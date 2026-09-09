import { afterEach, describe, expect, it, vi } from "vitest";

import { createDatabase } from "../../src/db/client.js";
import { migrateDatabase } from "../../src/db/migrate.js";
import { ArticleRepository } from "../../src/db/repositories/article-repository.js";
import { SourceRepository } from "../../src/db/repositories/source-repository.js";
import type { ProviderArticle } from "../../src/providers/types.js";
import { IngestService } from "../../src/services/ingest-service.js";

const cleanup: Array<() => void> = [];
const article = (overrides: Partial<ProviderArticle> = {}): ProviderArticle => ({
  externalId: "post-1",
  canonicalUrl: "https://example.com/post-1",
  title: "Post one",
  author: null,
  coverUrl: null,
  publishedAt: "2026-09-09T00:00:00.000Z",
  rawContent: "<article><p>Useful article content.</p></article>",
  rawContentType: "html",
  ...overrides,
});

async function fixture() {
  const database = createDatabase(":memory:");
  migrateDatabase(database);
  cleanup.push(() => database.close());
  const source = await new SourceRepository(database).create({
    type: "rss",
    name: "Example",
    canonicalUrl: "https://example.com/feed.xml",
    avatarUrl: null,
    externalId: "feed-1",
    providerKey: "rss-native",
    providerMeta: {},
  });
  return { database, source, repository: new ArticleRepository(database) };
}

afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose()),
);

describe("IngestService", () => {
  it("deduplicates first by external id and then by canonical URL", async () => {
    const { database, source, repository } = await fixture();
    const service = new IngestService({ articles: repository });

    await service.ingestProviderArticles(source, [article()]);
    await service.ingestProviderArticles(source, [
      article({ canonicalUrl: "https://example.com/moved" }),
    ]);
    await service.ingestProviderArticles(source, [
      article({ externalId: "replacement", canonicalUrl: "https://example.com/moved" }),
    ]);

    expect(database.sqlite.prepare("SELECT COUNT(*) AS count FROM articles").get()).toEqual({
      count: 1,
    });
  });

  it("does not rewrite article content when its hash is unchanged", async () => {
    const { database, source, repository } = await fixture();
    const service = new IngestService({ articles: repository });
    await service.ingestProviderArticles(source, [article()]);
    const before = database.sqlite.prepare("SELECT updated_at FROM article_contents").get();
    database.sqlite.exec("UPDATE article_contents SET updated_at = 'sentinel'");

    await service.ingestProviderArticles(source, [article()]);

    expect(before).toBeDefined();
    expect(database.sqlite.prepare("SELECT updated_at FROM article_contents").get()).toEqual({
      updated_at: "sentinel",
    });
  });

  it("keeps metadata and continues after one parse failure", async () => {
    const { database, source, repository } = await fixture();
    const parse = vi.fn(async (input: { canonicalUrl: string }) =>
      input.canonicalUrl.endsWith("bad")
        ? {
            document: null,
            status: "failed" as const,
            parser: "test",
            parserVersion: "1",
            confidence: 0,
            diagnostics: { reason: "bad" },
          }
        : {
            document: {
              version: 1 as const,
              title: "ok",
              sourceName: "Example",
              canonicalUrl: input.canonicalUrl,
              blocks: [
                {
                  id: "x",
                  type: "paragraph" as const,
                  children: [{ type: "text" as const, text: "ok" }],
                },
              ],
            },
            status: "ready" as const,
            parser: "test",
            parserVersion: "1",
            confidence: 1,
            diagnostics: {},
          },
    );
    const service = new IngestService({ articles: repository, parseArticle: parse });

    const outcome = await service.ingestProviderArticles(source, [
      article({ externalId: "bad", canonicalUrl: "https://example.com/bad" }),
      article({ externalId: "good", canonicalUrl: "https://example.com/good" }),
    ]);

    expect(outcome).toMatchObject({ processed: 2, failed: 1 });
    expect(
      database.sqlite
        .prepare(
          "SELECT content_status, COUNT(*) AS count FROM articles GROUP BY content_status ORDER BY content_status",
        )
        .all(),
    ).toEqual([
      { content_status: "failed", count: 1 },
      { content_status: "ready", count: 1 },
    ]);
  });

  it("marks an access-control or verification page unavailable", async () => {
    const { database, source, repository } = await fixture();
    const service = new IngestService({
      articles: repository,
      parseArticle: async () => ({
        document: null,
        status: "failed",
        parser: "wechat-parser",
        parserVersion: "1",
        confidence: 0,
        diagnostics: { blocked: true },
      }),
    });

    await service.ingestProviderArticles(source, [article()]);

    expect(database.sqlite.prepare("SELECT content_status FROM articles").get()).toEqual({
      content_status: "unavailable",
    });
  });
});
