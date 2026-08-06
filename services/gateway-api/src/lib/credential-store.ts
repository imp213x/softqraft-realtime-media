import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TenantRecord } from "../config.js";

/** Public tenant policy (quotas). Secrets never live here. */
export interface TenantPolicy {
  tenantId: string;
  label: string;
  maxSessions: number;
  maxEgress: number;
  createdAt: string;
  /** false = env bootstrap (not file-managed) */
  managed: boolean;
}

/**
 * One API key. On disk: hash only (no plaintext).
 * key format (v2): `sqk_{keyId}.{secret}`
 */
export interface ApiKeyRecord {
  keyId: string;
  tenantId: string;
  /** sha256 hex of full api key */
  keyHash: string;
  /** Short preview for UI, e.g. sqk_key_ab… */
  keyPrefix: string;
  label: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  managed: boolean;
}

export type AuditAction =
  | "tenant.created"
  | "tenant.updated"
  | "tenant.revoked"
  | "key.created"
  | "key.revoked"
  | "key.rotated"
  | "store.migrated_v1";

export interface AuditEvent {
  id: string;
  at: string;
  action: AuditAction;
  tenantId: string;
  keyId?: string;
  detail?: string;
}

interface StoreFileV2 {
  version: 2;
  tenants: TenantPolicy[];
  keys: ApiKeyRecord[];
  audit: AuditEvent[];
}

/** v1 plaintext shape (migrated on load) */
interface StoreFileV1 {
  version?: 1;
  credentials: Array<{
    tenantId: string;
    apiKey: string;
    label?: string;
    maxSessions?: number;
    maxEgress?: number;
    createdAt?: string;
    managed?: boolean;
  }>;
}

const MAX_AUDIT = 500;

/**
 * Credential registry: hashed file-backed keys + env bootstrap.
 * Hardening #6 — no plaintext secrets on disk for managed keys.
 */
export class CredentialStore {
  private tenants = new Map<string, TenantPolicy>();
  /** keyId → record */
  private keysById = new Map<string, ApiKeyRecord>();
  /** keyHash → keyId (O(1) verify path for opaque/legacy keys) */
  private hashToKeyId = new Map<string, string>();
  private legacyKeys: Set<string>;
  private storePath: string;
  private audit: AuditEvent[] = [];
  /** In-memory only: plaintext env keys → tenant (never persisted) */
  private envPlainByKey = new Map<string, TenantRecord>();

  constructor(opts: {
    storePath: string;
    legacyKeys: Set<string>;
    envTenants: TenantRecord[];
  }) {
    this.storePath = opts.storePath;
    this.legacyKeys = new Set(opts.legacyKeys);

    for (const t of opts.envTenants) {
      const tenantId = sanitizeTenantId(t.tenantId) || t.tenantId;
      this.tenants.set(tenantId, {
        tenantId,
        label: tenantId,
        maxSessions: t.maxSessions,
        maxEgress: t.maxEgress,
        createdAt: new Date(0).toISOString(),
        managed: false,
      });
      this.envPlainByKey.set(t.apiKey, {
        tenantId,
        apiKey: t.apiKey,
        maxSessions: t.maxSessions,
        maxEgress: t.maxEgress,
      });
      // Also index hash for consistency if env key is presented
      const h = hashKey(t.apiKey);
      const keyId = `env_${tenantId}`;
      this.keysById.set(keyId, {
        keyId,
        tenantId,
        keyHash: h,
        keyPrefix: maskKey(t.apiKey),
        label: "env bootstrap",
        createdAt: new Date(0).toISOString(),
        expiresAt: null,
        revokedAt: null,
        managed: false,
      });
      this.hashToKeyId.set(h, keyId);
    }
  }

