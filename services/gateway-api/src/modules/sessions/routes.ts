import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { GatewayConfig } from "../../config.js";
import type { LiveKitClients } from "../../providers/livekit/client.js";
import { requireServiceAuth, HttpError } from "../../lib/auth.js";
import type { QuotaTracker } from "../../lib/quotas.js";
import type { CredentialStore } from "../../lib/credential-store.js";
import { sendError } from "../../lib/errors.js";
import { ERROR_CODES } from "@softqraft/shared";
import type { SessionStore } from "./store.js";
import { assertSessionAccess } from "./store.js";
import { toPublicSession } from "./types.js";
import { mintParticipantToken } from "../../providers/livekit/tokens.js";
import type { UsageMeter } from "../../lib/usage-meter.js";
import {
  buildRoomMetadata,
  canAdoptRoom,
  parseRoomMetadata,
} from "../../lib/room-metadata.js";
import { isTerminalEgressStatus } from "../../providers/livekit/egress.js";

const createSessionBody = z.object({
  idempotencyKey: z.string().min(1).optional(),
  externalId: z.string().min(1).max(128).optional(),
  roomName: z.string().min(1).max(256).optional(),
  profile: z
    .enum([
      "interactive",
      "creator_live_webrtc",
      "creator_live_hls",
      "hybrid_live",
      "recording_only",
      "live_plus_recording",
    ])
    .optional(),
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
  recording: z
    .object({
      file: z
        .object({
          enabled: z.boolean().optional(),
          keyTemplate: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

const createTokenBody = z.object({
  identity: z.string().min(1).max(128),
  name: z.string().max(128).optional(),
  role: z.enum(["host", "cohost", "guest", "realtime_viewer", "agent"]),
  ttlSeconds: z.number().int().min(60).max(86400).optional(),
  attributes: z.record(z.string()).optional(),
});

export async function registerSessionRoutes(
  app: FastifyInstance,
  config: GatewayConfig,
  clients: LiveKitClients,
  store: SessionStore,
  quotas: QuotaTracker,
  credentials: CredentialStore,
  usage: UsageMeter,
): Promise<void> {
  app.post("/v1/sessions", async (req, reply) => {
    let reservedTenant: string | null | undefined;
    try {
      const auth = requireServiceAuth(req, credentials);
      const body = createSessionBody.parse(req.body ?? {});
      const tenantId = auth.tenant?.tenantId ?? null;

      if (body.idempotencyKey) {
        const existing = await store.getByIdempotencyKey(
          body.idempotencyKey,
          tenantId,
        );
        if (existing) {
          return reply.status(200).send(toPublicSession(existing));
        }
      }

      // Atomic reserve before LiveKit work (fixes check-then-act race)
      await quotas.tryReserveSession(auth.tenant);
      if (auth.tenant) reservedTenant = auth.tenant.tenantId;

      const sessionId = `sess_${randomUUID().replace(/-/g, "")}`;
      const roomName = body.roomName?.trim() || sessionId;
      const emptyTimeout = body.realtime?.emptyTimeoutSeconds ?? 300;
      const maxParticipants = body.realtime?.maxParticipants ?? 50;
      const roomMetadata = buildRoomMetadata({
        sessionId,
        tenantId,
        externalId: body.externalId ?? null,
        callerMetadata: body.metadata,
      });

      try {
        await clients.rooms.createRoom({
          name: roomName,
          emptyTimeout,
          maxParticipants,
          metadata: roomMetadata,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!/already exists|conflict|duplicat/i.test(message)) {
          throw new HttpError(
            503,
            ERROR_CODES.DEPENDENCY,
            `LiveKit createRoom failed: ${message}`,
          );
        }
        await assertRoomAdoptable(clients, {
          roomName,
          callerTenantId: tenantId,
          tenantIsolationActive: credentials.hasTenantIsolation(),
        });
      }

      const session = await store.create({
        sessionId,
        tenantId,
        externalId: body.externalId ?? null,
        roomName,
        status: "ready",
        profile: body.profile ?? "creator_live_webrtc",
        audienceMode: body.audience?.mode ?? "realtime",
        realtime: { url: config.realtimeUrl },
        playback: { status: "pending", hlsUrl: null },
        metadata: {
          ...(body.metadata ?? {}),
          recording: body.recording ?? null,
        },
        maxParticipants,
        idempotencyKey: body.idempotencyKey,
        createdAt: new Date().toISOString(),
        endedAt: null,
      });

      usage.recordSessionCreated();
      reservedTenant = undefined; // ownership transferred to session lifecycle

      return reply.status(201).send(toPublicSession(session));
    } catch (err) {
      if (reservedTenant !== undefined) {
        try {
          await quotas.releaseSession(reservedTenant);
        } catch {
          /* best-effort */
        }
      }
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

  app.get("/v1/sessions", async (req, reply) => {
    try {
      const auth = requireServiceAuth(req, credentials);
      const q = req.query as { status?: string; limit?: string };
      const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20) || 20));
      const tenantId = auth.tenant?.tenantId ?? null;
      const scopeTenant = credentials.hasTenantIsolation()
        ? tenantId
        : undefined;
      const items = (await store.list(q.status, limit, scopeTenant)).map(
        toPublicSession,
      );
      return reply.send({ items });
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.get("/v1/sessions/:sessionId", async (req, reply) => {
    try {
      const auth = requireServiceAuth(req, credentials);
      const { sessionId } = req.params as { sessionId: string };
      const session = await store.get(sessionId);
      const tenantId = auth.tenant?.tenantId ?? null;
      if (!assertSessionAccess(session, tenantId)) {
        throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Session not found");
      }
      return reply.send(toPublicSession(session));
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.post("/v1/sessions/:sessionId/end", async (req, reply) => {
    try {
      const auth = requireServiceAuth(req, credentials);
      const { sessionId } = req.params as { sessionId: string };
      const session = await store.get(sessionId);
      const tenantId = auth.tenant?.tenantId ?? null;
      if (!assertSessionAccess(session, tenantId)) {
        throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Session not found");
      }

      for (const job of await store.listEgress(sessionId)) {
        if (job.status === "starting" || job.status === "active") {
          try {
            await clients.egress.stopEgress(job.egressId);
            await store.putEgress({
              ...job,
              status: "stopping",
              updatedAt: new Date().toISOString(),
            });
          } catch (err) {
            req.log.warn({ err, egressId: job.egressId }, "stop egress failed");
          }
        }
        // Release egress quota for any still-held jobs when ending session
        if (job.quotaHeld && !isTerminalEgressStatus(job.status)) {
          await quotas.releaseEgress(job.tenantId);
          await store.putEgress({
            ...job,
            status: isTerminalEgressStatus(job.status)
              ? job.status
              : "stopping",
            quotaHeld: false,
            updatedAt: new Date().toISOString(),
          });
        }
      }

      try {
        await clients.rooms.deleteRoom(session.roomName);
      } catch (err) {
        req.log.warn({ err, room: session.roomName }, "deleteRoom failed");
      }

      const wasOpen = session.status !== "ended";
      const ended = (await store.end(sessionId))!;
      if (wasOpen) {
        await quotas.releaseSession(session.tenantId);
        usage.recordSessionEnded({
          startedAt: session.createdAt,
          endedAt: ended.endedAt ?? undefined,
          assumedViewers: session.maxParticipants,
        });
      }
      return reply.send(toPublicSession(ended));
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.post("/v1/sessions/:sessionId/tokens", async (req, reply) => {
    try {
      const auth = requireServiceAuth(req, credentials);
      const { sessionId } = req.params as { sessionId: string };
      const session = await store.get(sessionId);
      const tenantId = auth.tenant?.tenantId ?? null;
      if (!assertSessionAccess(session, tenantId) || session.status === "ended") {
        throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Session not found");
      }
      const body = createTokenBody.parse(req.body ?? {});

      const minted = await mintParticipantToken(config, {
        identity: body.identity,
        name: body.name,
        roomName: session.roomName,
        role: body.role,
        ttlSeconds: body.ttlSeconds,
        attributes: body.attributes,
      });

      usage.recordTokenMinted();

      if (session.status === "ready" && body.role === "host") {
        await store.update(sessionId, { status: "live" });
      }

      return reply.send(minted);
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

  app.get("/v1/sessions/:sessionId/playback", async (req, reply) => {
    try {
      const auth = requireServiceAuth(req, credentials);
      const { sessionId } = req.params as { sessionId: string };
      const session = await store.get(sessionId);
      const tenantId = auth.tenant?.tenantId ?? null;
      if (!assertSessionAccess(session, tenantId)) {
        throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Session not found");
      }
      return reply.send({
        sessionId: session.sessionId,
        audienceMode: session.audienceMode,
        status:
          session.status === "ended"
            ? "ended"
            : session.playback.status === "ready"
              ? "ready"
              : session.playback.status,
        hlsUrl: session.playback.hlsUrl,
        realtimeUrl: session.realtime.url,
      });
    } catch (err) {
      return sendError(req, reply, err);
    }
  });
}

async function assertRoomAdoptable(
  clients: LiveKitClients,
  input: {
    roomName: string;
    callerTenantId: string | null;
    tenantIsolationActive: boolean;
  },
): Promise<void> {
  let rooms: Array<{ name?: string; metadata?: string }> = [];
  try {
    // listRooms accepts optional name filter in livekit-server-sdk
    rooms = (await clients.rooms.listRooms([input.roomName])) as Array<{
      name?: string;
      metadata?: string;
    }>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new HttpError(
      503,
      ERROR_CODES.DEPENDENCY,
      `LiveKit listRooms failed during adopt: ${message}`,
    );
  }

  const room =
    rooms.find((r) => r.name === input.roomName) ?? rooms[0] ?? null;
  if (!room) {
    throw new HttpError(
      409,
      ERROR_CODES.CONFLICT,
      `Room '${input.roomName}' reported existing but could not be listed`,
    );
  }

  const meta = parseRoomMetadata(room.metadata);
  const decision = canAdoptRoom({
    callerTenantId: input.callerTenantId,
    roomMetadata: meta,
    tenantIsolationActive: input.tenantIsolationActive,
  });
  if (!decision.ok) {
    throw new HttpError(
      409,
      ERROR_CODES.CONFLICT,
      `Cannot adopt room '${input.roomName}': ${decision.reason}`,
    );
  }
}
