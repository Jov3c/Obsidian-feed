# Obsidian Feed V1 — REST API 规格

机器可读版本见 `schemas/openapi.yaml`。

## 1. Base

```text
/v1
```

Content-Type：`application/json; charset=utf-8`。

鉴权：

```http
Authorization: Bearer <FEED_SERVER_TOKEN>
```

## 2. Error shape

```json
{
  "error": {
    "code": "SOURCE_NOT_FOUND",
    "message": "Source not found",
    "retryable": false,
    "retryAfterSeconds": null,
    "requestId": "req_xxx"
  }
}
```

生产环境不返回 stack。

## 3. Health

### `GET /health/live`

无需鉴权。

```json
{"status":"ok"}
```

### `GET /health/ready`

需要鉴权或仅内网；实现时可选择鉴权，文档建议鉴权。

```json
{
  "status":"ok",
  "database":"ok",
  "wechat":"ok|degraded|disabled"
}
```

## 4. Resolve subscription

### `POST /v1/subscriptions/resolve`

Request：

```json
{"input":"https://mp.weixin.qq.com/s/..."}
```

Response：

```json
{
  "candidate": {
    "kind":"wechat",
    "providerKey":"wechat-werss",
    "name":"机器之心",
    "canonicalUrl":null,
    "avatarUrl":"https://...",
    "externalId":"...",
    "resolutionToken":"signed-short-lived-token"
  }
}
```

### resolutionToken

为了不让客户端提交伪造 provider meta，resolve 返回服务端签名 token：

- TTL 10 分钟；
- 内容包含 provider key + resolved candidate；
- HMAC secret 使用 server token 派生或独立 secret；
- subscribe 时验证。

## 5. Create subscription

### `POST /v1/subscriptions`

```json
{"resolutionToken":"..."}
```

返回：

```json
{
  "subscription": {
    "id":"sub_xxx",
    "enabled":true,
    "source": { ... }
  }
}
```

语义幂等：同 source 重复订阅返回已有 subscription，200/201 均可，但 OpenAPI 固定 200 更简单。

## 6. List subscriptions

### `GET /v1/subscriptions`

返回 enabled/disabled 和 source status。

默认只返回 enabled；`?includeDisabled=true` 可显示历史。

## 7. Delete subscription

### `DELETE /v1/subscriptions/:id`

语义：disable，不删除 source/articles。

Response 204。

## 8. List articles

### `GET /v1/articles`

Query：

```text
limit=1..50 default30
cursor=<opaque>
sourceId=<optional>
```

V1 不加全文搜索参数。

Response：

```json
{
  "items": [
    {
      "id":"art_xxx",
      "title":"...",
      "author":"...",
      "canonicalUrl":"...",
      "publishedAt":"...",
      "contentStatus":"ready",
      "source": {
        "id":"src_xxx",
        "type":"wechat",
        "name":"机器之心",
        "avatarUrl":"..."
      }
    }
  ],
  "nextCursor":"..."
}
```

Cursor 包含排序键并签名/编码；不要使用 offset 作为客户端无限分页主方案。

## 9. Article detail

### `GET /v1/articles/:id`

返回 metadata + ArticleDocument。

如果 content unavailable：HTTP 200，`document=null`，`contentStatus=unavailable`；文章存在不是 404。

只有 article id 不存在才 404。

## 10. Refresh source

### `POST /v1/sources/:id/refresh`

Response：

```json
{
  "status":"accepted",
  "sourceId":"src_xxx"
}
```

如果 cooldown：429：

```json
{
  "error": {
    "code":"SOURCE_REFRESH_THROTTLED",
    "retryable":true,
    "retryAfterSeconds":420
  }
}
```

## 11. Source status

### `GET /v1/sources/:id/status`

```json
{
  "id":"src_xxx",
  "status":"needs_auth",
  "lastSyncedAt":"...",
  "nextSyncAt":"...",
  "lastError": {
    "code":"WECHAT_AUTH_REQUIRED",
    "message":"微信公众号采集服务需要重新授权"
  }
}
```

不要返回 upstream credentials。

## 12. Media

### `GET /v1/media/:id`

- 返回实际媒体 bytes；
- `Cache-Control`；
- ETag；
- 支持 If-None-Match；
- media route 的 id 必须只定位 DB 记录，不能接受任意 URL query。

## 13. Rate limit

V1 server 单用户：

- 全局 120 req/min 作为合理默认；
- refresh route 单独限制；
- media GET 不与 JSON API 使用同一低限额，但需要并发限制。

## 14. Request ID

每个请求生成 request id；日志和 error response 关联。

## 15. CORS

Obsidian plugin `requestUrl()` 不依赖普通浏览器 CORS 的方式与环境不同，但 server 仍不应 `Access-Control-Allow-Origin: *` 无条件开放。

V1 默认不启用浏览器跨域。若调试 UI 需要，开发环境显式配置。
