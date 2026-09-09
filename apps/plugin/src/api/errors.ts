import { errorResponseSchema, type ApiError } from "@obsidian-feed/contracts";

export class FeedApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly retryAfterSeconds?: number | null,
  ) {
    super(message);
    this.name = "FeedApiError";
  }
}

export function apiErrorFrom(value: unknown, status: number): FeedApiError {
  const parsed = errorResponseSchema.safeParse(value);
  if (parsed.success) {
    const error: ApiError = parsed.data.error;
    return new FeedApiError(error.code, error.message, error.retryable, error.retryAfterSeconds);
  }
  return new FeedApiError(`HTTP_${status}`, "Feed Server request failed", status >= 500);
}
