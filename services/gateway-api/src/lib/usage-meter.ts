/**
 * Usage meter (R3) with optional file persistence so gateway restarts
 * do not wipe operator-visible counters. Single-node file path;
 * multi-instance should move to Redis later.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface UsageSnapshot {
  since: string;
  updatedAt: string;
  sessionsCreated: number;
  sessionsEnded: number;
  sessionsActive: number;
  /** Sum of completed session durations (minutes). */
  sessionMinutes: number;
  tokensMinted: number;
  egressJobsStarted: number;
  egressJobsCompleted: number;
  /**
   * Proxy only: assumes avg concurrent viewers = maxParticipants of session
   * and default bitrate when ending. Not measured WebRTC bytes.
   */
  estimatedDownstreamGbProxy: number;
  assumptions: {
    defaultBitrateMbps: number;
    formula: string;
  };
  /** True when counters were restored from disk or session store. */
  restored?: boolean;
  restoreSource?: string;
}

interface PersistedUsage {
  version: 1;
  since: string;
  sessionsCreated: number;
  sessionsEnded: number;
  sessionsActive: number;
  sessionMinutes: number;
  tokensMinted: number;
  egressJobsStarted: number;
  egressJobsCompleted: number;
  estimatedDownstreamGbProxy: number;
  defaultBitrateMbps: number;
  updatedAt: string;
}

export interface SessionUsageSeed {
  createdAt: string;
  endedAt: string | null;
  status: string;
  maxParticipants: number;
}

export class UsageMeter {
  private since = new Date().toISOString();
  private sessionsCreated = 0;
  private sessionsEnded = 0;
  private sessionsActive = 0;
  private sessionMinutes = 0;
  private tokensMinted = 0;
  private egressJobsStarted = 0;
  private egressJobsCompleted = 0;
  private estimatedDownstreamGbProxy = 0;
  private defaultBitrateMbps: number;
  private storePath: string | null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private restored = false;
  private restoreSource = "";

  constructor(opts?: { defaultBitrateMbps?: number; storePath?: string }) {
    this.defaultBitrateMbps = opts?.defaultBitrateMbps ?? 1.5;
    this.storePath = opts?.storePath ?? null;
  }

  /** Load counters from disk if present. */
  async loadFromDisk(): Promise<boolean> {
    if (!this.storePath) return false;
    try {
      const raw = await readFile(this.storePath, "utf8");
      const data = JSON.parse(raw) as PersistedUsage;
      if (!data || data.version !== 1) return false;
      this.since = data.since || this.since;
      this.sessionsCreated = num(data.sessionsCreated);
      this.sessionsEnded = num(data.sessionsEnded);
      this.sessionsActive = Math.max(0, num(data.sessionsActive));
      this.sessionMinutes = num(data.sessionMinutes);
      this.tokensMinted = num(data.tokensMinted);
      this.egressJobsStarted = num(data.egressJobsStarted);
      this.egressJobsCompleted = num(data.egressJobsCompleted);
      this.estimatedDownstreamGbProxy = num(data.estimatedDownstreamGbProxy);
      if (data.defaultBitrateMbps > 0) {
        this.defaultBitrateMbps = data.defaultBitrateMbps;
      }
      this.restored = true;
      this.restoreSource = "file";
      return true;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") return false;
      // Corrupt file — start fresh rather than crash boot
      return false;
    }
  }

  /**
   * Rebuild counters from durable session rows (Postgres).
   * Used when the usage file is missing after a deploy/restart.
   * tokensMinted cannot be recovered (not stored on sessions).
   */
  restoreFromSessions(
    sessions: SessionUsageSeed[],
    opts?: { egressStarted?: number; egressCompleted?: number },
  ): void {
    let created = 0;
    let ended = 0;
    let active = 0;
    let minutes = 0;
    let gb = 0;
    let earliest = "";

    for (const s of sessions) {
      created += 1;
      if (!earliest || s.createdAt < earliest) earliest = s.createdAt;
      const isEnded = s.status === "ended" || Boolean(s.endedAt);
      if (isEnded) {
        ended += 1;
        const start = Date.parse(s.createdAt);
        const end = Date.parse(s.endedAt ?? s.createdAt);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
          const hours = (end - start) / 3_600_000;
          minutes += hours * 60;
          const viewers = Math.max(0, s.maxParticipants || 0);
          if (viewers > 0) {
            gb += (viewers * this.defaultBitrateMbps * hours * 3600) / 8000;
          }
        }
      } else {
        active += 1;
      }
    }

