import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { GatewayConfig } from "../../config.js";
import type { CredentialStore } from "../../lib/credential-store.js";
import type { UsageMeter } from "../../lib/usage-meter.js";
import {
  adminSessionCookieName,
  LoginRateLimiter,
  type AdminAuthStore,
  type AdminOperator,
} from "../../lib/admin-auth.js";
import { parseCookies, serializeCookie } from "../../lib/cookies.js";
import { HttpError } from "../../lib/auth.js";
import { sendError } from "../../lib/errors.js";
import { COST_PROFILE_NOTES, ERROR_CODES } from "@softqraft/shared";

const createBody = z.object({
  tenantId: z.string().min(1).max(64),
  label: z.string().max(128).optional(),
  maxSessions: z.number().int().positive().max(10_000).optional(),
  maxEgress: z.number().int().positive().max(10_000).optional(),
  keyLabel: z.string().max(128).optional(),
  expiresAt: z.string().nullable().optional(),
});

const createKeyBody = z.object({
  label: z.string().max(128).optional(),
  expiresAt: z.string().nullable().optional(),
});

const rotateBody = z.object({
  label: z.string().max(128).optional(),
  revokeKeyId: z.string().min(1).optional(),
});

const updateTenantBody = z.object({
  label: z.string().max(128).optional(),
  maxSessions: z.number().int().positive().max(10_000).optional(),
  maxEgress: z.number().int().positive().max(10_000).optional(),
});

const loginBody = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
});

const bootstrapBody = z.object({
  bootstrapToken: z.string().min(1),
  email: z.string().email().max(320),
  password: z.string().min(10).max(200),
});

const SESSION_MAX_AGE = 8 * 3600;

async function requireAdmin(
  req: FastifyRequest,
  config: GatewayConfig,
  authStore: AdminAuthStore,
  opts?: { write?: boolean },
): Promise<{ mode: "session" | "bearer"; operator: AdminOperator | null }> {
  // 1) Cookie session (preferred)
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies[adminSessionCookieName()];
  if (sessionToken) {
    const session = await authStore.resolveSession(sessionToken);
    if (session) {
      if (
        opts?.write &&
        session.operator.role === "viewer"
      ) {
        throw new HttpError(
          403,
          ERROR_CODES.FORBIDDEN,
          "Viewer role cannot modify credentials",
        );
      }
      return { mode: "session", operator: session.operator };
    }
  }

  // 2) Break-glass env bearer (phase B)
  if (config.adminToken) {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      const token = header.slice("Bearer ".length).trim();
      if (token === config.adminToken) {
        return { mode: "bearer", operator: null };
      }
    }
  }

  const n = await authStore.countOperators();
  if (n === 0 && !config.adminToken) {
    throw new HttpError(
      503,
      ERROR_CODES.DEPENDENCY,
      "Admin not bootstrapped — POST /admin/v1/auth/bootstrap",
    );
  }
  throw new HttpError(
    401,
    ERROR_CODES.UNAUTHORIZED,
    "Not signed in — login or provide break-glass admin token",
  );
}

function setSessionCookie(
  reply: FastifyReply,
  token: string,
  secure: boolean,
  clear = false,
): void {
  reply.header(
    "Set-Cookie",
    serializeCookie(adminSessionCookieName(), token, {
      httpOnly: true,
      secure,
      sameSite: "Lax",
      path: "/",
      maxAgeSec: clear ? 0 : SESSION_MAX_AGE,
      clear,
    }),
  );
}

function clientIp(req: FastifyRequest): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  return req.ip || "unknown";
}

