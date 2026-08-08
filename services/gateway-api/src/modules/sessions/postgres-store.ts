import pg from "pg";
import type { SessionStore } from "./store.js";
import type { EgressJobRecord, SessionRecord } from "./types.js";
import type {
  AudienceMode,
  CapabilityProfile,
  EgressStatus,
  EgressType,
  SessionStatus,
} from "@softqraft/shared";

const { Pool } = pg;

/** Embedded so dist/Docker builds do not depend on loose .sql paths. */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id        TEXT PRIMARY KEY,
  tenant_id         TEXT,
  external_id       TEXT,
  room_name         TEXT NOT NULL,
  status            TEXT NOT NULL,
  profile           TEXT NOT NULL,
  audience_mode     TEXT NOT NULL,
  realtime_url      TEXT NOT NULL,
  playback_status   TEXT NOT NULL DEFAULT 'pending',
  playback_hls_url  TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  max_participants  INT NOT NULL DEFAULT 50,
  idempotency_key   TEXT,
  created_at        TIMESTAMPTZ NOT NULL,
  ended_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_idempotency_uidx
  ON sessions ((COALESCE(tenant_id, '')), idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS sessions_room_active_idx
  ON sessions (room_name)
  WHERE status <> 'ended';

CREATE INDEX IF NOT EXISTS sessions_tenant_created_idx
  ON sessions (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS egress_jobs (
  egress_id         TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  tenant_id         TEXT,
  type              TEXT NOT NULL,
  status            TEXT NOT NULL,
  filepath          TEXT,
  hls_prefix        TEXT,
  playback_hls_url  TEXT,
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL,
  quota_held        BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS egress_jobs_session_idx
  ON egress_jobs (session_id);
`;

export class PostgresSessionStore implements SessionStore {
  private pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async migrate(): Promise<void> {
    await this.pool.query(SCHEMA_SQL);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async create(record: SessionRecord): Promise<SessionRecord> {
    await this.pool.query(
      `INSERT INTO sessions (
        session_id, tenant_id, external_id, room_name, status, profile,
        audience_mode, realtime_url, playback_status, playback_hls_url,
        metadata, max_participants, idempotency_key, created_at, ended_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15
      )`,
      [
        record.sessionId,
        record.tenantId,
        record.externalId,
        record.roomName,
        record.status,
        record.profile,
        record.audienceMode,
        record.realtime.url,
        record.playback.status,
        record.playback.hlsUrl,
        JSON.stringify(record.metadata ?? {}),
        record.maxParticipants,
        record.idempotencyKey ?? null,
        record.createdAt,
        record.endedAt,
      ],
    );
    return record;
  }

  async get(sessionId: string): Promise<SessionRecord | undefined> {
    const res = await this.pool.query(
      `SELECT * FROM sessions WHERE session_id = $1`,
      [sessionId],
    );
    if (!res.rows[0]) return undefined;
    return rowToSession(res.rows[0]);
  }

  async getByIdempotencyKey(
    key: string,
    tenantId: string | null,
  ): Promise<SessionRecord | undefined> {
    const res = await this.pool.query(
      `SELECT * FROM sessions
       WHERE idempotency_key = $1
         AND COALESCE(tenant_id, '') = COALESCE($2, '')
       LIMIT 1`,
      [key, tenantId],
    );
    if (!res.rows[0]) return undefined;
    return rowToSession(res.rows[0]);
  }

  async getActiveByRoomName(
    roomName: string,
  ): Promise<SessionRecord | undefined> {
    const res = await this.pool.query(
      `SELECT * FROM sessions
       WHERE room_name = $1 AND status <> 'ended'
       ORDER BY created_at DESC
       LIMIT 1`,
      [roomName],
    );
    if (!res.rows[0]) return undefined;
    return rowToSession(res.rows[0]);
  }

  async list(
    status?: string,
    limit = 20,
    tenantId?: string | null,
  ): Promise<SessionRecord[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (status) {
      params.push(status);
      clauses.push(`status = $${params.length}`);
    }
    if (tenantId !== undefined) {
      params.push(tenantId);
      clauses.push(`tenant_id IS NOT DISTINCT FROM $${params.length}`);
    }
    params.push(limit);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const res = await this.pool.query(
      `SELECT * FROM sessions ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToSession);
  }

  async update(
    sessionId: string,
    patch: Partial<SessionRecord>,
  ): Promise<SessionRecord | undefined> {
    const existing = await this.get(sessionId);
    if (!existing) return undefined;
    const updated: SessionRecord = {
      ...existing,
      ...patch,
      realtime: patch.realtime ?? existing.realtime,
      playback: patch.playback
        ? { ...existing.playback, ...patch.playback }
        : existing.playback,
      metadata: patch.metadata ?? existing.metadata,
    };
    await this.pool.query(
      `UPDATE sessions SET
        tenant_id = $2,
        external_id = $3,
        room_name = $4,
        status = $5,
        profile = $6,
        audience_mode = $7,
        realtime_url = $8,
        playback_status = $9,
        playback_hls_url = $10,
        metadata = $11::jsonb,
        max_participants = $12,
        ended_at = $13
       WHERE session_id = $1`,
      [
        sessionId,
        updated.tenantId,
        updated.externalId,
        updated.roomName,
        updated.status,
        updated.profile,
        updated.audienceMode,
        updated.realtime.url,
        updated.playback.status,
        updated.playback.hlsUrl,
        JSON.stringify(updated.metadata ?? {}),
        updated.maxParticipants,
        updated.endedAt,
      ],
    );
    return updated;
  }

  async end(sessionId: string): Promise<SessionRecord | undefined> {
    const existing = await this.get(sessionId);
    if (!existing) return undefined;
    if (existing.status === "ended") return existing;
    return this.update(sessionId, {
      status: "ended",
      endedAt: new Date().toISOString(),
      playback: {
        ...existing.playback,
        status:
          existing.playback.status === "ready" ? "ready" : "unavailable",
      },
    });
  }

  async putEgress(job: EgressJobRecord): Promise<EgressJobRecord> {
    await this.pool.query(
      `INSERT INTO egress_jobs (
        egress_id, session_id, tenant_id, type, status, filepath, hls_prefix,
        playback_hls_url, error, created_at, updated_at, quota_held
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
      )
      ON CONFLICT (egress_id) DO UPDATE SET
        status = EXCLUDED.status,
        filepath = COALESCE(EXCLUDED.filepath, egress_jobs.filepath),
        hls_prefix = COALESCE(EXCLUDED.hls_prefix, egress_jobs.hls_prefix),
        playback_hls_url = COALESCE(EXCLUDED.playback_hls_url, egress_jobs.playback_hls_url),
        error = EXCLUDED.error,
        updated_at = EXCLUDED.updated_at,
        quota_held = EXCLUDED.quota_held`,
      [
        job.egressId,
        job.sessionId,
        job.tenantId,
        job.type,
        job.status,
        job.filepath ?? null,
        job.hlsPrefix ?? null,
        job.playback.hlsUrl,
        job.error,
        job.createdAt,
        job.updatedAt,
        job.quotaHeld ?? false,
      ],
    );
    return job;
  }

  async getEgress(egressId: string): Promise<EgressJobRecord | undefined> {
    const res = await this.pool.query(
      `SELECT * FROM egress_jobs WHERE egress_id = $1`,
      [egressId],
    );
    if (!res.rows[0]) return undefined;
    return rowToEgress(res.rows[0]);
  }

  async listEgress(sessionId: string): Promise<EgressJobRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM egress_jobs WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionId],
    );
    return res.rows.map(rowToEgress);
  }

  /** Lightweight rows for usage-meter rebuild after process restart. */
  async listAllForUsage(): Promise<
    Array<{
      createdAt: string;
      endedAt: string | null;
      status: string;
      maxParticipants: number;
    }>
  > {
    const res = await this.pool.query(
      `SELECT created_at, ended_at, status, max_participants FROM sessions`,
    );
    return res.rows.map((row) => ({
      createdAt: toIso(row.created_at),
      endedAt: row.ended_at == null ? null : toIso(row.ended_at),
      status: String(row.status),
      maxParticipants: Number(row.max_participants ?? 50),
    }));
  }

  async countEgressJobs(): Promise<{ started: number; completed: number }> {
    const res = await this.pool.query(
      `SELECT
         count(*)::int AS started,
         count(*) FILTER (WHERE status IN ('complete', 'completed', 'ended'))::int AS completed
       FROM egress_jobs`,
    );
    const row = res.rows[0] as { started?: number; completed?: number } | undefined;
    return {
      started: Number(row?.started ?? 0),
      completed: Number(row?.completed ?? 0),
    };
  }
}

