import type { FastifyInstance, FastifyRequest } from "fastify";
import { WebhookReceiver } from "livekit-server-sdk";
import type { GatewayConfig } from "../../config.js";
import type { SessionStore } from "../sessions/store.js";
import { mapEgressStatus } from "../../providers/livekit/egress.js";

/**
 * LiveKit signs webhooks with the project API key/secret.
 * We verify, update local egress state, and optionally forward the raw
 * payload to consumer apps (e.g. Clatters Echo finalize).
 */
export async function registerWebhookRoutes(
  app: FastifyInstance,
  config: GatewayConfig,
  store: SessionStore,
): Promise<void> {
  const receiver = new WebhookReceiver(
    config.livekitApiKey,
    config.livekitApiSecret,
  );

  app.post("/v1/webhooks/livekit", async (req, reply) => {
    const rawBody = getRawBody(req);
    if (!rawBody) {
      return reply.status(400).send({
        error: {
          code: "bad_request",
          message: "Empty webhook body",
          requestId: req.requestId,
        },
      });
    }

    const authHeader = String(req.headers.authorization || "").trim();
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : authHeader;

    if (!token) {
      return reply.status(401).send({
        error: {
          code: "unauthorized",
          message: "Missing webhook authorization",
          requestId: req.requestId,
        },
      });
    }

    let event: Awaited<ReturnType<WebhookReceiver["receive"]>>;
    try {
      event = await receiver.receive(rawBody, token);
    } catch (err) {
      req.log.warn({ err }, "livekit webhook verification failed");
      return reply.status(401).send({
        error: {
          code: "unauthorized",
          message: "Invalid webhook signature",
          requestId: req.requestId,
        },
      });
    }

    const eventName = String(event.event || "");
    req.log.info(
      { event: eventName, egressId: event.egressInfo?.egressId },
      "livekit webhook received",
    );

    // Update local egress job cache when present
    const egressInfo = event.egressInfo;
    if (egressInfo?.egressId) {
      const existing = store.getEgress(egressInfo.egressId);
      if (existing) {
        store.putEgress({
          ...existing,
          status: mapEgressStatus(egressInfo),
          error:
            egressInfo.error && String(egressInfo.error).length > 0
              ? String(egressInfo.error)
              : existing.error,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // Fan-out to consumer apps (Clatters, etc.) — same raw body + auth
    if (config.webhookForwardUrls.length > 0) {
      const results = await Promise.allSettled(
        config.webhookForwardUrls.map((url) =>
          forwardWebhook(url, rawBody, authHeader || token, req.log),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        req.log.warn(
          { failed, total: results.length },
          "some webhook forwards failed",
        );
      }
    }

    return reply.status(200).send({ ok: true, event: eventName });
  });
}

function getRawBody(req: FastifyRequest): string {
  if (typeof req.rawBody === "string" && req.rawBody.length > 0) {
    return req.rawBody;
  }
  if (typeof req.body === "string") {
    return req.body;
  }
  if (req.body && typeof req.body === "object") {
    // Last resort — verification may fail if re-serialized
    return JSON.stringify(req.body);
  }
  return "";
}

async function forwardWebhook(
  url: string,
  rawBody: string,
  authorization: string,
  log: FastifyRequest["log"],
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/webhook+json",
      authorization,
    },
    body: rawBody,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    log.warn(
      { url, status: res.status, body: text.slice(0, 200) },
      "webhook forward non-OK",
    );
    throw new Error(`forward ${url} → ${res.status}`);
  }
}
