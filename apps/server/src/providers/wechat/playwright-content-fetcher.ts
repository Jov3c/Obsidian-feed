import { ProviderError } from "../types.js";
import type { ArticleContentFetcher, FetchedArticleContent } from "./direct-content-fetcher.js";

export class DisabledPlaywrightContentFetcher implements ArticleContentFetcher {
  async fetch(_url: string): Promise<FetchedArticleContent> {
    void _url;
    throw new ProviderError(
      "CONTENT_UNAVAILABLE",
      "Browser content fetching is not enabled in the baseline server",
      false,
      "wechat-playwright",
    );
  }
}
