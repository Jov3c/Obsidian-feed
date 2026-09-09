import type { ApiArticleDetail } from "@obsidian-feed/contracts";
import { describe, expect, it, vi } from "vitest";

import { VaultMediaDownloader } from "../../src/vault/media-downloader.js";

const detail = {
  article: {
    id: "art_1",
    sourceId: "src_1",
    externalId: "one",
    canonicalUrl: "https://example.com/article",
    title: "Article",
    author: null,
    coverUrl: null,
    publishedAt: null,
    fetchedAt: "2026-09-09T01:00:00.000Z",
    contentStatus: "ready",
    contentHash: "hash",
  },
  source: { id: "src_1", type: "rss", name: "Source", avatarUrl: null },
  document: {
    version: 1 as const,
    title: "Article",
    sourceName: "Source",
    canonicalUrl: "https://example.com/article",
    blocks: [
      { id: "i1", type: "image" as const, src: "/v1/media/med_one", alt: "One" },
      { id: "i2", type: "image" as const, src: "/v1/media/med_two" },
    ],
  },
  parse: { parser: "rss", parserVersion: "1", confidence: 1 },
} satisfies ApiArticleDetail;

describe("VaultMediaDownloader", () => {
  it("downloads authenticated server media using MIME-derived deterministic names", async () => {
    const files = new Map<string, ArrayBuffer>();
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        arrayBuffer: new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
        headers: { "content-type": "image/png" },
      })
      .mockResolvedValueOnce({
        status: 200,
        arrayBuffer: new Uint8Array([0xff, 0xd8, 0xff]).buffer,
        headers: { "Content-Type": "image/jpeg" },
      });
    const downloader = new VaultMediaDownloader(
      {
        exists: async (path) => files.has(path),
        createBinary: async (path, value) => void files.set(path, value),
      },
      { baseUrl: "https://feed.test/", token: "secret", request },
    );

    const localized = await downloader.localizeArticleImages(detail, "Feed/RSS/Source/Article.md");

    expect([...files.keys()]).toEqual([
      expect.stringMatching(/^Feed\/_attachments\/art_1\/001-[a-f0-9]{8}\.png$/u),
      expect.stringMatching(/^Feed\/_attachments\/art_1\/002-[a-f0-9]{8}\.jpg$/u),
    ]);
    expect(request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        url: "https://feed.test/v1/media/med_one",
        headers: { Authorization: "Bearer secret" },
      }),
    );
    expect(localized.blocks[0]).toMatchObject({
      type: "image",
      src: expect.stringMatching(/^!\[\[Feed\/_attachments\/art_1\/001-.*\.png\]\]$/u),
    });
    expect((localized.blocks[1] as { src: string }).src).toMatch(
      /^!\[\[Feed\/_attachments\/art_1\/002-.*\.jpg\]\]$/u,
    );
  });

  it("keeps the server URL when MIME, size, origin, or download is unsafe", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        arrayBuffer: new Uint8Array(5).buffer,
        headers: { "content-type": "image/svg+xml" },
      })
      .mockRejectedValueOnce(new Error("offline"));
    const downloader = new VaultMediaDownloader(
      { exists: async () => false, createBinary: vi.fn() },
      { baseUrl: "https://feed.test", token: "secret", maxImageBytes: 4, request },
    );

    const localized = await downloader.localizeArticleImages(detail, "Feed/RSS/Source/Article.md");

    expect(localized.blocks[0]).toMatchObject({ src: "/v1/media/med_one" });
    expect((localized.blocks[1] as { src: string }).src).toBe("/v1/media/med_two");
  });
});
