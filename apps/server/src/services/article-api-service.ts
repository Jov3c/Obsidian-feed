import type { ApiArticleDetail, ArticlePage } from "@obsidian-feed/contracts";

import type { ArticleRepository } from "../db/repositories/article-repository.js";
import type { SourceRepository } from "../db/repositories/source-repository.js";
import { CursorService } from "../security/cursor.js";

export class ArticleApiService {
  constructor(
    private readonly articles: ArticleRepository,
    private readonly sources: SourceRepository,
    private readonly cursors: CursorService,
  ) {}

  async listArticles(input: {
    limit: number;
    cursor?: string;
    sourceId?: string;
  }): Promise<ArticlePage> {
    const before = input.cursor ? this.cursors.verify(input.cursor, input.sourceId) : undefined;
    const page = await this.articles.listPage({
      limit: input.limit + 1,
      ...(input.sourceId ? { sourceId: input.sourceId } : {}),
      ...(before ? { before } : {}),
    });
    const hasMore = page.items.length > input.limit;
    const rows = page.items.slice(0, input.limit);
    const items = await Promise.all(
      rows.map(async (article) => {
        const source = await this.sources.findById(article.sourceId);
        if (!source) throw new Error("Article source missing");
        return {
          id: article.id,
          title: article.title,
          author: article.author,
          canonicalUrl: article.canonicalUrl,
          publishedAt: article.publishedAt,
          contentStatus: article.contentStatus,
          source: {
            id: source.id,
            type: source.sourceType,
            name: source.name,
            avatarUrl: source.avatarUrl,
          },
        };
      }),
    );
    const last = rows.at(-1);
    const nextCursor =
      hasMore && last
        ? this.cursors.issue({
            publishedAtFallback: last.publishedAt ?? last.fetchedAt,
            id: last.id,
            ...(input.sourceId ? { sourceId: input.sourceId } : {}),
          })
        : null;
    return { items, nextCursor };
  }

  async getArticle(id: string): Promise<ApiArticleDetail | null> {
    const detail = await this.articles.getDetail(id);
    if (!detail) return null;
    const source = await this.sources.findById(detail.article.sourceId);
    if (!source) return null;
    return {
      article: {
        id: detail.article.id,
        sourceId: detail.article.sourceId,
        externalId: detail.article.externalId,
        canonicalUrl: detail.article.canonicalUrl,
        title: detail.article.title,
        author: detail.article.author,
        coverUrl: detail.article.coverUrl,
        publishedAt: detail.article.publishedAt,
        fetchedAt: detail.article.fetchedAt,
        contentStatus: detail.article.contentStatus,
        contentHash: detail.article.contentHash,
      },
      source: {
        id: source.id,
        type: source.sourceType,
        name: source.name,
        avatarUrl: source.avatarUrl,
      },
      document: detail.content?.documentJson
        ? (JSON.parse(detail.content.documentJson) as ApiArticleDetail["document"])
        : null,
      parse: {
        parser: detail.content?.parser ?? null,
        parserVersion: detail.content?.parserVersion ?? null,
        confidence: detail.content?.parseConfidence ?? null,
      },
    };
  }
}
