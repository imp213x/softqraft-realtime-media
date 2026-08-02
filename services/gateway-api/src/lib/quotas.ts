import type { TenantRecord } from "../config.js";
import { ERROR_CODES } from "@softqraft/shared";
import { HttpError } from "./auth.js";

/**
 * In-memory concurrent quota counters (v1). Redis-backed later for multi-node.
 */
export class QuotaTracker {
  private activeSessions = new Map<string, number>();
  private activeEgress = new Map<string, number>();

  private key(tenantId: string | null | undefined): string {
    return tenantId?.trim() || "_default";
  }

  countSessions(tenantId: string | null | undefined): number {
    return this.activeSessions.get(this.key(tenantId)) ?? 0;
  }

  countEgress(tenantId: string | null | undefined): number {
    return this.activeEgress.get(this.key(tenantId)) ?? 0;
  }

  assertCanCreateSession(tenant: TenantRecord | null): void {
    if (!tenant) return;
    const n = this.countSessions(tenant.tenantId);
    if (n >= tenant.maxSessions) {
      throw new HttpError(
        429,
        ERROR_CODES.QUOTA_EXCEEDED,
        `Tenant '${tenant.tenantId}' session quota exceeded (${tenant.maxSessions})`,
      );
    }
  }

  assertCanStartEgress(tenant: TenantRecord | null): void {
    if (!tenant) return;
    const n = this.countEgress(tenant.tenantId);
    if (n >= tenant.maxEgress) {
      throw new HttpError(
        429,
        ERROR_CODES.QUOTA_EXCEEDED,
        `Tenant '${tenant.tenantId}' egress quota exceeded (${tenant.maxEgress})`,
      );
    }
  }

  onSessionCreated(tenantId: string | null | undefined): void {
    const k = this.key(tenantId);
    this.activeSessions.set(k, this.countSessions(tenantId) + 1);
  }

  onSessionEnded(tenantId: string | null | undefined): void {
    const k = this.key(tenantId);
    this.activeSessions.set(k, Math.max(0, this.countSessions(tenantId) - 1));
  }

  onEgressStarted(tenantId: string | null | undefined): void {
    const k = this.key(tenantId);
    this.activeEgress.set(k, this.countEgress(tenantId) + 1);
  }

  onEgressTerminal(tenantId: string | null | undefined): void {
    const k = this.key(tenantId);
    this.activeEgress.set(k, Math.max(0, this.countEgress(tenantId) - 1));
  }
}
