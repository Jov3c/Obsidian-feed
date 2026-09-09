import {
  articleDetailSchema,
  articlePageSchema,
  refreshResultSchema,
  resolvedCandidateResponseSchema,
  sourceStatusResponseSchema,
  subscriptionListSchema,
  subscriptionResponseSchema,
  type ApiArticleDetail,
  type ApiSubscription,
  type ArticleListParams,
  type ArticlePage,
  type RefreshResult,
  type ResolvedCandidate,
  type SourceStatusResponse,
} from "@obsidian-feed/contracts";

import { apiErrorFrom } from "./errors.js";

export interface RequestOptions {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}
export interface RequestResponse {
  status: number;
  json: unknown;
}
export type RequestFunction = (options: RequestOptions) => Promise<RequestResponse>;

export class FeedApiClient {
  private readonly baseUrl: string;
  constructor(
    private readonly config: { baseUrl: string; token: string; request: RequestFunction },
  ) {
    this.baseUrl = config.baseUrl.replace(/\/+$/u, "");
  }

  private async call(path: string, method = "GET", body?: unknown): Promise<unknown> {
    const options: RequestOptions = {
      url: `${this.baseUrl}${path}`,
      method,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    const attempts = method === "GET" ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await this.config.request(options);
        if (response.status < 200 || response.status >= 300)
          throw apiErrorFrom(response.json, response.status);
        return response.json;
      } catch (error) {
        if (attempt + 1 >= attempts || (error instanceof Error && "code" in error)) throw error;
      }
    }
    throw new Error("Request failed");
  }

  async resolveSubscription(input: string): Promise<ResolvedCandidate> {
    return resolvedCandidateResponseSchema.parse(
      await this.call("/v1/subscriptions/resolve", "POST", { input }),
    ).candidate;
  }
  async subscribe(resolutionToken: string): Promise<ApiSubscription> {
    return subscriptionResponseSchema.parse(
      await this.call("/v1/subscriptions", "POST", { resolutionToken }),
    ).subscription;
  }
  async listSubscriptions(): Promise<ApiSubscription[]> {
    return subscriptionListSchema.parse(await this.call("/v1/subscriptions")).items;
  }
  async disableSubscription(id: string): Promise<void> {
    await this.call(`/v1/subscriptions/${encodeURIComponent(id)}`, "DELETE");
  }
  async listArticles(params: ArticleListParams): Promise<ArticlePage> {
    const query = new URLSearchParams({ limit: String(params.limit) });
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.sourceId) query.set("sourceId", params.sourceId);
    return articlePageSchema.parse(await this.call(`/v1/articles?${query.toString()}`));
  }
  async getArticle(id: string): Promise<ApiArticleDetail> {
    return articleDetailSchema.parse(await this.call(`/v1/articles/${encodeURIComponent(id)}`));
  }
  async refreshSource(id: string): Promise<RefreshResult> {
    return refreshResultSchema.parse(
      await this.call(`/v1/sources/${encodeURIComponent(id)}/refresh`, "POST"),
    );
  }
  async getSourceStatus(id: string): Promise<SourceStatusResponse> {
    return sourceStatusResponseSchema.parse(
      await this.call(`/v1/sources/${encodeURIComponent(id)}/status`),
    );
  }
}
