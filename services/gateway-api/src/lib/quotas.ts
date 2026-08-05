import type { TenantRecord } from "../config.js";
import { ERROR_CODES } from "@softqraft/shared";
import { HttpError } from "./auth.js";
import type { Redis as RedisClient } from "ioredis";

/**
 * Concurrent quota counters.
 * - Memory: single-node
 * - Redis: atomic INCR/DECR (multi-instance safe)
 *
 * Prefer tryReserve* before external work (LiveKit), release on failure.
 */
export interface QuotaTracker {
  countSessions(tenantId: string | null | undefined): Promise<number>;
  countEgress(tenantId: string | null | undefined): Promise<number>;
  /** Atomically reserve a session slot or throw 429. */
  tryReserveSession(tenant: TenantRecord | null): Promise<void>;
  tryReserveEgress(tenant: TenantRecord | null): Promise<void>;
  releaseSession(tenantId: string | null | undefined): Promise<void>;
  releaseEgress(tenantId: string | null | undefined): Promise<void>;
  /** @deprecated use tryReserveSession */
  assertCanCreateSession(tenant: TenantRecord | null): Promise<void>;
  /** @deprecated use tryReserveEgress */
  assertCanStartEgress(tenant: TenantRecord | null): Promise<void>;
  /** @deprecated use tryReserveSession (no-op after reserve) */
  onSessionCreated(tenantId: string | null | undefined): Promise<void>;
  onSessionEnded(tenantId: string | null | undefined): Promise<void>;
  onEgressStarted(tenantId: string | null | undefined): Promise<void>;
  onEgressTerminal(tenantId: string | null | undefined): Promise<void>;
  close?(): Promise<void>;
}

function tenantKey(tenantId: string | null | undefined): string {
  return tenantId?.trim() || "_default";
}

export class MemoryQuotaTracker implements QuotaTracker {
  private activeSessions = new Map<string, number>();
  private activeEgress = new Map<string, number>();

  async countSessions(tenantId: string | null | undefined): Promise<number> {
    return this.activeSessions.get(tenantKey(tenantId)) ?? 0;
  }

  async countEgress(tenantId: string | null | undefined): Promise<number> {
    return this.activeEgress.get(tenantKey(tenantId)) ?? 0;
  }

  async tryReserveSession(tenant: TenantRecord | null): Promise<void> {
    if (!tenant) return;
    const k = tenantKey(tenant.tenantId);
    const n = this.activeSessions.get(k) ?? 0;
    if (n >= tenant.maxSessions) {
      throw new HttpError(
        429,
        ERROR_CODES.QUOTA_EXCEEDED,
        `Tenant '${tenant.tenantId}' session quota exceeded (${tenant.maxSessions})`,
      );
    }
    this.activeSessions.set(k, n + 1);
  }

  async tryReserveEgress(tenant: TenantRecord | null): Promise<void> {
    if (!tenant) return;
    const k = tenantKey(tenant.tenantId);
    const n = this.activeEgress.get(k) ?? 0;
    if (n >= tenant.maxEgress) {
      throw new HttpError(
        429,
        ERROR_CODES.QUOTA_EXCEEDED,
        `Tenant '${tenant.tenantId}' egress quota exceeded (${tenant.maxEgress})`,
      );
    }
    this.activeEgress.set(k, n + 1);
  }

  async releaseSession(tenantId: string | null | undefined): Promise<void> {
    const k = tenantKey(tenantId);
    this.activeSessions.set(
      k,
      Math.max(0, (this.activeSessions.get(k) ?? 0) - 1),
    );
  }

  async releaseEgress(tenantId: string | null | undefined): Promise<void> {
    const k = tenantKey(tenantId);
    this.activeEgress.set(
      k,
      Math.max(0, (this.activeEgress.get(k) ?? 0) - 1),
    );
  }

  async assertCanCreateSession(tenant: TenantRecord | null): Promise<void> {
    if (!tenant) return;
    const n = await this.countSessions(tenant.tenantId);
    if (n >= tenant.maxSessions) {
      throw new HttpError(
        429,
        ERROR_CODES.QUOTA_EXCEEDED,
        `Tenant '${tenant.tenantId}' session quota exceeded (${tenant.maxSessions})`,
      );
    }
  }

  async assertCanStartEgress(tenant: TenantRecord | null): Promise<void> {
    if (!tenant) return;
    const n = await this.countEgress(tenant.tenantId);
    if (n >= tenant.maxEgress) {
      throw new HttpError(
        429,
        ERROR_CODES.QUOTA_EXCEEDED,
        `Tenant '${tenant.tenantId}' egress quota exceeded (${tenant.maxEgress})`,
      );
    }
  }

