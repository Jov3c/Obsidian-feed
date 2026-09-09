import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const sourceTypes = ["rss", "wechat"] as const;
export const sourceStatuses = [
  "active",
  "rate_limited",
  "needs_auth",
  "parse_error",
  "unavailable",
  "disabled",
] as const;
export const contentStatuses = ["pending", "ready", "partial", "unavailable", "failed"] as const;

export const sources = sqliteTable(
  "sources",
  {
    id: text("id").primaryKey(),
    sourceType: text("source_type", { enum: sourceTypes }).notNull(),
    name: text("name").notNull(),
    canonicalUrl: text("canonical_url"),
    avatarUrl: text("avatar_url"),
    externalId: text("external_id"),
    providerKey: text("provider_key").notNull(),
    providerMetaJson: text("provider_meta_json").notNull().default("{}"),
    status: text("status", { enum: sourceStatuses }).notNull(),
    lastSyncedAt: text("last_synced_at"),
    nextSyncAt: text("next_sync_at"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_sources_provider_external")
      .on(table.providerKey, table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),
    index("ix_sources_next_sync").on(table.nextSyncAt),
    index("ix_sources_status").on(table.status),
    check("ck_sources_failures", sql`${table.consecutiveFailures} >= 0`),
  ],
);

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .unique()
      .references(() => sources.id, { onDelete: "restrict" }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [check("ck_subscriptions_enabled", sql`${table.enabled} IN (0, 1)`)],
);

export const articles = sqliteTable(
  "articles",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    externalId: text("external_id"),
    canonicalUrl: text("canonical_url").notNull(),
    title: text("title").notNull(),
    author: text("author"),
    coverUrl: text("cover_url"),
    publishedAt: text("published_at"),
    fetchedAt: text("fetched_at").notNull(),
    contentHash: text("content_hash"),
    contentStatus: text("content_status", { enum: contentStatuses }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_articles_source_external")
      .on(table.sourceId, table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),
    uniqueIndex("ux_articles_source_url").on(table.sourceId, table.canonicalUrl),
    index("ix_articles_published").on(table.publishedAt, table.id),
    index("ix_articles_source_published").on(table.sourceId, table.publishedAt),
    index("ix_articles_content_status").on(table.contentStatus),
  ],
);

export const articleContents = sqliteTable(
  "article_contents",
  {
    articleId: text("article_id")
      .primaryKey()
      .references(() => articles.id, { onDelete: "cascade" }),
    documentJson: text("document_json"),
    rawSnapshotPath: text("raw_snapshot_path"),
    parser: text("parser"),
    parserVersion: text("parser_version"),
    parseConfidence: real("parse_confidence"),
    parseDiagnosticsJson: text("parse_diagnostics_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "ck_article_contents_confidence",
      sql`${table.parseConfidence} IS NULL OR (${table.parseConfidence} >= 0 AND ${table.parseConfidence} <= 1)`,
    ),
  ],
);

export const syncLogs = sqliteTable(
  "sync_logs",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").references(() => sources.id, { onDelete: "set null" }),
    providerKey: text("provider_key").notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    status: text("status", { enum: ["running", "success", "failed"] }).notNull(),
    newArticles: integer("new_articles").notNull().default(0),
    updatedArticles: integer("updated_articles").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("ix_sync_logs_source_started").on(table.sourceId, table.startedAt),
    index("ix_sync_logs_created").on(table.createdAt),
  ],
);

export const mediaCache = sqliteTable(
  "media_cache",
  {
    id: text("id").primaryKey(),
    originalUrl: text("original_url").notNull().unique(),
    localPath: text("local_path"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    sha256: text("sha256"),
    etag: text("etag"),
    lastModified: text("last_modified"),
    status: text("status", { enum: ["pending", "ready", "failed"] }).notNull(),
    lastAccessedAt: text("last_accessed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("ix_media_lru").on(table.lastAccessedAt),
    index("ix_media_status").on(table.status),
  ],
);
