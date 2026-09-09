// @vitest-environment jsdom

import type { ApiArticleDetail, ApiArticleListItem } from "@obsidian-feed/contracts";
import { describe, expect, it, vi } from "vitest";

import { ArticleRenderer } from "../../src/reader/renderer.js";
import { captureScrollPosition } from "../../src/reader/scroll-state.js";
import { shouldMarkRead, ReadingStateStore } from "../../src/state/reading-state.js";
import { ArticleExporter, type VaultAdapter } from "../../src/vault/exporter.js";
import { renderToday } from "../../src/views/today-view.js";

const listItem: ApiArticleListItem = {
  id: "art_e2e",
  title: "End-to-end article",
  author: "Author",
  canonicalUrl: "https://example.com/article",
  publishedAt: "2026-09-09T00:00:00.000Z",
  contentStatus: "ready",
  source: { id: "src_e2e", type: "rss", name: "Fixture Feed", avatarUrl: null },
};

const detail: ApiArticleDetail = {
  article: {
    ...listItem,
    sourceId: "src_e2e",
    externalId: "entry-e2e",
    coverUrl: null,
    fetchedAt: "2026-09-09T00:01:00.000Z",
    contentHash: "hash",
  },
  source: listItem.source,
  document: {
    version: 1,
    title: listItem.title,
    sourceName: listItem.source.name,
    canonicalUrl: listItem.canonicalUrl,
    blocks: [
      {
        id: "p1",
        type: "paragraph",
        children: [
          { type: "text", text: "Safe body " },
          { type: "text", text: "unsafe link", href: "javascript:alert(1)" },
          { type: "text", text: " <script>not markup</script>" },
        ],
      },
    ],
  },
  parse: { parser: "rss", parserVersion: "1", confidence: 1 },
};

function memoryVault(): VaultAdapter & { files: Record<string, string> } {
  const files: Record<string, string> = {};
  return {
    files,
    exists: async (path) => path in files,
    read: async (path) => files[path]!,
    create: async (path, content) => ((files[path] = content), { path }),
    modify: async (path, content) => ((files[path] = content), { path }),
    findByArticleId: async () => null,
  };
}

describe("plugin reader end-to-end flow", () => {
  it("opens Today metadata, renders safely, records progress and exports Markdown", async () => {
    const root = document.createElement("div");
    const opened = vi.fn();
    renderToday(
      root,
      { items: [listItem], nextCursor: null, loading: false, loadingMore: false, error: null },
      { reading: {}, onOpen: opened, onLoadMore: vi.fn() },
    );
    root.querySelector<HTMLElement>(".of-article-row")!.click();
    expect(opened).toHaveBeenCalledWith("art_e2e");

    const api = { getArticle: vi.fn().mockResolvedValue(detail) };
    const loaded = await api.getArticle("art_e2e");
    const content = document.createElement("div");
    new ArticleRenderer().renderDocument(content, loaded.document!, {
      mediaLoader: { load: async () => "blob:test", dispose: vi.fn() },
      onImageOpen: vi.fn(),
    });
    expect(content.textContent).toContain("Safe body unsafe link <script>not markup</script>");
    expect(content.querySelector("script")).toBeNull();
    expect(content.querySelector('a[href^="javascript:"]')).toBeNull();

    Object.defineProperties(content, {
      scrollHeight: { value: 1_000 },
      clientHeight: { value: 100 },
      scrollTop: { value: 800, writable: true },
    });
    const position = captureScrollPosition(content);
    const data = { reading: {} };
    const persist = vi.fn();
    const reading = new ReadingStateStore(data, persist, 1);
    reading.update("art_e2e", {
      ...position,
      read: shouldMarkRead(position.progress, 1_000),
    });
    await reading.flush();
    expect(data.reading).toMatchObject({ art_e2e: { read: true } });
    expect(persist).toHaveBeenCalledOnce();

    const vault = memoryVault();
    const file = await new ArticleExporter(vault, { saveRoot: "Feed" }).save(detail);
    expect(vault.files[file.path]).toContain("Safe body unsafe link");
    expect(vault.files[file.path]).not.toContain("javascript:");
    expect(vault.files[file.path]).toContain("## 我的笔记");
  });
});