  async onSessionCreated(tenantId: string | null | undefined): Promise<void> {
    // no-op when using tryReserveSession
    void tenantId;
  }

  async onSessionEnded(tenantId: string | null | undefined): Promise<void> {
    await this.releaseSession(tenantId);
  }

  async onEgressStarted(tenantId: string | null | undefined): Promise<void> {
    void tenantId;
  }

  async onEgressTerminal(tenantId: string | null | undefined): Promise<void> {
    await this.releaseEgress(tenantId);
  }
}

const RESERVE_LUA = `
local key = KEYS[1]
local max = tonumber(ARGV[1])
local cur = tonumber(redis.call('GET', key) or '0')
if cur >= max then
  return -1
end
return redis.call('INCR', key)
`;

export class RedisQuotaTracker implements QuotaTracker {
  private redis: RedisClient;
  private prefix: string;

  constructor(redis: RedisClient, prefix = "sqrm:quota") {
    this.redis = redis;
    this.prefix = prefix;
  }

  private sk(tenantId: string | null | undefined): string {
    return `${this.prefix}:sess:${tenantKey(tenantId)}`;
  }

  private ek(tenantId: string | null | undefined): string {
    return `${this.prefix}:egress:${tenantKey(tenantId)}`;
  }

  async countSessions(tenantId: string | null | undefined): Promise<number> {
    const v = await this.redis.get(this.sk(tenantId));
    return Number(v ?? 0);
  }

  async countEgress(tenantId: string | null | undefined): Promise<number> {
    const v = await this.redis.get(this.ek(tenantId));
    return Number(v ?? 0);
  }

  async tryReserveSession(tenant: TenantRecord | null): Promise<void> {
    if (!tenant) return;
    const result = (await this.redis.eval(
      RESERVE_LUA,
      1,
      this.sk(tenant.tenantId),
      String(tenant.maxSessions),
    )) as number;
    if (result === -1) {
      throw new HttpError(
        429,
        ERROR_CODES.QUOTA_EXCEEDED,
        `Tenant '${tenant.tenantId}' session quota exceeded (${tenant.maxSessions})`,
      );
    }
  }

  async tryReserveEgress(tenant: TenantRecord | null): Promise<void> {
    if (!tenant) return;
    const result = (await this.redis.eval(
      RESERVE_LUA,
      1,
      this.ek(tenant.tenantId),
      String(tenant.maxEgress),
    )) as number;
    if (result === -1) {
      throw new HttpError(
        429,
        ERROR_CODES.QUOTA_EXCEEDED,
        `Tenant '${tenant.tenantId}' egress quota exceeded (${tenant.maxEgress})`,
      );
    }
  }

  async releaseSession(tenantId: string | null | undefined): Promise<void> {
    const key = this.sk(tenantId);
    const n = await this.redis.decr(key);
    if (n < 0) await this.redis.set(key, "0");
  }

  async releaseEgress(tenantId: string | null | undefined): Promise<void> {
    const key = this.ek(tenantId);
    const n = await this.redis.decr(key);
    if (n < 0) await this.redis.set(key, "0");
  }

  async assertCanCreateSession(tenant: TenantRecord | null): Promise<void> {
    if (!tenant) return;
    const n = await this.countSessions(tenant.tenantId);
    if (n >= tenant.maxSessions) {
      throw new HttpError(
        429,
        ERROR_CODES.QUOTA_EXCEEDED,
        `Tenant '${tenant.tenantId}' session quota exceeded (${tenant.maxSessions})`,
      );
    }
  }

  async assertCanStartEgress(tenant: TenantRecord | null): Promise<void> {
    if (!tenant) return;
    const n = await this.countEgress(tenant.tenantId);
    if (n >= tenant.maxEgress) {
      throw new HttpError(
        429,
        ERROR_CODES.QUOTA_EXCEEDED,
        `Tenant '${tenant.tenantId}' egress quota exceeded (${tenant.maxEgress})`,
      );
    }
  }

  async onSessionCreated(): Promise<void> {}
  async onEgressStarted(): Promise<void> {}

  async onSessionEnded(tenantId: string | null | undefined): Promise<void> {
    await this.releaseSession(tenantId);
  }

  async onEgressTerminal(tenantId: string | null | undefined): Promise<void> {
    await this.releaseEgress(tenantId);
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
