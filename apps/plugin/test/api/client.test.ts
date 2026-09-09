import { articlePageSchema } from "@obsidian-feed/contracts";
import { describe, expect, it, vi } from "vitest";

import { FeedApiClient } from "../../src/api/client.js";

describe("FeedApiClient", () => {
  it("uses requestUrl with bearer auth and validates responses", async () => {
    const request = vi.fn(async () => ({ status: 200, json: { items: [], nextCursor: null } }));
    const client = new FeedApiClient({
      baseUrl: "https://feed.example/",
      token: "secret",
      request,
    });
    const page = await client.listArticles({ limit: 30 });
    expect(articlePageSchema.parse(page)).toEqual({ items: [], nextCursor: null });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://feed.example/v1/articles?limit=30",
        method: "GET",
        headers: { Authorization: "Bearer secret" },
      }),
    );
  });

  it("rejects malformed server data", async () => {
    const client = new FeedApiClient({
      baseUrl: "https://feed.example",
      token: "secret",
      request: async () => ({ status: 200, json: { items: [{ body: "not allowed" }] } }),
    });
    await expect(client.listArticles({ limit: 30 })).rejects.toBeDefined();
  });

  it("retries one transient GET failure but not unauthorized responses", async () => {
    const transient = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ status: 200, json: { items: [], nextCursor: null } });
    await new FeedApiClient({
      baseUrl: "https://feed.example",
      token: "secret",
      request: transient,
    }).listArticles({ limit: 30 });
    expect(transient).toHaveBeenCalledTimes(2);
    const unauthorized = vi.fn(async () => ({
      status: 401,
      json: {
        error: { code: "AUTH_INVALID", message: "bad", retryable: false, requestId: "req_1" },
      },
    }));
    await expect(
      new FeedApiClient({
        baseUrl: "https://feed.example",
        token: "secret",
        request: unauthorized,
      }).listArticles({ limit: 30 }),
    ).rejects.toMatchObject({ code: "AUTH_INVALID" });
    expect(unauthorized).toHaveBeenCalledOnce();
  });
});
