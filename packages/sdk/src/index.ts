/**
 * SoftQraft Realtime Media — public Gateway client (backend use only).
 * Never ship API keys to browsers or mobile apps.
 */

import type {
  AudienceMode,
  CapabilityProfile,
  ParticipantRole,
} from "@softqraft/shared";

export type {
  AudienceMode,
  CapabilityProfile,
  ParticipantRole,
  DeploymentPlane,
  HostingCostClass,
} from "@softqraft/shared";

export interface SoftQraftClientOptions {
  /** Gateway base URL, e.g. https://media.softqraftlabs.com */
  baseUrl: string;
  /** Tenant service API key (`sq_…` or bootstrap key) */
  apiKey: string;
  /** Optional fetch implementation (tests / edge) */
  fetch?: typeof fetch;
}

export interface CreateSessionInput {
  idempotencyKey?: string;
  externalId?: string;
  roomName?: string;
  profile?: CapabilityProfile;
  metadata?: Record<string, unknown>;
  realtime?: {
    emptyTimeoutSeconds?: number;
    maxParticipants?: number;
  };
  audience?: {
    mode?: AudienceMode;
    visibility?: "public" | "private";
  };
  recording?: {
    file?: { enabled?: boolean; keyTemplate?: string };
  };
}

export interface Session {
  sessionId: string;
  tenantId: string | null;
  externalId: string | null;
  roomName: string;
  status: string;
  profile: CapabilityProfile;
  audienceMode: AudienceMode;
  realtime: { url: string };
  playback: { status: string; hlsUrl: string | null };
  metadata: Record<string, unknown>;
  createdAt: string;
  endedAt: string | null;
}

export interface MintTokenInput {
  identity: string;
  name?: string;
  role: ParticipantRole;
  ttlSeconds?: number;
  attributes?: Record<string, string>;
}

export interface MintedToken {
  token: string;
  identity: string;
  role: ParticipantRole;
  expiresAt: string;
  realtimeUrl: string;
  iceServers: Array<{
    urls: string[];
    username?: string;
    credential?: string;
  }>;
}

export interface SoftQraftErrorBody {
  error?: { code?: string; message?: string; requestId?: string };
}

export class SoftQraftApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    status: number,
    message: string,
    opts?: { code?: string; requestId?: string },
  ) {
    super(message);
    this.name = "SoftQraftApiError";
    this.status = status;
    this.code = opts?.code;
    this.requestId = opts?.requestId;
  }
}

/**
 * Backend-only HTTP client for SoftQraft Gateway.
 *
 * @example
 * ```ts
 * const sq = new SoftQraftClient({
 *   baseUrl: process.env.SOFTQRAFT_GATEWAY_URL!,
 *   apiKey: process.env.SOFTQRAFT_API_KEY!,
 * });
 * const session = await sq.createSession({ externalId: "show-1", profile: "interactive" });
 * const { token, realtimeUrl, iceServers } = await sq.mintToken(session.sessionId, {
 *   identity: "host-1",
 *   role: "host",
 * });
 * ```
 */
export class SoftQraftClient {
  private baseUrl: string;
  private apiKey: string;
  private fetchFn: typeof fetch;

  constructor(opts: SoftQraftClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
    if (!this.baseUrl) throw new Error("baseUrl is required");
    if (!this.apiKey) throw new Error("apiKey is required");
  }

  async createSession(input: CreateSessionInput = {}): Promise<Session> {
    return this.request<Session>("POST", "/v1/sessions", input);
  }

  async getSession(sessionId: string): Promise<Session> {
    return this.request<Session>(
      "GET",
      `/v1/sessions/${encodeURIComponent(sessionId)}`,
    );
  }

  async listSessions(query?: {
    status?: string;
    limit?: number;
  }): Promise<{ items: Session[] }> {
    const q = new URLSearchParams();
    if (query?.status) q.set("status", query.status);
    if (query?.limit != null) q.set("limit", String(query.limit));
    const suffix = q.toString() ? `?${q}` : "";
    return this.request("GET", `/v1/sessions${suffix}`);
  }

  async endSession(sessionId: string): Promise<Session> {
    return this.request(
      "POST",
      `/v1/sessions/${encodeURIComponent(sessionId)}/end`,
    );
  }

  async mintToken(
    sessionId: string,
    input: MintTokenInput,
  ): Promise<MintedToken> {
    return this.request(
      "POST",
      `/v1/sessions/${encodeURIComponent(sessionId)}/tokens`,
      input,
    );
  }

  async startEgress(
    sessionId: string,
    body: {
      type: "room_composite_file" | "room_composite_hls";
      options?: Record<string, unknown>;
    },
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/v1/sessions/${encodeURIComponent(sessionId)}/egress`,
      body,
    );
  }

  async getPlayback(sessionId: string): Promise<unknown> {
    return this.request(
      "GET",
      `/v1/sessions/${encodeURIComponent(sessionId)}/playback`,
    );
  }

  async health(): Promise<{ status: string }> {
    return this.request("GET", "/health");
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const data = (await res.json().catch(() => ({}))) as SoftQraftErrorBody & T;
    if (!res.ok) {
      throw new SoftQraftApiError(
        res.status,
        data?.error?.message || `HTTP ${res.status}`,
        { code: data?.error?.code, requestId: data?.error?.requestId },
      );
    }
    return data as T;
  }
}
