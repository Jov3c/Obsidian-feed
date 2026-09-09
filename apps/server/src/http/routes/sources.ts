import {
  refreshResultSchema,
  sourceStatusResponseSchema,
  type RefreshResult,
  type SourceStatusResponse,
} from "@obsidian-feed/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

export interface SourceRouteService {
  getStatus(id: string): Promise<SourceStatusResponse>;
  refresh(id: string): Promise<RefreshResult>;
}
const paramsSchema = z.object({ id: z.string().min(1).max(128) }).strict();

export function registerSourceRoutes(app: FastifyInstance, service: SourceRouteService): void {
  app.get("/v1/sources/:id/status", async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return sourceStatusResponseSchema.parse(await service.getStatus(id));
  });
  app.post("/v1/sources/:id/refresh", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    return reply.code(202).send(refreshResultSchema.parse(await service.refresh(id)));
  });
}
