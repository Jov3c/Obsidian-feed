import { z } from "zod";

import { TrustedUpstreamClient } from "../../http/trusted-upstream-client.js";
import { ProviderError } from "../types.js";
import type {
  AdapterHealth,
  RawArticleContent,
  WeChatAdapter,
  WechatArticlePage,
  WechatSourceCandidate,
  WechatUpstreamArticle,
  WechatUpstreamSource,
} from "./wechat-adapter.js";
import {
  addSourceResponseSchema,
  articleListResponseSchema,
  byArticleResponseSchema,
} from "./werss-schemas.js";

const maxResponseBytes = 5 * 1024 * 1024;

function publishedAt(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const milliseconds = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export class WeRssAdapter implements WeChatAdapter {
  readonly key = "werss";
  private readonly client: TrustedUpstreamClient;

  constructor(
    private readonly options: { baseUrl: string; apiKey: string; requestTimeoutMs: number },
  ) {
    this.client = new TrustedUpstreamClient(options.baseUrl);
  }

  async health(): Promise<AdapterHealth> {
    try {
      const response = await this.client.getText("api/v1/wx/mps?limit=1&offset=0", this.limits());
      return response.statusCode >= 200 && response.statusCode < 300 ? "ok" : "degraded";
    } catch {
      return "degraded";
    }
  }

  async resolveByArticleUrl(url: string): Promise<WechatSourceCandidate> {
    const response = await this.request(
      "POST",
      `api/v1/wx/mps/by_article?url=${encodeURIComponent(url)}`,
      byArticleResponseSchema,
      {},
    );
    return {
      name: response.data.mp_info.mp_name,
      avatarUrl: response.data.mp_info.logo ?? null,
      encodedId: response.data.mp_info.biz,
      intro: response.data.description ?? null,
      articleUrl: url,
    };
  }

  async ensureSubscribed(candidate: WechatSourceCandidate): Promise<WechatUpstreamSource> {
    const response = await this.request("POST", "api/v1/wx/mps", addSourceResponseSchema, {
      mp_name: candidate.name,
      mp_cover: candidate.avatarUrl,
      mp_id: candidate.encodedId,
      avatar: candidate.avatarUrl,
      mp_intro: candidate.intro,
    });
    return {
      id: response.data.id,
      externalId: response.data.faker_id,
      name: response.data.mp_name,
      avatarUrl: response.data.mp_cover ?? null,
    };
  }

  async listArticles(
    source: WechatUpstreamSource,
    options: { limit: number; offset: number },
  ): Promise<WechatArticlePage> {
    const query = new URLSearchParams({
      mp_id: source.id,
      limit: String(options.limit),
      offset: String(options.offset),
    });
    const response = await this.request(
      "GET",
      `api/v1/wx/articles?${query.toString()}`,
      articleListResponseSchema,
    );
    return {
      articles: response.data.list.map((article): WechatUpstreamArticle => ({
        id: article.id,
        canonicalUrl: article.url,
        title: article.title,
        author: article.author ?? null,
        coverUrl: article.pic_url ?? null,
        publishedAt: publishedAt(article.publish_time),
        rawContent: article.content ?? null,
      })),
      total: response.data.total,
      offset: options.offset,
      limit: options.limit,
    };
  }

  async fetchContent(article: WechatUpstreamArticle): Promise<RawArticleContent> {
    return { html: article.rawContent, canonicalUrl: article.canonicalUrl };
  }

  private limits() {
    return {
      maxBytes: maxResponseBytes,
      timeoutMs: this.options.requestTimeoutMs,
      headers: { accept: "application/json", "x-api-key": this.options.apiKey },
    };
  }

  private async request<T extends z.ZodType>(
    method: "GET" | "POST",
    path: string,
    schema: T,
    body?: unknown,
  ): Promise<z.infer<T>> {
    try {
      const response =
        method === "POST"
          ? await this.client.postJson(path, body ?? {}, this.limits())
          : await this.client.getText(path, this.limits());
      if (response.statusCode === 401) {
        throw new ProviderError(
          "UPSTREAM_AUTH_REQUIRED",
          "WeRSS authentication required",
          false,
          "wechat-werss",
        );
      }
      if (response.statusCode === 429) {
        const retryAfter = Number.parseInt(response.headers["retry-after"] ?? "", 10);
        throw new ProviderError(
          "UPSTREAM_RATE_LIMITED",
          "WeRSS rate limited",
          true,
          "wechat-werss",
          Number.isFinite(retryAfter) ? retryAfter : undefined,
        );
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new ProviderError(
          "UPSTREAM_UNAVAILABLE",
          "WeRSS request failed",
          true,
          "wechat-werss",
        );
      }
      const parsed = schema.parse(JSON.parse(response.body));
      if ((parsed as { code?: unknown }).code !== 0) {
        throw new ProviderError(
          "UPSTREAM_UNAVAILABLE",
          "WeRSS returned an error",
          true,
          "wechat-werss",
        );
      }
      return parsed;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        "UPSTREAM_UNAVAILABLE",
        "Invalid WeRSS response",
        true,
        "wechat-werss",
        undefined,
        error,
      );
    }
  }
}
