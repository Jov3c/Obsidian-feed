# Obsidian Feed V1 — Content Provider 规范

## 1. 目的

Provider 负责“外部来源如何被识别与同步”。业务层只认识统一 Source / Article。

## 2. 接口

```ts
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

export interface ContentProvider {
  readonly key: string;
  canHandle(input: ResolveInput): Promise<boolean>;
  resolveSource(input: ResolveInput): Promise<ResolvedSource>;
  ensureSubscribed(source: ResolvedSource): Promise<void>;
  syncSource(source: Source, cursor?: string): Promise<SyncPage>;
  fetchArticle(article: ArticleMeta): Promise<ProviderArticle>;
}
```

## 3. Provider Registry

`ProviderRegistry`：

```ts
class ProviderRegistry {
  register(provider: ContentProvider): void;
  resolveForInput(input: ResolveInput): Promise<ContentProvider>;
  getByKey(key: string): ContentProvider;
}
```

优先级：

1. 明确微信域名 → wechat；
2. URL → RSS provider 尝试 feed discovery；
3. 无 provider → `UNSUPPORTED_SOURCE`。

不要同时让多个 provider 抓同一 URL。

## 4. RSS Provider

### `canHandle`

只接受 http/https URL，通过 SSRF guard 后：

1. 请求 URL；
2. Content-Type 或内容检测；
3. 若不是 feed，解析 HTML `<link rel="alternate" type="application/rss+xml|atom+xml">`；
4. 一个候选直接使用；多个候选返回候选列表错误 `MULTIPLE_FEEDS_FOUND`，由 API 交给 UI 选择（V1 可默认优先 Atom/RSS main）。

### RSS XML 安全

- body <= 5MB；
- 禁止 DTD；
- 禁止外部实体；
- timeout 10s；
- redirect <= 5；
- 最终 URL 再做 SSRF 校验。

### ID

RSS source external id：`sha256(canonicalFeedUrl)`。

Article external ID 顺序：

1. RSS GUID/id；
2. canonical link；
3. `sha256(title + publishedAt + sourceId)`。

## 5. WeChat Provider

Wechat Provider 本身不写任何微信平台协议。它委托 `WeChatAdapter`。

```ts
export interface WeChatAdapter {
  key: string;
  health(): Promise<AdapterHealth>;
  resolveByArticleUrl(url: string): Promise<WechatSourceCandidate>;
  ensureSubscribed(candidate: WechatSourceCandidate): Promise<WechatUpstreamSource>;
  listArticles(
    source: WechatUpstreamSource,
    options: ListOptions,
  ): Promise<WechatUpstreamArticle[]>;
  fetchContent(article: WechatUpstreamArticle): Promise<RawArticleContent>;
  requestRefresh?(source: WechatUpstreamSource): Promise<void>;
}
```

## 6. Provider Meta

外部 provider 特有字段放 `provider_meta_json`：

```json
{
  "upstreamSourceId": "MP_WXS_xxx",
  "upstreamExternalId": "..."
}
```

禁止业务代码到处 `JSON.parse`；每个 provider 自己用 Zod schema 解析。

## 7. Provider error taxonomy

```ts
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
```

Error 必须带：

```ts
{
  code,
  message,
  retryable,
  retryAfterSeconds?,
  providerKey,
  causeForLogOnly?
}
```

`causeForLogOnly` 不进入 API 响应。

## 8. Isolation

Provider 调用必须有超时。Scheduler 每个 source 单独 catch。

一个 provider 抛异常：

- 写 sync_log；
- 更新 source status；
- 计算 nextSyncAt；
- 不影响其他 source。

## 9. Test contract

所有 Provider 都要通过同一套 contract tests：

- canHandle 正确；
- resolveSource schema 完整；
- sync 结果 canonical URL；
- duplicate external IDs 不产生重复；
- timeout 转换成统一错误；
- invalid input 不触发外部请求；
- provider meta 可以 round-trip。
