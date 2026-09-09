import { describe, expect, it } from "vitest";

import { hashArticleDocument, normalizeArticleDocument } from "../src/index.js";

describe("normalizeArticleDocument", () => {
  it("removes empty paragraphs and merges adjacent equal text marks", () => {
    const normalized = normalizeArticleDocument({
      version: 1,
      title: "Normalization",
      sourceName: "Example",
      canonicalUrl: "https://example.com/post",
      blocks: [
        { id: "old-empty", type: "paragraph", children: [{ type: "text", text: "   " }] },
        {
          id: "old-content",
          type: "paragraph",
          children: [
            { type: "text", text: " first ", marks: ["bold"] },
            { type: "text", text: "second ", marks: ["bold"] },
          ],
        },
      ],
    });

    expect(normalized.blocks).toEqual([
      {
        id: expect.stringMatching(/^blk_[a-f0-9]{16}$/),
        type: "paragraph",
        children: [{ type: "text", text: "first second", marks: ["bold"] }],
      },
    ]);
  });

  it("generates stable block ids from canonical content", () => {
    const input = {
      version: 1 as const,
      title: "Stable",
      sourceName: "Example",
      canonicalUrl: "https://example.com/stable",
      blocks: [
        {
          id: "temporary-a",
          type: "paragraph" as const,
          children: [{ type: "text" as const, text: "Same" }],
        },
      ],
    };

    const first = normalizeArticleDocument(input);
    const second = normalizeArticleDocument({
      ...input,
      blocks: [{ ...input.blocks[0], id: "temporary-b" }],
    });

    expect(second.blocks[0]?.id).toBe(first.blocks[0]?.id);
  });
});

describe("hashArticleDocument", () => {
  it("is deterministic and changes when business content changes", () => {
    const base = normalizeArticleDocument({
      version: 1,
      title: "Hash",
      sourceName: "Example",
      canonicalUrl: "https://example.com/hash",
      blocks: [{ id: "temporary", type: "paragraph", children: [{ type: "text", text: "one" }] }],
    });
    const changed = normalizeArticleDocument({
      ...base,
      blocks: [{ id: "temporary", type: "paragraph", children: [{ type: "text", text: "two" }] }],
    });

    expect(hashArticleDocument(base)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashArticleDocument(base)).toBe(hashArticleDocument(structuredClone(base)));
    expect(hashArticleDocument(changed)).not.toBe(hashArticleDocument(base));
  });
});
