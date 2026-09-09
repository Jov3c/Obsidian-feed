import { z } from "zod";

export const apiErrorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    retryAfterSeconds: z.number().int().min(0).nullable().optional(),
    requestId: z.string(),
  })
  .strict();

export const errorResponseSchema = z
  .object({
    error: apiErrorSchema,
  })
  .strict();

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorResponse = z.infer<typeof errorResponseSchema>;