    this.since = earliest || this.since;
    this.sessionsCreated = created;
    this.sessionsEnded = ended;
    this.sessionsActive = active;
    this.sessionMinutes = minutes;
    this.estimatedDownstreamGbProxy = gb;
    this.egressJobsStarted = opts?.egressStarted ?? this.egressJobsStarted;
    this.egressJobsCompleted = opts?.egressCompleted ?? this.egressJobsCompleted;
    // tokensMinted left as-is (unknown from sessions)
    this.restored = true;
    this.restoreSource = "sessions";
    void this.persistNow();
  }

  recordSessionCreated(): void {
    this.sessionsCreated += 1;
    this.sessionsActive += 1;
    this.schedulePersist();
  }

  recordSessionEnded(input: {
    startedAt: string;
    endedAt?: string;
    /** Used for GB proxy when known (e.g. maxParticipants). */
    assumedViewers?: number;
  }): void {
    this.sessionsEnded += 1;
    this.sessionsActive = Math.max(0, this.sessionsActive - 1);

    const start = Date.parse(input.startedAt);
    const end = Date.parse(input.endedAt ?? new Date().toISOString());
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      this.schedulePersist();
      return;
    }
    const hours = (end - start) / 3_600_000;
    this.sessionMinutes += hours * 60;

    const viewers = Math.max(0, input.assumedViewers ?? 0);
    if (viewers > 0) {
      this.estimatedDownstreamGbProxy +=
        (viewers * this.defaultBitrateMbps * hours * 3600) / 8000;
    }
    this.schedulePersist();
  }

  recordTokenMinted(): void {
    this.tokensMinted += 1;
    this.schedulePersist();
  }

  recordEgressStarted(): void {
    this.egressJobsStarted += 1;
    this.schedulePersist();
  }

  recordEgressCompleted(): void {
    this.egressJobsCompleted += 1;
    this.schedulePersist();
  }

  snapshot(): UsageSnapshot {
    return {
      since: this.since,
      updatedAt: new Date().toISOString(),
      sessionsCreated: this.sessionsCreated,
      sessionsEnded: this.sessionsEnded,
      sessionsActive: this.sessionsActive,
      sessionMinutes: Math.round(this.sessionMinutes * 100) / 100,
      tokensMinted: this.tokensMinted,
      egressJobsStarted: this.egressJobsStarted,
      egressJobsCompleted: this.egressJobsCompleted,
      estimatedDownstreamGbProxy:
        Math.round(this.estimatedDownstreamGbProxy * 1000) / 1000,
      assumptions: {
        defaultBitrateMbps: this.defaultBitrateMbps,
        formula:
          "GB ≈ assumedViewers × bitrateMbps × hours × 3600 / 8000 (proxy, not measured bytes)",
      },
      restored: this.restored || undefined,
      restoreSource: this.restoreSource || undefined,
    };
  }

  private schedulePersist(): void {
    if (!this.storePath) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistNow();
    }, 500);
  }

  async persistNow(): Promise<void> {
    if (!this.storePath) return;
    const body: PersistedUsage = {
      version: 1,
      since: this.since,
      sessionsCreated: this.sessionsCreated,
      sessionsEnded: this.sessionsEnded,
      sessionsActive: this.sessionsActive,
      sessionMinutes: this.sessionMinutes,
      tokensMinted: this.tokensMinted,
      egressJobsStarted: this.egressJobsStarted,
      egressJobsCompleted: this.egressJobsCompleted,
      estimatedDownstreamGbProxy: this.estimatedDownstreamGbProxy,
      defaultBitrateMbps: this.defaultBitrateMbps,
      updatedAt: new Date().toISOString(),
    };
    try {
      await mkdir(path.dirname(this.storePath), { recursive: true });
      const tmp = `${this.storePath}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(body, null, 2), "utf8");
      await rename(tmp, this.storePath);
    } catch {
      // Non-fatal: usage remains in memory
    }
  }
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
