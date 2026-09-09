import { createHash } from "node:crypto";

import type { HttpLimits, HttpTextResponse } from "../../http/safe-http-client.js";
import { discoverFeedUrls } from "./discovery.js";
import { parseFeedXml } from "./feed-parser.js";
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

interface TextHttpClient {
  getText(url: string, limits: HttpLimits): Promise<HttpTextResponse>;
}

const feedLimits = { maxBytes: 5 * 1024 * 1024, timeoutMs: 10_000, maxRedirects: 5 };

function inputUrl(rawInput: string): URL {
  try {
    const url = new URL(rawInput);
    if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("protocol");
    return url;
  } catch (error) {
    throw new ProviderError(
      "INVALID_URL",
      "Invalid RSS URL",
      false,
      "rss-native",
      undefined,
      error,
    );
  }
}

export class RssProvider implements ContentProvider {
  readonly key = "rss-native";

  constructor(private readonly http: TextHttpClient) {}

  async canHandle(input: ResolveInput): Promise<boolean> {
    try {
      const url = inputUrl(input.rawInput);
      return url.hostname.toLowerCase() !== "mp.weixin.qq.com";
    } catch {
      return false;
    }
  }

  async resolveSource(input: ResolveInput): Promise<ResolvedSource> {
    const requestedUrl = inputUrl(input.rawInput).href;
    let response = await this.http.getText(requestedUrl, feedLimits);
    let feedUrl = response.finalUrl;
    let feed;
    try {
      feed = parseFeedXml(response.body, feedUrl);
    } catch (error) {
      if (error instanceof ProviderError && error.code === "PARSE_FAILED") {
        const candidates = discoverFeedUrls(response.body, response.finalUrl);
        if (candidates.length !== 1) throw error;
        feedUrl = candidates[0] ?? feedUrl;
        response = await this.http.getText(feedUrl, feedLimits);
        feed = parseFeedXml(response.body, response.finalUrl);
        feedUrl = response.finalUrl;
      } else {
        throw error;
      }
    }
    return {
      type: "rss",
      providerKey: this.key,
      externalId: createHash("sha256").update(feedUrl).digest("hex"),
      name: feed.title,
      canonicalUrl: feedUrl,
      avatarUrl: null,
      providerMeta: { siteUrl: feed.siteUrl },
    };
  }

  async ensureSubscribed(source: ResolvedSource): Promise<void> {
    void source;
  }

  async syncSource(source: Source): Promise<SyncPage> {
    if (!source.canonicalUrl) {
      throw new ProviderError("SOURCE_NOT_FOUND", "RSS source URL is missing", false, this.key);
    }
    const response = await this.http.getText(source.canonicalUrl, feedLimits);
    return { articles: parseFeedXml(response.body, response.finalUrl).articles, hasMore: false };
  }

  async fetchArticle(article: ArticleMeta): Promise<ProviderArticle> {
    const response = await this.http.getText(article.canonicalUrl, feedLimits);
    return {
      externalId: article.externalId,
      canonicalUrl: response.finalUrl,
      title: article.title,
      author: article.author,
      coverUrl: article.coverUrl,
      publishedAt: article.publishedAt,
      rawContent: response.body,
      rawContentType: "html",
    };
  }
}
