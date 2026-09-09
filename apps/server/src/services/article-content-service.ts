import type { ArticleDocument } from "@obsidian-feed/content-model";

import type { ArticleRepository } from "../db/repositories/article-repository.js";
import type { SourceRepository } from "../db/repositories/source-repository.js";
import type { ProviderRegistry } from "../providers/registry.js";
import { ProviderError, type ArticleMeta, type Source } from "../providers/types.js";
import { IngestService } from "./ingest-service.js";

export class ArticleContentService {
  constructor(
    private readonly articles: ArticleRepository,
    private readonly sources: SourceRepository,
    private readonly providers: ProviderRegistry,
    private readonly ingest: IngestService,
  ) {}

  async ensureArticleContent(articleId: string): Promise<ArticleDocument | null> {
    const existing = await this.articles.getDetail(articleId);
    if (!existing) return null;
    if (existing.content?.documentJson) {
      return JSON.parse(existing.content.documentJson) as ArticleDocument;
    }
    if (existing.article.contentStatus !== "pending") return null;
    const sourceRow = await this.sources.findById(existing.article.sourceId);
    if (!sourceRow) return null;
    const source: Source = {
      id: sourceRow.id,
      type: sourceRow.sourceType,
      name: sourceRow.name,
      canonicalUrl: sourceRow.canonicalUrl,
      avatarUrl: sourceRow.avatarUrl,
      externalId: sourceRow.externalId,
      providerKey: sourceRow.providerKey,
      providerMeta: JSON.parse(sourceRow.providerMetaJson) as Record<string, unknown>,
      status: sourceRow.status,
      lastSyncedAt: sourceRow.lastSyncedAt,
      nextSyncAt: sourceRow.nextSyncAt,
    };
    const article: ArticleMeta = {
      id: existing.article.id,
      sourceId: existing.article.sourceId,
      externalId: existing.article.externalId,
      canonicalUrl: existing.article.canonicalUrl,
      title: existing.article.title,
      author: existing.article.author,
      coverUrl: existing.article.coverUrl,
      publishedAt: existing.article.publishedAt,
      fetchedAt: existing.article.fetchedAt,
      contentStatus: existing.article.contentStatus,
      contentHash: existing.article.contentHash,
    };
    try {
      const fetched = await this.providers.getByKey(source.providerKey).fetchArticle(article);
      await this.ingest.ingestProviderArticles(source, [fetched]);
    } catch (error) {
      const blocked =
        error instanceof ProviderError &&
        (error.code === "CONTENT_BLOCKED" || error.code === "CONTENT_UNAVAILABLE");
      await this.articles.setContent(articleId, {
        documentJson: null,
        contentHash: null,
        contentStatus: blocked ? "unavailable" : "failed",
        parser: null,
        parserVersion: null,
        parseConfidence: null,
        parseDiagnostics: {
          reason: "content_fetch_error",
          ...(error instanceof ProviderError ? { errorCode: error.code } : {}),
        },
      });
      return null;
    }
    const updated = await this.articles.getDetail(articleId);
    return updated?.content?.documentJson
      ? (JSON.parse(updated.content.documentJson) as ArticleDocument)
      : null;
  }
}
