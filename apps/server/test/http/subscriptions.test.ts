import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import { createDatabase } from "../../src/db/client.js";
import { migrateDatabase } from "../../src/db/migrate.js";
import { ProviderRegistry } from "../../src/providers/registry.js";
import type { ContentProvider, ResolvedSource, ResolveInput } from "../../src/providers/types.js";
import { ResolutionTokenService } from "../../src/security/resolution-token.js";
import { SubscriptionService } from "../../src/services/subscription-service.js";

const token = "0123456789abcdef0123456789abcdef";
const cleanup: Array<() => Promise<void> | void> = [];

function createApp() {
  const database = createDatabase(":memory:");
  migrateDatabase(database);
  const provider: ContentProvider = {
    key: "rss-native",
    canHandle: async () => true,
    resolveSource: async (input: ResolveInput): Promise<ResolvedSource> => ({
      type: "rss",
      providerKey: "rss-native",
      externalId: "feed-http",
      name: "HTTP feed",
      canonicalUrl: input.rawInput,
      avatarUrl: null,
      providerMeta: {},
    }),
    ensureSubscribed: async () => undefined,
    syncSource: async () => ({ articles: [], hasMore: false }),
    fetchArticle: async () => {
      throw new Error("not used");
    },
  };
  const providers = new ProviderRegistry();
  providers.register(provider);
  const subscriptions = new SubscriptionService({
    database,
    providers,
    tokens: new ResolutionTokenService({ secret: token }),
  });
  const app = buildApp({
    config: { feedServerToken: token },
    database,
    getWechatHealth: () => "disabled",
    subscriptionService: subscriptions,
    logger: false,
  });
  cleanup.push(
    () => database.close(),
    () => app.close(),
  );
  return app;
}

afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

describe("subscription routes", () => {
  it("resolves and creates a subscription with OpenAPI response shapes", async () => {
    const app = createApp();
    const headers = { authorization: `Bearer ${token}` };
    const resolved = await app.inject({
      method: "POST",
      url: "/v1/subscriptions/resolve",
      headers,
      payload: { input: "https://example.com/feed.xml" },
    });

    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({
      candidate: {
        kind: "rss",
        providerKey: "rss-native",
        name: "HTTP feed",
        canonicalUrl: "https://example.com/feed.xml",
        avatarUrl: null,
        externalId: "feed-http",
        resolutionToken: expect.any(String),
      },
    });

    const created = await app.inject({
      method: "POST",
      url: "/v1/subscriptions",
      headers,
      payload: { resolutionToken: resolved.json().candidate.resolutionToken },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      subscription: {
        id: expect.stringMatching(/^sub_/),
        enabled: true,
        source: {
          id: expect.stringMatching(/^src_/),
          type: "rss",
          providerKey: "rss-native",
          status: "active",
        },
      },
    });
  });

  it("rejects malformed request bodies and tampered resolution tokens", async () => {
    const app = createApp();
    const headers = { authorization: `Bearer ${token}` };
    const malformed = await app.inject({
      method: "POST",
      url: "/v1/subscriptions/resolve",
      headers,
      payload: { input: "", extra: true },
    });
    const tampered = await app.inject({
      method: "POST",
      url: "/v1/subscriptions",
      headers,
      payload: { resolutionToken: "this-token-has-been-tampered" },
    });

    expect(malformed.statusCode).toBe(400);
    expect(tampered.statusCode).toBe(422);
    expect(tampered.json().error.code).toBe("INVALID_RESOLUTION_TOKEN");
  });

  it("lists and disables subscriptions without deleting their source", async () => {
    const app = createApp();
    const headers = { authorization: `Bearer ${token}` };
    const resolved = await app.inject({
      method: "POST",
      url: "/v1/subscriptions/resolve",
      headers,
      payload: { input: "https://example.com/feed.xml" },
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/subscriptions",
      headers,
      payload: { resolutionToken: resolved.json().candidate.resolutionToken },
    });
    const subscription = created.json().subscription;

    const disabled = await app.inject({
      method: "DELETE",
      url: `/v1/subscriptions/${subscription.id}`,
      headers,
    });
    const enabledList = await app.inject({ method: "GET", url: "/v1/subscriptions", headers });
    const fullList = await app.inject({
      method: "GET",
      url: "/v1/subscriptions?includeDisabled=true",
      headers,
    });

    expect(disabled.statusCode).toBe(204);
    expect(enabledList.json()).toEqual({ items: [] });
    expect(fullList.json()).toEqual({ items: [{ ...subscription, enabled: false }] });
  });

  it("returns 404 when disabling an unknown subscription", async () => {
    const response = await createApp().inject({
      method: "DELETE",
      url: "/v1/subscriptions/sub_missing",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("SUBSCRIPTION_NOT_FOUND");
  });
});
