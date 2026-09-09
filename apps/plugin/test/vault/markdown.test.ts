import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ArticleDocument } from "@obsidian-feed/content-model/types";
import { describe, expect, it } from "vitest";

import { articleDocumentToMarkdown } from "../../src/vault/markdown.js";
import { sanitizePathSegment } from "../../src/vault/path.js";

const fixture = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/markdown/article.md");
const documentValue: ArticleDocument = {
  version: 1,
  title: "Markdown",
  sourceName: "Source",
  canonicalUrl: "https://example.com/article",
  blocks: [
    {
      id: "p",
      type: "paragraph",
      children: [
        { type: "text", text: "Bold", marks: ["bold"] },
        { type: "text", text: " link", href: "https://example.com" },
      ],
    },
    {
      id: "q",
      type: "blockquote",
      blocks: [{ id: "qp", type: "paragraph", children: [{ type: "text", text: "Quote" }] }],
    },
    {
      id: "l",
      type: "list",
      ordered: false,
      items: [
        {
          children: [{ type: "text", text: "Parent" }],
          nested: {
            id: "n",
            type: "list",
            ordered: true,
            items: [{ children: [{ type: "text", text: "Child" }] }],
          },
        },
      ],
    },
    { id: "c", type: "code", code: "const fence = ```;", language: "ts" },
    {
      id: "t",
      type: "table",
      headers: [[{ type: "text", text: "Name" }]],
      rows: [[[{ type: "text", text: "Value" }]]],
    },
    { id: "i", type: "image", src: "/v1/media/med_1", alt: "Image" },
  ],
};

describe("Markdown conversion", () => {
  it("matches the semantic golden file", () => {
    expect(
      articleDocumentToMarkdown(documentValue, {
        imageUrl: (block) => `https://feed.example${block.src}`,
      }),
    ).toBe(readFileSync(fixture, "utf8").replaceAll("\r\n", "\n"));
  });

  it("sanitizes forbidden characters, traversal, trailing dots, and length", () => {
    expect(sanitizePathSegment('../bad\\name:*?"<>|. ')).toBe("bad name");
    expect([...sanitizePathSegment("字".repeat(130))]).toHaveLength(120);
  });
});
