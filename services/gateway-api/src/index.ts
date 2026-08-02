import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadConfig } from "./config.js";
import { requestIdHook } from "./lib/request-id.js";
import { registerRawBodyHook } from "./lib/raw-body.js";
import { createLiveKitClients } from "./providers/livekit/client.js";
import { SessionStore } from "./modules/sessions/store.js";
import { registerHealthRoutes } from "./modules/health/routes.js";
import { registerSessionRoutes } from "./modules/sessions/routes.js";
import { registerEgressRoutes } from "./modules/egress/routes.js";
import { registerWebhookRoutes } from "./modules/webhooks/routes.js";

async function main() {
  const config = loadConfig();
  const clients = createLiveKitClients(config);
  const store = new SessionStore();

  const app = Fastify({
    logger: true,
  });

  // Local HTML demos + browser clients (tighten origins in production)
  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
  });

  await requestIdHook(app);
  await registerRawBodyHook(app);

  // LiveKit may post application/webhook+json
  app.addContentTypeParser(
    "application/webhook+json",
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, body);
    },
  );

  await registerHealthRoutes(app, config, clients);
  await registerSessionRoutes(app, config, clients, store);
  await registerEgressRoutes(app, config, clients, store);
  await registerWebhookRoutes(app, config, store);

  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    {
      realtimeUrl: config.realtimeUrl,
      livekitUrl: config.livekitUrl,
      webhookForwardUrls: config.webhookForwardUrls,
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
