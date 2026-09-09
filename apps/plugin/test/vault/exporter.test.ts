import type { ApiArticleDetail } from "@obsidian-feed/contracts";
import { describe, expect, it } from "vitest";

import { ArticleExporter, type VaultAdapter } from "../../src/vault/exporter.js";

const detail = {
  article: {
    id: "art_1",
    sourceId: "src_1",
    externalId: "one",
    canonicalUrl: "https://example.com/article",
    title: "Title: quoted",
    author: "A",
    coverUrl: null,
    publishedAt: "2026-09-09T00:00:00.000Z",
    fetchedAt: "2026-09-09T01:00:00.000Z",
    contentStatus: "ready",
    contentHash: "hash",
  },
  source: { id: "src_1", type: "rss", name: "Source", avatarUrl: null },
  document: {
    version: 1 as const,
    title: "Title: quoted",
    sourceName: "Source",
    canonicalUrl: "https://example.com/article",
    blocks: [
      {
        id: "p",
        type: "paragraph" as const,
        children: [{ type: "text" as const, text: "New body" }],
      },
    ],
  },
  parse: { parser: "rss", parserVersion: "1", confidence: 1 },
} satisfies ApiArticleDetail;

function memoryVault(
  initial: Record<string, string> = {},
): VaultAdapter & { files: Record<string, string> } {
  const files = { ...initial };
  return {
    files,
    exists: async (path) => path in files,
    read: async (path) => files[path]!,
    create: async (path, content) => {
      files[path] = content;
      return { path };
    },
    modify: async (path, content) => {
      files[path] = content;
      return { path };
    },
    findByArticleId: async (id) =>
      Object.keys(files).find((path) =>
        files[path]?.includes(`obsidian_feed_article_id: ${JSON.stringify(id)}`),
      ) ?? null,
  };
}

describe("ArticleExporter", () => {
  it("preserves user note and excerpt regions byte-for-byte on re-save", async () => {
    const vault = memoryVault();
    const exporter = new ArticleExporter(vault, {
      saveRoot: "Feed",
      now: () => new Date("2026-09-09T12:00:00+08:00"),
    });
    const file = await exporter.save(detail);
    vault.files[file.path] = vault.files[file.path]!.replace(
      "## 我的笔记\n\n",
      "## 我的笔记\n\n我的原始笔记  \n\n",
    )
      .replace("## 我的摘录\n\n", "## 我的摘录\n\n> 原始摘录\n\n")
      .replace("New body", "Old body");
    await exporter.save(detail);
    expect(vault.files[file.path]).toContain("我的原始笔记  \n");
    expect(vault.files[file.path]).toContain("> 原始摘录\n");
    expect(vault.files[file.path]).toContain("New body");
    expect(vault.files[file.path]).not.toContain("Old body");
  });

  it("creates an updated copy instead of overwriting an ambiguous identified note", async () => {
    const vault = memoryVault({
      "Feed/RSS/Source/Title quoted.md":
        '---\nobsidian_feed_article_id: "art_1"\n---\nuser content',
    });
    const exporter = new ArticleExporter(vault, {
      saveRoot: "Feed",
      now: () => new Date("2026-09-09T12:00:00+08:00"),
    });
    const file = await exporter.save(detail);
    expect(file.path).toContain("-updated");
    expect(vault.files["Feed/RSS/Source/Title quoted.md"]).toContain("user content");
  });
});
