import { z } from "zod";

export const sourceTypeSchema = z.enum(["rss", "wechat"]);
export const sourceStatusSchema = z.enum([
  "active",
  "rate_limited",
  "needs_auth",
  "parse_error",
  "unavailable",
  "disabled",
]);

export const sourceSummarySchema = z
  .object({
    id: z.string(),
    type: sourceTypeSchema,
    name: z.string(),
    avatarUrl: z.string().nullable(),
  })
  .strict();

export const sourceSchema = sourceSummarySchema
  .extend({
    canonicalUrl: z.string().nullable(),
    externalId: z.string().nullable(),
    providerKey: z.string(),
    status: sourceStatusSchema,
    lastSyncedAt: z.iso.datetime({ offset: true }).nullable(),
    nextSyncAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

export const sourceStatusResponseSchema = z
  .object({
    id: z.string(),
    status: sourceStatusSchema,
    lastSyncedAt: z.iso.datetime({ offset: true }).nullable(),
    nextSyncAt: z.iso.datetime({ offset: true }).nullable(),
    lastError: z
      .object({
        code: z.string(),
        message: z.string(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const readyResponseSchema = z
  .object({
    status: z.enum(["ok", "degraded"]),
    database: z.enum(["ok", "error"]),
    wechat: z.enum(["ok", "degraded", "disabled"]),
  })
  .strict();

export const refreshResultSchema = z
  .object({
    status: z.enum(["accepted", "already_running"]),
    sourceId: z.string(),
  })
  .strict();

export type ApiSource = z.infer<typeof sourceSchema>;
export type ApiSourceSummary = z.infer<typeof sourceSummarySchema>;
export type SourceStatusResponse = z.infer<typeof sourceStatusResponseSchema>;
export type ReadyResponse = z.infer<typeof readyResponseSchema>;
export type RefreshResult = z.infer<typeof refreshResultSchema>;
