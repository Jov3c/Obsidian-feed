# Obsidian Feed V1 — 验收标准

只有所有 **P0** 完成，V1 才可标记完成。

## A. 工程

- [ ] P0 pnpm monorepo 结构符合架构文档。
- [ ] P0 `pnpm install --frozen-lockfile` 可执行。
- [ ] P0 `pnpm lint` 通过。
- [ ] P0 `pnpm typecheck` 通过。
- [ ] P0 `pnpm test` 通过。
- [ ] P0 `pnpm build` 通过。
- [ ] P0 插件产出 `main.js`, `manifest.json`, `styles.css`。
- [ ] P0 `isDesktopOnly=false`。
- [ ] P0 Server Node >=22.5.0 可运行。

## B. Server 基础

- [ ] P0 未带 Bearer token 的业务 API 返回 401。
- [ ] P0 `/health/live` 正常。
- [ ] P0 `/health/ready` 能区分 DB 和微信 adapter 状态。
- [ ] P0 SQLite WAL/foreign_keys 生效。
- [ ] P0 migration 从空数据库成功。
- [ ] P0 重启不丢 subscription/source/article。

## C. RSS

- [ ] P0 可以添加标准 RSS 2.0。
- [ ] P0 可以添加 Atom。
- [ ] P0 RSS article 不重复入库。
- [ ] P0 feed item 有全文时能生成 ArticleDocument。
- [ ] P0 只有链接时 generic parser 失败会明确降级，不伪造全文。
- [ ] P0 XXE/DTD 测试被拒绝。
- [ ] P0 私网 SSRF URL 被拒绝。

## D. 微信公众号

- [ ] P0 未配置 WeChat adapter 时 RSS 仍可用。
- [ ] P0 粘贴合法 `mp.weixin.qq.com` 文章链接可调用 adapter resolve。
- [ ] P0 WeRSS mock `by_article` 能映射公众号 candidate。
- [ ] P0 确认订阅能调用 ensure subscribed，并保存 source/provider meta。
- [ ] P0 能从 WeRSS mock 分页拉文章列表。
- [ ] P0 首次回填默认不超过配置的 30 篇。
- [ ] P0 401 映射 needs_auth。
- [ ] P0 429 映射 rate_limited，并退避。
- [ ] P0 WeChat 上游失败不影响 RSS source sync。
- [ ] P0 不含正文时可走 direct content fetch。
- [ ] P0 blocked/login/captcha 页面不绕过，文章标记 unavailable/blocked。

## E. 正文解析

- [ ] P0 Reader 永远不直接注入原始微信 HTML。
- [ ] P0 ArticleDocument 通过 JSON schema/Zod。
- [ ] P0 正常文本文章保留关键正文。
- [ ] P0 `data-src` 图片被识别。
- [ ] P0 QR/关注尾部 fixture 被过滤。
- [ ] P0 正文中的“关注”普通语句不会因关键词误删。
- [ ] P0 nested section 文本顺序不丢。
- [ ] P0 table/code/list 基本结构保留。
- [ ] P0 XSS fixture 不产生 script/event/javascript URL。
- [ ] P0 parser 输出 confidence 和 version。

## F. Today

- [ ] P0 首屏只拉 article metadata，不拉全文。
- [ ] P0 默认最多 30 条。
- [ ] P0 cursor 分页可继续加载。
- [ ] P0 标题、来源、时间正确。
- [ ] P0 本地已读状态能改变行视觉。
- [ ] P0 不展示摘要。
- [ ] P0 服务端断开时有清晰错误，不白屏。

## G. Reader

- [ ] P0 桌面正文默认 720px 左右。
- [ ] P0 默认 17px / 1.8 行高。
- [ ] P0 移动端单栏。
- [ ] P0 图片不撑破正文。
- [ ] P0 table 可横向滚动。
- [ ] P0 点击图片可打开 Viewer。
- [ ] P0 外链可打开原网页。
- [ ] P0 阅读位置自动保存。
- [ ] P0 关闭再打开同篇文章恢复位置。
- [ ] P0 到 85% 自动标记已读。
- [ ] P0 下滚顶栏弱化/隐藏，上滚恢复。
- [ ] P0 reduced-motion 下动画可禁用。
- [ ] P0 正文失败仍可“打开原文”。

## H. Save Markdown

- [ ] P0 一键保存文章为 `.md`。
- [ ] P0 frontmatter 合法。
- [ ] P0 标题特殊字符不会破坏 YAML/文件名。
- [ ] P0 `我的笔记`、`我的摘录` 存在。
- [ ] P0 正文顺序与 Reader 一致。
- [ ] P0 第二次保存不会覆盖用户笔记/摘录。
- [ ] P0 local image mode 下载至 Vault。
- [ ] P0 remote mode 不下载图片。
- [ ] P0 图片失败不导致整篇保存失败。
- [ ] P0 选中文字可以追加到“我的摘录”。

## I. Mobile

至少在真实设备/模拟实际 Obsidian 环境：

- [ ] P0 iPhone 打开 Today。
- [ ] P0 iPhone 打开长文并连续滚动。
- [ ] P0 iPhone 恢复阅读位置。
- [ ] P0 iPhone 保存文章。
- [ ] P0 iPhone 图片 Viewer。
- [ ] P0 iPad 同样完成核心阅读流程。
- [ ] P0 Android 至少完成一轮核心流程。

## J. Security

- [ ] P0 SSRF private/loopback/link-local 测试全过。
- [ ] P0 redirect 到 private IP 被阻断。
- [ ] P0 API token 不进入 log。
- [ ] P0 WeRSS API key 不进入 API response/log。
- [ ] P0 Renderer 不使用 raw `innerHTML`。
- [ ] P0 media MIME allowlist。
- [ ] P0 media size limit。
- [ ] P0 Vault path 不能 `../` escape。

## K. Scope

- [ ] P0 无 AI dependency。
- [ ] P0 无摘要字段/UI。
- [ ] P0 无推荐系统。
- [ ] P0 无用户登录/注册系统。
- [ ] P0 无 Redis/Kafka。
- [ ] P0 无客户端 telemetry。

## Release candidate 手工体验

最终 RC 至少使用：

- 5 个 RSS sources；
- 5 个微信公众号 sources（若上游允许）；
- 100+ article metadata；
- 20 篇不同排版文章；
- 其中至少 5 篇图片密集、3 篇复杂 section、2 篇代码/表格；
- 连续使用 2 天，确认 scheduler/恢复状态/重复文章没有明显问题。
