import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { requestIdHook } from "./lib/request-id.js";
import { createLiveKitClients } from "./providers/livekit/client.js";
import { SessionStore } from "./modules/sessions/store.js";
import { registerHealthRoutes } from "./modules/health/routes.js";
import { registerSessionRoutes } from "./modules/sessions/routes.js";
import { registerEgressRoutes } from "./modules/egress/routes.js";

async function main() {
  const config = loadConfig();
  const clients = createLiveKitClients(config);
  const store = new SessionStore();

  const app = Fastify({
    logger: true,
  });

  await requestIdHook(app);

  await registerHealthRoutes(app, config, clients);
  await registerSessionRoutes(app, config, clients, store);
  await registerEgressRoutes(app, config, clients, store);

  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    {
      realtimeUrl: config.realtimeUrl,
      livekitUrl: config.livekitUrl,
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
