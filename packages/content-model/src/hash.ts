import { createHash } from "node:crypto";

import { articleDocumentSchema } from "./schema.js";
import type { ArticleDocument } from "./article-document.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }

  return value;
}

export function canonicalArticleDocumentJson(document: ArticleDocument): string {
  return JSON.stringify(canonicalize(articleDocumentSchema.parse(document)));
}

export function hashArticleDocument(document: ArticleDocument): string {
  return createHash("sha256").update(canonicalArticleDocumentJson(document)).digest("hex");
}

export function createStableBlockId(
  canonicalUrl: string,
  blockPath: string,
  blockContent: unknown,
): string {
  const hash = createHash("sha256")
    .update(canonicalUrl)
    .update("\0")
    .update(blockPath)
    .update("\0")
    .update(JSON.stringify(canonicalize(blockContent)))
    .digest("hex")
    .slice(0, 16);

  return `blk_${hash}`;
}
