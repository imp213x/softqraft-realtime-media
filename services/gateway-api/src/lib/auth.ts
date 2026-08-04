import type { FastifyRequest } from "fastify";
import type { TenantRecord } from "../config.js";
import type { CredentialStore } from "./credential-store.js";
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
 * Resolve bearer API key → tenant (or legacy key set) via CredentialStore.
 */
export function requireServiceAuth(
  req: FastifyRequest,
  credentials: CredentialStore,
): AuthContext {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, "Missing bearer token");
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, "Missing bearer token");
  }

  const resolved = credentials.resolve(token);
  if (!resolved) {
    throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, "Invalid service key");
  }
  return { tenant: resolved.tenant, apiKey: resolved.apiKey };
}
