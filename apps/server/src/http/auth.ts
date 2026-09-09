import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";

import { AppError } from "./errors.js";

function tokenDigest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function tokenMatches(provided: string, expected: string): boolean {
  return timingSafeEqual(tokenDigest(provided), tokenDigest(expected));
}

function bearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length);
  return token.length > 0 ? token : null;
}

export function registerBearerAuth(app: FastifyInstance, expectedToken: string): void {
  app.addHook("onRequest", async (request) => {
    if (request.routeOptions.url === "/health/live") return;

    const token = bearerToken(request);
    if (token === null || !tokenMatches(token, expectedToken)) {
      throw new AppError("AUTH_INVALID", 401, false, "Invalid or missing bearer token");
    }
  });
}
