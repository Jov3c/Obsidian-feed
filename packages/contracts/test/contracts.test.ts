import { describe, expect, it } from "vitest";

import {
  articleDetailSchema,
  articleListParamsSchema,
  articlePageSchema,
  createSubscriptionRequestSchema,
  errorResponseSchema,
  readyResponseSchema,
  refreshResultSchema,
  resolveSubscriptionRequestSchema,
  resolvedCandidateSchema,
} from "../src/index.js";

const source = {
  id: "src_1",
  type: "rss",
  name: "Example Feed",
  avatarUrl: null,
} as const;

describe("API contract schemas", () => {
  it("accepts an OpenAPI-compatible resolved candidate", () => {
    const candidate = {
      kind: "rss",
      providerKey: "rss-native",
      name: "Example Feed",
      canonicalUrl: "https://example.com/feed.xml",
      avatarUrl: null,
      externalId: "feed-1",
      resolutionToken: "signed-resolution-token-value",
    } as const;

    expect(resolvedCandidateSchema.parse(candidate)).toEqual(candidate);
  });

  it("keeps ArticleDocument out of article list items", () => {
    expect(() =>
      articlePageSchema.parse({
        items: [
          {
            id: "art_1",
            title: "Article",
            author: null,
            canonicalUrl: "https://example.com/article",
            publishedAt: null,
            contentStatus: "ready",
            source,
            document: { version: 1 },
          },
        ],
        nextCursor: null,
      }),
    ).toThrow();
  });

  it("accepts unavailable article detail with nullable parse metadata", () => {
    const detail = {
      article: {
        id: "art_1",
        sourceId: "src_1",
        externalId: null,
        canonicalUrl: "https://example.com/article",
        title: "Article",
        author: null,
        coverUrl: null,
        publishedAt: null,
        fetchedAt: "2026-09-09T03:22:11.123Z",
        contentStatus: "unavailable",
        contentHash: null,
      },
      source,
      document: null,
      parse: { parser: null, parserVersion: null, confidence: null },
    } as const;

    expect(articleDetailSchema.parse(detail)).toEqual(detail);
  });

  it("requires requestId on errors", () => {
    expect(() =>
      errorResponseSchema.parse({
        error: { code: "SOURCE_NOT_FOUND", message: "Source not found", retryable: false },
      }),
    ).toThrow();
  });

  it("applies the OpenAPI article list limit default and bounds", () => {
    expect(articleListParamsSchema.parse({})).toEqual({ limit: 30 });
    expect(() => articleListParamsSchema.parse({ limit: 51 })).toThrow();
  });

  it("validates readiness and refresh response enums", () => {
    expect(
      readyResponseSchema.parse({ status: "degraded", database: "ok", wechat: "disabled" }),
    ).toEqual({ status: "degraded", database: "ok", wechat: "disabled" });
    expect(refreshResultSchema.parse({ status: "already_running", sourceId: "src_1" })).toEqual({
      status: "already_running",
      sourceId: "src_1",
    });
  });

  it("rejects malformed resolve and subscribe request bodies", () => {
    expect(resolveSubscriptionRequestSchema.parse({ input: "https://example.com/feed" })).toEqual({
      input: "https://example.com/feed",
    });
    expect(() => resolveSubscriptionRequestSchema.parse({ input: "" })).toThrow();
    expect(() => createSubscriptionRequestSchema.parse({ resolutionToken: "short" })).toThrow();
  });
});
