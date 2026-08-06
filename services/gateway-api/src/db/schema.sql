-- SoftQraft Gateway durable state (hardening #3)
-- Applied automatically on Gateway boot when DATABASE_URL is set.

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

-- Unique idempotency per tenant (null tenant → '')
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

-- P0.5 Admin operators + sessions
CREATE TABLE IF NOT EXISTS admin_operators (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  password_salt   TEXT NOT NULL,
  role            TEXT NOT NULL,
  disabled_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id              TEXT PRIMARY KEY,
  operator_id     TEXT NOT NULL REFERENCES admin_operators(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx
  ON admin_sessions (expires_at);
