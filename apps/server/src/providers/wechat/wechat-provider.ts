import {
  ProviderError,
  type ArticleMeta,
  type ContentProvider,
  type ProviderArticle,
  type ResolvedSource,
  type ResolveInput,
  type Source,
  type SyncPage,
} from "../types.js";
import type { ProviderRegistry } from "../registry.js";
import { SafeExternalHttpClient } from "../../http/safe-http-client.js";
import type {
  WeChatAdapter,
  WechatSourceCandidate,
  WechatUpstreamArticle,
  WechatUpstreamSource,
} from "./wechat-adapter.js";
import { WeRssAdapter } from "./werss-adapter.js";
import { DirectContentFetcher, type ArticleContentFetcher } from "./direct-content-fetcher.js";

export interface WeChatRegistrationConfig {
  adapter: "werss" | null;
  baseUrl: string | null;
  apiKey: string | null;
  requestTimeoutMs: number;
  initialBackfillLimit: number;
  pageSize: number;
  maxPages: number;
}

export function registerConfiguredWeChatProvider(
  registry: ProviderRegistry,
  config: WeChatRegistrationConfig | undefined,
  onAdapter?: (adapter: WeChatAdapter) => void,
): boolean {
  if (config?.adapter !== "werss" || config.baseUrl === null || config.apiKey === null) {
    return false;
  }
  const adapter = new WeRssAdapter({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    requestTimeoutMs: config.requestTimeoutMs,
  });
  onAdapter?.(adapter);
  registry.register(
    new WeChatProvider(
      adapter,
      {
        initialBackfillLimit: config.initialBackfillLimit,
        pageSize: config.pageSize,
        maxPages: config.maxPages,
      },
      new DirectContentFetcher(new SafeExternalHttpClient()),
    ),
  );
  return true;
}

function articleUrl(input: string): string {
  try {
    const url = new URL(input);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "mp.weixin.qq.com" ||
      !url.pathname.startsWith("/s")
    ) {
      throw new Error("not a WeChat article");
    }
    return url.href;
  } catch (error) {
    throw new ProviderError(
      "INVALID_URL",
      "Invalid WeChat article URL",
      false,
      "wechat-werss",
      undefined,
      error,
    );
  }
}

export class WeChatProvider implements ContentProvider {
  readonly key = "wechat-werss";

  constructor(
    private readonly adapter: WeChatAdapter,
    private readonly options: {
      initialBackfillLimit: number;
      pageSize: number;
      maxPages: number;
    },
    private readonly directContentFetcher?: ArticleContentFetcher,
  ) {}

  async canHandle(input: ResolveInput): Promise<boolean> {
    try {
      articleUrl(input.rawInput);
      return true;
    } catch {
      return false;
    }
  }

  async resolveSource(input: ResolveInput): Promise<ResolvedSource> {
    const url = articleUrl(input.rawInput);
    const candidate = await this.adapter.resolveByArticleUrl(url);
    return {
      type: "wechat",
      providerKey: this.key,
      externalId: candidate.encodedId,
      name: candidate.name,
      canonicalUrl: null,
      avatarUrl: candidate.avatarUrl,
      providerMeta: {
        upstreamEncodedId: candidate.encodedId,
        intro: candidate.intro,
        articleUrl: url,
      },
    };
  }

  async ensureSubscribed(source: ResolvedSource): Promise<void> {
    const encodedId = source.providerMeta.upstreamEncodedId;
    if (typeof encodedId !== "string") {
      throw new ProviderError(
        "UPSTREAM_UNAVAILABLE",
        "WeChat candidate metadata missing",
        false,
        this.key,
      );
    }
    const candidate: WechatSourceCandidate = {
      name: source.name,
      avatarUrl: source.avatarUrl,
      encodedId,
      intro: typeof source.providerMeta.intro === "string" ? source.providerMeta.intro : null,
      ...(typeof source.providerMeta.articleUrl === "string"
        ? { articleUrl: source.providerMeta.articleUrl }
        : {}),
    };
    const upstream = await this.adapter.ensureSubscribed(candidate);
    source.externalId = upstream.externalId;
    source.providerMeta = {
      upstreamSourceId: upstream.id,
      upstreamExternalId: upstream.externalId,
    };
  }

  async syncSource(source: Source, cursor?: string): Promise<SyncPage> {
    const upstreamSourceId = source.providerMeta?.upstreamSourceId;
    if (typeof upstreamSourceId !== "string" || source.externalId === null) {
      throw new ProviderError(
        "SOURCE_NOT_FOUND",
        "WeChat upstream source metadata missing",
        false,
        this.key,
      );
    }
    const upstream: WechatUpstreamSource = {
      id: upstreamSourceId,
      externalId: source.externalId,
      name: source.name,
      avatarUrl: source.avatarUrl,
    };
    const startOffset = cursor === undefined ? 0 : Number.parseInt(cursor, 10);
    if (!Number.isSafeInteger(startOffset) || startOffset < 0) {
      throw new ProviderError("PARSE_FAILED", "Invalid WeChat cursor", false, this.key);
    }
    const cap =
      source.lastSyncedAt === null
        ? this.options.initialBackfillLimit
        : this.options.pageSize * this.options.maxPages;
    const articles: ProviderArticle[] = [];
    let offset = startOffset;
    let total = Number.POSITIVE_INFINITY;
    for (
      let page = 0;
      page < this.options.maxPages && articles.length < cap && offset < total;
      page += 1
    ) {
      const limit = Math.min(this.options.pageSize, cap - articles.length);
      const result = await this.adapter.listArticles(upstream, { limit, offset });
      total = result.total;
      articles.push(...result.articles.map((article) => this.toProviderArticle(article)));
      offset += result.articles.length;
      if (result.articles.length < limit) break;
    }
    return {
      articles,
      ...(offset < total ? { cursor: String(offset) } : {}),
      hasMore: offset < total,
    };
  }

  async fetchArticle(article: ArticleMeta): Promise<ProviderArticle> {
    const upstream: WechatUpstreamArticle = {
      id: article.externalId ?? article.id,
      canonicalUrl: article.canonicalUrl,
      title: article.title,
      author: article.author,
      coverUrl: article.coverUrl,
      publishedAt: article.publishedAt,
      rawContent: null,
    };
    const content = await this.adapter.fetchContent(upstream);
    const resolvedContent =
      content.html || !this.directContentFetcher
        ? content
        : await this.directContentFetcher.fetch(content.canonicalUrl);
    return {
      ...this.toProviderArticle(upstream),
      canonicalUrl: resolvedContent.canonicalUrl,
      ...(resolvedContent.html
        ? { rawContent: resolvedContent.html, rawContentType: "html" as const }
        : {}),
    };
  }

  private toProviderArticle(article: WechatUpstreamArticle): ProviderArticle {
    return {
      externalId: article.id,
      canonicalUrl: article.canonicalUrl,
      title: article.title,
      author: article.author,
      coverUrl: article.coverUrl,
      publishedAt: article.publishedAt,
      ...(article.rawContent
        ? { rawContent: article.rawContent, rawContentType: "html" as const }
        : {}),
    };
  }
}
