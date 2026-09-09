# Obsidian Feed V1 — Codex Start Here

> 文档快照日期：2026-09-09
>
> 工作名：**Obsidian Feed**。正式名称可以后改；除非文档明确允许，不要自行扩大 V1 范围。

## 1. 给 Codex 的唯一目标

从零实现一个 **Obsidian 原生沉浸式阅读器**，能够：

1. 订阅标准 RSS / Atom；
2. 通过“粘贴微信公众号任意文章链接”订阅公众号；
3. 在自托管服务端定时同步新文章；
4. 在 Obsidian 桌面端、iPhone、iPad、Android 中提供统一、干净、安静的长文阅读体验；
5. 记录已读状态与阅读进度；
6. 将文章保存成普通 Markdown，并可选择把图片本地化到 Vault；
7. 将选中文字摘录到文章笔记。

## 2. V1 明确不做

以下内容 **不得实现，也不得预埋会改变产品体验的 UI**：

- AI；
- 摘要；
- AI 问答；
- 推荐算法；
- 社交；
- 多用户账号体系；
- 云端阅读状态同步；
- 系统级 Push；
- 付费墙绕过；
- 验证码绕过；
- 绕过登录、访问控制或平台技术保护措施；
- 大型后台管理前端；
- Redis、Kafka、微服务。

如果实现过程中发现某个功能必须依赖上述能力，停止扩展，使用文档定义的降级行为。

## 3. 首先阅读的文档顺序

Codex 在写任何代码前，按顺序阅读：

1. `01_PRODUCT_SPEC.md`
2. `02_SYSTEM_ARCHITECTURE.md`
3. `03_UX_READING_SPEC.md`
4. `04_CONTENT_MODEL.md`
5. `05_PROVIDER_SPEC.md`
6. `06_WECHAT_PROVIDER.md`
7. `07_CONTENT_PARSING.md`
8. `08_DATABASE.md`
9. `09_API.md`
10. `10_OBSIDIAN_PLUGIN.md`
11. `11_MARKDOWN_EXPORT.md`
12. `12_MEDIA.md`
13. `13_SYNC_AND_ERRORS.md`
14. `14_SECURITY_PRIVACY.md`
15. `15_TESTING.md`
16. `16_DEPLOYMENT.md`
17. `21_ACCEPTANCE_CRITERIA.md`
18. `docs/superpowers/plans/2026-09-09-obsidian-feed-v1.md`

机器可读契约：

- `schemas/article-document.schema.json`
- `schemas/openapi.yaml`
- `schemas/sqlite.sql`

## 4. 工程形态必须遵守

使用 pnpm workspace monorepo：

```text
obsidian-feed/
├── apps/
│   ├── plugin/              # Obsidian 插件
│   └── server/              # 自托管 Feed Server
├── packages/
│   ├── contracts/           # API DTO + Zod schemas
│   └── content-model/       # ArticleDocument + 转换辅助
├── docs/
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

关键约束：

- TypeScript strict mode；
- Node.js `>=22.5.0`；
- 服务端 Fastify；
- SQLite + Drizzle `node:sqlite`；
- 插件基于 Obsidian Plugin API + esbuild；
- 插件运行时不依赖 Node/Electron 专属 API；
- `manifest.json` 的 `isDesktopOnly` 必须为 `false`；
- 所有外部网络访问在 README 明确披露；
- 内容服务和阅读状态严格分离；
- V1 单用户，不做登录系统；
- 服务端使用一个随机长 token 进行 Bearer 鉴权即可。

## 5. 最重要的架构边界

```text
外部内容源                         Obsidian
    │                                │
    ▼                                │
Feed Server                          │
- 抓取/同步                          │
- 正文解析                           │
- ArticleDocument                    │
- 图片代理缓存                        │
- SQLite 内容库                      │
    │                                │
    └──────── HTTPS JSON API ───────►│
                                     │
                            Plugin local data
                            - 已读
                            - 阅读进度
                            - 最近打开
                                     │
                                     ▼
                                  Vault
                            - Markdown 笔记
                            - 本地图片附件
```

### 服务端拥有

- 来源；
- 文章元数据；
- 结构化正文；
- 同步日志；
- 媒体缓存。

### 插件本地拥有

- 已读状态；
- 阅读进度；
- 最近打开记录；
- 插件设置。

### Vault 拥有

- 用户主动保存的 Markdown；
- 用户主动本地化的图片；
- 用户自己的笔记和摘录。

服务端不得知道 Vault 路径和用户笔记内容。

## 6. 微信公众号实现原则

V1 **不从零复制 WeWe RSS 或 Qiaomu 插件源码**。

微信采集采用 Provider / Adapter：

```text
WeChatProvider
└── WeRssAdapter (V1 默认实现)
```

V1 默认适配自托管 WeRSS（`wufulin/wechat-mp-rss` / 其当前维护版本）的公开 API 形态。Adapter 负责把其数据转换成我们的统一模型。后续可替换为 WechRss、WeWe-compatible 或其他合法可用数据源，不影响插件和数据库业务层。

订阅流程必须支持：

```text
mp.weixin.qq.com 文章链接
        ↓
WeRssAdapter.resolveSourceByArticleUrl()
        ↓
确认公众号
        ↓
WeRssAdapter.ensureSourceSubscribed()
        ↓
同步文章元数据
```

当上游需要扫码授权、登录失效、429 或访问受限时，必须返回明确错误状态，不尝试绕过。

## 7. 文章阅读原则

阅读器不是微信网页 iframe，也不是直接注入原始 HTML。

必须经过：

```text
原内容
  ↓
Source-specific parser
  ↓
Sanitizer
  ↓
ArticleDocument
  ↓
Obsidian ArticleRenderer
```

阅读与 Markdown 导出必须共用同一份 `ArticleDocument`。

## 8. 开发纪律

- TDD：先失败测试，再最小实现；
- 每个实现任务保持独立可测试；
- 不在单文件堆积数千行逻辑；
- 不使用 `any` 逃避类型系统，必须有明确原因和注释；
- 外部数据进入边界立刻 Zod 校验；
- 任何 HTML 在展示前必须清理；
- 不信任 RSS、微信 HTML、上游 API、图片 URL；
- 所有 URL 抓取必须经过 SSRF 校验；
- 所有请求设置超时、响应体上限、重定向上限；
- 不把 token/API Key 写进日志。

## 9. V1 完成定义

只有 `21_ACCEPTANCE_CRITERIA.md` 中全部 P0 验收项通过，才能称 V1 完成。

不要以“能打开页面”或“RSS 能抓到”为完成标准。
