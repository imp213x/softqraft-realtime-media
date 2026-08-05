import Fastify from "fastify";
import cors from "@fastify/cors";
import { Redis } from "ioredis";
import { loadConfig } from "./config.js";
import { requestIdHook } from "./lib/request-id.js";
import { registerRawBodyHook } from "./lib/raw-body.js";
import {
  MemoryQuotaTracker,
  RedisQuotaTracker,
  type QuotaTracker,
} from "./lib/quotas.js";
import { CredentialStore } from "./lib/credential-store.js";
import { UsageMeter } from "./lib/usage-meter.js";
import { createLiveKitClients } from "./providers/livekit/client.js";
import {
  MemorySessionStore,
  type SessionStore,
} from "./modules/sessions/store.js";
import { createPostgresSessionStore } from "./modules/sessions/postgres-store.js";
import { registerHealthRoutes } from "./modules/health/routes.js";
import { registerSessionRoutes } from "./modules/sessions/routes.js";
import { registerEgressRoutes } from "./modules/egress/routes.js";
import { registerWebhookRoutes } from "./modules/webhooks/routes.js";
import { registerAdminRoutes } from "./modules/admin/routes.js";

async function main() {
  const config = loadConfig();
  const clients = createLiveKitClients(config);

  let store: SessionStore;
  let storeBackend: "memory" | "postgres" = "memory";
  if (config.databaseUrl) {
    store = await createPostgresSessionStore(config.databaseUrl);
    storeBackend = "postgres";
  } else {
    store = new MemorySessionStore();
  }

  let quotas: QuotaTracker;
  let quotaBackend: "memory" | "redis" = "memory";
  let redis: Redis | null = null;
  if (config.quotaBackend === "redis") {
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    await redis.connect();
    quotas = new RedisQuotaTracker(redis);
    quotaBackend = "redis";
  } else {
    quotas = new MemoryQuotaTracker();
  }

  const usage = new UsageMeter();
  const credentials = new CredentialStore({
    storePath: config.tenantStorePath,
    legacyKeys: config.serviceApiKeys,
    envTenants: config.tenants,
  });
  await credentials.loadFromDisk();

  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
  });

  await requestIdHook(app);
  await registerRawBodyHook(app);

  app.addContentTypeParser(
    "application/webhook+json",
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, body);
    },
  );

  await registerHealthRoutes(app, config, clients, {
    storeBackend,
    quotaBackend,
    redis,
  });
  await registerAdminRoutes(app, config, credentials, usage);
  await registerSessionRoutes(
    app,
    config,
    clients,
    store,
    quotas,
    credentials,
    usage,
  );
  await registerEgressRoutes(
    app,
    config,
    clients,
    store,
    quotas,
    credentials,
    usage,
  );
  await registerWebhookRoutes(app, config, store, quotas, usage);

  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    {
      realtimeUrl: config.realtimeUrl,
      livekitUrl: config.livekitUrl,
      publicGatewayUrl: config.publicGatewayUrl || null,
      deploymentPlane: config.deploymentPlane,
      hostingCostClass: config.hostingCostClass,
      storeBackend,
      quotaBackend,
      databaseUrl: config.databaseUrl ? "[set]" : null,
      adminEnabled: Boolean(config.adminToken),
      tenantStorePath: config.tenantStorePath,
      tenantCount: credentials.tenantCount(),
      iceServers: config.iceServers.map((s) => ({
        urls: s.urls,
        hasAuth: Boolean(s.username),
      })),
      hlsPublicBaseUrl: config.hlsPublicBaseUrl || null,
      s3: config.s3
        ? { bucket: config.s3.bucket, endpoint: config.s3.endpoint ?? "aws" }
        : null,
    },
    "SoftQraft Gateway listening",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
