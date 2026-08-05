/**
 * In-process usage meter (R3).
 * Single-node only; multi-instance needs Redis/file later.
 */

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

  constructor(opts?: { defaultBitrateMbps?: number }) {
    this.defaultBitrateMbps = opts?.defaultBitrateMbps ?? 1.5;
  }

  recordSessionCreated(): void {
    this.sessionsCreated += 1;
    this.sessionsActive += 1;
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
      return;
    }
    const hours = (end - start) / 3_600_000;
    this.sessionMinutes += hours * 60;

    const viewers = Math.max(0, input.assumedViewers ?? 0);
    if (viewers > 0) {
      this.estimatedDownstreamGbProxy +=
        (viewers * this.defaultBitrateMbps * hours * 3600) / 8000;
    }
  }

  recordTokenMinted(): void {
    this.tokensMinted += 1;
  }

  recordEgressStarted(): void {
    this.egressJobsStarted += 1;
  }

  recordEgressCompleted(): void {
    this.egressJobsCompleted += 1;
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
    };
  }
}
