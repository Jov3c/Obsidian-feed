import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "../../src/db/client.js";
import { migrateDatabase } from "../../src/db/migrate.js";
import { ArticleRepository } from "../../src/db/repositories/article-repository.js";
import { SourceRepository } from "../../src/db/repositories/source-repository.js";
import { SubscriptionRepository } from "../../src/db/repositories/subscription-repository.js";

const cleanup: Array<() => void> = [];

function openTestDatabase(): Database {
  const directory = mkdtempSync(join(tmpdir(), "obsidian-feed-db-"));
  const database = createDatabase(join(directory, "feed.sqlite"));
  migrateDatabase(database);
  cleanup.push(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return database;
}

afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose());
});

describe("SQLite schema", () => {
  it("migrates an empty database and applies required pragmas", () => {
    const database = openTestDatabase();

    expect(database.sqlite.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    expect(database.sqlite.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
    expect(
      database.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((row) => row.name),
    ).toEqual([
      "article_contents",
      "articles",
      "media_cache",
      "sources",
      "subscriptions",
      "sync_logs",
    ]);
  });

  it("enforces source identity uniqueness", async () => {
    const database = openTestDatabase();
    const sources = new SourceRepository(database);
    const input = {
      type: "rss" as const,
      name: "Example",
      canonicalUrl: "https://example.com/feed.xml",
      avatarUrl: null,
      externalId: "external-feed",
      providerKey: "rss-native",
      providerMeta: {},
    };

    await sources.create(input);
    await expect(sources.create(input)).rejects.toThrow();
  });

  it("disabling a subscription preserves its source and articles", async () => {
    const database = openTestDatabase();
    const sources = new SourceRepository(database);
    const subscriptions = new SubscriptionRepository(database);
    const articles = new ArticleRepository(database);
    const source = await sources.create({
      type: "rss",
      name: "Example",
      canonicalUrl: "https://example.com/feed.xml",
      avatarUrl: null,
      externalId: "external-feed",
      providerKey: "rss-native",
      providerMeta: {},
    });
    const subscription = await subscriptions.enableForSource(source.id);
    await articles.upsertMeta({
      sourceId: source.id,
      externalId: "article-1",
      canonicalUrl: "https://example.com/article-1",
      title: "Article 1",
      author: null,
      coverUrl: null,
      publishedAt: "2026-09-09T03:22:11.123Z",
      fetchedAt: "2026-09-09T03:23:11.123Z",
      contentStatus: "pending",
    });

    await subscriptions.disable(subscription.id);

    expect((await subscriptions.listEnabled()).length).toBe(0);
    expect(await sources.findById(source.id)).toMatchObject({ id: source.id });
    expect((await articles.listPage({ limit: 30 })).items).toHaveLength(1);
  });

  it("deleting an article cascades its content", async () => {
    const database = openTestDatabase();
    const sources = new SourceRepository(database);
    const articles = new ArticleRepository(database);
    const source = await sources.create({
      type: "rss",
      name: "Example",
      canonicalUrl: "https://example.com/feed.xml",
      avatarUrl: null,
      externalId: "external-feed",
      providerKey: "rss-native",
      providerMeta: {},
    });
    const article = await articles.upsertMeta({
      sourceId: source.id,
      externalId: "article-1",
      canonicalUrl: "https://example.com/article-1",
      title: "Article 1",
      author: null,
      coverUrl: null,
      publishedAt: null,
      fetchedAt: "2026-09-09T03:23:11.123Z",
      contentStatus: "pending",
    });
    await articles.setContent(article.id, {
      documentJson: '{"version":1}',
      contentHash: "hash",
      contentStatus: "ready",
      parser: "rss-content-parser",
      parserVersion: "1.0.0",
      parseConfidence: 1,
      parseDiagnostics: {},
    });

    database.sqlite.prepare("DELETE FROM articles WHERE id = ?").run(article.id);

    expect(
      database.sqlite
        .prepare("SELECT article_id FROM article_contents WHERE article_id = ?")
        .get(article.id),
    ).toBeUndefined();
  });
});
