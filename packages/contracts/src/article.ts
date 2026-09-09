import { articleDocumentSchema } from "@obsidian-feed/content-model";
import { z } from "zod";

import { sourceSummarySchema } from "./source.js";

export const contentStatusSchema = z.enum(["pending", "ready", "partial", "unavailable", "failed"]);

export const articleListParamsSchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(30),
    cursor: z.string().max(4096).optional(),
    sourceId: z.string().max(128).optional(),
  })
  .strict();

export const articleListItemSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    author: z.string().nullable(),
    canonicalUrl: z.string(),
    publishedAt: z.iso.datetime({ offset: true }).nullable(),
    contentStatus: contentStatusSchema,
    source: sourceSummarySchema,
  })
  .strict();

export const articlePageSchema = z
  .object({
    items: z.array(articleListItemSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

export const articleMetaSchema = z
  .object({
    id: z.string(),
    sourceId: z.string(),
    externalId: z.string().nullable(),
    canonicalUrl: z.string(),
    title: z.string(),
    author: z.string().nullable(),
    coverUrl: z.string().nullable(),
    publishedAt: z.iso.datetime({ offset: true }).nullable(),
    fetchedAt: z.iso.datetime({ offset: true }),
    contentStatus: contentStatusSchema,
    contentHash: z.string().nullable(),
  })
  .strict();

export const articleDetailSchema = z
  .object({
    article: articleMetaSchema,
    source: sourceSummarySchema,
    document: articleDocumentSchema.nullable(),
    parse: z
      .object({
        parser: z.string().nullable(),
        parserVersion: z.string().nullable(),
        confidence: z.number().min(0).max(1).nullable(),
      })
      .strict(),
  })
  .strict();

export type ApiArticleListItem = z.infer<typeof articleListItemSchema>;
export type ArticleListParams = z.infer<typeof articleListParamsSchema>;
export type ArticlePage = z.infer<typeof articlePageSchema>;
export type ApiArticleDetail = z.infer<typeof articleDetailSchema>;
