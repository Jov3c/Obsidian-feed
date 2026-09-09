import type { HttpLimits, HttpTextResponse } from "../../http/safe-http-client.js";
import { ProviderError } from "../types.js";

interface TextHttpClient {
  getText(url: string, limits: HttpLimits): Promise<HttpTextResponse>;
}

export interface FetchedArticleContent {
  html: string;
  canonicalUrl: string;
}

export interface ArticleContentFetcher {
  fetch(url: string): Promise<FetchedArticleContent>;
}

const limits = { maxBytes: 5 * 1024 * 1024, timeoutMs: 15_000, maxRedirects: 5 };

export class DirectContentFetcher implements ArticleContentFetcher {
  constructor(private readonly http: TextHttpClient) {}

  async fetch(url: string): Promise<FetchedArticleContent> {
    const response = await this.http.getText(url, limits);
    const contentType = response.headers["content-type"] ?? "";
    if (
      response.statusCode < 200 ||
      response.statusCode >= 300 ||
      !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/iu.test(contentType)
    ) {
      throw new ProviderError(
        "CONTENT_BLOCKED",
        "Article response is not accessible HTML",
        false,
        "wechat-direct",
      );
    }
    if (/(?:验证码|captcha|安全验证|登录后继续|请先登录|访问过于频繁)/iu.test(response.body)) {
      throw new ProviderError(
        "CONTENT_BLOCKED",
        "Article response requires interactive access",
        false,
        "wechat-direct",
      );
    }
    return { html: response.body, canonicalUrl: response.finalUrl };
  }
}
