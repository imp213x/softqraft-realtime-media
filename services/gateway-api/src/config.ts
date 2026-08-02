export interface GatewayConfig {
  host: string;
  port: number;
  /** Public LiveKit WebSocket URL returned to clients */
  realtimeUrl: string;
  /** Comma-separated service API keys Clatters backends may use */
  serviceApiKeys: Set<string>;
}

export function loadConfig(): GatewayConfig {
  const keys = (process.env.GATEWAY_SERVICE_API_KEYS ?? "dev-local-key")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  return {
    host: process.env.GATEWAY_HOST ?? "0.0.0.0",
    port: Number(process.env.GATEWAY_PORT ?? "8080"),
    realtimeUrl:
      process.env.LIVEKIT_REALTIME_URL ?? "ws://localhost:7880",
    serviceApiKeys: new Set(keys),
  };
}
