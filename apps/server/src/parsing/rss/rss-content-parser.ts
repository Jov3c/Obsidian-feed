import { normalizeArticleDocument, type ArticleDocument } from "@obsidian-feed/content-model";

import { descendants, isElement, type DomNode } from "../dom.js";
import { extractBlocks } from "../normalize.js";
import type { RawParseInput } from "../pipeline.js";

export function parseRssContent(input: RawParseInput, root: DomNode): ArticleDocument | null {
  const container = descendants(root).find(
    (node) => isElement(node) && (node.tagName === "article" || node.tagName === "main"),
  );
  const element = container && isElement(container) ? container : descendants(root).find(isElement);
  if (!element) return null;
  const blocks = extractBlocks(element, input.canonicalUrl);
  if (blocks.length === 0) return null;
  return normalizeArticleDocument({
    version: 1,
    title: input.title,
    sourceName: input.sourceName,
    canonicalUrl: input.canonicalUrl,
    blocks,
    ...(input.author ? { author: input.author } : {}),
    ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
    ...(input.language ? { language: input.language } : {}),
  });
}
