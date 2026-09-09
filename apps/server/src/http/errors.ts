import type { FastifyInstance, FastifyRequest } from "fastify";

export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    readonly retryable: boolean,
    readonly publicMessage: string,
    readonly retryAfterSeconds?: number,
    options?: ErrorOptions,
  ) {
    super(publicMessage, options);
    this.name = "AppError";
  }
}

function statusCodeOf(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }
  return 500;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler(async () => {
    throw new AppError("INTERNAL_ERROR", 404, false, "Request failed");
  });

  app.setErrorHandler((error, request, reply) => {
    const normalized =
      error instanceof AppError
        ? error
        : new AppError("INTERNAL_ERROR", statusCodeOf(error), false, "Request failed", undefined, {
            cause: error,
          });

    if (normalized.statusCode >= 500) {
      request.log.error({ errorCode: normalized.code, requestId: request.id }, "request failed");
    }

    const retryAfter = normalized.retryAfterSeconds;
    return reply.status(normalized.statusCode).send({
      error: {
        code: normalized.code,
        message: normalized.publicMessage,
        retryable: normalized.retryable,
        ...(retryAfter === undefined ? {} : { retryAfterSeconds: retryAfter }),
        requestId: String(request.id),
      },
    });
  });
}

export function requestIdOf(request: FastifyRequest): string {
  return String(request.id);
}
