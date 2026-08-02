import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({ status: "ok" as const }));

  // Phase 1: wire LiveKit + Redis checks. Skeleton reports ready for local bring-up.
  app.get("/ready", async () => ({
    status: "ready" as const,
    checks: {
      gateway: true,
      livekit: false,
      redis: false,
    },
  }));
}
