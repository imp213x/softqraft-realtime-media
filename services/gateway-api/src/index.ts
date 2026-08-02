import Fastify from "fastify";
import { registerHealthRoutes } from "./modules/health/routes.js";
import { registerSessionRoutes } from "./modules/sessions/routes.js";
import { loadConfig } from "./config.js";
import { requestIdHook } from "./lib/request-id.js";

async function main() {
  const config = loadConfig();
  const app = Fastify({
    logger: true,
  });

  await requestIdHook(app);

  await registerHealthRoutes(app);
  await registerSessionRoutes(app, config);

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
