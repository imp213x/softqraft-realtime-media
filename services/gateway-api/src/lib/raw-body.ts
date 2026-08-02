import type { FastifyInstance } from "fastify";
import { Readable } from "node:stream";

/**
 * Capture exact request bytes for LiveKit webhook signature verification.
 * Only applies to /v1/webhooks/livekit.
 */
export async function registerRawBodyHook(app: FastifyInstance): Promise<void> {
  app.addHook("preParsing", async (request, _reply, payload) => {
    if (!request.url.startsWith("/v1/webhooks/livekit")) {
      return payload;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);
    request.rawBody = buf.toString("utf8");
    return Readable.from(buf);
  });
}
