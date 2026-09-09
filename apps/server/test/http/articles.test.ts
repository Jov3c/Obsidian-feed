import {
  articleDetailSchema,
  articlePageSchema,
  type ApiArticleDetail,
  type ArticlePage,
} from "@obsidian-feed/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import { createDatabase } from "../../src/db/client.js";
import { CursorError, CursorService } from "../../src/security/cursor.js";

const token = "0123456789abcdef0123456789abcdef";
const cleanup: Array<() => Promise<void> | void> = [];
const source = { id: "src_1", type: "rss" as const, name: "Feed", avatarUrl: null };
const item = (id: string) => ({
  id,
  title: id,
  author: null,
  canonicalUrl: `https://example.com/${id}`,
  publishedAt: "2026-09-09T00:00:00.000Z",
  contentStatus: "ready" as const,
  source,
});

function createApp() {
  const database = createDatabase(":memory:");
  const pages: Record<string, ArticlePage> = {
    first: { items: [item("art_3"), item("art_2")], nextCursor: "opaque-page-2" },
    "opaque-page-2": { items: [item("art_1")], nextCursor: null },
  };
  const detail: ApiArticleDetail = {
    article: {
      id: "art_1",
      sourceId: "src_1",
      externalId: "one",
      canonicalUrl: "https://example.com/art_1",
      title: "art_1",
      author: null,
      coverUrl: null,
      publishedAt: null,
      fetchedAt: "2026-09-09T00:00:00.000Z",
      contentStatus: "ready",
      contentHash: "hash",
    },
    source,
    document: null,
    parse: { parser: "rss-content-parser", parserVersion: "1.0.0", confidence: 0.8 },
  };
  const app = buildApp({
    config: { feedServerToken: token },
    database,
    getWechatHealth: () => "disabled",
    articleService: {
      listArticles: async ({ cursor }) => pages[cursor ?? "first"]!,
      getArticle: async () => detail,
    },
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

describe("article routes and cursor", () => {
  it("returns contract-valid pages without documents and without page duplicates", async () => {
    const app = createApp();
    const headers = { authorization: `Bearer ${token}` };
    const first = await app.inject({ method: "GET", url: "/v1/articles?limit=2", headers });
    const second = await app.inject({
      method: "GET",
      url: `/v1/articles?limit=2&cursor=${first.json().nextCursor}`,
      headers,
    });
    expect(
      articlePageSchema.parse(first.json()).items.every((entry) => !("document" in entry)),
    ).toBe(true);
    expect(articlePageSchema.parse(second.json()).items.map((entry) => entry.id)).toEqual([
      "art_1",
    ]);
  });

  it("returns contract-valid detail with nullable document", async () => {
    const response = await createApp().inject({
      method: "GET",
      url: "/v1/articles/art_1",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(articleDetailSchema.parse(response.json()).document).toBeNull();
  });

  it("rejects a tampered signed cursor and binds it to a filter", () => {
    const cursors = new CursorService(token);
    const cursor = cursors.issue({
      publishedAtFallback: "2026-09-09T00:00:00.000Z",
      id: "art_1",
      sourceId: "src_1",
    });
    expect(cursors.verify(cursor, "src_1").id).toBe("art_1");
    expect(() => cursors.verify(`${cursor}x`, "src_1")).toThrow(CursorError);
    expect(() => cursors.verify(cursor, "src_2")).toThrow(CursorError);
  });
});
