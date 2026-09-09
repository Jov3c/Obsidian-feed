import {
  articleDetailSchema,
  articleListParamsSchema,
  articlePageSchema,
  type ApiArticleDetail,
  type ArticlePage,
} from "@obsidian-feed/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

export interface ArticleRouteService {
  listArticles(input: { limit: number; cursor?: string; sourceId?: string }): Promise<ArticlePage>;
  getArticle(id: string): Promise<ApiArticleDetail | null>;
}

const querySchema = z
  .object({
    limit: z.coerce.number().optional(),
    cursor: z.string().optional(),
    sourceId: z.string().optional(),
  })
  .strict();
const paramsSchema = z.object({ id: z.string().min(1).max(128) }).strict();

export function registerArticleRoutes(app: FastifyInstance, service: ArticleRouteService): void {
  app.get("/v1/articles", async (request) => {
    const raw = querySchema.parse(request.query);
    const input = articleListParamsSchema.parse({
      limit: raw.limit ?? 30,
      ...(raw.cursor ? { cursor: raw.cursor } : {}),
      ...(raw.sourceId ? { sourceId: raw.sourceId } : {}),
    });
    return articlePageSchema.parse(
      await service.listArticles({
        limit: input.limit,
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
      }),
    );
  });
  app.get("/v1/articles/:id", async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const detail = await service.getArticle(id);
    if (!detail) {
      const { AppError } = await import("../errors.js");
      throw new AppError("ARTICLE_NOT_FOUND", 404, false, "Article not found");
    }
    return articleDetailSchema.parse(detail);
  });
}
