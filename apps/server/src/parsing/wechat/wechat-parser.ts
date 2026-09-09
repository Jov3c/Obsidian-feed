import { normalizeArticleDocument, type ArticleDocument } from "@obsidian-feed/content-model";

import type { DomNode } from "../dom.js";
import { extractBlocks } from "../normalize.js";
import type { RawParseInput } from "../pipeline.js";
import { selectWechatCandidate } from "./candidates.js";
import { removeTailNoise } from "./noise.js";

export interface ParserOutput {
  document: ArticleDocument | null;
  confidence: number;
  diagnostics: Record<string, unknown>;
}

function makeDocument(input: RawParseInput, blocks: ArticleDocument["blocks"]): ArticleDocument {
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

export function parseWechat(input: RawParseInput, root: DomNode): ParserOutput {
  const candidate = selectWechatCandidate(root);
  if (!candidate) return { document: null, confidence: 0, diagnostics: { reason: "no_candidate" } };

  const extracted = extractBlocks(candidate.element, input.canonicalUrl);
  const blocks = removeTailNoise(extracted);
  if (blocks.length === 0) {
    return { document: null, confidence: 0, diagnostics: { reason: "empty_content" } };
  }

  const confidence = candidate.features.knownWechatRoot
    ? candidate.features.textLength >= 80 || candidate.features.imageCount >= 2
      ? 0.9
      : 0.55
    : candidate.score >= 60
      ? 0.72
      : 0.5;

  return {
    document: makeDocument(input, blocks),
    confidence,
    diagnostics: {
      candidateScore: candidate.score,
      knownWechatRoot: candidate.features.knownWechatRoot,
      extractedBlockCount: blocks.length,
    },
  };
}
