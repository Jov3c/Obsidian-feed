# Obsidian Feed V1 系统架构

## 1. 总览

```text
                    ┌─────────────────────────┐
                    │      External Sources    │
                    │ RSS / Atom / WeChat MP   │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │       Feed Server        │
                    │                         │
                    │ Provider Registry        │
                    │ Sync Scheduler           │
                    │ Content Parser           │
                    │ Article Repository       │
                    │ Media Cache              │
                    │ REST API                 │
                    └────────────┬────────────┘
                                 │ HTTPS + Bearer
                                 ▼
                    ┌─────────────────────────┐
                    │    Obsidian Plugin       │
                    │                         │
                    │ Today View               │
                    │ Subscriptions View       │
                    │ Reader View              │
                    │ Local Reading State      │
                    │ Vault Export             │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │      Obsidian Vault      │
                    │ Markdown + Attachments   │
                    └─────────────────────────┘
```

## 2. 为什么需要服务端

微信公众号不能视为标准 RSS；插件也不能在 iOS 后台可靠轮询。因此：

- 内容抓取与定时同步放服务端；
- 插件只在打开时读取服务端数据；
- 微信采集凭据永不进入 Vault；
- 更换微信采集方案不需要发布新插件。

## 3. Monorepo

```text
obsidian-feed/
├── apps/
│   ├── plugin/
│   │   ├── src/
│   │   ├── manifest.json
│   │   ├── styles.css
│   │   ├── esbuild.config.mjs
│   │   └── package.json
│   └── server/
│       ├── src/
│       ├── drizzle/
│       ├── Dockerfile
│       └── package.json
├── packages/
│   ├── contracts/
│   │   └── src/
│   └── content-model/
│       └── src/
├── docs/
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

## 4. 技术栈

### Shared

- TypeScript strict；
- pnpm workspace；
- Zod 用于 runtime validation；
- Vitest 测试。

### Plugin

- `obsidian` 官方 npm package；
- Obsidian Plugin API；
- `ItemView`；
- `requestUrl()` 进行服务端 HTTP 请求；
- esbuild；
- 原生 DOM，不引入 React/Vue；
- Lucide/Obsidian icon API；
- DOMPurify 仅用于最后一层防御（如果 renderer 允许 inline html；V1 尽量不允许）。

### Server

- Node.js >= 22.5.0；
- Fastify；
- Drizzle ORM；
- `node:sqlite`；
- `fast-xml-parser` 或同等级 XML parser（禁 DTD/实体扩展）；
- `linkedom`/`parse5` 之类纯服务端 DOM parser；
- `@mozilla/readability` 仅作为普通网页全文兜底，不作为微信主算法；
- 可选 Playwright 仅用于微信正文抓取的降级能力，默认可关闭；
- Pino/Fastify logger；
- Node crypto。

## 5. 模块划分

### Server

```text
src/
├── app.ts
├── config.ts
├── http/
│   ├── auth.ts
│   ├── errors.ts
│   └── routes/
├── db/
│   ├── client.ts
│   ├── schema.ts
│   └── repositories/
├── providers/
│   ├── registry.ts
│   ├── types.ts
│   ├── rss/
│   └── wechat/
├── parsing/
│   ├── pipeline.ts
│   ├── html-safety.ts
│   ├── generic/
│   └── wechat/
├── sync/
│   ├── scheduler.ts
│   ├── worker.ts
│   └── policy.ts
├── media/
│   ├── service.ts
│   └── route.ts
└── observability/
```

职责必须清楚：Route 不解析 HTML；Provider 不写 Obsidian 状态；Parser 不操作数据库。

### Plugin

```text
src/
├── main.ts
├── api/
│   ├── client.ts
│   └── errors.ts
├── model/
├── state/
│   ├── plugin-data.ts
│   └── reading-state.ts
├── views/
│   ├── today-view.ts
│   ├── subscriptions-view.ts
│   └── reader-view.ts
├── reader/
│   ├── renderer.ts
│   ├── scroll-state.ts
│   ├── image-viewer.ts
│   └── selection.ts
├── vault/
│   ├── exporter.ts
│   ├── markdown.ts
│   ├── media-downloader.ts
│   └── path.ts
└── settings/
```

## 6. Shared packages

### `packages/contracts`

只包含跨 API 边界的数据：

- `ApiSource`；
- `ApiArticleListItem`；
- `ApiArticleDetail`；
- `ApiSubscription`；
- 请求/响应 Zod schema；
- API error shape。

### `packages/content-model`

- `ArticleDocument`；
- Block types；
- inline marks；
- Markdown converter 的纯函数辅助；
- schema version migration。

不得让 shared package import Fastify 或 Obsidian。

## 7. 数据流

### RSS 同步

```text
Scheduler
→ RssProvider.fetchIndex
→ normalize metadata
→ upsert Article
→ content available? parse
→ ArticleDocument
→ content_hash
→ store
```

### 微信同步

```text
Scheduler
→ WeChatProvider.syncSource
→ WeRssAdapter list articles
→ upsert metadata
→ for new article: fetch body
→ WeChatParser
→ ArticleDocument
→ store
```

### 插件阅读

```text
TodayView → GET /v1/articles
ReaderView → GET /v1/articles/:id
Renderer → ArticleDocument blocks → DOM
ScrollState → local data.json
```

### 保存

```text
ReaderView
→ ArticleDocument
→ MarkdownConverter
→ Vault.create/modify
→ optional media localizer
```

## 8. 单用户鉴权

V1 没有账号体系。

Feed Server 启动时读取：

```text
FEED_SERVER_TOKEN=<至少32随机字节>
```

插件保存服务地址和 token 到插件 `data.json`。

请求：

```http
Authorization: Bearer <token>
```

除 `/health/live` 外所有业务接口需要 token。

如果将来上架 Community Plugin，README 必须明确披露网络请求和远程服务用途。

## 9. 版本策略

- API version path 固定 `/v1`；
- `ArticleDocument.version = 1`；
- 数据库用迁移文件；
- 插件遇到不支持的 ArticleDocument version，显示明确错误而不是尝试猜测。

## 10. 架构禁止项

- 不允许插件直接访问 WeRSS；必须经过 Feed Server；
- 不允许 ReaderView 直接渲染微信 `innerHTML`；
- 不允许把完整正文塞进文章列表 API；
- 不允许服务端保存 Vault 路径；
- 不允许把阅读进度写入服务端；
- 不允许 Provider 直接拼 UI DTO；
- 不允许一个 `main.ts` 承担全部插件功能；
- 不允许一个 `server.ts` 承担路由、抓取、解析和 DB。