  async loadFromDisk(): Promise<void> {
    try {
      const raw = await readFile(this.storePath, "utf8");
      const data = JSON.parse(raw) as StoreFileV2 | StoreFileV1;

      if (isV2(data)) {
        for (const t of data.tenants ?? []) {
          if (!t.managed) continue; // env only from process env
          this.tenants.set(t.tenantId, t);
        }
        for (const k of data.keys ?? []) {
          if (!k.managed) continue;
          this.indexKey(k);
        }
        this.audit = Array.isArray(data.audit) ? data.audit.slice(-MAX_AUDIT) : [];
        return;
      }

      // v1 migration: hash plaintext, rewrite file
      if (Array.isArray((data as StoreFileV1).credentials)) {
        await this.migrateV1(data as StoreFileV1);
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT") throw err;
    }
  }

  private async migrateV1(data: StoreFileV1): Promise<void> {
    for (const c of data.credentials) {
      if (!c.apiKey || !c.tenantId) continue;
      const tenantId = sanitizeTenantId(c.tenantId);
      if (!tenantId) continue;
      if (!this.tenants.has(tenantId) || this.tenants.get(tenantId)?.managed) {
        this.tenants.set(tenantId, {
          tenantId,
          label: (c.label || tenantId).slice(0, 128),
          maxSessions: Math.max(1, c.maxSessions ?? 50),
          maxEgress: Math.max(1, c.maxEgress ?? 10),
          createdAt: c.createdAt || new Date().toISOString(),
          managed: true,
        });
      }
      const keyId = `key_${randomBytes(9).toString("base64url")}`;
      // Keep original plaintext as secret material only for one-time rehash of same string
      const rec: ApiKeyRecord = {
        keyId,
        tenantId,
        keyHash: hashKey(c.apiKey),
        keyPrefix: maskKey(c.apiKey),
        label: (c.label || "migrated").slice(0, 128),
        createdAt: c.createdAt || new Date().toISOString(),
        expiresAt: null,
        revokedAt: null,
        managed: true,
      };
      this.indexKey(rec);
      // Note: callers must re-create keys if they only have previews after migration
      // — full key still works if they still have the old plaintext (hash matches).
    }
    this.pushAudit({
      action: "store.migrated_v1",
      tenantId: "_system",
      detail: `Migrated ${(data.credentials ?? []).length} v1 credential(s) to hashed v2`,
    });
    await this.persist();
  }

  private indexKey(k: ApiKeyRecord): void {
    this.keysById.set(k.keyId, k);
    this.hashToKeyId.set(k.keyHash, k.keyId);
  }

  private unindexKey(k: ApiKeyRecord): void {
    this.keysById.delete(k.keyId);
    this.hashToKeyId.delete(k.keyHash);
  }

  private async persist(): Promise<void> {
    const body: StoreFileV2 = {
      version: 2,
      tenants: [...this.tenants.values()].filter((t) => t.managed),
      keys: [...this.keysById.values()].filter((k) => k.managed),
      audit: this.audit.slice(-MAX_AUDIT),
    };
    try {
      await mkdir(path.dirname(this.storePath), { recursive: true });
      const tmp = `${this.storePath}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(body, null, 2), "utf8");
      await rename(tmp, this.storePath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      const msg = err instanceof Error ? err.message : String(err);
      if (code === "EACCES" || code === "EPERM") {
        throw new Error(
          `Cannot write credential store at ${this.storePath} (${code}). ` +
            `Fix volume permissions (e.g. chown softqraft /data) and retry.`,
        );
      }
      throw new Error(`Failed to persist credential store: ${msg}`);
    }
  }

  private pushAudit(
    input: Omit<AuditEvent, "id" | "at"> & { at?: string },
  ): void {
    this.audit.push({
      id: `aud_${randomBytes(8).toString("base64url")}`,
      at: input.at || new Date().toISOString(),
      action: input.action,
      tenantId: input.tenantId,
      keyId: input.keyId,
      detail: input.detail,
    });
    if (this.audit.length > MAX_AUDIT) {
      this.audit = this.audit.slice(-MAX_AUDIT);
    }
  }

  resolve(
    apiKey: string,
  ): { tenant: TenantRecord | null; apiKey: string; keyId?: string } | null {
    const raw = String(apiKey || "").trim();
    if (!raw) return null;

    // Env plaintext map (bootstrap)
    const envT = this.envPlainByKey.get(raw);
    if (envT) {
      return { tenant: envT, apiKey: raw, keyId: `env_${envT.tenantId}` };
    }

    // Legacy flat service keys (no tenant)
    if (this.legacyKeys.has(raw)) {
      return { tenant: null, apiKey: raw };
    }

    // Prefer keyId parse for O(1)
    const parsed = parseManagedKey(raw);
    let rec: ApiKeyRecord | undefined;
    if (parsed) {
      rec = this.keysById.get(parsed.keyId);
      if (rec && rec.keyHash !== hashKey(raw)) {
        rec = undefined;
      }
    }
    if (!rec) {
      const keyId = this.hashToKeyId.get(hashKey(raw));
      rec = keyId ? this.keysById.get(keyId) : undefined;
    }
    if (!rec || rec.revokedAt) return null;
    if (rec.expiresAt && Date.parse(rec.expiresAt) < Date.now()) return null;

    const policy = this.tenants.get(rec.tenantId);
    if (!policy) return null;

    return {
      tenant: {
        tenantId: policy.tenantId,
        apiKey: raw,
        maxSessions: policy.maxSessions,
        maxEgress: policy.maxEgress,
      },
      apiKey: raw,
      keyId: rec.keyId,
    };
  }

  listTenants(): Array<{
    tenantId: string;
    label: string;
    maxSessions: number;
    maxEgress: number;
    createdAt: string;
    managed: boolean;
    keys: Array<{
      keyId: string;
      label: string;
      keyPrefix: string;
      createdAt: string;
      expiresAt: string | null;
      revokedAt: string | null;
      status: "active" | "revoked" | "expired";
    }>;
  }> {
    return [...this.tenants.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((t) => {
        const keys = [...this.keysById.values()]
          .filter((k) => k.tenantId === t.tenantId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((k) => ({
            keyId: k.keyId,
            label: k.label,
            keyPrefix: k.keyPrefix,
            createdAt: k.createdAt,
            expiresAt: k.expiresAt,
            revokedAt: k.revokedAt,
            status: keyStatus(k),
          }));
        return {
          tenantId: t.tenantId,
          label: t.label,
          maxSessions: t.maxSessions,
          maxEgress: t.maxEgress,
          createdAt: t.createdAt,
          managed: t.managed,
          keys,
        };
      });
  }

  /** @deprecated use listTenants — flat list for older admin UI */
  list(): Array<{
    tenantId: string;
    label: string;
    maxSessions: number;
    maxEgress: number;
    createdAt: string;
    managed: boolean;
    apiKeyPreview: string;
    keyId?: string;
    keyCount?: number;
  }> {
    return this.listTenants().map((t) => {
      const active = t.keys.filter((k) => k.status === "active");
      const preview =
        active[0]?.keyPrefix || t.keys[0]?.keyPrefix || "••••••••";
      return {
        tenantId: t.tenantId,
        label: t.label,
        maxSessions: t.maxSessions,
        maxEgress: t.maxEgress,
        createdAt: t.createdAt,
        managed: t.managed,
        apiKeyPreview: preview,
        keyId: active[0]?.keyId,
        keyCount: active.length,
      };
    });
  }

  listAudit(limit = 50): AuditEvent[] {
    return this.audit.slice(-Math.min(200, Math.max(1, limit))).reverse();
  }

  /**
   * Create tenant (if needed) + one API key.
   * Returns plaintext apiKey once.
   */
  async create(input: {
    tenantId: string;
    label?: string;
    maxSessions?: number;
    maxEgress?: number;
    keyLabel?: string;
    expiresAt?: string | null;
  }): Promise<{
    tenantId: string;
    label: string;
    maxSessions: number;
    maxEgress: number;
    createdAt: string;
    keyId: string;
    apiKey: string;
    expiresAt: string | null;
  }> {
    const tenantId = sanitizeTenantId(input.tenantId);
    if (!tenantId) throw new Error("Invalid tenantId");

    let policy = this.tenants.get(tenantId);
    if (policy && !policy.managed) {
      throw new Error(
        `Tenant '${tenantId}' is env-bootstrap; manage via GATEWAY_TENANTS`,
      );
    }

    // Tenant already exists → mint another key (Admin "Create" / retry path)
    if (policy) {
      if (input.maxSessions != null || input.maxEgress != null || input.label) {
        policy = {
          ...policy,
          label: input.label?.trim()
            ? input.label.trim().slice(0, 128)
            : policy.label,
          maxSessions:
            input.maxSessions != null
              ? Math.max(1, input.maxSessions)
              : policy.maxSessions,
          maxEgress:
            input.maxEgress != null
              ? Math.max(1, input.maxEgress)
              : policy.maxEgress,
        };
        this.tenants.set(tenantId, policy);
      }
      const added = await this.createKey(tenantId, {
        label: input.keyLabel || input.label || "default",
        expiresAt: input.expiresAt,
      });
      return {
        tenantId: policy.tenantId,
        label: policy.label,
        maxSessions: policy.maxSessions,
        maxEgress: policy.maxEgress,
        createdAt: policy.createdAt,
        keyId: added.keyId,
        apiKey: added.apiKey,
        expiresAt: added.expiresAt,
      };
    }

    const newPolicy: TenantPolicy = {
      tenantId,
      label: (input.label || tenantId).trim().slice(0, 128),
      maxSessions: Math.max(1, input.maxSessions ?? 50),
      maxEgress: Math.max(1, input.maxEgress ?? 10),
      createdAt: new Date().toISOString(),
      managed: true,
    };

    const minted = mintApiKey(tenantId);
    const rec: ApiKeyRecord = {
      keyId: minted.keyId,
      tenantId,
      keyHash: hashKey(minted.apiKey),
      keyPrefix: maskKey(minted.apiKey),
      label: (input.keyLabel || input.label || "default").trim().slice(0, 128),
      createdAt: new Date().toISOString(),
      expiresAt: normalizeExpiry(input.expiresAt),
      revokedAt: null,
      managed: true,
    };

    // Apply in-memory, persist, rollback if disk fails (avoids 500 then 409)
    this.tenants.set(tenantId, newPolicy);
    this.indexKey(rec);
    this.pushAudit({ action: "tenant.created", tenantId });
    this.pushAudit({
      action: "key.created",
      tenantId,
      keyId: rec.keyId,
    });
    try {
      await this.persist();
    } catch (err) {
      this.tenants.delete(tenantId);
      this.unindexKey(rec);
      this.audit = this.audit.filter(
        (a) => a.keyId !== rec.keyId && a.tenantId !== tenantId,
      );
      throw err;
    }

    return {
      tenantId: newPolicy.tenantId,
      label: newPolicy.label,
      maxSessions: newPolicy.maxSessions,
      maxEgress: newPolicy.maxEgress,
      createdAt: newPolicy.createdAt,
      keyId: rec.keyId,
      apiKey: minted.apiKey,
      expiresAt: rec.expiresAt,
    };
  }

  /** Add another key (rotation / multi-key). Does not revoke old keys. */
  async createKey(
    tenantIdRaw: string,
    input?: { label?: string; expiresAt?: string | null },
  ): Promise<{ keyId: string; apiKey: string; expiresAt: string | null }> {
    const tenantId = sanitizeTenantId(tenantIdRaw);
    const policy = this.tenants.get(tenantId);
    if (!policy) throw new Error("Tenant not found");
    if (!policy.managed) {
      throw new Error("Cannot add keys to env-bootstrap tenant");
    }
    const minted = mintApiKey(tenantId);
    const rec: ApiKeyRecord = {
      keyId: minted.keyId,
      tenantId,
      keyHash: hashKey(minted.apiKey),
      keyPrefix: maskKey(minted.apiKey),
      label: (input?.label || "rotated").trim().slice(0, 128),
      createdAt: new Date().toISOString(),
      expiresAt: normalizeExpiry(input?.expiresAt),
      revokedAt: null,
      managed: true,
    };
    this.indexKey(rec);
    this.pushAudit({
      action: "key.created",
      tenantId,
      keyId: rec.keyId,
      detail: "additional key",
    });
    await this.persist();
    return {
      keyId: rec.keyId,
      apiKey: minted.apiKey,
      expiresAt: rec.expiresAt,
    };
  }

  /**
   * Issue a new key and revoke previous active keys.
   * - default: revoke all other active keys for the tenant
   * - revokeKeyId: revoke only that key (overlapping dual-key if you skip default)
   */
  async rotateKey(
    tenantIdRaw: string,
    opts?: { revokeKeyId?: string; label?: string },
  ): Promise<{
    keyId: string;
    apiKey: string;
    expiresAt: string | null;
    revokedKeyIds: string[];
  }> {
    const tenantId = sanitizeTenantId(tenantIdRaw);
    const policy = this.tenants.get(tenantId);
    if (!policy?.managed) {
      throw new Error("Tenant not found or not managed");
    }
    const created = await this.createKey(tenantId, {
      label: opts?.label || "rotated",
    });
    const revokedKeyIds: string[] = [];
    const candidates = [...this.keysById.values()].filter(
      (k) =>
        k.tenantId === tenantId &&
        k.managed &&
        !k.revokedAt &&
        k.keyId !== created.keyId,
    );
    for (const k of candidates) {
      if (opts?.revokeKeyId && k.keyId !== opts.revokeKeyId) continue;
      await this.revokeKey(tenantId, k.keyId, false);
      revokedKeyIds.push(k.keyId);
    }
    this.pushAudit({
      action: "key.rotated",
      tenantId,
      keyId: created.keyId,
      detail: `revoked: ${revokedKeyIds.join(",") || "none"}`,
    });
    await this.persist();
    return { ...created, revokedKeyIds };
  }

  async updateTenant(
    tenantIdRaw: string,
    patch: { label?: string; maxSessions?: number; maxEgress?: number },
  ): Promise<TenantPolicy> {
    const tenantId = sanitizeTenantId(tenantIdRaw);
    const policy = this.tenants.get(tenantId);
    if (!policy) throw new Error("Tenant not found");
    if (!policy.managed) {
      throw new Error("Cannot update env-bootstrap tenant from admin");
    }
    if (patch.label != null) policy.label = patch.label.trim().slice(0, 128);
    if (patch.maxSessions != null) {
      policy.maxSessions = Math.max(1, patch.maxSessions);
    }
    if (patch.maxEgress != null) {
      policy.maxEgress = Math.max(1, patch.maxEgress);
    }
    this.tenants.set(tenantId, policy);
    this.pushAudit({
      action: "tenant.updated",
      tenantId,
      detail: JSON.stringify(patch),
    });
    await this.persist();
    return policy;
  }

  async revokeKey(
    tenantIdRaw: string,
    keyId: string,
    persist = true,
  ): Promise<boolean> {
    const tenantId = sanitizeTenantId(tenantIdRaw);
    const rec = this.keysById.get(keyId);
    if (!rec || rec.tenantId !== tenantId) return false;
    if (!rec.managed) {
      throw new Error("Cannot revoke env-bootstrap key from admin");
    }
    if (rec.revokedAt) return true;
    rec.revokedAt = new Date().toISOString();
    this.keysById.set(keyId, rec);
    this.pushAudit({ action: "key.revoked", tenantId, keyId });
    if (persist) await this.persist();
    return true;
  }

  /**
   * Revoke all managed keys for tenant (tenant policy remains unless deleteTenant).
   */
  async revoke(tenantIdRaw: string): Promise<boolean> {
    const tenantId = sanitizeTenantId(tenantIdRaw);
    const policy = this.tenants.get(tenantId);
    if (!policy) return false;
    if (!policy.managed) {
      throw new Error(
        "Cannot revoke env-bootstrap credentials from the admin UI; remove from GATEWAY_TENANTS / GATEWAY_SERVICE_API_KEYS",
      );
    }
    let any = false;
    for (const k of [...this.keysById.values()]) {
      if (k.tenantId === tenantId && k.managed && !k.revokedAt) {
        k.revokedAt = new Date().toISOString();
        this.keysById.set(k.keyId, k);
        any = true;
        this.pushAudit({
          action: "key.revoked",
          tenantId,
          keyId: k.keyId,
          detail: "tenant revoke-all",
        });
      }
    }
    this.pushAudit({ action: "tenant.revoked", tenantId });
    await this.persist();
    return any || true;
  }

  /** Remove managed tenant + keys from store entirely. */
  async deleteTenant(tenantIdRaw: string): Promise<boolean> {
    const tenantId = sanitizeTenantId(tenantIdRaw);
    const policy = this.tenants.get(tenantId);
    if (!policy) return false;
    if (!policy.managed) {
      throw new Error("Cannot delete env-bootstrap tenant");
    }
    for (const k of [...this.keysById.values()]) {
      if (k.tenantId === tenantId) this.unindexKey(k);
    }
    this.tenants.delete(tenantId);
    this.pushAudit({
      action: "tenant.revoked",
      tenantId,
      detail: "deleted",
    });
    await this.persist();
    return true;
  }

  tenantCount(): number {
    return this.tenants.size;
  }

  hasTenantIsolation(): boolean {
    return this.tenants.size > 0;
  }
}

function isV2(data: unknown): data is StoreFileV2 {
  return (
    Boolean(data) &&
    typeof data === "object" &&
    (data as StoreFileV2).version === 2
  );
}

export function hashKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}

function mintApiKey(tenantId: string): { keyId: string; apiKey: string } {
  const keyId = `key_${randomBytes(9).toString("base64url")}`;
  const secret = randomBytes(24).toString("base64url");
  // sqk_{keyId}.{secret} — keyId is parseable for O(1) lookup
  const apiKey = `sqk_${keyId}.${secret}`;
  void tenantId;
  return { keyId, apiKey };
}

/** Parse `sqk_{keyId}.{secret}` */
export function parseManagedKey(
  apiKey: string,
): { keyId: string; secret: string } | null {
  if (!apiKey.startsWith("sqk_")) return null;
  const rest = apiKey.slice(4);
  const dot = rest.indexOf(".");
  if (dot <= 0) return null;
  const keyId = rest.slice(0, dot);
  const secret = rest.slice(dot + 1);
  if (!keyId.startsWith("key_") || !secret) return null;
  return { keyId, secret };
}

function sanitizeTenantId(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 64);
}

function maskKey(key: string): string {
  if (key.length <= 12) return "••••••••";
  return `${key.slice(0, 10)}…${key.slice(-4)}`;
}

function keyStatus(
  k: ApiKeyRecord,
): "active" | "revoked" | "expired" {
  if (k.revokedAt) return "revoked";
  if (k.expiresAt && Date.parse(k.expiresAt) < Date.now()) return "expired";
  return "active";
}

function normalizeExpiry(v?: string | null): string | null {
  if (v == null || v === "") return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) throw new Error("Invalid expiresAt");
  return new Date(t).toISOString();
}
