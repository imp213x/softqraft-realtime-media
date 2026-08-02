import type { FastifyReply, FastifyRequest } from "fastify";
import { ERROR_CODES, type ApiErrorBody } from "@softqraft/shared";
import { HttpError } from "./auth.js";

export function sendError(
  req: FastifyRequest,
  reply: FastifyReply,
  err: unknown,
): FastifyReply {
  if (err instanceof HttpError) {
    const body: ApiErrorBody = {
      error: {
        code: err.code,
        message: err.message,
        requestId: req.requestId,
      },
    };
    return reply.status(err.statusCode).send(body);
  }

  req.log.error(err);
  const body: ApiErrorBody = {
    error: {
      code: ERROR_CODES.INTERNAL,
      message: "Internal server error",
      requestId: req.requestId,
    },
  };
  return reply.status(500).send(body);
}
