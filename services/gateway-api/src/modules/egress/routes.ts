import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { GatewayConfig } from "../../config.js";
import type { LiveKitClients } from "../../providers/livekit/client.js";
import { requireServiceAuth, HttpError } from "../../lib/auth.js";
import type { QuotaTracker } from "../../lib/quotas.js";
import type { CredentialStore } from "../../lib/credential-store.js";
import { sendError } from "../../lib/errors.js";
import { ERROR_CODES } from "@softqraft/shared";
import type { SessionStore } from "../sessions/store.js";
import { assertSessionAccess } from "../sessions/store.js";
import { toPublicEgress } from "../sessions/types.js";
import type { EgressJobRecord } from "../sessions/types.js";
import {
  buildHlsPlaybackUrl,
  isTerminalEgressStatus,
  mapEgressStatus,
  renderKeyTemplate,
  sanitizePathSegment,
  startRoomCompositeFile,
  startRoomCompositeHls,
  stopEgressJob,
  getEgress,
} from "../../providers/livekit/egress.js";
import type { UsageMeter } from "../../lib/usage-meter.js";

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
      segmentDurationSeconds: z.number().int().min(1).max(10).optional(),
      playlistName: z.string().optional(),
      livePlaylistName: z.string().optional(),
    })
    .optional(),
});

async function releaseEgressQuotaIfNeeded(
  quotas: QuotaTracker,
  job: { tenantId: string | null; quotaHeld?: boolean; status: string },
  nextStatus: string,
): Promise<boolean> {
  if (
    job.quotaHeld &&
    !isTerminalEgressStatus(job.status) &&
    isTerminalEgressStatus(nextStatus)
  ) {
    await quotas.releaseEgress(job.tenantId);
    return true;
  }
  return false;
}

