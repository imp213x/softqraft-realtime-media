import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

export type AdminRole = "owner" | "admin" | "viewer";

export interface AdminOperator {
  id: string;
  email: string;
  role: AdminRole;
  disabledAt: string | null;
  createdAt: string;
}

export interface AdminSessionInfo {
  operator: AdminOperator;
  sessionId: string;
}

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const COOKIE_NAME = "sq_admin_session";

export function adminSessionCookieName(): string {
  return COOKIE_NAME;
}

function hashPassword(password: string, salt?: Buffer): { hash: string; salt: string } {
  const s = salt ?? randomBytes(16);
  const hash = scryptSync(password, s, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return { hash: hash.toString("base64"), salt: s.toString("base64") };
}

function verifyPassword(password: string, saltB64: string, hashB64: string): boolean {
  try {
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = scryptSync(password, salt, expected.length, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    });
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

/** Simple per-IP rate limit for login/bootstrap */
export class LoginRateLimiter {
  private hits = new Map<string, { n: number; resetAt: number }>();

  constructor(
    private max = 10,
    private windowMs = 60_000,
  ) {}

  check(ip: string): boolean {
    const now = Date.now();
    const row = this.hits.get(ip);
    if (!row || row.resetAt < now) {
      this.hits.set(ip, { n: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (row.n >= this.max) return false;
    row.n += 1;
    return true;
  }
}

export interface AdminAuthStore {
  countOperators(): Promise<number>;
  createOperator(input: {
    email: string;
    password: string;
    role: AdminRole;
  }): Promise<AdminOperator>;
  verifyCredentials(
    email: string,
    password: string,
  ): Promise<AdminOperator | null>;
  createSession(operatorId: string): Promise<string>;
  resolveSession(token: string): Promise<AdminSessionInfo | null>;
  deleteSession(token: string): Promise<void>;
  close?(): Promise<void>;
}

// --- Postgres ---

export class PostgresAdminAuthStore implements AdminAuthStore {
  private pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
  }

  async migrate(): Promise<void> {
    await this.pool.query(`
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
    `);
  }

  async countOperators(): Promise<number> {
    const r = await this.pool.query(`SELECT COUNT(*)::int AS n FROM admin_operators`);
    return Number(r.rows[0]?.n ?? 0);
  }

  async createOperator(input: {
    email: string;
    password: string;
    role: AdminRole;
  }): Promise<AdminOperator> {
    const email = normalizeEmail(input.email);
    assertPassword(input.password);
    const id = newId("adm");
    const { hash, salt } = hashPassword(input.password);
    const createdAt = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO admin_operators (id, email, password_hash, password_salt, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, email, hash, salt, input.role, createdAt],
    );
    return {
      id,
      email,
      role: input.role,
      disabledAt: null,
      createdAt,
    };
  }

  async verifyCredentials(
    email: string,
    password: string,
  ): Promise<AdminOperator | null> {
    const r = await this.pool.query(
      `SELECT id, email, password_hash, password_salt, role, disabled_at, created_at
       FROM admin_operators WHERE email = $1`,
      [normalizeEmail(email)],
    );
    const row = r.rows[0];
    if (!row) return null;
    if (row.disabled_at) return null;
    if (!verifyPassword(password, row.password_salt, row.password_hash)) {
      return null;
    }
    return rowToOperator(row);
  }

  async createSession(operatorId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const id = newId("ads");
    const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await this.pool.query(
      `INSERT INTO admin_sessions (id, operator_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [id, operatorId, tokenHash, expires],
    );
    return token;
  }

  async resolveSession(token: string): Promise<AdminSessionInfo | null> {
    if (!token) return null;
    const tokenHash = hashToken(token);
    const r = await this.pool.query(
      `SELECT s.id AS session_id, s.expires_at,
              o.id, o.email, o.role, o.disabled_at, o.created_at
       FROM admin_sessions s
       JOIN admin_operators o ON o.id = s.operator_id
       WHERE s.token_hash = $1`,
      [tokenHash],
    );
    const row = r.rows[0];
    if (!row) return null;
    if (row.disabled_at) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await this.pool.query(`DELETE FROM admin_sessions WHERE id = $1`, [
        row.session_id,
      ]);
      return null;
    }
    // sliding expiry
    const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await this.pool.query(
      `UPDATE admin_sessions SET expires_at = $1 WHERE id = $2`,
      [expires, row.session_id],
    );
    return {
      sessionId: String(row.session_id),
      operator: rowToOperator(row),
    };
  }

  async deleteSession(token: string): Promise<void> {
    if (!token) return;
    await this.pool.query(`DELETE FROM admin_sessions WHERE token_hash = $1`, [
      hashToken(token),
    ]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// --- File fallback (no DATABASE_URL) ---

interface FileShape {
  operators: Array<{
    id: string;
    email: string;
    passwordHash: string;
    passwordSalt: string;
    role: AdminRole;
    disabledAt: string | null;
    createdAt: string;
  }>;
  sessions: Array<{
    id: string;
    operatorId: string;
    tokenHash: string;
    expiresAt: string;
  }>;
}

export class FileAdminAuthStore implements AdminAuthStore {
  private data: FileShape = { operators: [], sessions: [] };

  constructor(private filePath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      this.data = JSON.parse(raw) as FileShape;
      if (!this.data.operators) this.data.operators = [];
      if (!this.data.sessions) this.data.sessions = [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  private async save(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
  }

  async countOperators(): Promise<number> {
    return this.data.operators.length;
  }

  async createOperator(input: {
    email: string;
    password: string;
    role: AdminRole;
  }): Promise<AdminOperator> {
    const email = normalizeEmail(input.email);
    assertPassword(input.password);
    if (this.data.operators.some((o) => o.email === email)) {
      throw new Error("Email already registered");
    }
    const id = newId("adm");
    const { hash, salt } = hashPassword(input.password);
    const createdAt = new Date().toISOString();
    this.data.operators.push({
      id,
      email,
      passwordHash: hash,
      passwordSalt: salt,
      role: input.role,
      disabledAt: null,
      createdAt,
    });
    await this.save();
    return { id, email, role: input.role, disabledAt: null, createdAt };
  }

  async verifyCredentials(
    email: string,
    password: string,
  ): Promise<AdminOperator | null> {
    const o = this.data.operators.find(
      (x) => x.email === normalizeEmail(email),
    );
    if (!o || o.disabledAt) return null;
    if (!verifyPassword(password, o.passwordSalt, o.passwordHash)) return null;
    return {
      id: o.id,
      email: o.email,
      role: o.role,
      disabledAt: o.disabledAt,
      createdAt: o.createdAt,
    };
  }

  async createSession(operatorId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    this.data.sessions.push({
      id: newId("ads"),
      operatorId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    });
    // prune expired
    const now = Date.now();
    this.data.sessions = this.data.sessions.filter(
      (s) => Date.parse(s.expiresAt) > now,
    );
    await this.save();
    return token;
  }

  async resolveSession(token: string): Promise<AdminSessionInfo | null> {
    if (!token) return null;
    const th = hashToken(token);
    const s = this.data.sessions.find((x) => x.tokenHash === th);
    if (!s) return null;
    if (Date.parse(s.expiresAt) < Date.now()) {
      this.data.sessions = this.data.sessions.filter((x) => x.id !== s.id);
      await this.save();
      return null;
    }
    const o = this.data.operators.find((x) => x.id === s.operatorId);
    if (!o || o.disabledAt) return null;
    s.expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await this.save();
    return {
      sessionId: s.id,
      operator: {
        id: o.id,
        email: o.email,
        role: o.role,
        disabledAt: o.disabledAt,
        createdAt: o.createdAt,
      },
    };
  }

  async deleteSession(token: string): Promise<void> {
    if (!token) return;
    const th = hashToken(token);
    this.data.sessions = this.data.sessions.filter((x) => x.tokenHash !== th);
    await this.save();
  }
}

export async function createAdminAuthStore(opts: {
  databaseUrl: string;
  filePath: string;
}): Promise<AdminAuthStore> {
  if (opts.databaseUrl) {
    const store = new PostgresAdminAuthStore(opts.databaseUrl);
    await store.migrate();
    return store;
  }
  const store = new FileAdminAuthStore(opts.filePath);
  await store.load();
  return store;
}

function hashToken(token: string): string {
  return scryptSync(token, "sq_admin_session_v1", 32).toString("base64");
}

function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

function assertPassword(password: string): void {
  if (!password || password.length < 10) {
    throw new Error("Password must be at least 10 characters");
  }
}

function rowToOperator(row: Record<string, unknown>): AdminOperator {
  return {
    id: String(row.id),
    email: String(row.email),
    role: row.role as AdminRole,
    disabledAt: row.disabled_at ? String(row.disabled_at) : null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}
