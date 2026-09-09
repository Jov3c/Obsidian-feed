import { createHash } from "node:crypto";

import type { ArticleDocument } from "@obsidian-feed/content-model";

import type { ArticleRepository } from "../db/repositories/article-repository.js";
import { parseArticle, type ParseResult, type RawParseInput } from "../parsing/pipeline.js";
import type { ProviderArticle } from "../providers/types.js";

export interface IngestSource {
  id: string;
  name: string;
  sourceType?: "rss" | "wechat";
  type?: "rss" | "wechat";
}

export interface IngestOutcome {
  processed: number;
  added: number;
  updated: number;
  failed: number;
}

type ParseArticle = (input: RawParseInput) => Promise<ParseResult>;

function documentJson(document: ArticleDocument): { json: string; hash: string } {
  const json = JSON.stringify(document);
  return { json, hash: createHash("sha256").update(json).digest("hex") };
}

export class IngestService {
  private readonly articles: ArticleRepository;
  private readonly parse: ParseArticle;
  private readonly now: () => Date;

  constructor(input: {
    articles: ArticleRepository;
    parseArticle?: ParseArticle;
    now?: () => Date;
  }) {
    this.articles = input.articles;
    this.parse = input.parseArticle ?? parseArticle;
    this.now = input.now ?? (() => new Date());
  }

  async ingestProviderArticles(
    source: IngestSource,
    providerArticles: ProviderArticle[],
  ): Promise<IngestOutcome> {
    const outcome: IngestOutcome = { processed: 0, added: 0, updated: 0, failed: 0 };
    for (const providerArticle of providerArticles) {
      const existing = await this.articles.findByIdentity({
        sourceId: source.id,
        externalId: providerArticle.externalId,
        canonicalUrl: providerArticle.canonicalUrl,
      });
      const row = await this.articles.upsertMeta({
        sourceId: source.id,
        externalId: providerArticle.externalId,
        canonicalUrl: providerArticle.canonicalUrl,
        title: providerArticle.title,
        author: providerArticle.author,
        coverUrl: providerArticle.coverUrl,
        publishedAt: providerArticle.publishedAt,
        fetchedAt: this.now().toISOString(),
        contentStatus: "pending",
      });
      outcome.processed += 1;
      if (existing) outcome.updated += 1;
      else outcome.added += 1;

      if (!providerArticle.rawContent) continue;
      try {
        const sourceType = source.sourceType ?? source.type;
        if (!sourceType) throw new Error("Source type missing");
        const parsed = await this.parse({
          sourceType,
          html: providerArticle.rawContent,
          title: providerArticle.title,
          sourceName: source.name,
          canonicalUrl: providerArticle.canonicalUrl,
          ...(providerArticle.author ? { author: providerArticle.author } : {}),
          ...(providerArticle.publishedAt ? { publishedAt: providerArticle.publishedAt } : {}),
          contentType: providerArticle.rawContentType === "html" ? "text/html" : "application/xml",
        });
        if (!parsed.document) {
          outcome.failed += 1;
          await this.articles.setContent(row.id, {
            documentJson: null,
            contentHash: null,
            contentStatus: parsed.diagnostics.blocked === true ? "unavailable" : "failed",
            parser: parsed.parser,
            parserVersion: parsed.parserVersion,
            parseConfidence: parsed.confidence,
            parseDiagnostics: parsed.diagnostics,
          });
          continue;
        }
        const serialized = documentJson(parsed.document);
        if (row.contentHash === serialized.hash) continue;
        await this.articles.setContent(row.id, {
          documentJson: serialized.json,
          contentHash: serialized.hash,
          contentStatus: parsed.status,
          parser: parsed.parser,
          parserVersion: parsed.parserVersion,
          parseConfidence: parsed.confidence,
          parseDiagnostics: parsed.diagnostics,
        });
      } catch (error) {
        outcome.failed += 1;
        await this.articles.setContent(row.id, {
          documentJson: null,
          contentHash: null,
          contentStatus: "failed",
          parser: null,
          parserVersion: null,
          parseConfidence: null,
          parseDiagnostics: {
            reason: "ingest_error",
            message: error instanceof Error ? error.message : "Unknown ingestion error",
          },
        });
      }
    }
    return outcome;
  }
}
