import type { EgressJobRecord, SessionRecord } from "./types.js";

/**
 * In-memory store for Phase 1–3 single-node Gateway.
 * Production will persist session metadata (Postgres) while LiveKit remains room SoT.
 */
export class SessionStore {
  private sessions = new Map<string, SessionRecord>();
  private byIdempotency = new Map<string, string>();
  private egressById = new Map<string, EgressJobRecord>();
  private egressBySession = new Map<string, string[]>();

  create(record: SessionRecord): SessionRecord {
    this.sessions.set(record.sessionId, record);
    if (record.idempotencyKey) {
      // Scope idempotency by tenant to avoid cross-tenant collisions
      const idempKey = `${record.tenantId ?? "_"}:${record.idempotencyKey}`;
      this.byIdempotency.set(idempKey, record.sessionId);
    }
    return record;
  }

  get(sessionId: string): SessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  getByIdempotencyKey(
    key: string,
    tenantId: string | null,
  ): SessionRecord | undefined {
    const idempKey = `${tenantId ?? "_"}:${key}`;
    const id = this.byIdempotency.get(idempKey);
    return id ? this.sessions.get(id) : undefined;
  }

  list(
    status?: string,
    limit = 20,
    tenantId?: string | null,
  ): SessionRecord[] {
    const all = [...this.sessions.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    let filtered = status ? all.filter((s) => s.status === status) : all;
    if (tenantId !== undefined) {
      // null tenantId filter = only unscoped; string = that tenant
      filtered = filtered.filter((s) => s.tenantId === tenantId);
    }
    return filtered.slice(0, limit);
  }

  update(
    sessionId: string,
    patch: Partial<SessionRecord>,
  ): SessionRecord | undefined {
    const existing = this.sessions.get(sessionId);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  end(sessionId: string): SessionRecord | undefined {
    const existing = this.sessions.get(sessionId);
    if (!existing) return undefined;
    const updated: SessionRecord = {
      ...existing,
      status: "ended",
      endedAt: new Date().toISOString(),
      playback: {
        ...existing.playback,
        status:
          existing.playback.status === "ready" ? "ready" : "unavailable",
      },
    };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  putEgress(job: EgressJobRecord): EgressJobRecord {
    this.egressById.set(job.egressId, job);
    const list = this.egressBySession.get(job.sessionId) ?? [];
    if (!list.includes(job.egressId)) {
      list.push(job.egressId);
      this.egressBySession.set(job.sessionId, list);
    }
    return job;
  }

  getEgress(egressId: string): EgressJobRecord | undefined {
    return this.egressById.get(egressId);
  }

  listEgress(sessionId: string): EgressJobRecord[] {
    const ids = this.egressBySession.get(sessionId) ?? [];
    return ids
      .map((id) => this.egressById.get(id))
      .filter((j): j is EgressJobRecord => Boolean(j));
  }
}

/** Ensure caller tenant owns the session (or legacy unscoped). */
export function assertSessionAccess(
  session: SessionRecord | undefined,
  tenantId: string | null,
): session is SessionRecord {
  if (!session) return false;
  // Multi-tenant key: must match
  if (tenantId !== null && session.tenantId !== tenantId) {
    return false;
  }
  // Legacy key (tenantId null): can only access unscoped sessions when tenants
  // are configured — if session has a tenant, legacy keys cannot see it.
  if (tenantId === null && session.tenantId !== null) {
    // Allow if no multi-tenant isolation was intended (legacy-only mode stores null)
    // When session.tenantId is set, require matching tenant key.
    return false;
  }
  return true;
}