function mapCredError(err: unknown): never {
  if (err instanceof HttpError) throw err;
  if (err instanceof Error) {
    if (/already exists|Invalid tenant/i.test(err.message)) {
      throw new HttpError(409, ERROR_CODES.CONFLICT, err.message);
    }
    if (/not found/i.test(err.message)) {
      throw new HttpError(404, ERROR_CODES.NOT_FOUND, err.message);
    }
    if (
      /env-bootstrap|Cannot revoke|Cannot add|Cannot update|Cannot delete|Invalid expiresAt|Cannot write credential store|Failed to persist/i.test(
        err.message,
      )
    ) {
      throw new HttpError(400, ERROR_CODES.VALIDATION, err.message);
    }
  }
  throw err;
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  config: GatewayConfig,
  credentials: CredentialStore,
  usage: UsageMeter,
  authStore: AdminAuthStore,
): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const adminHtmlPath = path.resolve(here, "../../../public/admin/index.html");
  const rateLimit = new LoginRateLimiter(10, 60_000);

  app.get("/admin", async (_req, reply) => {
    return reply.redirect("/admin/");
  });

  app.get("/admin/", async (_req, reply) => {
    try {
      const html = await readFile(adminHtmlPath, "utf8");
      // Avoid browsers/CDNs serving a stale console without delete controls.
      return reply
        .header("Cache-Control", "no-store, no-cache, must-revalidate")
        .header("Pragma", "no-cache")
        .type("text/html")
        .send(html);
    } catch {
      return reply
        .status(500)
        .type("text/plain")
        .send("Admin UI missing — rebuild gateway with public/admin assets");
    }
  });

  // --- P0.5 Auth ---

  app.get("/admin/v1/auth/status", async (_req, reply) => {
    const operators = await authStore.countOperators();
    return reply.send({
      operators,
      needsBootstrap: operators === 0,
      passwordLogin: true,
      breakGlassConfigured: Boolean(config.adminToken),
    });
  });

  app.post("/admin/v1/auth/bootstrap", async (req, reply) => {
    try {
      const ip = clientIp(req);
      if (!rateLimit.check(ip)) {
        throw new HttpError(429, ERROR_CODES.QUOTA_EXCEEDED, "Too many attempts");
      }
      const body = bootstrapBody.parse(req.body ?? {});
      const n = await authStore.countOperators();
      if (n > 0) {
        throw new HttpError(
          409,
          ERROR_CODES.CONFLICT,
          "Already bootstrapped — use login",
        );
      }
      const expected = config.adminBootstrapToken || config.adminToken;
      if (!expected || body.bootstrapToken !== expected) {
        throw new HttpError(
          401,
          ERROR_CODES.UNAUTHORIZED,
          "Invalid bootstrap token",
        );
      }
      const operator = await authStore.createOperator({
        email: body.email,
        password: body.password,
        role: "owner",
      });
      const sessionToken = await authStore.createSession(operator.id);
      setSessionCookie(reply, sessionToken, config.adminCookieSecure);
      return reply.status(201).send({
        operator: {
          id: operator.id,
          email: operator.email,
          role: operator.role,
        },
        message: "Owner created — you are signed in",
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendError(
          req,
          reply,
          new HttpError(400, ERROR_CODES.VALIDATION, err.message),
        );
      }
      if (err instanceof Error && /Password must|already registered/i.test(err.message)) {
        return sendError(
          req,
          reply,
          new HttpError(400, ERROR_CODES.VALIDATION, err.message),
        );
      }
      return sendError(req, reply, err);
    }
  });

  app.post("/admin/v1/auth/login", async (req, reply) => {
    try {
      const ip = clientIp(req);
      if (!rateLimit.check(ip)) {
        throw new HttpError(429, ERROR_CODES.QUOTA_EXCEEDED, "Too many attempts");
      }
      const body = loginBody.parse(req.body ?? {});
      const operator = await authStore.verifyCredentials(
        body.email,
        body.password,
      );
      if (!operator) {
        throw new HttpError(
          401,
          ERROR_CODES.UNAUTHORIZED,
          "Invalid email or password",
        );
      }
      const sessionToken = await authStore.createSession(operator.id);
      setSessionCookie(reply, sessionToken, config.adminCookieSecure);
      return reply.send({
        operator: {
          id: operator.id,
          email: operator.email,
          role: operator.role,
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

  app.post("/admin/v1/auth/logout", async (req, reply) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const token = cookies[adminSessionCookieName()];
      if (token) await authStore.deleteSession(token);
      setSessionCookie(reply, "", config.adminCookieSecure, true);
      return reply.send({ ok: true });
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.get("/admin/v1/auth/me", async (req, reply) => {
    try {
      const auth = await requireAdmin(req, config, authStore);
      if (auth.mode === "bearer") {
        return reply.send({
          mode: "break_glass",
          operator: null,
          note: "Authenticated via GATEWAY_ADMIN_TOKEN",
        });
      }
      return reply.send({
        mode: "session",
        operator: {
          id: auth.operator!.id,
          email: auth.operator!.email,
          role: auth.operator!.role,
        },
      });
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.get("/admin/v1/meta", async (req, reply) => {
    try {
      await requireAdmin(req, config, authStore);
      const publicGateway =
        config.publicGatewayUrl ||
        `http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`;
      const costClaimsAllowed =
        config.deploymentPlane === "economic_production" &&
        config.hostingCostClass === "bandwidth_cheap";
      return reply.send({
        product: "SoftQraft Realtime Media",
        publicGatewayUrl: publicGateway.replace(/\/$/, ""),
        realtimeUrl: config.realtimeUrl,
        adminEnabled: Boolean(config.adminToken),
        tenantCount: credentials.tenantCount(),
        deploymentPlane: config.deploymentPlane,
        hostingCostClass: config.hostingCostClass,
        costClaimsAllowed,
        costClaimNote: costClaimsAllowed
          ? "Economic production plane + bandwidth-cheap host — cost claims allowed vs LiveKit Cloud transfer."
          : "Demo plane and/or non-cheap host — do not market cost savings vs LiveKit Cloud. See ADR-009.",
        costProfiles: COST_PROFILE_NOTES,
        credentialStore: {
          version: 2,
          hashed: true,
          multiKey: true,
          format: "sqk_{keyId}.{secret}",
        },
      });
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  // Usage is process-lifetime only. Credential revoke/delete must never reset these counters.
  app.get("/admin/v1/usage", async (req, reply) => {
    try {
      await requireAdmin(req, config, authStore);
      return reply.send({
        usage: usage.snapshot(),
        note: "In-process counters since Gateway start (resets only on process restart — not on tenant delete/revoke). GB is a proxy (maxParticipants × bitrate), not measured WebRTC bytes.",
      });
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.get("/admin/v1/audit", async (req, reply) => {
    try {
      await requireAdmin(req, config, authStore);
      const q = req.query as { limit?: string };
      const limit = Math.min(200, Math.max(1, Number(q.limit ?? 50) || 50));
      return reply.send({ items: credentials.listAudit(limit) });
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.get("/admin/v1/credentials", async (req, reply) => {
    try {
      await requireAdmin(req, config, authStore);
      return reply.send({
        items: credentials.list(),
        tenants: credentials.listTenants(),
      });
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.post("/admin/v1/credentials", async (req, reply) => {
    try {
      await requireAdmin(req, config, authStore, { write: true });
      const body = createBody.parse(req.body ?? {});
      const created = await credentials.create(body);
      return reply.status(201).send({
        ...created,
        warning:
          "Store apiKey now — it is shown once and stored as SHA-256 only",
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendError(
          req,
          reply,
          new HttpError(400, ERROR_CODES.VALIDATION, err.message),
        );
      }
      try {
        mapCredError(err);
      } catch (mapped) {
        return sendError(req, reply, mapped);
      }
    }
  });

  app.patch("/admin/v1/credentials/:tenantId", async (req, reply) => {
    try {
      await requireAdmin(req, config, authStore, { write: true });
      const { tenantId } = req.params as { tenantId: string };
      const body = updateTenantBody.parse(req.body ?? {});
      const updated = await credentials.updateTenant(tenantId, body);
      return reply.send(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendError(
          req,
          reply,
          new HttpError(400, ERROR_CODES.VALIDATION, err.message),
        );
      }
      try {
        mapCredError(err);
      } catch (mapped) {
        return sendError(req, reply, mapped);
      }
    }
  });

  app.post("/admin/v1/credentials/:tenantId/keys", async (req, reply) => {
    try {
      await requireAdmin(req, config, authStore, { write: true });
      const { tenantId } = req.params as { tenantId: string };
      const body = createKeyBody.parse(req.body ?? {});
      const created = await credentials.createKey(tenantId, body);
      return reply.status(201).send({
        tenantId,
        ...created,
        warning:
          "Store apiKey now — it is shown once and stored as SHA-256 only",
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendError(
          req,
          reply,
          new HttpError(400, ERROR_CODES.VALIDATION, err.message),
        );
      }
      try {
        mapCredError(err);
      } catch (mapped) {
        return sendError(req, reply, mapped);
      }
    }
  });

  app.post("/admin/v1/credentials/:tenantId/rotate", async (req, reply) => {
    try {
      await requireAdmin(req, config, authStore, { write: true });
      const { tenantId } = req.params as { tenantId: string };
      const body = rotateBody.parse(req.body ?? {});
      const rotated = await credentials.rotateKey(tenantId, body);
      return reply.status(201).send({
        tenantId,
        ...rotated,
        warning:
          "Store apiKey now — previous keys revoked (unless single-key revoke specified)",
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return sendError(
          req,
          reply,
          new HttpError(400, ERROR_CODES.VALIDATION, err.message),
        );
      }
      try {
        mapCredError(err);
      } catch (mapped) {
        return sendError(req, reply, mapped);
      }
    }
  });

  app.delete(
    "/admin/v1/credentials/:tenantId/keys/:keyId",
    async (req, reply) => {
      try {
        await requireAdmin(req, config, authStore, { write: true });
        const { tenantId, keyId } = req.params as {
          tenantId: string;
          keyId: string;
        };
        const ok = await credentials.revokeKey(tenantId, keyId);
        if (!ok) {
          throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Key not found");
        }
        return reply.send({ revoked: true, tenantId, keyId });
      } catch (err) {
        try {
          mapCredError(err);
        } catch (mapped) {
          return sendError(req, reply, mapped);
        }
      }
    },
  );

  app.delete("/admin/v1/credentials/:tenantId", async (req, reply) => {
    try {
      await requireAdmin(req, config, authStore, { write: true });
      const { tenantId } = req.params as { tenantId: string };
      const q = req.query as { hard?: string };
      if (q.hard === "1" || q.hard === "true") {
        const ok = await credentials.deleteTenant(tenantId);
        if (!ok) {
          throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Tenant not found");
        }
        return reply.send({ deleted: true, tenantId });
      }
      const ok = await credentials.revoke(tenantId);
      if (!ok) {
        throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Credential not found");
      }
      return reply.send({ revoked: true, tenantId });
    } catch (err) {
      try {
        mapCredError(err);
      } catch (mapped) {
        return sendError(req, reply, mapped);
      }
    }
  });
}
