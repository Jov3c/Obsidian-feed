export interface ResolveInput {
  rawInput: string;
}

export interface ResolvedSource {
  type: "rss" | "wechat";
  providerKey: string;
  externalId: string | null;
  name: string;
  canonicalUrl: string | null;
  avatarUrl: string | null;
  providerMeta: Record<string, unknown>;
}

export interface ProviderArticle {
  externalId: string | null;
  canonicalUrl: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  publishedAt: string | null;
  rawContent?: string | null;
  rawContentType?: "html" | "xml" | "text";
}

export interface SyncPage {
  articles: ProviderArticle[];
  cursor?: string;
  hasMore: boolean;
}

export interface Source {
  id: string;
  type: "rss" | "wechat";
  name: string;
  canonicalUrl: string | null;
  avatarUrl: string | null;
  externalId: string | null;
  providerKey: string;
  providerMeta?: Record<string, unknown>;
  status: "active" | "rate_limited" | "needs_auth" | "parse_error" | "unavailable" | "disabled";
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
}

export interface ArticleMeta {
  id: string;
  sourceId: string;
  externalId: string | null;
  canonicalUrl: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  contentStatus: "pending" | "ready" | "partial" | "unavailable" | "failed";
  contentHash: string | null;
}

export interface ContentProvider {
  readonly key: string;
  canHandle(input: ResolveInput): Promise<boolean>;
  resolveSource(input: ResolveInput): Promise<ResolvedSource>;
  ensureSubscribed(source: ResolvedSource): Promise<void>;
  syncSource(source: Source, cursor?: string): Promise<SyncPage>;
  fetchArticle(article: ArticleMeta): Promise<ProviderArticle>;
}

export type ProviderErrorCode =
  | "UNSUPPORTED_SOURCE"
  | "INVALID_URL"
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_AUTH_REQUIRED"
  | "UPSTREAM_RATE_LIMITED"
  | "SOURCE_NOT_FOUND"
  | "CONTENT_UNAVAILABLE"
  | "CONTENT_BLOCKED"
  | "PARSE_FAILED"
  | "TIMEOUT";

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly providerKey: string,
    readonly retryAfterSeconds?: number,
    readonly causeForLogOnly?: unknown,
  ) {
    super(message, causeForLogOnly === undefined ? undefined : { cause: causeForLogOnly });
    this.name = "ProviderError";
  }
}