function rowToSession(row: Record<string, unknown>): SessionRecord {
  const meta = row.metadata;
  let metadata: Record<string, unknown> = {};
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    metadata = meta as Record<string, unknown>;
  } else if (typeof meta === "string") {
    try {
      metadata = JSON.parse(meta) as Record<string, unknown>;
    } catch {
      metadata = {};
    }
  }
  return {
    sessionId: String(row.session_id),
    tenantId: row.tenant_id == null ? null : String(row.tenant_id),
    externalId: row.external_id == null ? null : String(row.external_id),
    roomName: String(row.room_name),
    status: row.status as SessionStatus,
    profile: row.profile as CapabilityProfile,
    audienceMode: row.audience_mode as AudienceMode,
    realtime: { url: String(row.realtime_url) },
    playback: {
      status: row.playback_status as SessionRecord["playback"]["status"],
      hlsUrl:
        row.playback_hls_url == null ? null : String(row.playback_hls_url),
    },
    metadata,
    maxParticipants: Number(row.max_participants ?? 50),
    idempotencyKey: row.idempotency_key
      ? String(row.idempotency_key)
      : undefined,
    createdAt: toIso(row.created_at),
    endedAt: row.ended_at == null ? null : toIso(row.ended_at),
  };
}

function rowToEgress(row: Record<string, unknown>): EgressJobRecord {
  return {
    egressId: String(row.egress_id),
    sessionId: String(row.session_id),
    tenantId: row.tenant_id == null ? null : String(row.tenant_id),
    type: row.type as EgressType,
    status: row.status as EgressStatus,
    filepath: row.filepath ? String(row.filepath) : undefined,
    hlsPrefix: row.hls_prefix ? String(row.hls_prefix) : undefined,
    playback: {
      hlsUrl:
        row.playback_hls_url == null ? null : String(row.playback_hls_url),
    },
    error: row.error == null ? null : String(row.error),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    quotaHeld: Boolean(row.quota_held),
  };
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export async function createPostgresSessionStore(
  databaseUrl: string,
): Promise<PostgresSessionStore> {
  const store = new PostgresSessionStore(databaseUrl);
  await store.migrate();
  return store;
}
