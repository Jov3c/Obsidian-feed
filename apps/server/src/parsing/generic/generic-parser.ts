import { normalizeArticleDocument, type ArticleDocument } from "@obsidian-feed/content-model";

import type { DomNode } from "../dom.js";
import { extractBlocks } from "../normalize.js";
import type { RawParseInput } from "../pipeline.js";
import { selectGenericCandidate } from "../wechat/candidates.js";

export function parseGeneric(input: RawParseInput, root: DomNode): ArticleDocument | null {
  const candidate = selectGenericCandidate(root);
  if (!candidate) return null;
  const blocks = extractBlocks(candidate.element, input.canonicalUrl);
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
