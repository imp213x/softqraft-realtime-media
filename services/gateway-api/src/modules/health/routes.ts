import type { FastifyInstance } from "fastify";
import type { LiveKitClients } from "../../providers/livekit/client.js";
import { probeLiveKit } from "../../providers/livekit/client.js";
import type { GatewayConfig } from "../../config.js";

export async function registerHealthRoutes(
  app: FastifyInstance,
  config: GatewayConfig,
  clients: LiveKitClients,
): Promise<void> {
  app.get("/health", async () => ({ status: "ok" as const }));

  app.get("/ready", async (_req, reply) => {
    const livekit = await probeLiveKit(clients);
    const s3 = Boolean(config.s3);
    const ready = livekit;

    const body = {
      status: ready ? ("ready" as const) : ("not_ready" as const),
      checks: {
        gateway: true,
        livekit,
        s3Configured: s3,
      },
    };

    return reply.status(ready ? 200 : 503).send(body);
  });
}
