# Obsidian Feed V1 — 安全、隐私与合规边界

## 1. 威胁模型

不信任：

- 用户粘贴的 URL；
- RSS XML；
- RSS 中 HTML；
- 微信文章 HTML；
- WeRSS response；
- 图片 URL；
- 外部重定向；
- 文件名；
- Markdown 特殊字符。

## 2. SSRF

所有服务端外部 URL 请求必须经过统一 `SafeHttpClient`，禁止业务模块直接 `fetch()`。

### URL rules

允许：`http`, `https`。

拒绝：

- localhost；
- loopback；
- link-local；
- RFC1918 private ranges；
- IPv6 loopback/link-local/ULA；
- `.local`；
- `file:`, `ftp:`, `gopher:` 等；
- embedded credentials `http://user:pass@host`。

### DNS rebinding

每次连接前解析 host：

- 所有解析 IP 都必须通过 public-address policy；
- redirect 后重新验证；
- HTTP client 尽可能 pin validated resolution / 使用安全 agent；
- 不能只在字符串层判断 `10.`。

### 自托管内网例外

WeRSS base URL 可能是 Docker 内网 `http://werss:8001`，它是**管理员显式配置的 trusted upstream**，不走用户 URL SSRF policy。分两个 client：

- `TrustedUpstreamClient`：只用于管理员配置的固定 base URL；
- `SafeExternalHttpClient`：用于 RSS、文章、媒体 URL。

不要混用。

## 3. XSS

最佳防御：ArticleDocument 无 raw HTML。

Renderer：

- text 使用 text nodes；
- code 使用 `textContent`；
- URL validate；
- 不 `innerHTML = raw`；
- 不执行 script/style/iframe；
- 不支持 arbitrary HTML block。

## 4. XML

- 禁 DTD；
- 禁 external entity；
- body 5MB；
- parser node/depth bounds；
- 不允许 XML 引用本地文件。

## 5. API token

Server token：

- 至少 32 random bytes；
- 文档示例不放真实 token；
- log redaction；
- 插件 password field；
- 支持 server 轮换，轮换后插件需更新；
- 不通过 URL query 传 token。

## 6. WeRSS API key

只在 Feed Server 环境变量/secret 中。

不得：

- API response 返回；
- 传到 Obsidian；
- 写 sync log；
- 写 exception message 未脱敏。

## 7. HTTPS

场景：

### 同机 desktop

`127.0.0.1` HTTP 可接受。

### 局域网 / 手机

推荐：

- Tailscale/ZeroTier/private VPN；或
- 反向代理 HTTPS。

不要建议直接把无 TLS 的 API token 暴露到公网。

## 8. Content copyright / platform constraints

产品设计目标为用户个人、自托管阅读和知识沉淀。

项目不得默认：

- 建设公开全文镜像；
- 批量向公众再分发第三方全文；
- 绕过登录、验证码、付费墙；
- 绕过平台访问控制；
- 规避权利方删除要求。

README 必须声明用户应遵守内容来源的平台条款、知识产权和当地法律。

WeRSS 当前项目本身也强调私有自托管和谨慎全文采集；本项目保持同样保守边界。

## 9. Obsidian community policy

准备上架社区插件时：

- 必须有 LICENSE；
- README 披露网络访问；
- 不做客户端 telemetry；
- 不动态加载广告；
- 不自行安装/更新依赖；
- 不混淆代码隐藏目的。

## 10. Telemetry

V1：无 telemetry。

Server 只记录运行日志与同步日志，不上报第三方 analytics。

## 11. Logs

日志允许：

- source id；
- provider key；
- status；
- duration；
- request id；
- HTTP status；
- host（可记录）。

日志禁止：

- bearer token；
- cookie；
- API key；
- 完整可能包含敏感 query 的 URL；
- 全文文章内容。

## 12. File write safety

Vault path：

- normalize；
- sanitize path segments；
- 必须保持在 vault 内；
- 禁止 `../` escape；
- 不用原文标题直接作为未清洗系统路径。

Server media path：

- id → DB → known local path；
- media route 不接受用户提供磁盘路径。

## 13. Dependency policy

- lockfile 提交；
- 定期 audit；
- 不引入无人维护且拥有网络/HTML 高权限的依赖，除非必要；
- HTML parser/security 依赖升级要跑 fixtures；
- 不使用 postinstall 下载未知二进制；Playwright 作为显式可选部署能力。
