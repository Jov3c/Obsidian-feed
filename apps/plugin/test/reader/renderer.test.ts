// @vitest-environment jsdom

import type { ArticleDocument } from "@obsidian-feed/content-model/types";
import { describe, expect, it, vi } from "vitest";

import { ArticleRenderer } from "../../src/reader/renderer.js";

describe("ArticleRenderer", () => {
  it("renders semantic blocks as safe DOM with stable block ids", () => {
    const documentValue: ArticleDocument = {
      version: 1,
      title: "Safe",
      sourceName: "Source",
      canonicalUrl: "https://example.com/article",
      blocks: [
        {
          id: "b1",
          type: "paragraph",
          children: [
            { type: "text", text: "<script>alert(1)</script>" },
            { type: "text", text: "bad", href: "javascript:alert(1)" },
          ],
        },
        { id: "b2", type: "code", code: "<img onerror=alert(1)>", language: "html" },
      ],
    };
    const container = document.createElement("div");
    new ArticleRenderer().renderDocument(container, documentValue, {
      mediaLoader: { load: vi.fn(), dispose: vi.fn() },
      onImageOpen: vi.fn(),
    });
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.querySelector('[data-block-id="b2"]')?.textContent).toContain(
      "<img onerror=alert(1)>",
    );
  });
});
