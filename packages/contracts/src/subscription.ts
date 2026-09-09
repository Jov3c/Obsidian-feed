import { z } from "zod";

import { sourceSchema } from "./source.js";

export const resolveSubscriptionRequestSchema = z
  .object({
    input: z.string().min(1).max(4096),
  })
  .strict();

export const createSubscriptionRequestSchema = z
  .object({
    resolutionToken: z.string().min(20).max(16_384),
  })
  .strict();

export const resolvedCandidateSchema = z
  .object({
    kind: z.enum(["rss", "wechat"]),
    providerKey: z.string(),
    name: z.string(),
    canonicalUrl: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    externalId: z.string().nullable(),
    resolutionToken: z.string(),
  })
  .strict();

export const subscriptionSchema = z
  .object({
    id: z.string(),
    enabled: z.boolean(),
    source: sourceSchema,
  })
  .strict();

export const subscriptionListSchema = z
  .object({
    items: z.array(subscriptionSchema),
  })
  .strict();

export const resolvedCandidateResponseSchema = z
  .object({
    candidate: resolvedCandidateSchema,
  })
  .strict();

export const subscriptionResponseSchema = z
  .object({
    subscription: subscriptionSchema,
  })
  .strict();

export type ResolvedCandidate = z.infer<typeof resolvedCandidateSchema>;
export type ApiSubscription = z.infer<typeof subscriptionSchema>;
