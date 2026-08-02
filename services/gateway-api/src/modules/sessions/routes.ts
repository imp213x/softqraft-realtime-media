import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { GatewayConfig } from "../../config.js";
import { requireServiceAuth, HttpError } from "../../lib/auth.js";
import { sendError } from "../../lib/errors.js";
import { ERROR_CODES } from "@clatters-media/shared";
import { SessionStore } from "./store.js";

const createSessionBody = z.object({
  idempotencyKey: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
  realtime: z
    .object({
      emptyTimeoutSeconds: z.number().int().nonnegative().optional(),
      maxParticipants: z.number().int().positive().optional(),
    })
    .optional(),
  audience: z
    .object({
      mode: z.enum(["hls", "realtime", "hybrid"]).optional(),
      visibility: z.enum(["public", "private"]).optional(),
    })
    .optional(),
});

const createTokenBody = z.object({
  identity: z.string().min(1),
  name: z.string().optional(),
  role: z.enum(["host", "cohost", "guest", "realtime_viewer", "agent"]),
  ttlSeconds: z.number().int().min(60).max(86400).optional(),
  attributes: z.record(z.string()).optional(),
});

/**
 * Session routes — Phase 0/1 skeleton.
 * Token minting and LiveKit RoomService wiring land in the next engineering slice.
 */
export async function registerSessionRoutes(
  app: FastifyInstance,
  config: GatewayConfig,
): Promise<void> {
  const store = new SessionStore();

  app.post("/v1/sessions", async (req, reply) => {
    try {
      requireServiceAuth(req, config);
      const body = createSessionBody.parse(req.body ?? {});

      if (body.idempotencyKey) {
        const existing = store.getByIdempotencyKey(body.idempotencyKey);
        if (existing) {
          return reply.status(200).send(existing);
        }
      }

      const sessionId = `sess_${randomUUID().replace(/-/g, "")}`;
      const session = store.create({
        sessionId,
        roomName: sessionId,
        status: "ready",
        realtime: { url: config.realtimeUrl },
        playback: { status: "pending", hlsUrl: null },
        metadata: body.metadata ?? {},
        idempotencyKey: body.idempotencyKey,
        createdAt: new Date().toISOString(),
        endedAt: null,
      });

      return reply.status(201).send(session);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendError(
          req,
          reply,
          new HttpError(400, ERROR_CODES.VALIDATION, err.message),
        );
      }
      return sendError(req, reply, err);
    }
  });

  app.get("/v1/sessions/:sessionId", async (req, reply) => {
    try {
      requireServiceAuth(req, config);
      const { sessionId } = req.params as { sessionId: string };
      const session = store.get(sessionId);
      if (!session) {
        throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Session not found");
      }
      return reply.send(session);
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.post("/v1/sessions/:sessionId/end", async (req, reply) => {
    try {
      requireServiceAuth(req, config);
      const { sessionId } = req.params as { sessionId: string };
      const session = store.end(sessionId);
      if (!session) {
        throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Session not found");
      }
      return reply.send(session);
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.post("/v1/sessions/:sessionId/tokens", async (req, reply) => {
    try {
      requireServiceAuth(req, config);
      const { sessionId } = req.params as { sessionId: string };
      const session = store.get(sessionId);
      if (!session || session.status === "ended") {
        throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Session not found");
      }
      const body = createTokenBody.parse(req.body ?? {});

      // Placeholder until LiveKit access-token signing is wired (next slice).
      return reply.status(501).send({
        error: {
          code: "not_implemented",
          message:
            "Token minting will be enabled once LiveKit API credentials are wired",
          requestId: req.requestId,
          debug: {
            sessionId,
            identity: body.identity,
            role: body.role,
            realtimeUrl: config.realtimeUrl,
          },
        },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendError(
          req,
          reply,
          new HttpError(400, ERROR_CODES.VALIDATION, err.message),
        );
      }
      return sendError(req, reply, err);
    }
  });
}
