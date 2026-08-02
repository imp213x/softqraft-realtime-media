import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { GatewayConfig } from "../../config.js";
import type { LiveKitClients } from "../../providers/livekit/client.js";
import { requireServiceAuth, HttpError } from "../../lib/auth.js";
import { sendError } from "../../lib/errors.js";
import { ERROR_CODES } from "@softqraft/shared";
import type { SessionStore } from "../sessions/store.js";
import { toPublicEgress } from "../sessions/types.js";
import {
  mapEgressStatus,
  renderKeyTemplate,
  sanitizePathSegment,
  startRoomCompositeFile,
  stopEgressJob,
  getEgress,
} from "../../providers/livekit/egress.js";

const startEgressBody = z.object({
  type: z.enum([
    "room_composite_file",
    "room_composite_hls",
    "room_composite_rtmp",
    "track",
    "participant",
  ]),
  options: z
    .object({
      fileType: z.string().optional(),
      filepath: z.string().optional(),
      keyTemplate: z.string().optional(),
      layout: z.string().optional(),
    })
    .optional(),
});

export async function registerEgressRoutes(
  app: FastifyInstance,
  config: GatewayConfig,
  clients: LiveKitClients,
  store: SessionStore,
): Promise<void> {
  app.post("/v1/sessions/:sessionId/egress", async (req, reply) => {
    try {
      requireServiceAuth(req, config);
      const { sessionId } = req.params as { sessionId: string };
      const session = store.get(sessionId);
      if (!session || session.status === "ended") {
        throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Session not found");
      }

      const body = startEgressBody.parse(req.body ?? {});

      if (body.type !== "room_composite_file") {
        throw new HttpError(
          501,
          ERROR_CODES.VALIDATION,
          `Egress type '${body.type}' is not implemented in Phase 1 (use room_composite_file)`,
        );
      }

      if (!config.s3) {
        throw new HttpError(
          503,
          ERROR_CODES.DEPENDENCY,
          "S3 recording storage is not configured",
        );
      }

      const externalId = sanitizePathSegment(
        session.externalId ?? session.sessionId,
        "session",
      );
      const template =
        body.options?.keyTemplate ||
        body.options?.filepath ||
        config.recordingKeyTemplate;

      const filepath = renderKeyTemplate(template, {
        externalId,
        sessionId: sanitizePathSegment(session.sessionId, "sess"),
        roomName: sanitizePathSegment(session.roomName, "room"),
        // {time} left for LiveKit substitution when present
      });

      let info;
      try {
        info = await startRoomCompositeFile(clients, config, {
          roomName: session.roomName,
          filepath,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new HttpError(
          502,
          ERROR_CODES.DEPENDENCY,
          `Egress start failed: ${message}`,
        );
      }

      const egressId = String(info.egressId || "").trim();
      if (!egressId) {
        throw new HttpError(
          502,
          ERROR_CODES.DEPENDENCY,
          "Egress started but no egressId returned",
        );
      }

      const now = new Date().toISOString();
      const job = store.putEgress({
        egressId,
        sessionId,
        type: "room_composite_file",
        status: mapEgressStatus(info),
        filepath,
        playback: { hlsUrl: null },
        error: null,
        createdAt: now,
        updatedAt: now,
      });

      if (session.status === "ready") {
        store.update(sessionId, { status: "live" });
      }

      return reply.status(202).send(toPublicEgress(job));
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

  app.get("/v1/sessions/:sessionId/egress", async (req, reply) => {
    try {
      requireServiceAuth(req, config);
      const { sessionId } = req.params as { sessionId: string };
      const session = store.get(sessionId);
      if (!session) {
        throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Session not found");
      }

      // Refresh statuses from LiveKit when possible
      const items = [];
      for (const job of store.listEgress(sessionId)) {
        try {
          const info = await getEgress(clients, job.egressId);
          if (info) {
            const status = mapEgressStatus(info);
            const updated = store.putEgress({
              ...job,
              status,
              updatedAt: new Date().toISOString(),
            });
            items.push(toPublicEgress(updated));
            continue;
          }
        } catch {
          /* keep cached */
        }
        items.push(toPublicEgress(job));
      }

      return reply.send({ items });
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.get("/v1/egress/:egressId", async (req, reply) => {
    try {
      requireServiceAuth(req, config);
      const { egressId } = req.params as { egressId: string };
      let job = store.getEgress(egressId);

      try {
        const info = await getEgress(clients, egressId);
        if (info && job) {
          job = store.putEgress({
            ...job,
            status: mapEgressStatus(info),
            updatedAt: new Date().toISOString(),
          });
        } else if (info && !job) {
          // Unknown to local store — return LiveKit snapshot
          return reply.send({
            egressId,
            sessionId: null,
            type: "room_composite_file",
            status: mapEgressStatus(info),
            playback: { hlsUrl: null },
            error: null,
            createdAt: null,
            updatedAt: new Date().toISOString(),
          });
        }
      } catch {
        /* fall through */
      }

      if (!job) {
        throw new HttpError(
          404,
          ERROR_CODES.EGRESS_NOT_FOUND,
          "Egress job not found",
        );
      }
      return reply.send(toPublicEgress(job));
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.post("/v1/egress/:egressId/stop", async (req, reply) => {
    try {
      requireServiceAuth(req, config);
      const { egressId } = req.params as { egressId: string };
      const job = store.getEgress(egressId);

      let info;
      try {
        info = await stopEgressJob(clients, egressId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new HttpError(
          502,
          ERROR_CODES.DEPENDENCY,
          `Failed to stop egress: ${message}`,
        );
      }

      if (job) {
        const updated = store.putEgress({
          ...job,
          status: mapEgressStatus(info),
          updatedAt: new Date().toISOString(),
        });
        return reply.send(toPublicEgress(updated));
      }

      return reply.send({
        egressId,
        sessionId: null,
        type: "room_composite_file",
        status: mapEgressStatus(info),
        playback: { hlsUrl: null },
        error: null,
        createdAt: null,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      return sendError(req, reply, err);
    }
  });
}
