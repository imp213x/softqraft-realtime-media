import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadConfig } from "./config.js";
import { requestIdHook } from "./lib/request-id.js";
import { registerRawBodyHook } from "./lib/raw-body.js";
import { QuotaTracker } from "./lib/quotas.js";
import { CredentialStore } from "./lib/credential-store.js";
import { createLiveKitClients } from "./providers/livekit/client.js";
import { SessionStore } from "./modules/sessions/store.js";
import { registerHealthRoutes } from "./modules/health/routes.js";
import { registerSessionRoutes } from "./modules/sessions/routes.js";
import { registerEgressRoutes } from "./modules/egress/routes.js";
import { registerWebhookRoutes } from "./modules/webhooks/routes.js";
import { registerAdminRoutes } from "./modules/admin/routes.js";

async function main() {
  const config = loadConfig();
  const clients = createLiveKitClients(config);
  const store = new SessionStore();
  const quotas = new QuotaTracker();
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

  await registerHealthRoutes(app, config, clients);
  await registerAdminRoutes(app, config, credentials);
  await registerSessionRoutes(app, config, clients, store, quotas, credentials);
  await registerEgressRoutes(app, config, clients, store, quotas, credentials);
  await registerWebhookRoutes(app, config, store);

  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    {
      realtimeUrl: config.realtimeUrl,
      livekitUrl: config.livekitUrl,
      publicGatewayUrl: config.publicGatewayUrl || null,
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
