import type { FastifyInstance, FastifyRequest } from "fastify";
import { WebhookReceiver } from "livekit-server-sdk";
import type { GatewayConfig } from "../../config.js";
import type { SessionStore } from "../sessions/store.js";
import type { QuotaTracker } from "../../lib/quotas.js";
import type { UsageMeter } from "../../lib/usage-meter.js";
import {
  isTerminalEgressStatus,
  mapEgressStatus,
} from "../../providers/livekit/egress.js";

/**
 * LiveKit signs webhooks with the project API key/secret.
 * We verify, update durable session/egress state, release quotas, and
 * optionally forward the raw payload to consumer apps.
 */
export async function registerWebhookRoutes(
  app: FastifyInstance,
  config: GatewayConfig,
  store: SessionStore,
  quotas: QuotaTracker,
  usage?: UsageMeter,
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
      {
        event: eventName,
        egressId: event.egressInfo?.egressId,
        room: event.room?.name,
      },
      "livekit webhook received",
    );

    try {
      await handleLiveKitEvent(event, eventName, store, quotas, usage, req);
    } catch (err) {
      req.log.error({ err, event: eventName }, "webhook handler failed");
      // Still 200 after verify so LiveKit does not hammer retries for app bugs;
      // durable queue is a later hardening step.
    }

    if (config.webhookForwardUrls.length > 0) {
      const results = await Promise.allSettled(
        config.webhookForwardUrls.map((url) =>
          forwardWebhook(
            url,
            rawBody,
            authHeader || token,
            config.webhookForwardSharedSecret,
            req.log,
          ),
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

async function handleLiveKitEvent(
  event: Awaited<ReturnType<WebhookReceiver["receive"]>>,
  eventName: string,
  store: SessionStore,
  quotas: QuotaTracker,
  usage: UsageMeter | undefined,
  req: FastifyRequest,
): Promise<void> {
  // --- Egress lifecycle: release quota on terminal status ---
  const egressInfo = event.egressInfo;
  if (egressInfo?.egressId) {
    const existing = await store.getEgress(String(egressInfo.egressId));
    if (existing) {
      const status = mapEgressStatus(egressInfo);
      let quotaHeld = existing.quotaHeld;
      if (
        existing.quotaHeld &&
        !isTerminalEgressStatus(existing.status) &&
        isTerminalEgressStatus(status)
      ) {
        await quotas.releaseEgress(existing.tenantId);
        quotaHeld = false;
        req.log.info(
          { egressId: existing.egressId, tenantId: existing.tenantId },
          "egress quota released via webhook",
        );
      }
      await store.putEgress({
        ...existing,
        status,
        quotaHeld,
        error:
          egressInfo.error && String(egressInfo.error).length > 0
            ? String(egressInfo.error)
            : existing.error,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  // --- Room finished / emptyTimeout: end Gateway session + release session quota ---
  if (
    eventName === "room_finished" ||
    eventName === "room_ended" ||
    eventName === "room.finished"
  ) {
    const roomName = event.room?.name ? String(event.room.name) : "";
    if (!roomName) return;

    const session = await store.getActiveByRoomName(roomName);
    if (!session || session.status === "ended") return;

    // Release any still-held egress quotas for this session
    for (const job of await store.listEgress(session.sessionId)) {
      if (job.quotaHeld && !isTerminalEgressStatus(job.status)) {
        await quotas.releaseEgress(job.tenantId);
        await store.putEgress({
          ...job,
          status: "complete",
          quotaHeld: false,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    const ended = await store.end(session.sessionId);
    await quotas.releaseSession(session.tenantId);
    usage?.recordSessionEnded({
      startedAt: session.createdAt,
      endedAt: ended?.endedAt ?? undefined,
      assumedViewers: session.maxParticipants,
    });
    req.log.info(
      { sessionId: session.sessionId, roomName, tenantId: session.tenantId },
      "session ended via room_finished webhook",
    );
  }
}

function getRawBody(req: FastifyRequest): string {
  if (typeof req.rawBody === "string" && req.rawBody.length > 0) {
    return req.rawBody;
  }
  if (typeof req.body === "string") {
    return req.body;
  }
  if (req.body && typeof req.body === "object") {
    return JSON.stringify(req.body);
  }
  return "";
}

async function forwardWebhook(
  url: string,
  body: string,
  authorization: string,
  sharedSecret: string,
  log: FastifyRequest["log"],
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/webhook+json",
    Authorization: authorization.startsWith("Bearer ")
      ? authorization
      : `Bearer ${authorization}`,
  };
  // Consumer apps (e.g. Jari SoftQraft mode) verify this instead of LiveKit JWT.
  if (sharedSecret.trim()) {
    headers["X-SoftQraft-Webhook-Secret"] = sharedSecret.trim();
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok) {
    log.warn({ url, status: res.status }, "webhook forward non-2xx");
    throw new Error(`forward ${url} → ${res.status}`);
  }
}
