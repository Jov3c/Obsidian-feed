import {
  createSubscriptionRequestSchema,
  resolveSubscriptionRequestSchema,
  type ApiSubscription,
  type ResolvedCandidate,
} from "@obsidian-feed/contracts";
import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";

import { ProviderError } from "../../providers/types.js";
import { ResolutionTokenError } from "../../security/resolution-token.js";
import { SubscriptionNotFoundError } from "../../services/subscription-service.js";
import { AppError } from "../errors.js";

export interface SubscriptionRouteService {
  resolveSubscription(rawInput: string): Promise<ResolvedCandidate>;
  createSubscription(resolutionToken: string): Promise<ApiSubscription>;
  listSubscriptions(includeDisabled: boolean): Promise<ApiSubscription[]>;
  disableSubscription(id: string): Promise<void>;
}

const listQuerySchema = z
  .object({ includeDisabled: z.enum(["true", "false"]).optional() })
  .strict();
const idParametersSchema = z.object({ id: z.string().min(1).max(128) }).strict();

function publicError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError)
    return new AppError("INVALID_REQUEST", 400, false, "Invalid request body");
  if (error instanceof ResolutionTokenError) {
    return new AppError(
      "INVALID_RESOLUTION_TOKEN",
      422,
      false,
      "Invalid or expired resolution token",
    );
  }
  if (error instanceof SubscriptionNotFoundError) {
    return new AppError("SUBSCRIPTION_NOT_FOUND", 404, false, "Subscription not found");
  }
  if (error instanceof ProviderError) {
    const mapping: Record<string, { code: string; status: number }> = {
      INVALID_URL: { code: "INVALID_SOURCE_URL", status: 400 },
      UNSUPPORTED_SOURCE: { code: "UNSUPPORTED_SOURCE", status: 422 },
      PARSE_FAILED: { code: "RSS_PARSE_FAILED", status: 422 },
      TIMEOUT: { code: "UPSTREAM_TIMEOUT", status: 502 },
      UPSTREAM_UNAVAILABLE: { code: "WECHAT_UPSTREAM_UNAVAILABLE", status: 502 },
      UPSTREAM_AUTH_REQUIRED: { code: "WECHAT_AUTH_REQUIRED", status: 502 },
      UPSTREAM_RATE_LIMITED: { code: "WECHAT_RATE_LIMITED", status: 502 },
    };
    const mapped = mapping[error.code] ?? { code: error.code, status: 422 };
    return new AppError(
      mapped.code,
      mapped.status,
      error.retryable,
      error.message,
      error.retryAfterSeconds,
    );
  }
  return new AppError("INTERNAL_ERROR", 500, false, "Request failed", undefined, { cause: error });
}

export function registerSubscriptionRoutes(
  app: FastifyInstance,
  service: SubscriptionRouteService,
): void {
  app.get("/v1/subscriptions", async (request) => {
    try {
      const query = listQuerySchema.parse(request.query);
      return { items: await service.listSubscriptions(query.includeDisabled === "true") };
    } catch (error) {
      throw publicError(error);
    }
  });

  app.post("/v1/subscriptions/resolve", async (request) => {
    try {
      const body = resolveSubscriptionRequestSchema.parse(request.body);
      return { candidate: await service.resolveSubscription(body.input) };
    } catch (error) {
      throw publicError(error);
    }
  });

  app.post("/v1/subscriptions", async (request) => {
    try {
      const body = createSubscriptionRequestSchema.parse(request.body);
      return { subscription: await service.createSubscription(body.resolutionToken) };
    } catch (error) {
      throw publicError(error);
    }
  });

  app.delete("/v1/subscriptions/:id", async (request, reply) => {
    try {
      const parameters = idParametersSchema.parse(request.params);
      await service.disableSubscription(parameters.id);
      return reply.status(204).send();
    } catch (error) {
      throw publicError(error);
    }
  });
}
