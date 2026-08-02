export interface SessionRecord {
  sessionId: string;
  roomName: string;
  status: "ready" | "live" | "ending" | "ended";
  realtime: { url: string };
  playback: { status: "pending" | "ready" | "unavailable"; hlsUrl: string | null };
  metadata: Record<string, unknown>;
  idempotencyKey?: string;
  createdAt: string;
  endedAt: string | null;
}

/**
 * In-memory store for local skeleton only.
 * Production will use Postgres (session metadata) + LiveKit as source of truth for rooms.
 */
export class SessionStore {
  private byId = new Map<string, SessionRecord>();
  private byIdempotency = new Map<string, string>();

  create(record: SessionRecord): SessionRecord {
    this.byId.set(record.sessionId, record);
    if (record.idempotencyKey) {
      this.byIdempotency.set(record.idempotencyKey, record.sessionId);
    }
    return record;
  }

  get(sessionId: string): SessionRecord | undefined {
    return this.byId.get(sessionId);
  }

  getByIdempotencyKey(key: string): SessionRecord | undefined {
    const id = this.byIdempotency.get(key);
    return id ? this.byId.get(id) : undefined;
  }

  end(sessionId: string): SessionRecord | undefined {
    const existing = this.byId.get(sessionId);
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
    this.byId.set(sessionId, updated);
    return updated;
  }
}
