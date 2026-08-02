import type { FastifyRequest } from "fastify";
import type { GatewayConfig } from "../config.js";
import { ERROR_CODES } from "@clatters-media/shared";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function requireServiceAuth(
  req: FastifyRequest,
  config: GatewayConfig,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, "Missing bearer token");
  }
  const token = header.slice("Bearer ".length).trim();
  if (!config.serviceApiKeys.has(token)) {
    throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, "Invalid service key");
  }
}
