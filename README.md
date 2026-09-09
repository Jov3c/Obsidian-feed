# Obsidian Feed

一个面向 Obsidian 的自托管订阅阅读器，用统一、安静的阅读界面阅读 RSS、Atom 和公开的微信公众号文章，并将正文可靠地保存为 Markdown。

> 当前版本：`0.1.0`（V1 Release Candidate）
>
> 真实 iPhone、iPad、Android 设备及长期运行体验尚未完成验证，请参阅[当前验证状态](#当前验证状态)。

## 项目特点

- 支持 RSS 2.0 与 Atom 订阅、自动同步和游标分页。
- 可通过用户自行部署的 WeRSS 服务订阅公开微信公众号文章。
- 服务端将不可信 HTML 转换为受约束的 `ArticleDocument`，插件不会直接注入原始网页 HTML。
- 提供专注阅读界面、阅读进度恢复、85% 自动已读、图片查看器和移动端单栏布局。
- 可一键保存 Markdown，并保留“我的笔记”和“我的摘录”；图片可下载到 Vault，也可保留远程地址。
- SQLite 持久化、定时同步、媒体代理缓存、数据库备份及健康检查均包含在自托管服务中。
- 微信功能不可用时会明确降级，不影响 RSS 的订阅和同步。

V1 不包含 AI、自动摘要、推荐系统、用户账号、Redis、Kafka、客户端遥测或系统推送。

## 工作方式

Obsidian Feed 由两个必需组件和一个可选上游组成：

```text
RSS / Atom ──────────────┐
                        │
公开微信文章 → WeRSS ───┼→ Feed Server → ArticleDocument / 媒体缓存
                        │                         │
                        └─────────────────────────┘
                                                  ↓
                                      Obsidian Feed 插件
                                      阅读 / 进度 / Markdown
```

- **Feed Server**：发现订阅源、执行同步、解析正文、保存 SQLite 数据并代理图片。
- **Obsidian 插件**：显示 Today、订阅列表与阅读器，保存本地阅读状态和 Markdown。
- **WeRSS（可选）**：用于解析并同步公开微信公众号来源，是管理员明确配置的可信上游。

插件不能脱离 Feed Server 单独工作。插件只连接你配置的 Feed Server；WeRSS 密钥仅保存在服务端，不会下发给插件。

## 环境要求

任选一种服务端部署方式：

- Docker 与 Docker Compose；或
- Node.js 22.5 及以上版本、pnpm 10。

插件要求 Obsidian 1.13.0 或更高版本，`isDesktopOnly=false`。移动设备必须能通过局域网、VPN 或 HTTPS 访问 Feed Server。

## 快速开始：Docker Compose

### 1. 准备配置

复制示例环境文件：

```sh
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

生成一个随机访问令牌：

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

把输出写入 `.env` 中的 `FEED_SERVER_TOKEN`。令牌至少需要 32 个字符，不要提交 `.env`。

### 2. 启动服务

```sh
docker compose up -d --build
```

默认监听 `43110` 端口，SQLite 数据库和媒体缓存保存在 Docker 的 `feed-data` volume 中。

检查容器状态：

```sh
docker compose ps
curl http://127.0.0.1:43110/health/live
```

`/health/live` 用于容器存活检查；`/health/ready`、`/v1/system/status` 和所有业务 API 都需要 Bearer token。

### 3. 停止或升级

```sh
docker compose down
git pull
docker compose up -d --build
```

不要在仍需保留数据时执行 `docker compose down -v`，该命令会删除数据 volume。

## 从源码运行

安装并构建：

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

Linux 或 macOS：

```sh
export FEED_SERVER_TOKEN="替换为至少32个字符的随机令牌"
pnpm --filter @obsidian-feed/server start
```

Windows PowerShell：

```powershell
$env:FEED_SERVER_TOKEN = "替换为至少32个字符的随机令牌"
pnpm --filter @obsidian-feed/server start
```

源码运行默认使用：

- 地址：`0.0.0.0:43110`
- 数据库：`data/feed.sqlite`
- 媒体目录：`data/`

## 安装 Obsidian 插件

先在仓库根目录执行 `pnpm build`，然后创建：

```text
<你的 Vault>/.obsidian/plugins/obsidian-feed/
```

将以下三个构建产物复制进去：

```text
apps/plugin/dist/main.js
apps/plugin/dist/manifest.json
apps/plugin/dist/styles.css
```

重新加载 Obsidian，在“设置 → 第三方插件”中启用 **Obsidian Feed**。随后进入插件设置并填写：

- **Server URL**：例如 `http://127.0.0.1:43110`。
- **Access token**：与服务端 `FEED_SERVER_TOKEN` 完全相同。
- **Save root**：保存文章的 Vault 目录，默认 `Feed`。
- **Image mode**：下载图片到 Vault，或保留服务端图片链接。
- **Reading**：字号、行高和正文宽度偏好。

可通过侧边栏 RSS 图标或命令面板中的 **Open Obsidian Feed** 打开插件。

### 手机和平板连接

移动设备上的 `127.0.0.1` 指向手机或平板本身，并不指向运行服务端的电脑。请改用：

- 同一局域网内的服务器地址，例如 `http://192.168.1.20:43110`；
- 私有 VPN 地址；或
- 配置了 HTTPS 的域名。

不建议将未加额外网络保护的 Feed Server 直接暴露到公网。若使用反向代理，请启用 HTTPS，同时继续保留应用的 Bearer token 验证。

## 添加订阅

在插件中选择添加订阅并粘贴：

- RSS 或 Atom feed 地址；
- 可发现 feed 的网站地址；
- 已配置 WeRSS 时的公开 `https://mp.weixin.qq.com/s/...` 文章地址。

添加过程分为“解析候选”和“确认订阅”两步。新订阅会进入定时同步，也可以在来源页面手动刷新。

## 配置微信公众号支持

微信公众号能力默认关闭。你需要自行部署和管理兼容的 WeRSS 服务，并让它与 Feed Server 网络互通。

在 `.env` 中同时设置：

```dotenv
WECHAT_ADAPTER=werss
WERSS_BASE_URL=http://werss:8001
WERSS_API_KEY=替换为你的密钥
```

三项必须同时存在。Docker 场景可将 WeRSS 容器连接到名为 `obsidian-feed` 的网络。

注意：

- WeRSS 能看到被解析的公开微信文章地址，并提供公众号与文章元数据。
- 上游字段只在 WeRSS adapter 边界内处理，不会扩散到公开 API 或 `ArticleDocument`。
- 401、429、网络故障和微信验证页会转换为明确的降级状态。
- 项目只读取无需交互即可公开访问的内容，不会绕过登录、验证码、付费墙或访问控制。
- 微信上游不可用不会阻止 RSS 来源继续工作。

## 环境变量

除 `FEED_SERVER_TOKEN` 外，其余项目均有默认值。WeRSS 的三个启用项必须一起配置。

| 变量                            | 默认值             | 说明                                                |
| ------------------------------- | ------------------ | --------------------------------------------------- |
| `HOST`                          | `0.0.0.0`          | 服务监听地址                                        |
| `PORT`                          | `43110`            | 服务监听端口                                        |
| `FEED_SERVER_TOKEN`             | 无                 | 必填，至少 32 个字符                                |
| `DATABASE_PATH`                 | `data/feed.sqlite` | SQLite 数据库路径                                   |
| `DATA_DIR`                      | `data`             | 媒体及运行数据目录                                  |
| `WECHAT_ADAPTER`                | 未启用             | 当前支持值为 `werss`                                |
| `WERSS_BASE_URL`                | 无                 | 管理员配置的 WeRSS 地址                             |
| `WERSS_API_KEY`                 | 无                 | WeRSS 密钥，仅服务端使用                            |
| `WERSS_REQUEST_TIMEOUT_MS`      | `15000`            | WeRSS 请求超时毫秒数                                |
| `WECHAT_INITIAL_BACKFILL_LIMIT` | `30`               | 微信来源首次回填上限                                |
| `WECHAT_SYNC_PAGE_SIZE`         | `20`               | 微信同步分页大小                                    |
| `WECHAT_SYNC_MAX_PAGES`         | `3`                | 单次微信同步最大页数                                |
| `WECHAT_PLAYWRIGHT_ENABLED`     | `false`            | 预留的浏览器抓取开关；V1 基线未启用浏览器抓取器     |
| `SYNC_TICK_SECONDS`             | `60`               | 调度器检查周期                                      |
| `SYNC_MAX_CONCURRENCY`          | `4`                | 全局同步并发上限                                    |
| `RSS_SYNC_INTERVAL_MINUTES`     | `30`               | RSS 正常同步间隔                                    |
| `WECHAT_SYNC_INTERVAL_MINUTES`  | `60`               | 微信正常同步间隔                                    |
| `EXTERNAL_FETCH_MAX_BYTES`      | `5242880`          | 外部响应上限配置；V1 内置 provider 同样限制为 5 MiB |
| `EXTERNAL_FETCH_MAX_REDIRECTS`  | `5`                | 外部请求最大重定向次数                              |
| `MEDIA_MAX_BYTES`               | `20971520`         | 单张媒体最大字节数                                  |
| `MEDIA_CACHE_MAX_BYTES`         | `2147483648`       | 预留的媒体缓存容量配置；V1 尚未自动执行容量清理     |
| `MEDIA_FETCH_TIMEOUT_MS`        | `15000`            | 媒体请求超时毫秒数                                  |

## 数据、备份与状态检查

服务端持久化以下数据：

- subscription、source 和 article metadata；
- 规范化的 `ArticleDocument`；
- 同步日志与状态；
- 媒体缓存。

插件本地保存阅读进度、已读状态、界面偏好以及用户主动保存的 Markdown、笔记和摘录。

源码部署在构建后可执行：

```sh
pnpm --filter @obsidian-feed/server status
pnpm --filter @obsidian-feed/server db:backup -- backups/feed-backup.sqlite
```

运行状态命令需要设置 `FEED_SERVER_TOKEN`，非默认地址还需设置 `FEED_SERVER_URL`。备份命令读取 `DATABASE_PATH`；目标文件必须尚不存在，以避免误覆盖。

Docker 部署可在容器中检查状态：

```sh
docker compose exec feed-server node dist/cli/status.js
```

建议定期备份 SQLite 数据库，并将备份复制到 Docker volume 之外的位置。

## 网络、安全与隐私

- 插件只连接用户配置的 Feed Server，不包含客户端遥测。
- Feed Server 会访问 RSS/Atom、公开文章地址、文章图片及可选的 WeRSS 上游。
- 外部 feed、正文和媒体请求会阻止 loopback、私网及 link-local 目标，并在重定向后重新校验。
- 正文和媒体都有大小、超时及类型限制；媒体仅接受允许的图片 MIME。
- Reader 使用受约束的结构化文档创建 DOM，不使用上游原始 `innerHTML`。
- Bearer token 保存在 Obsidian 插件数据中，并非硬件安全存储；能读取插件数据的人可能取得服务端访问权限。
- 数据库、媒体和文章内容由部署者自行保管；请保护数据目录及备份。

更完整的威胁边界与漏洞报告方式请阅读 [SECURITY.md](SECURITY.md)。

## Markdown 保存行为

保存文章后会生成带 frontmatter 的 `.md` 文件，并包含：

```markdown
## 我的笔记

## 我的摘录
```

再次保存同一篇文章时，已有笔记和摘录不会被覆盖。选择阅读器中的文字后，可以将内容追加到“我的摘录”。单张图片下载失败不会阻止正文文件保存。

## 开发与验证

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

工作区结构：

```text
apps/plugin/              Obsidian 插件
apps/server/              自托管 Feed Server
packages/content-model/   ArticleDocument 与规范化逻辑
packages/contracts/       API 数据契约
adr/                      项目架构决策记录
```

自动测试使用本地 RSS fixture、模拟 WeRSS 和模拟 Obsidian DOM，不要求真实第三方账号。

## 当前验证状态

已通过自动化 lint、格式检查、类型检查、测试和构建，并验证生产 bundle 能启动及返回健康状态。以下项目不能由自动化测试替代，目前明确标记为未验证：

- Docker 镜像实际构建与容器运行（当前开发环境未安装 Docker）；
- 真实 Obsidian 桌面主题兼容体验；
- 真实 iPhone、iPad 和 Android 核心阅读流程；
- 5 个 RSS、5 个微信公众号、100 篇以上文章及连续两天运行的 RC 手工体验。

因此当前仓库是 V1 候选版本，不代表真实设备验收已经完成。

## 版权与平台规则

请仅处理你有权访问和保存的内容。文章文字、图片及发布者标识仍归各自权利人所有。使用者应遵守来源站点的条款、版权要求、速率限制和访问控制。

本项目从零实现，不包含或复制启发项目的 GPL/MIT 源码和资源。

## License

项目使用 [MIT License](LICENSE)。
