export interface S3Config {
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
  endpoint?: string;
  forcePathStyle: boolean;
}

export interface GatewayConfig {
  host: string;
  port: number;
  serviceApiKeys: Set<string>;
  /** Public WebSocket URL returned to clients */
  realtimeUrl: string;
  /** HTTP base for LiveKit server SDK (RoomService / Egress) */
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  redisUrl: string;
  s3: S3Config | null;
  recordingKeyTemplate: string;
  defaultTokenTtlSeconds: number;
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

export function loadConfig(): GatewayConfig {
  const keys = env("GATEWAY_SERVICE_API_KEYS", "dev-local-key")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

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

  return {
    host: env("GATEWAY_HOST", "0.0.0.0"),
    port: Number(env("GATEWAY_PORT", "8080")),
    serviceApiKeys: new Set(keys),
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
    defaultTokenTtlSeconds: Number(env("TOKEN_TTL_SECONDS", "600")),
  };
}
