import { describe, expect, it } from "vitest";

import { articleDocumentSchema } from "../src/index.js";

const validDocument = {
  version: 1,
  title: "A safe article",
  sourceName: "Example Feed",
  canonicalUrl: "https://example.com/articles/1",
  blocks: [
    {
      id: "b_1",
      type: "paragraph",
      children: [{ type: "text", text: "Hello" }],
    },
  ],
} as const;

describe("articleDocumentSchema", () => {
  it("accepts a valid version 1 document", () => {
    expect(articleDocumentSchema.parse(validDocument)).toEqual(validDocument);
  });

  it("rejects arbitrary HTML blocks", () => {
    expect(() =>
      articleDocumentSchema.parse({
        ...validDocument,
        blocks: [{ id: "b_1", type: "html", html: "<script>alert(1)</script>" }],
      }),
    ).toThrow();
  });

  it("rejects executable inline link schemes", () => {
    expect(() =>
      articleDocumentSchema.parse({
        ...validDocument,
        blocks: [
          {
            id: "b_1",
            type: "paragraph",
            children: [{ type: "text", text: "click", href: "javascript:alert(1)" }],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects undeclared properties", () => {
    expect(() =>
      articleDocumentSchema.parse({ ...validDocument, rawHtml: "<p>unsafe</p>" }),
    ).toThrow();
  });
});
