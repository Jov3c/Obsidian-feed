import type { FastifyInstance } from "fastify";

export function registerSystemRoutes(
  app: FastifyInstance,
  status: () => Promise<Record<string, unknown>> | Record<string, unknown>,
): void {
  app.get("/v1/system/status", async () => status());
}
