import type { FastifyRequest } from "fastify";
import type { GatewayConfig, TenantRecord } from "../config.js";
import { ERROR_CODES } from "@softqraft/shared";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface AuthContext {
  /** Resolved tenant, or null when using legacy single-key mode */
  tenant: TenantRecord | null;
  /** API key used (never log at info in production) */
  apiKey: string;
}

/**
 * Resolve bearer API key → tenant (or legacy key set).
 */
export function requireServiceAuth(
  req: FastifyRequest,
  config: GatewayConfig,
): AuthContext {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, "Missing bearer token");
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, "Missing bearer token");
  }

  // Multi-tenant registry takes precedence when configured
  if (config.tenantsByKey.size > 0) {
    const tenant = config.tenantsByKey.get(token);
    if (!tenant) {
      // Fall back to legacy keys if present
      if (config.serviceApiKeys.has(token)) {
        return { tenant: null, apiKey: token };
      }
      throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, "Invalid service key");
    }
    return { tenant, apiKey: token };
  }

  if (!config.serviceApiKeys.has(token)) {
    throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, "Invalid service key");
  }
  return { tenant: null, apiKey: token };
}
