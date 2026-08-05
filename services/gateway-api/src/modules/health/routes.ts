import type { FastifyInstance } from "fastify";
import type { Redis as RedisClient } from "ioredis";
import type { LiveKitClients } from "../../providers/livekit/client.js";
import { probeLiveKit } from "../../providers/livekit/client.js";
import type { GatewayConfig } from "../../config.js";

export async function registerHealthRoutes(
  app: FastifyInstance,
  config: GatewayConfig,
  clients: LiveKitClients,
  deps?: {
    storeBackend?: "memory" | "postgres";
    quotaBackend?: "memory" | "redis";
    redis?: RedisClient | null;
  },
): Promise<void> {
  app.get("/health", async () => ({ status: "ok" as const }));

  app.get("/ready", async (_req, reply) => {
    const livekit = await probeLiveKit(clients);
    const s3Configured = Boolean(config.s3);

    let redisOk: boolean | null = null;
    if (deps?.quotaBackend === "redis" && deps.redis) {
      try {
        const pong = await deps.redis.ping();
        redisOk = pong === "PONG";
      } catch {
        redisOk = false;
      }
    }

    let databaseOk: boolean | null = null;
    if (deps?.storeBackend === "postgres" && config.databaseUrl) {
      try {
        const { Client } = await import("pg");
        const client = new Client({
          connectionString: config.databaseUrl,
        });
        await client.connect();
        await client.query("SELECT 1");
        await client.end();
        databaseOk = true;
      } catch {
        databaseOk = false;
      }
    }

    const checks = {
      gateway: true,
      livekit,
      s3Configured,
      storeBackend: deps?.storeBackend ?? "memory",
      quotaBackend: deps?.quotaBackend ?? "memory",
      redis: redisOk,
      database: databaseOk,
    };

    const ready =
      livekit &&
      (redisOk === null || redisOk === true) &&
      (databaseOk === null || databaseOk === true);

    return reply.status(ready ? 200 : 503).send({
      status: ready ? ("ready" as const) : ("not_ready" as const),
      checks,
    });
  });
}
