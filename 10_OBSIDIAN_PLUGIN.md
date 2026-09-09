# Obsidian Feed V1 — Obsidian 插件实现规格

## 1. 插件定位

插件是阅读客户端，不承担外部内容采集和定时任务。

## 2. Manifest

建议：

```json
{
  "id": "obsidian-feed",
  "name": "Obsidian Feed",
  "version": "0.1.0",
  "minAppVersion": "1.13.0",
  "description": "A reading-first RSS and WeChat article reader for Obsidian.",
  "author": "Jov3",
  "isDesktopOnly": false
}
```

`minAppVersion` 是项目选择，不代表当前 Obsidian 最新版本。发布前用当前官方 API 验证并调整。

## 3. 入口

`src/main.ts` 只做组合：

```ts
export default class ObsidianFeedPlugin extends Plugin {
  async onload() {
    // load settings/state
    // initialize ApiClient
    // register views
    // register ribbon
    // register commands
    // add SettingTab
  }

  onunload() {
    // registered resources disposed by Obsidian helpers
  }
}
```

不得把列表渲染、网络请求、Markdown 转换塞到 `main.ts`。

## 4. Views

建议一个主 view type：

```text
obsidian-feed-main
```

内部 route state：

```ts
type FeedRoute =
  | { name: "today" }
  | { name: "subscriptions" }
  | { name: "reader"; articleId: string; from: "today" | "subscriptions" };
```

也可以拆多个 ItemView，但 V1 优先单主 view，避免 mobile workspace 复杂化。

## 5. Ribbon

左侧一个 RSS/reader 图标：

- 点击打开/激活 Feed view；
- 不创建多个重复 leaf；
- 优先复用现有 leaf。

## 6. Commands

至少：

- `Open Obsidian Feed`；
- `Add feed subscription`；
- `Refresh current feed list`；
- `Save current article to vault`（有 reader context 才可用）。

命令名称发布时中英文可由本地化决定。

## 7. ApiClient

```ts
class FeedApiClient {
  constructor(config: { baseUrl: string; token: string });
  resolveSubscription(input: string): Promise<ResolvedCandidate>;
  subscribe(resolutionToken: string): Promise<ApiSubscription>;
  listSubscriptions(): Promise<ApiSubscription[]>;
  disableSubscription(id: string): Promise<void>;
  listArticles(params: ArticleListParams): Promise<ArticlePage>;
  getArticle(id: string): Promise<ArticleDetail>;
  refreshSource(id: string): Promise<RefreshResult>;
  getSourceStatus(id: string): Promise<SourceStatusResponse>;
}
```

底层只用 Obsidian `requestUrl()`。

### Timeout

Obsidian requestUrl 本身控制能力有限时，在调用层使用 Promise timeout wrapper，默认 15s JSON API；文章详情 20s。

### Retry

- GET 网络瞬时错误：最多自动重试 1 次；
- POST subscribe 不自动无脑重试，依赖服务端幂等；
- 429 尊重 retryAfter；
- 401 不重试。

## 8. PluginData

```ts
interface PluginDataV1 {
  version: 1;
  settings: PluginSettings;
  reading: Record<string, ReadingState>;
  ui: {
    lastRoute?: "today" | "subscriptions";
  };
}
```

### Settings

```ts
interface PluginSettings {
  serverBaseUrl: string;
  serverToken: string;
  saveRoot: string;
  imageSaveMode: "local" | "remote";
  readerFontSize: "small" | "standard" | "large";
  readerLineHeight: "compact" | "comfortable" | "loose";
  readerWidth: "narrow" | "standard" | "wide";
}
```

默认：

```text
serverBaseUrl = "http://127.0.0.1:43110"
saveRoot = "Feed"
imageSaveMode = "local"
font = standard
lineHeight = comfortable
width = standard
```

注意：iPhone 不能访问电脑的 `127.0.0.1`。设置说明要明确服务器需在手机可访问地址（局域网/VPN/HTTPS）。

## 9. Token storage

Obsidian `data.json` 不是硬件安全区。设置页必须说明 server token 会保存在插件配置中。

V1 不把微信登录凭证保存在插件。

## 10. Today state

View state：

```ts
interface TodayState {
  items: ApiArticleListItem[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: FeedUiError | null;
}
```

打开 view：

1. 先渲染壳；
2. 请求第一页；
3. 不拉全文；
4. scroll 接近底部拉下一页；
5. route 切换后取消/忽略过时响应。

## 11. Reader state

```ts
interface ReaderState {
  articleId: string;
  detail: ArticleDetail | null;
  loading: boolean;
  error: FeedUiError | null;
}
```

防 race：每次打开 article 生成 request sequence；后响应若不是 current sequence 则丢弃。

## 12. Renderer

`ArticleRenderer` 只接受验证后的 `ArticleDocument`。

```ts
renderDocument(container: HTMLElement, doc: ArticleDocument): RenderHandle
```

每个 block：

- 创建原生 DOM；
- `dataset.blockId = block.id`；
- TextRun 用 `createSpan`/text node；
- link 设置 href 并验证；
- 不设置 `innerHTML`；
- code 使用 `textContent`；
- table 单独容器。

这能大幅降低 XSS 面。

## 13. Scroll state

每 500ms throttle：

- 计算 progress；
- 找 viewport 顶部最近 `data-block-id`；
- 保存 anchor id + offset；
- 写入内存；
- `saveData` debounce 2s；
- view close / plugin unload 立即 flush。

不要每次 scroll 都写磁盘。

## 14. 已读状态

由本地 `ReadingState` 决定。

Today list 的 `read` 是本地 join：

```ts
const read = pluginData.reading[item.id]?.read ?? false;
```

服务端 article DTO 不带个人 read state。

## 15. Settings Tab

分组：

### Server

- Server URL；
- Access Token（password input）；
- Test connection；
- 状态显示。

### Reading

- 字号；
- 行距；
- 宽度。

### Saving

- Save root；
- Image mode。

### WeChat status

仅显示由 server `/health/ready` / source status 提供的信息。不让用户在 Obsidian 输入 WeRSS API Key。

## 16. Mobile concerns

- 不使用 hover-only action；
- context menu 有 touch 替代；
- 不依赖 filesystem Node path；用 Obsidian `normalizePath`；
- 不使用 `fs`, `path`, Electron；
- 不打开本地 server process；
- 图片 Viewer 用 DOM/CSS；
- body safe area 使用 `env(safe-area-inset-*)`。

## 17. Network disclosure

如果申请 Obsidian Community Plugin：README 明确说明：

- 插件会连接用户配置的 Feed Server；
- 用途为获取订阅、文章和媒体；
- 不包含客户端 telemetry；
- 微信数据由用户自己的服务处理。

## 18. CSS scope

所有 class 前缀：

```text
of-
```

例如：

- `.of-root`
- `.of-reader`
- `.of-article-row`

不要写全局 `p {}`、`img {}` 污染 Vault。
