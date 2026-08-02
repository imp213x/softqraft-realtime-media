import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
    /** Raw body string for LiveKit webhook verification */
    rawBody?: string;
  }
}

export async function requestIdHook(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (req) => {
    const incoming = req.headers["x-request-id"];
    req.requestId =
      typeof incoming === "string" && incoming.length > 0
        ? incoming
        : randomUUID();
  });

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.requestId);
  });
}
