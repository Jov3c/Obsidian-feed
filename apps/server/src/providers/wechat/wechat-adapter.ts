export type AdapterHealth = "ok" | "degraded";

export interface WechatSourceCandidate {
  name: string;
  avatarUrl: string | null;
  encodedId: string;
  intro: string | null;
  articleUrl?: string;
}

export interface WechatUpstreamSource {
  id: string;
  externalId: string;
  name: string;
  avatarUrl: string | null;
}

export interface WechatUpstreamArticle {
  id: string;
  canonicalUrl: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  publishedAt: string | null;
  rawContent: string | null;
}

export interface WechatArticlePage {
  articles: WechatUpstreamArticle[];
  total: number;
  offset: number;
  limit: number;
}

export interface RawArticleContent {
  html: string | null;
  canonicalUrl: string;
}

export interface WeChatAdapter {
  readonly key: string;
  health(): Promise<AdapterHealth>;
  resolveByArticleUrl(url: string): Promise<WechatSourceCandidate>;
  ensureSubscribed(candidate: WechatSourceCandidate): Promise<WechatUpstreamSource>;
  listArticles(
    source: WechatUpstreamSource,
    options: { limit: number; offset: number },
  ): Promise<WechatArticlePage>;
  fetchContent(article: WechatUpstreamArticle): Promise<RawArticleContent>;
  requestRefresh?(source: WechatUpstreamSource): Promise<void>;
}
