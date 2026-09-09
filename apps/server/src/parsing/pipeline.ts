import {
  normalizeArticleDocument,
  type ArticleBlock,
  type ArticleDocument,
} from "@obsidian-feed/content-model";

import { parseDom } from "./dom.js";
import { parseGeneric } from "./generic/generic-parser.js";
import { parseRssContent } from "./rss/rss-content-parser.js";
import { parseWechat } from "./wechat/wechat-parser.js";

export interface RawParseInput {
  sourceType: "wechat" | "rss" | "generic";
  html: string;
  title: string;
  sourceName: string;
  canonicalUrl: string;
  author?: string | null;
  publishedAt?: string | null;
  language?: string | null;
  contentType?: string;
}

export interface ParseResult {
  document: ArticleDocument | null;
  status: "ready" | "partial" | "failed";
  parser: string;
  parserVersion: string;
  confidence: number;
  diagnostics: Record<string, unknown>;
}

export interface MediaRegistrar {
  registerRemote(url: string): Promise<{ id: string; src: string }>;
}

export interface ParseOptions {
  mediaRegistrar?: MediaRegistrar;
}

const parserVersion = "1.0.0";

function failed(parser: string, diagnostics: Record<string, unknown>): ParseResult {
  return { document: null, status: "failed", parser, parserVersion, confidence: 0, diagnostics };
}

function parserName(sourceType: RawParseInput["sourceType"]): string {
  if (sourceType === "wechat") return "wechat-parser";
  if (sourceType === "rss") return "rss-content-parser";
  return "generic-parser";
}

function blockedPage(html: string): boolean {
  const compact = html.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ");
  return /(?:验证码|captcha|安全验证|登录后继续|请先登录|访问过于频繁)/iu.test(compact);
}

async function registerMedia(
  document: ArticleDocument,
  registrar: MediaRegistrar | undefined,
): Promise<ArticleDocument> {
  if (!registrar) return document;
  const blocks = (
    await Promise.all(
      document.blocks.map(async (block): Promise<ArticleBlock | null> => {
        if (block.type !== "image") return block;
        const remoteUrl = block.originalSrc ?? block.src;
        try {
          const media = await registrar.registerRemote(remoteUrl);
          return { ...block, src: media.src, originalSrc: remoteUrl };
        } catch {
          return null;
        }
      }),
    )
  ).filter((block): block is ArticleBlock => block !== null);
  return normalizeArticleDocument({ ...document, blocks });
}

export async function parseArticle(
  input: RawParseInput,
  options: ParseOptions = {},
): Promise<ParseResult> {
  const parser = parserName(input.sourceType);
  if (input.contentType && !/(?:text\/html|application\/xhtml\+xml)/iu.test(input.contentType)) {
    return failed(parser, { reason: "unsupported_content_type" });
  }
  if (Buffer.byteLength(input.html, "utf8") > 5 * 1024 * 1024) {
    return failed(parser, { reason: "body_too_large" });
  }
  if (input.html.includes("\0")) return failed(parser, { reason: "nul_byte" });
  if (blockedPage(input.html)) return failed(parser, { blocked: true });

  const { root, nodeCount, maxDepth } = parseDom(input.html);
  if (nodeCount > 100_000) return failed(parser, { reason: "node_limit", nodeCount });
  if (maxDepth > 200) return failed(parser, { reason: "depth_limit", maxDepth });

  if (input.sourceType === "wechat") {
    const output = parseWechat(input, root);
    if (!output.document) return failed(parser, output.diagnostics);
    return {
      document: await registerMedia(output.document, options.mediaRegistrar),
      status: output.confidence >= 0.65 ? "ready" : "partial",
      parser,
      parserVersion,
      confidence: output.confidence,
      diagnostics: { ...output.diagnostics, nodeCount, maxDepth },
    };
  }

  const document =
    input.sourceType === "rss" ? parseRssContent(input, root) : parseGeneric(input, root);
  if (!document) return failed(parser, { reason: "empty_content", nodeCount, maxDepth });
  return {
    document: await registerMedia(document, options.mediaRegistrar),
    status: "ready",
    parser,
    parserVersion,
    confidence: input.sourceType === "rss" ? 0.85 : 0.7,
    diagnostics: { nodeCount, maxDepth },
  };
}
