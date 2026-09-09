import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { MediaFile, MediaRef } from "../../media/media-service.js";

export interface MediaRouteService {
  registerRemote(url: string): Promise<MediaRef>;
  getOrFetch(id: string): Promise<MediaFile>;
}

const paramsSchema = z.object({ id: z.string().min(1).max(128) }).strict();

export function registerMediaRoutes(app: FastifyInstance, media: MediaRouteService): void {
  app.get("/v1/media/:id", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const file = await media.getOrFetch(id);
    reply
      .header("ETag", file.etag)
      .header("Cache-Control", "private, max-age=86400")
      .header("X-Content-Type-Options", "nosniff");
    if (request.headers["if-none-match"] === file.etag) return reply.code(304).send();
    return reply.type(file.mimeType).header("Content-Length", file.sizeBytes).send(file.bytes);
  });
}
