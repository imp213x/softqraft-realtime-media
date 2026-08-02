import type { EgressJobRecord, SessionRecord } from "./types.js";

/**
 * In-memory store for Phase 1 single-node Gateway.
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
      this.byIdempotency.set(record.idempotencyKey, record.sessionId);
    }
    return record;
  }

  get(sessionId: string): SessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  getByIdempotencyKey(key: string): SessionRecord | undefined {
    const id = this.byIdempotency.get(key);
    return id ? this.sessions.get(id) : undefined;
  }

  list(status?: string, limit = 20): SessionRecord[] {
    const all = [...this.sessions.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    const filtered = status
      ? all.filter((s) => s.status === status)
      : all;
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
