import { parseTenantsEnv } from "./lib/tenants.js";

export interface S3Config {
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
  endpoint?: string;
  forcePathStyle: boolean;
}

export interface IceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface TenantRecord {
  tenantId: string;
  apiKey: string;
  maxSessions: number;
  maxEgress: number;
}

export interface GatewayConfig {
  host: string;
  port: number;
  /** Legacy flat keys (still accepted when GATEWAY_TENANTS empty or as fallback) */
  serviceApiKeys: Set<string>;
  /** Multi-tenant registry keyed by API key */
  tenantsByKey: Map<string, TenantRecord>;
  tenants: TenantRecord[];
  /** Public WebSocket URL returned to clients */
  realtimeUrl: string;
  /** HTTP base for LiveKit server SDK (RoomService / Egress) */
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  redisUrl: string;
  s3: S3Config | null;
  recordingKeyTemplate: string;
  hlsKeyTemplate: string;
  /** Origin base for HLS playlists (path-style bucket URL or CDN-less public origin) */
  hlsPublicBaseUrl: string;
  /** Optional CDN base; when set, playback URLs prefer this over hlsPublicBaseUrl */
  cdnPublicBaseUrl: string;
  /** TURN/STUN servers returned with participant tokens for client ICE */
  iceServers: IceServerConfig[];
  defaultTokenTtlSeconds: number;
  /**
   * Optional consumer webhook URLs (e.g. Clatters /api/livekit/egress-webhook).
   * LiveKit webhooks are verified then forwarded with the original signature.
   */
  webhookForwardUrls: string[];
}

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = env(name);
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function toHttpLiveKitUrl(url: string): string {
  return url
    .replace(/^wss:/i, "https:")
    .replace(/^ws:/i, "http:")
    .replace(/\/$/, "");
}

function buildIceServers(): IceServerConfig[] {
  const servers: IceServerConfig[] = [];

  // Always include public STUN for local/dev convenience
  const stunUrls = env("STUN_URLS", "stun:stun.l.google.com:19302");
  if (stunUrls) {
    servers.push({
      urls: stunUrls
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean),
    });
  }

  const turnUrls = env("TURN_URLS");
  const turnUser = env("TURN_USERNAME", "softqraft");
  const turnPass = env("TURN_PASSWORD", "softqraftturn");
  if (turnUrls) {
    servers.push({
      urls: turnUrls
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean),
      username: turnUser,
      credential: turnPass,
    });
  } else if (envBool("TURN_ENABLED", false) || env("TURN_HOST")) {
    // Convenience: TURN_HOST=host.example.com → standard UDP/TCP URLs
    const host = env("TURN_HOST", "localhost");
    const port = env("TURN_PORT", "3478");
    servers.push({
      urls: [
        `turn:${host}:${port}?transport=udp`,
        `turn:${host}:${port}?transport=tcp`,
      ],
      username: turnUser,
      credential: turnPass,
    });
  }

  return servers;
}

export function loadConfig(): GatewayConfig {
  const keys = env("GATEWAY_SERVICE_API_KEYS", "dev-local-key")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const tenants = parseTenantsEnv(env("GATEWAY_TENANTS"));
  const tenantsByKey = new Map<string, TenantRecord>();
  for (const t of tenants) {
    if (tenantsByKey.has(t.apiKey)) {
      throw new Error(
        `Duplicate API key in GATEWAY_TENANTS for tenant '${t.tenantId}'`,
      );
    }
    tenantsByKey.set(t.apiKey, t);
  }

  const livekitWsOrHttp = env("LIVEKIT_URL", "http://localhost:7880");
  const realtimeUrl = env(
    "LIVEKIT_REALTIME_URL",
    livekitWsOrHttp
      .replace(/^https:/i, "wss:")
      .replace(/^http:/i, "ws:"),
  );

  const bucket = env("S3_BUCKET_NAME") || env("LIVEKIT_EGRESS_S3_BUCKET");
  const accessKey =
    env("AWS_ACCESS_KEY_ID") || env("LIVEKIT_EGRESS_S3_ACCESS_KEY");
  const secretKey =
    env("AWS_SECRET_ACCESS_KEY") || env("LIVEKIT_EGRESS_S3_SECRET");
  const region =
    env("AWS_REGION") ||
    env("LIVEKIT_EGRESS_S3_REGION") ||
    "us-east-1";
  const endpoint =
    env("S3_ENDPOINT") || env("LIVEKIT_EGRESS_S3_ENDPOINT") || undefined;
  const forcePathStyle = envBool(
    "S3_FORCE_PATH_STYLE",
    envBool("LIVEKIT_EGRESS_S3_FORCE_PATH_STYLE", Boolean(endpoint)),
  );

  const s3: S3Config | null =
    bucket && accessKey && secretKey
      ? {
          bucket,
          region,
          accessKey,
          secretKey,
          endpoint,
          forcePathStyle,
        }
      : null;

  const hlsPublicBaseUrl = env(
    "HLS_PUBLIC_BASE_URL",
    bucket
      ? endpoint
        ? `${endpoint.replace(/\/$/, "")}/${bucket}`
        : `https://${bucket}.s3.${region}.amazonaws.com`
      : "",
  );

  return {
    host: env("GATEWAY_HOST", "0.0.0.0"),
    port: Number(env("GATEWAY_PORT", "8080")),
    serviceApiKeys: new Set(keys),
    tenantsByKey,
    tenants,
    realtimeUrl,
    livekitUrl: toHttpLiveKitUrl(livekitWsOrHttp),
    livekitApiKey: env("LIVEKIT_API_KEY", "softqraft_dev_key"),
    livekitApiSecret: env(
      "LIVEKIT_API_SECRET",
      "softqraft_dev_secret_change_me_before_prod",
    ),
    redisUrl: env("REDIS_URL", "redis://localhost:6379"),
    s3,
    recordingKeyTemplate: env(
      "RECORDING_KEY_TEMPLATE",
      "recordings/{externalId}/{sessionId}-{time}.mp4",
    ),
    hlsKeyTemplate: env(
      "HLS_KEY_TEMPLATE",
      "hls/{externalId}/{sessionId}",
    ),
    hlsPublicBaseUrl: hlsPublicBaseUrl.replace(/\/$/, ""),
    cdnPublicBaseUrl: env("CDN_PUBLIC_BASE_URL").replace(/\/$/, ""),
    iceServers: buildIceServers(),
    defaultTokenTtlSeconds: Number(env("TOKEN_TTL_SECONDS", "600")),
    webhookForwardUrls: env("WEBHOOK_FORWARD_URLS")
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean),
  };
}
