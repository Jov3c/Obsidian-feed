import { afterEach, describe, expect, it } from "vitest";

import { createDatabase } from "../../src/db/client.js";
import { migrateDatabase } from "../../src/db/migrate.js";
import { SubscriptionRepository } from "../../src/db/repositories/subscription-repository.js";
import { ProviderRegistry } from "../../src/providers/registry.js";
import type {
  ArticleMeta,
  ContentProvider,
  ProviderArticle,
  ResolvedSource,
  ResolveInput,
  Source,
  SyncPage,
} from "../../src/providers/types.js";
import {
  ResolutionTokenError,
  ResolutionTokenService,
} from "../../src/security/resolution-token.js";
import { SubscriptionService } from "../../src/services/subscription-service.js";

const secret = "0123456789abcdef0123456789abcdef";
const cleanup: Array<() => void> = [];

class FakeRssProvider implements ContentProvider {
  readonly key = "rss-native";
  ensureCalls = 0;

  async canHandle(input: ResolveInput): Promise<boolean> {
    return input.rawInput.startsWith("https://");
  }

  async resolveSource(input: ResolveInput): Promise<ResolvedSource> {
    return {
      type: "rss",
      providerKey: this.key,
      externalId: "feed-1",
      name: "Example feed",
      canonicalUrl: input.rawInput,
      avatarUrl: null,
      providerMeta: { siteUrl: "https://example.com" },
    };
  }

  async ensureSubscribed(source: ResolvedSource): Promise<void> {
    void source;
    this.ensureCalls += 1;
  }

  async syncSource(source: Source): Promise<SyncPage> {
    void source;
    return { articles: [], hasMore: false };
  }

  async fetchArticle(article: ArticleMeta): Promise<ProviderArticle> {
    throw new Error(`Unexpected fetch for ${article.id}`);
  }
}

function createFixture(now: { value: Date }) {
  const database = createDatabase(":memory:");
  migrateDatabase(database);
  cleanup.push(() => database.close());
  const provider = new FakeRssProvider();
  const providers = new ProviderRegistry();
  providers.register(provider);
  const tokens = new ResolutionTokenService({ secret, now: () => now.value });
  const service = new SubscriptionService({ database, providers, tokens });
  return { database, provider, tokens, service };
}

afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose());
});

describe("SubscriptionService", () => {
  it("resolves RSS to a signed token with a ten-minute lifetime", async () => {
    const now = { value: new Date("2026-09-09T03:00:00.000Z") };
    const { service, tokens } = createFixture(now);

    const candidate = await service.resolveSubscription("https://example.com/feed.xml");
    const payload = tokens.verify(candidate.resolutionToken);

    expect(candidate).toMatchObject({
      kind: "rss",
      providerKey: "rss-native",
      name: "Example feed",
    });
    expect(payload.provider).toBe("rss-native");
    expect(payload.expiresAt - payload.issuedAt).toBe(10 * 60 * 1000);
  });

  it("rejects a tampered token", () => {
    const now = { value: new Date("2026-09-09T03:00:00.000Z") };
    const { tokens } = createFixture(now);
    const token = tokens.issue({
      type: "rss",
      providerKey: "rss-native",
      externalId: "feed-1",
      name: "Example",
      canonicalUrl: "https://example.com/feed.xml",
      avatarUrl: null,
      providerMeta: {},
    });

    const replacement = token.endsWith("a") ? "b" : "a";
    expect(() => tokens.verify(`${token.slice(0, -1)}${replacement}`)).toThrow(
      ResolutionTokenError,
    );
  });

  it("rejects an expired token using the injected clock", () => {
    const now = { value: new Date("2026-09-09T03:00:00.000Z") };
    const { tokens } = createFixture(now);
    const token = tokens.issue({
      type: "rss",
      providerKey: "rss-native",
      externalId: "feed-1",
      name: "Example",
      canonicalUrl: "https://example.com/feed.xml",
      avatarUrl: null,
      providerMeta: {},
    });
    now.value = new Date("2026-09-09T03:10:00.001Z");

    expect(() => tokens.verify(token)).toThrowError(
      expect.objectContaining({ code: "RESOLUTION_TOKEN_EXPIRED" }),
    );
  });

  it("re-enables a duplicate subscription without duplicating its source", async () => {
    const now = { value: new Date("2026-09-09T03:00:00.000Z") };
    const { database, provider, service } = createFixture(now);
    const candidate = await service.resolveSubscription("https://example.com/feed.xml");
    const first = await service.createSubscription(candidate.resolutionToken);
    await new SubscriptionRepository(database).disable(first.id);
    const second = await service.createSubscription(candidate.resolutionToken);

    expect(second).toEqual(first);
    expect(second.enabled).toBe(true);
    expect(provider.ensureCalls).toBe(2);
    expect(database.sqlite.prepare("SELECT COUNT(*) AS count FROM sources").get()).toEqual({
      count: 1,
    });
    expect(database.sqlite.prepare("SELECT COUNT(*) AS count FROM subscriptions").get()).toEqual({
      count: 1,
    });
  });

  it("lists enabled subscriptions by default and can include disabled rows", async () => {
    const now = { value: new Date("2026-09-09T03:00:00.000Z") };
    const { service } = createFixture(now);
    const candidate = await service.resolveSubscription("https://example.com/feed.xml");
    const created = await service.createSubscription(candidate.resolutionToken);
    await service.disableSubscription(created.id);

    expect(await service.listSubscriptions(false)).toEqual([]);
    expect(await service.listSubscriptions(true)).toEqual([{ ...created, enabled: false }]);
  });

  it("keeps concurrent creation idempotent", async () => {
    const now = { value: new Date("2026-09-09T03:00:00.000Z") };
    const { database, service } = createFixture(now);
    const candidate = await service.resolveSubscription("https://example.com/feed.xml");

    const [first, second] = await Promise.all([
      service.createSubscription(candidate.resolutionToken),
      service.createSubscription(candidate.resolutionToken),
    ]);

    expect(second.id).toBe(first.id);
    expect(database.sqlite.prepare("SELECT COUNT(*) AS count FROM sources").get()).toEqual({
      count: 1,
    });
  });
});
