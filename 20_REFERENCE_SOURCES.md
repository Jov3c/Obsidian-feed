# Obsidian Feed V1 — 参考资料与调研快照

> 调研快照：2026-09-09。外部项目可能变化；实施时应以当前 upstream 文档/OpenAPI 为准，但不得改变本规格的内部契约。

## 1. Obsidian 官方

### Developer Documentation

- https://docs.obsidian.md/
- https://docs.obsidian.md/Plugins/Getting%20started/Build%20a%20plugin
- https://docs.obsidian.md/community-directory/developer-policies

关键结论：

- 官方推荐 TypeScript plugin；
- sample plugin 使用 `src/main.ts` → build `main.js`；
- Community Plugin 对网络使用需要 README 披露；
- 不允许客户端 telemetry、动态网络广告等；
- 插件需要明确许可证。

### Sample plugin

- https://github.com/obsidianmd/obsidian-sample-plugin

用途：只参考官方工程形式与发布流程。

## 2. Qiaomu AI RSS

- https://github.com/joeseesun/qiaomu-ai-rss

我们参考：

- Obsidian 原生 ItemView 产品形态；
- 模块拆分；
- 阅读优先思路；
- mobile compatibility 思路。

不复制源码。

### License

该仓库根 `LICENSE` 为 GNU GPL v3。另有商业许可文件。我们的新项目从零实现，避免无意把 GPL 源码复制进 MIT 项目。

## 3. WeWe RSS

- https://github.com/cooderl/wewe-rss

截至 2026-05-11 已归档。

历史价值：

- 基于微信读书的公众号订阅；
- 通过公众号文章链接识别来源；
- 历史文章/定时更新/RSS。

因为已归档，不把它作为 V1 唯一硬依赖。

## 4. WeRSS

- https://github.com/wufulin/wechat-mp-rss

当前 README 描述：

- FastAPI；
- SQLite/MySQL/PostgreSQL；
- Playwright；
- 多种采集模式；
- API Key/JWT；
- 公众号与文章 API；
- RSS；
- 自托管合规提醒。

V1 默认 `WeRssAdapter` 对接此类 API。

调研代码中存在：

```text
POST /api/v1/wx/mps/by_article?url=...
POST /api/v1/wx/mps
GET  /api/v1/wx/mps
GET  /api/v1/wx/articles
```

实施时必须以当前 OpenAPI (`/api/openapi.json`) 做契约确认，Adapter 外部 schema 可允许小范围兼容变化，但内部 `WeChatAdapter` 接口不可被 upstream 字段污染。

## 5. WechRss

- https://github.com/johamwon/wechrss

当前项目同样验证了“粘贴公众号文章链接 → 识别公众号 → 定时同步”的产品路径。未来可实现 `WechRssAdapter`。

## 6. 微信文章归档工具

- https://github.com/halohazhang/wechat-mp-obsidian-archiver

用途：验证从文章链接识别公众号、增量同步、图片本地化、Obsidian Markdown 归档等问题的现实复杂度。

不复制其实现。

## 7. Drizzle SQLite

- https://orm.drizzle.team/docs/sqlite/get-started-sqlite
- https://orm.drizzle.team/docs/get-started/node-sqlite-new

当前文档支持 `node:sqlite`，并标注 Node.js v22.5.0+。

## 8. Mozilla Readability

- https://github.com/mozilla/readability

仅作为普通网页正文提取兜底。微信公众号优先 source-specific parser。

## 9. 法律/合规设计说明

本规格不对任何第三方平台接口持续可用性做承诺。产品默认个人私有自托管，禁止把“抓到内容”误解为“拥有对外再分发权利”。
