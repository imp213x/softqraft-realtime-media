import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { GatewayConfig } from "../../config.js";
import type { CredentialStore } from "../../lib/credential-store.js";
import { HttpError } from "../../lib/auth.js";
import { sendError } from "../../lib/errors.js";
import { ERROR_CODES } from "@softqraft/shared";

const createBody = z.object({
  tenantId: z.string().min(1).max(64),
  label: z.string().max(128).optional(),
  maxSessions: z.number().int().positive().max(10_000).optional(),
  maxEgress: z.number().int().positive().max(10_000).optional(),
});

function requireAdmin(req: { headers: { authorization?: string } }, config: GatewayConfig) {
  if (!config.adminToken) {
    throw new HttpError(
      503,
      ERROR_CODES.DEPENDENCY,
      "Admin console disabled — set GATEWAY_ADMIN_TOKEN",
    );
  }
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, "Missing admin bearer token");
  }
  const token = header.slice("Bearer ".length).trim();
  if (token !== config.adminToken) {
    throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, "Invalid admin token");
  }
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  config: GatewayConfig,
  credentials: CredentialStore,
): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/modules/admin → ../../../public/admin  OR src → ../../../public/admin
  const adminHtmlPath = path.resolve(here, "../../../public/admin/index.html");

  app.get("/admin", async (_req, reply) => {
    return reply.redirect("/admin/");
  });

  app.get("/admin/", async (_req, reply) => {
    try {
      const html = await readFile(adminHtmlPath, "utf8");
      return reply.type("text/html").send(html);
    } catch {
      return reply
        .status(500)
        .type("text/plain")
        .send("Admin UI missing — rebuild gateway with public/admin assets");
    }
  });

  app.get("/admin/v1/meta", async (req, reply) => {
    try {
      requireAdmin(req, config);
      const publicGateway =
        config.publicGatewayUrl ||
        `http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`;
      return reply.send({
        product: "SoftQraft Realtime Media",
        publicGatewayUrl: publicGateway.replace(/\/$/, ""),
        realtimeUrl: config.realtimeUrl,
        adminEnabled: Boolean(config.adminToken),
        tenantCount: credentials.tenantCount(),
      });
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.get("/admin/v1/credentials", async (req, reply) => {
    try {
      requireAdmin(req, config);
      return reply.send({ items: credentials.list() });
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.post("/admin/v1/credentials", async (req, reply) => {
    try {
      requireAdmin(req, config);
      const body = createBody.parse(req.body ?? {});
      const created = await credentials.create(body);
      return reply.status(201).send({
        tenantId: created.tenantId,
        label: created.label,
        apiKey: created.apiKey,
        maxSessions: created.maxSessions,
        maxEgress: created.maxEgress,
        createdAt: created.createdAt,
        warning: "Store apiKey now — it will not be shown again in full",
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendError(
          req,
          reply,
          new HttpError(400, ERROR_CODES.VALIDATION, err.message),
        );
      }
      if (err instanceof Error && /already exists|Invalid tenant/i.test(err.message)) {
        return sendError(
          req,
          reply,
          new HttpError(409, ERROR_CODES.CONFLICT, err.message),
        );
      }
      return sendError(req, reply, err);
    }
  });

  app.delete("/admin/v1/credentials/:tenantId", async (req, reply) => {
    try {
      requireAdmin(req, config);
      const { tenantId } = req.params as { tenantId: string };
      try {
        const ok = await credentials.revoke(tenantId);
        if (!ok) {
          throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Credential not found");
        }
        return reply.send({ revoked: true, tenantId });
      } catch (err) {
        if (err instanceof HttpError) throw err;
        if (err instanceof Error && /Cannot revoke env/i.test(err.message)) {
          throw new HttpError(400, ERROR_CODES.VALIDATION, err.message);
        }
        throw err;
      }
    } catch (err) {
      return sendError(req, reply, err);
    }
  });
}
