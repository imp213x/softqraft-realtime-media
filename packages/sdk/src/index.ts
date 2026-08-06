/**
 * SoftQraft Realtime Media — public Gateway client (backend use only).
 *
 * Package boundary (M1):
 * - Consumer apps MUST use this package (or raw HTTP OpenAPI), never `gateway-api` internals.
 * - Never ship API keys to browsers or mobile apps.
 * - Media clients use LiveKit SDK with token + realtimeUrl (+ iceServers) from mintToken.
 */

import type {
  AudienceMode,
  CapabilityProfile,
  EgressStatus,
  EgressType,
  ParticipantRole,
  SessionStatus,
} from "@softqraft/shared";

export type {
  AudienceMode,
  CapabilityProfile,
  DeploymentPlane,
  EgressStatus,
  EgressType,
  HostingCostClass,
  ParticipantRole,
  SessionStatus,
} from "@softqraft/shared";

export { COST_PROFILE_NOTES, ERROR_CODES, estimateDownstreamGb } from "@softqraft/shared";

/** Semantic version of this client package (keep in sync with package.json). */
export const SDK_VERSION = "0.2.0";

/** Gateway HTTP API major contract this client targets. */
export const GATEWAY_API_VERSION = "v1" as const;

export interface SoftQraftClientOptions {
  /** Gateway base URL, e.g. https://media.softqraftlabs.com */
  baseUrl: string;
  /**
   * Tenant service API key from Admin console (`sqk_…`) or env bootstrap key.
   * Server-side only.
   */
  apiKey: string;
  /** Optional fetch implementation (tests / edge) */
  fetch?: typeof fetch;
  /** Optional request timeout ms (AbortSignal). 0 = none */
  timeoutMs?: number;
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
  status: SessionStatus | string;
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

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface MintedToken {
  token: string;
  identity: string;
  role: ParticipantRole;
  expiresAt: string;
  realtimeUrl: string;
  iceServers: IceServer[];
}

export interface StartEgressInput {
  type: Extract<EgressType, "room_composite_file" | "room_composite_hls">;
  options?: {
    fileType?: string;
    filepath?: string;
    keyTemplate?: string;
    layout?: string;
    segmentDurationSeconds?: number;
    playlistName?: string;
    livePlaylistName?: string;
  };
}

export interface EgressJob {
  egressId: string;
  sessionId: string | null;
  type: EgressType | string;
  status: EgressStatus | string;
  playback: { hlsUrl: string | null };
  error: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PlaybackInfo {
  sessionId: string;
  audienceMode: AudienceMode | string;
  status: string;
  hlsUrl: string | null;
  realtimeUrl: string;
}

export interface ReadyStatus {
  status: "ready" | "not_ready" | string;
  checks?: Record<string, unknown>;
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
 * Backend-only HTTP client for SoftQraft Gateway API v1.
 *
 * @example
 * ```ts
 * import { SoftQraftClient } from "@softqraft/sdk";
 *
 * const sq = new SoftQraftClient({
 *   baseUrl: process.env.SOFTQRAFT_GATEWAY_URL!,
 *   apiKey: process.env.SOFTQRAFT_API_KEY!,
 * });
 * const session = await sq.createSession({ externalId: "show-1", profile: "interactive" });
 * const { token, realtimeUrl, iceServers } = await sq.mintToken(session.sessionId, {
 *   identity: "host-1",
 *   role: "host",
 * });
 * // LiveKit: room.connect(realtimeUrl, token, { rtcConfig: { iceServers } })
 * ```
 */
export class SoftQraftClient {
  private baseUrl: string;
  private apiKey: string;
  private fetchFn: typeof fetch;
  private timeoutMs: number;

  constructor(opts: SoftQraftClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = opts.timeoutMs ?? 0;
    if (!this.baseUrl) throw new Error("baseUrl is required");
    if (!this.apiKey) throw new Error("apiKey is required");
  }

  /** Gateway origin used by this client */
  get gatewayUrl(): string {
    return this.baseUrl;
  }

  async health(): Promise<{ status: string }> {
    return this.request("GET", "/health");
  }

  async ready(): Promise<ReadyStatus> {
    return this.request("GET", "/ready");
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
      {},
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

  /**
   * Start room composite egress (MP4 file or HLS segments).
   * HLS is a capability for large audience; not required for interactive-only apps.
   */
  async startEgress(
    sessionId: string,
    body: StartEgressInput,
  ): Promise<EgressJob> {
    return this.request(
      "POST",
      `/v1/sessions/${encodeURIComponent(sessionId)}/egress`,
      body,
    );
  }

  /** Convenience: room_composite_hls */
  async startHlsEgress(
    sessionId: string,
    options?: StartEgressInput["options"],
  ): Promise<EgressJob> {
    return this.startEgress(sessionId, {
      type: "room_composite_hls",
      options,
    });
  }

  /** Convenience: room_composite_file (Echo-style MP4) */
  async startFileEgress(
    sessionId: string,
    options?: StartEgressInput["options"],
  ): Promise<EgressJob> {
    return this.startEgress(sessionId, {
      type: "room_composite_file",
      options,
    });
  }

  async listEgress(sessionId: string): Promise<{ items: EgressJob[] }> {
    return this.request(
      "GET",
      `/v1/sessions/${encodeURIComponent(sessionId)}/egress`,
    );
  }

  async getEgress(egressId: string): Promise<EgressJob> {
    return this.request(
      "GET",
      `/v1/egress/${encodeURIComponent(egressId)}`,
    );
  }

  async stopEgress(egressId: string): Promise<EgressJob> {
    return this.request(
      "POST",
      `/v1/egress/${encodeURIComponent(egressId)}/stop`,
      {},
    );
  }

  async getPlayback(sessionId: string): Promise<PlaybackInfo> {
    return this.request(
      "GET",
      `/v1/sessions/${encodeURIComponent(sessionId)}/playback`,
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const controller =
      this.timeoutMs > 0 ? new AbortController() : undefined;
    const timer =
      controller &&
      setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller?.signal,
      });

      const data = (await res.json().catch(() => ({}))) as SoftQraftErrorBody &
        T;
      if (!res.ok) {
        throw new SoftQraftApiError(
          res.status,
          data?.error?.message || `HTTP ${res.status}`,
          { code: data?.error?.code, requestId: data?.error?.requestId },
        );
      }
      return data as T;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
