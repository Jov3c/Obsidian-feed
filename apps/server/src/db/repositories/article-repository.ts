import { and, desc, eq, sql } from "drizzle-orm";

import { newId, type Database } from "../client.js";
import { articleContents, articles } from "../schema.js";

export type ArticleRow = typeof articles.$inferSelect;
export type ArticleContentRow = typeof articleContents.$inferSelect;

export interface UpsertArticleMetaInput {
  sourceId: string;
  externalId: string | null;
  canonicalUrl: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  contentStatus: ArticleRow["contentStatus"];
}

export interface SetArticleContentInput {
  documentJson: string | null;
  contentHash: string | null;
  contentStatus: ArticleRow["contentStatus"];
  parser: string | null;
  parserVersion: string | null;
  parseConfidence: number | null;
  parseDiagnostics: Record<string, unknown>;
  rawSnapshotPath?: string | null;
}

export class ArticleRepository {
  constructor(
    private readonly database: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async findByIdentity(input: {
    sourceId: string;
    externalId: string | null;
    canonicalUrl: string;
  }): Promise<ArticleRow | undefined> {
    const byExternal = input.externalId
      ? this.database.orm
          .select()
          .from(articles)
          .where(
            and(eq(articles.sourceId, input.sourceId), eq(articles.externalId, input.externalId)),
          )
          .get()
      : undefined;
    return (
      byExternal ??
      this.database.orm
        .select()
        .from(articles)
        .where(
          and(eq(articles.sourceId, input.sourceId), eq(articles.canonicalUrl, input.canonicalUrl)),
        )
        .get()
    );
  }

  async upsertMeta(input: UpsertArticleMetaInput): Promise<ArticleRow> {
    const existing = await this.findByIdentity(input);
    const timestamp = this.now().toISOString();

    if (existing) {
      return this.database.orm
        .update(articles)
        .set({
          externalId: input.externalId,
          canonicalUrl: input.canonicalUrl,
          title: input.title,
          author: input.author,
          coverUrl: input.coverUrl,
          publishedAt: input.publishedAt,
          fetchedAt: input.fetchedAt,
          updatedAt: timestamp,
        })
        .where(eq(articles.id, existing.id))
        .returning()
        .get();
    }

    return this.database.orm
      .insert(articles)
      .values({
        id: newId("art"),
        ...input,
        contentHash: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning()
      .get();
  }

  async setContent(articleId: string, input: SetArticleContentInput): Promise<void> {
    const timestamp = this.now().toISOString();
    this.database.orm.transaction((transaction) => {
      transaction
        .insert(articleContents)
        .values({
          articleId,
          documentJson: input.documentJson,
          rawSnapshotPath: input.rawSnapshotPath ?? null,
          parser: input.parser,
          parserVersion: input.parserVersion,
          parseConfidence: input.parseConfidence,
          parseDiagnosticsJson: JSON.stringify(input.parseDiagnostics),
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: articleContents.articleId,
          set: {
            documentJson: input.documentJson,
            rawSnapshotPath: input.rawSnapshotPath ?? null,
            parser: input.parser,
            parserVersion: input.parserVersion,
            parseConfidence: input.parseConfidence,
            parseDiagnosticsJson: JSON.stringify(input.parseDiagnostics),
            updatedAt: timestamp,
          },
        })
        .run();
      transaction
        .update(articles)
        .set({
          contentHash: input.contentHash,
          contentStatus: input.contentStatus,
          updatedAt: timestamp,
        })
        .where(eq(articles.id, articleId))
        .run();
    });
  }

  async getDetail(
    articleId: string,
  ): Promise<{ article: ArticleRow; content: ArticleContentRow | null } | undefined> {
    const row = this.database.orm
      .select({ article: articles, content: articleContents })
      .from(articles)
      .leftJoin(articleContents, eq(articleContents.articleId, articles.id))
      .where(eq(articles.id, articleId))
      .get();
    return row ? { article: row.article, content: row.content } : undefined;
  }

  async listPage(input: {
    limit: number;
    sourceId?: string;
    before?: { publishedAtFallback: string; id: string };
  }): Promise<{ items: ArticleRow[]; nextCursor: null }> {
    const dateOrder = sql`coalesce(${articles.publishedAt}, ${articles.fetchedAt})`;
    const conditions = [
      ...(input.sourceId ? [eq(articles.sourceId, input.sourceId)] : []),
      ...(input.before
        ? [
            sql`(${dateOrder} < ${input.before.publishedAtFallback} OR (${dateOrder} = ${input.before.publishedAtFallback} AND ${articles.id} < ${input.before.id}))`,
          ]
        : []),
    ];
    const query = this.database.orm
      .select()
      .from(articles)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(dateOrder), desc(articles.id))
      .limit(input.limit);
    return { items: query.all(), nextCursor: null };
  }
}
