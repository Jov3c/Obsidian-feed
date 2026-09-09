import type { ArticleDocument } from "@obsidian-feed/content-model";

import type { ArticleRepository } from "../db/repositories/article-repository.js";
import type { SourceRepository } from "../db/repositories/source-repository.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { ArticleMeta, Source } from "../providers/types.js";
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
    const fetched = await this.providers.getByKey(source.providerKey).fetchArticle(article);
    await this.ingest.ingestProviderArticles(source, [fetched]);
    const updated = await this.articles.getDetail(articleId);
    return updated?.content?.documentJson
      ? (JSON.parse(updated.content.documentJson) as ArticleDocument)
      : null;
  }
}
