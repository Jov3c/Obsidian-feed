import { afterEach, describe, expect, it, vi } from "vitest";

import { createDatabase, type Database } from "../../src/db/client.js";
import { migrateDatabase } from "../../src/db/migrate.js";
import { ArticleRepository } from "../../src/db/repositories/article-repository.js";
import { SourceRepository } from "../../src/db/repositories/source-repository.js";
import { ProviderRegistry } from "../../src/providers/registry.js";
import { ProviderError, type ContentProvider } from "../../src/providers/types.js";
import { ArticleContentService } from "../../src/services/article-content-service.js";
import { IngestService } from "../../src/services/ingest-service.js";

describe("ArticleContentService", () => {
  let database: Database | undefined;
  afterEach(() => database?.close());

  it("keeps article metadata readable when public content is blocked", async () => {
    database = createDatabase(":memory:");
    migrateDatabase(database);
    const sources = new SourceRepository(database);
    const articles = new ArticleRepository(database);
    const source = await sources.create({
      type: "wechat",
      name: "Fixture",
      canonicalUrl: null,
      avatarUrl: null,
      externalId: "wx-source",
      providerKey: "blocked-provider",
      providerMeta: {},
    });
    const article = await articles.upsertMeta({
      sourceId: source.id,
      externalId: "wx-article",
      canonicalUrl: "https://mp.weixin.qq.com/s/blocked",
      title: "Blocked article",
      author: null,
      coverUrl: null,
      publishedAt: null,
      fetchedAt: new Date().toISOString(),
      contentStatus: "pending",
    });
    const providers = new ProviderRegistry();
    const fetchArticle = vi.fn(async () => {
      throw new ProviderError(
        "CONTENT_BLOCKED",
        "Interactive verification required",
        false,
        "wechat-direct",
      );
    });
    providers.register({
      key: "blocked-provider",
      canHandle: async () => true,
      resolveSource: async () => {
        throw new Error("not used");
      },
      ensureSubscribed: async () => undefined,
      syncSource: async () => ({ articles: [], hasMore: false }),
      fetchArticle,
    } satisfies ContentProvider);
    const service = new ArticleContentService(
      articles,
      sources,
      providers,
      new IngestService({ articles }),
    );

    await expect(service.ensureArticleContent(article.id)).resolves.toBeNull();
    await expect(service.ensureArticleContent(article.id)).resolves.toBeNull();
    expect(fetchArticle).toHaveBeenCalledOnce();
    await expect(articles.getDetail(article.id)).resolves.toMatchObject({
      article: { contentStatus: "unavailable" },
    });
  });
});
