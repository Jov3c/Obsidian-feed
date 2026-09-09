# Obsidian Feed V1 文档包

这是为 Codex / agentic coding 准备的完整 V1 规格包。

产品定位：

> **一个住在 Obsidian 里的沉浸式 RSS / 微信公众号阅读器。**

核心闭环：

```text
订阅 → 自动更新 → 安静阅读 → 保存 Markdown / 摘录
```

没有 AI，没有摘要，没有推荐。

## 文档地图

| 文件                        | 用途                                    |
| --------------------------- | --------------------------------------- |
| `CODEX_START_HERE.md`       | Codex 第一入口、范围硬约束              |
| `01_PRODUCT_SPEC.md`        | PRD、用户故事、范围与成功标准           |
| `02_SYSTEM_ARCHITECTURE.md` | 总体架构、工程目录、职责边界            |
| `03_UX_READING_SPEC.md`     | 页面、响应式、阅读交互、视觉参数        |
| `04_CONTENT_MODEL.md`       | Source / Article / ArticleDocument 契约 |
| `05_PROVIDER_SPEC.md`       | 通用 ContentProvider 设计               |
| `06_WECHAT_PROVIDER.md`     | 微信公众号接入、WeRSS Adapter 细节      |
| `07_CONTENT_PARSING.md`     | 正文识别、清洗、置信度、块解析          |
| `08_DATABASE.md`            | SQLite/Drizzle 数据模型、索引、迁移     |
| `09_API.md`                 | Feed Server REST API 设计               |
| `10_OBSIDIAN_PLUGIN.md`     | 插件生命周期、ItemView、状态、移动端    |
| `11_MARKDOWN_EXPORT.md`     | Markdown 保存、frontmatter、摘录        |
| `12_MEDIA.md`               | 图片代理、缓存、本地化、Viewer          |
| `13_SYNC_AND_ERRORS.md`     | Scheduler、退避、状态机、错误码         |
| `14_SECURITY_PRIVACY.md`    | SSRF、XSS、凭证、隐私、合规边界         |
| `15_TESTING.md`             | 单测、集成、契约、E2E、fixture 策略     |
| `16_DEPLOYMENT.md`          | Docker、自托管、环境变量、备份          |
| `17_OPERATIONS.md`          | 日志、健康检查、数据库维护、排障        |
| `18_CODING_STANDARDS.md`    | 命名、TypeScript、边界、提交规范        |
| `19_ROADMAP.md`             | V1 后可选演进，防止 V1 偷跑范围         |
| `20_REFERENCE_SOURCES.md`   | 当前参考项目和官方资料                  |
| `21_ACCEPTANCE_CRITERIA.md` | 可执行验收清单                          |
| `schemas/`                  | JSON Schema / OpenAPI / SQL             |
| `adr/`                      | 关键架构决策记录                        |
| `docs/superpowers/specs/`   | 汇总设计规格                            |
| `docs/superpowers/plans/`   | 可按任务执行的实施计划                  |

## 重要版权说明

`joeseesun/qiaomu-ai-rss` 的仓库 LICENSE 为 GPL-3.0。该项目可以作为产品与架构研究参考，但本项目应从零实现，不复制其 GPL 源码。如果未来实际复制或改编 GPL 覆盖代码，需单独评估并履行对应许可证义务。

本规格建议新项目自身使用 MIT License；最终许可证由项目所有者决定。

## 当前外部依赖策略

- Obsidian：官方 Plugin API；
- 微信公众号：V1 默认通过可替换 `WeRssAdapter` 接自托管 WeRSS；
- RSS/Atom：服务端原生解析；
- 内容模型：项目自定义 `ArticleDocument`；
- 服务端数据库：SQLite；
- 无 AI 服务依赖。