export async function registerEgressRoutes(
  app: FastifyInstance,
  config: GatewayConfig,
  clients: LiveKitClients,
  store: SessionStore,
  quotas: QuotaTracker,
  credentials: CredentialStore,
  usage: UsageMeter,
): Promise<void> {
  app.post("/v1/sessions/:sessionId/egress", async (req, reply) => {
    let reserved = false;
    let reservedTenant: string | null = null;
    try {
      const auth = requireServiceAuth(req, credentials);
      const { sessionId } = req.params as { sessionId: string };
      const session = await store.get(sessionId);
      const tenantId = auth.tenant?.tenantId ?? null;
      if (
        !assertSessionAccess(session, tenantId) ||
        session.status === "ended"
      ) {
        throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Session not found");
      }

      const body = startEgressBody.parse(req.body ?? {});

      if (
        body.type !== "room_composite_file" &&
        body.type !== "room_composite_hls"
      ) {
        throw new HttpError(
          501,
          ERROR_CODES.VALIDATION,
          `Egress type '${body.type}' is not implemented (use room_composite_file or room_composite_hls)`,
        );
      }

      if (!config.s3) {
        throw new HttpError(
          503,
          ERROR_CODES.DEPENDENCY,
          "S3 recording storage is not configured",
        );
      }

      await quotas.tryReserveEgress(auth.tenant);
      reserved = Boolean(auth.tenant);
      reservedTenant = session.tenantId;

      const externalId = sanitizePathSegment(
        session.externalId ?? session.sessionId,
        "session",
      );
      const pathVars = {
        externalId,
        sessionId: sanitizePathSegment(session.sessionId, "sess"),
        roomName: sanitizePathSegment(session.roomName, "room"),
      };

      let info;
      let filepath: string | undefined;
      let hlsPrefix: string | undefined;
      let hlsUrl: string | null = null;

      try {
        if (body.type === "room_composite_file") {
          const template =
            body.options?.keyTemplate ||
            body.options?.filepath ||
            config.recordingKeyTemplate;
          filepath = renderKeyTemplate(template, pathVars);
          info = await startRoomCompositeFile(clients, config, {
            roomName: session.roomName,
            filepath,
          });
        } else {
          const template =
            body.options?.keyTemplate || config.hlsKeyTemplate;
          hlsPrefix = renderKeyTemplate(template, pathVars).replace(
            /\/+$/g,
            "",
          );
          const livePlaylistName =
            body.options?.livePlaylistName ?? "live.m3u8";
          info = await startRoomCompositeHls(clients, config, {
            roomName: session.roomName,
            filenamePrefix: hlsPrefix,
            playlistName: body.options?.playlistName ?? "playlist.m3u8",
            livePlaylistName,
            segmentDurationSeconds: body.options?.segmentDurationSeconds,
          });
          hlsUrl = buildHlsPlaybackUrl(config, hlsPrefix, livePlaylistName);
        }
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

      usage.recordEgressStarted();

      const now = new Date().toISOString();
      const job = await store.putEgress({
        egressId,
        sessionId,
        tenantId: session.tenantId,
        type: body.type,
        status: mapEgressStatus(info),
        filepath,
        hlsPrefix,
        playback: { hlsUrl },
        error: null,
        createdAt: now,
        updatedAt: now,
        quotaHeld: Boolean(auth.tenant) || session.tenantId != null,
      });
      reserved = false;

      if (body.type === "room_composite_hls" && hlsUrl) {
        await store.update(sessionId, {
          playback: { status: "ready", hlsUrl },
        });
      }

      if (session.status === "ready") {
        await store.update(sessionId, { status: "live" });
      }

      return reply.status(202).send(toPublicEgress(job));
    } catch (err) {
      if (reserved) {
        try {
          await quotas.releaseEgress(reservedTenant);
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

  app.get("/v1/sessions/:sessionId/egress", async (req, reply) => {
    try {
      const auth = requireServiceAuth(req, credentials);
      const { sessionId } = req.params as { sessionId: string };
      const session = await store.get(sessionId);
      const tenantId = auth.tenant?.tenantId ?? null;
      if (!assertSessionAccess(session, tenantId)) {
        throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Session not found");
      }

      const items = [];
      for (const job of await store.listEgress(sessionId)) {
        items.push(
          toPublicEgress(await syncEgressFromLiveKit(clients, store, quotas, job)),
        );
      }

      return reply.send({ items });
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.get("/v1/egress/:egressId", async (req, reply) => {
    try {
      const auth = requireServiceAuth(req, credentials);
      const { egressId } = req.params as { egressId: string };
      let job = await store.getEgress(egressId);
      const tenantId = auth.tenant?.tenantId ?? null;

      if (job) {
        const session = await store.get(job.sessionId);
        if (!assertSessionAccess(session, tenantId)) {
          throw new HttpError(
            404,
            ERROR_CODES.EGRESS_NOT_FOUND,
            "Egress job not found",
          );
        }
        job = await syncEgressFromLiveKit(clients, store, quotas, job);
        return reply.send(toPublicEgress(job));
      }

      try {
        const info = await getEgress(clients, egressId);
        if (info && tenantId === null) {
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

      throw new HttpError(
        404,
        ERROR_CODES.EGRESS_NOT_FOUND,
        "Egress job not found",
      );
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.post("/v1/egress/:egressId/stop", async (req, reply) => {
    try {
      const auth = requireServiceAuth(req, credentials);
      const { egressId } = req.params as { egressId: string };
      let job = await store.getEgress(egressId);
      const tenantId = auth.tenant?.tenantId ?? null;

      if (job) {
        const session = await store.get(job.sessionId);
        if (!assertSessionAccess(session, tenantId)) {
          throw new HttpError(
            404,
            ERROR_CODES.EGRESS_NOT_FOUND,
            "Egress job not found",
          );
        }
      }

      try {
        const current = await getEgress(clients, egressId);
        if (current) {
          const status = mapEgressStatus(current);
          if (
            status === "complete" ||
            status === "failed" ||
            status === "stopping"
          ) {
            if (job) {
              const released = await releaseEgressQuotaIfNeeded(
                quotas,
                job,
                status,
              );
              const updated = await store.putEgress({
                ...job,
                status,
                quotaHeld: released ? false : job.quotaHeld,
                error:
                  status === "failed"
                    ? String(current.error || job.error || "egress_failed")
                    : job.error,
                updatedAt: new Date().toISOString(),
              });
              return reply.send(toPublicEgress(updated));
            }
            return reply.send({
              egressId,
              sessionId: null,
              type: "room_composite_file",
              status,
              playback: { hlsUrl: null },
              error: status === "failed" ? String(current.error || "") : null,
              createdAt: null,
              updatedAt: new Date().toISOString(),
            });
          }
        }
      } catch {
        /* continue to stop */
      }

      let info;
      try {
        info = await stopEgressJob(clients, egressId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/ABORTED|COMPLETE|FAILED|cannot be stopped/i.test(message)) {
          const status = /COMPLETE/i.test(message)
            ? "complete"
            : /FAILED/i.test(message)
              ? "failed"
              : "failed";
          if (job) {
            const released = await releaseEgressQuotaIfNeeded(
              quotas,
              job,
              status,
            );
            const updated = await store.putEgress({
              ...job,
              status,
              quotaHeld: released ? false : job.quotaHeld,
              error: message,
              updatedAt: new Date().toISOString(),
            });
            return reply.send(toPublicEgress(updated));
          }
          return reply.send({
            egressId,
            sessionId: null,
            type: "room_composite_file",
            status,
            playback: { hlsUrl: null },
            error: message,
            createdAt: null,
            updatedAt: new Date().toISOString(),
          });
        }
        throw new HttpError(
          502,
          ERROR_CODES.DEPENDENCY,
          `Failed to stop egress: ${message}`,
        );
      }

      if (job) {
        const status = mapEgressStatus(info);
        const released = await releaseEgressQuotaIfNeeded(quotas, job, status);
        const updated = await store.putEgress({
          ...job,
          status,
          quotaHeld: released ? false : job.quotaHeld,
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

async function syncEgressFromLiveKit(
  clients: LiveKitClients,
  store: SessionStore,
  quotas: QuotaTracker,
  job: EgressJobRecord,
): Promise<EgressJobRecord> {
  try {
    const info = await getEgress(clients, job.egressId);
    if (!info) return job;
    const status = mapEgressStatus(info);
    const released = await releaseEgressQuotaIfNeeded(quotas, job, status);
    return store.putEgress({
      ...job,
      status,
      quotaHeld: released ? false : job.quotaHeld,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return job;
  }
}
