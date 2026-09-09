# Obsidian Feed V1 — 微信公众号 Provider 规格

## 1. V1 决策

微信公众号不是标准开放 RSS 源，V1 不把平台逆向协议硬编码到主项目。

采用：

```text
Obsidian Feed Server
      ↓
WeChatProvider
      ↓
WeRssAdapter
      ↓
用户自托管 WeRSS
      ↓
微信公众号内容源
```

Adapter 可替换。插件永远只连 Feed Server。

## 2. 为什么默认 WeRSS Adapter

截至文档快照日期，`wufulin/wechat-mp-rss` 当前项目公开提供：

- 公众号 API；
- 文章 API；
- API Key / JWT；
- 定时采集；
- `web / api / app` 多种采集模式；
- 通过文章 URL 提取公众号 metadata 的接口；
- 添加公众号接口。

因此它适合作为 V1 **上游采集 sidecar**，而不是把其所有功能复制到本项目。

## 3. 配置

Feed Server：

```env
WECHAT_ADAPTER=werss
WERSS_BASE_URL=http://werss:8001
WERSS_API_KEY=werss_xxxxxxxxxxxxxxxxx
WERSS_REQUEST_TIMEOUT_MS=15000
```

如果没有配置：

- RSS 功能正常；
- 微信订阅入口可以显示，但识别时报 `WECHAT_PROVIDER_NOT_CONFIGURED`；
- Server health 显示 degraded，不应整体 unhealthy。

## 4. 鉴权

优先：

```http
X-API-Key: werss_xxx
```

Feed Server 日志不得输出 API Key。

## 5. 通过文章链接识别公众号

输入只允许：

- scheme `https`；
- host 为微信文章允许域名集合（V1 至少 `mp.weixin.qq.com`）；
- 路径符合文章形式。

流程：

```text
POST /v1/subscriptions/resolve
body.url = mp.weixin.qq.com/...
        ↓
WeChatProvider.resolveSource
        ↓
WeRssAdapter.resolveByArticleUrl
        ↓
POST {WERSS}/api/v1/wx/mps/by_article?url=<encoded>
        ↓
映射 WeRSS response
        ↓
ResolvedSource
```

注意：WeRSS 的 response 外层可能有项目自己的 `success_response` 包装。Adapter 必须用 Zod 明确验证，不要假定字段永远存在。

## 6. 添加/确保公众号存在

WeRSS 当前 `POST /api/v1/wx/mps` 的核心输入可映射为：

```json
{
  "mp_name": "公众号名称",
  "mp_cover": "...",
  "mp_id": "上游识别结果中的编码ID",
  "avatar": "...",
  "mp_intro": "..."
}
```

实现要求：

1. 先解析文章链接；
2. 调 `POST /mps`；
3. 对“已存在”结果视为 idempotent success；
4. 保存 upstream source id 到 `provider_meta_json`；
5. 不保存 WeRSS 用户密码；只保存 Feed Server 配置里的 API Key。

## 7. 列出文章

使用 WeRSS：

```http
GET /api/v1/wx/articles?mp_id=<id>&limit=...&offset=...
```

Adapter 只依赖：

- article id；
- title；
- link/url；
- publish_time；
- author（若有）；
- cover/pic（若有）；
- content（若上游有）。

对上游 response 做兼容解析层，业务层禁止直接 import WeRSS 类型。

V1 同步每次最多读取最近 2–3 页，依靠 watermark 去重。首次回填默认最近 30 篇；不要默认抓全部历史。

可配置：

```env
WECHAT_INITIAL_BACKFILL_LIMIT=30
WECHAT_SYNC_PAGE_SIZE=20
WECHAT_SYNC_MAX_PAGES=3
```

## 8. 正文获取策略

顺序：

### A. 上游已有完整 content

如果 WeRSS article response 有可靠正文：

- 作为 `rawContent`；
- 仍必须进入我们的 WeChat parser；
- 不直接返回上游 HTML。

### B. 上游只有 URL/metadata

Feed Server 对文章 canonical URL 做正文抓取。

#### Direct HTTP

- SSRF guard；
- timeout 15s；
- body max 5MB；
- accept text/html；
- 合理、非伪造安全用途的 UA；
- 解析页面。

#### Optional Playwright fallback

仅当 `WECHAT_PLAYWRIGHT_ENABLED=true` 且 direct HTML 明显不是文章正文时使用：

- Chromium context；
- 单页超时 20s；
- 禁止下载；
- 禁止弹窗；
- 不自动填验证码；
- 不绕过登录；
- 拿到静态 DOM 后立即关闭 page；
- 并发默认 1。

如果遇到验证码/登录/访问控制：返回 `CONTENT_BLOCKED`，不要继续绕过。

## 9. 手动刷新

插件请求我们的：

```http
POST /v1/sources/:id/refresh
```

Feed Server：

1. 检查 source；
2. 检查最短刷新间隔；
3. 如果 Adapter 支持 `requestRefresh`，调用上游；
4. 再执行增量同步；
5. 返回 accepted / throttled。

不允许用户连续点刷新造成上游风控。

## 10. 状态映射

| WeRSS/网络现象 | SourceStatus | API code |
|---|---|---|
| 正常 | active | - |
| 401/授权失效 | needs_auth | WECHAT_AUTH_REQUIRED |
| 429/明确频率限制 | rate_limited | WECHAT_RATE_LIMITED |
| 上游 5xx | unavailable | WECHAT_UPSTREAM_UNAVAILABLE |
| 正文 URL 失效 | active | ARTICLE_CONTENT_UNAVAILABLE（文章级） |
| parser 失败 | parse_error（连续失败阈值后） | ARTICLE_PARSE_FAILED |

## 11. 风控策略

我们的 Scheduler 不应该与 WeRSS 自己的 Scheduler 互相疯狂触发。

推荐：

- Feed Server 默认每 30–120 分钟读取一次上游文章列表；
- 不每次都触发 WeRSS 立即采集；
- `requestRefresh` 手动触发至少间隔 10 分钟；
- 429 后至少 1 小时冷却，并尊重 Retry-After；
- 连续失败指数退避，最大 12 小时。

## 12. 订阅取消

取消只在 Obsidian Feed DB 中把 subscription disabled。

V1 **不自动删除 WeRSS 中的公众号**，因为：

- 可能被其他工具共享；
- 上游数据不属于本项目独占；
- 删除是高影响行为。

以后可以增加显式“同时从采集服务删除”。

## 13. 隐私提示

设置页必须说明：

- 微信公众号采集依赖用户配置的自托管/自信任上游；
- 该上游可能持有微信相关登录凭据；
- Obsidian Feed 自身只持有访问该上游所需 API Key；
- 不建议把个人采集服务公开到互联网且无鉴权。

## 14. Adapter tests

必须用 fixture/mock server 测试：

- `by_article` 正常映射；
- invalid article URL 不请求 upstream；
- 401 → auth required；
- 429 → rate limited；
- add idempotency；
- articles pagination；
- 上游字段缺失 → schema error，不 crash server；
- content 有/无两种路径；
- API key 不出现在 error serialization。
