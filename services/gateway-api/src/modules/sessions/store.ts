import type { EgressJobRecord, SessionRecord } from "./types.js";

/**
 * Session + egress + idempotency store.
 * Memory (dev/demo) or Postgres (durable multi-instance).
 */
export interface SessionStore {
  create(record: SessionRecord): Promise<SessionRecord>;
  get(sessionId: string): Promise<SessionRecord | undefined>;
  getByIdempotencyKey(
    key: string,
    tenantId: string | null,
  ): Promise<SessionRecord | undefined>;
  /** Active (non-ended) session for a LiveKit room name — webhook reconcile. */
  getActiveByRoomName(roomName: string): Promise<SessionRecord | undefined>;
  list(
    status?: string,
    limit?: number,
    tenantId?: string | null,
  ): Promise<SessionRecord[]>;
  update(
    sessionId: string,
    patch: Partial<SessionRecord>,
  ): Promise<SessionRecord | undefined>;
  end(sessionId: string): Promise<SessionRecord | undefined>;
  putEgress(job: EgressJobRecord): Promise<EgressJobRecord>;
  getEgress(egressId: string): Promise<EgressJobRecord | undefined>;
  listEgress(sessionId: string): Promise<EgressJobRecord[]>;
  /** Optional cleanup for pools */
  close?(): Promise<void>;
}

/** Ensure caller tenant owns the session (or legacy unscoped). */
export function assertSessionAccess(
  session: SessionRecord | undefined,
  tenantId: string | null,
): session is SessionRecord {
  if (!session) return false;
  if (tenantId !== null && session.tenantId !== tenantId) {
    return false;
  }
  if (tenantId === null && session.tenantId !== null) {
    return false;
  }
  return true;
}

/**
 * In-memory store — single-node / tests only.
 */
export class MemorySessionStore implements SessionStore {
  private sessions = new Map<string, SessionRecord>();
  private byIdempotency = new Map<string, string>();
  private egressById = new Map<string, EgressJobRecord>();
  private egressBySession = new Map<string, string[]>();

  async create(record: SessionRecord): Promise<SessionRecord> {
    this.sessions.set(record.sessionId, record);
    if (record.idempotencyKey) {
      const idempKey = `${record.tenantId ?? "_"}:${record.idempotencyKey}`;
      this.byIdempotency.set(idempKey, record.sessionId);
    }
    return record;
  }

  async get(sessionId: string): Promise<SessionRecord | undefined> {
    return this.sessions.get(sessionId);
  }

  async getByIdempotencyKey(
    key: string,
    tenantId: string | null,
  ): Promise<SessionRecord | undefined> {
    const idempKey = `${tenantId ?? "_"}:${key}`;
    const id = this.byIdempotency.get(idempKey);
    return id ? this.sessions.get(id) : undefined;
  }

  async getActiveByRoomName(
    roomName: string,
  ): Promise<SessionRecord | undefined> {
    const matches = [...this.sessions.values()].filter(
      (s) => s.roomName === roomName && s.status !== "ended",
    );
    matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return matches[0];
  }

  async list(
    status?: string,
    limit = 20,
    tenantId?: string | null,
  ): Promise<SessionRecord[]> {
    const all = [...this.sessions.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    let filtered = status ? all.filter((s) => s.status === status) : all;
    if (tenantId !== undefined) {
      filtered = filtered.filter((s) => s.tenantId === tenantId);
    }
    return filtered.slice(0, limit);
  }

  async update(
    sessionId: string,
    patch: Partial<SessionRecord>,
  ): Promise<SessionRecord | undefined> {
    const existing = this.sessions.get(sessionId);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  async end(sessionId: string): Promise<SessionRecord | undefined> {
    const existing = this.sessions.get(sessionId);
    if (!existing) return undefined;
    if (existing.status === "ended") return existing;
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

  async putEgress(job: EgressJobRecord): Promise<EgressJobRecord> {
    this.egressById.set(job.egressId, job);
    const list = this.egressBySession.get(job.sessionId) ?? [];
    if (!list.includes(job.egressId)) {
      list.push(job.egressId);
      this.egressBySession.set(job.sessionId, list);
    }
    return job;
  }

  async getEgress(egressId: string): Promise<EgressJobRecord | undefined> {
    return this.egressById.get(egressId);
  }

  async listEgress(sessionId: string): Promise<EgressJobRecord[]> {
    const ids = this.egressBySession.get(sessionId) ?? [];
    return ids
      .map((id) => this.egressById.get(id))
      .filter((j): j is EgressJobRecord => Boolean(j));
  }
}

/** @deprecated Use MemorySessionStore — alias for older imports */
export class SessionStoreMemory extends MemorySessionStore {}
