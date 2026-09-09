# Obsidian Feed V1 — 运维与排障

## 1. Health

### live

进程能响应。

### ready

- DB query ok；
- migrations ok；
- media dir writable；
- WeChat adapter health 只影响 degraded，不影响 RSS readiness（除非配置要求 strict）。

## 2. Logging

JSON structured log：

```json
{
  "level":"info",
  "event":"source_sync_finished",
  "sourceId":"src_xxx",
  "provider":"wechat-werss",
  "durationMs":1204,
  "newArticles":2,
  "requestId":"..."
}
```

## 3. Log levels

- debug：开发 parser diagnostics；
- info：sync start/end、server lifecycle；
- warn：rate limited、partial parse、media fetch failure；
- error：unexpected provider/server errors。

## 4. Diagnostics endpoint

V1 不做大型 admin UI，但可以提供鉴权 CLI/endpoint：

```text
GET /v1/system/status
```

返回：

- version；
- uptime；
- db size；
- media cache size；
- enabled subscriptions count；
- sources by status；
- last scheduler tick；
- adapter health。

不返回 credentials。

## 5. CLI commands

Server package 建议：

```text
pnpm server:status
pnpm db:backup
pnpm db:vacuum
pnpm sync:source <id>
pnpm parser:reparse <article-id>
pnpm parser:reparse --parser wechat-parser --before-version 1.1.0
```

CLI 直接复用 service layer，不复制业务逻辑。

## 6. Common incidents

### RSS 全部不更新

检查：

- scheduler tick；
- DB lock；
- outbound DNS/network；
- SSRF policy 是否误判。

### 只有微信不更新

检查：

- `/health/ready` wechat；
- WERSS_BASE_URL；
- API key；
- WeRSS login/auth；
- rate limited；
- 上游是否本身已抓到新文章。

### 文章有列表无正文

检查：

- `content_status`；
- sync log；
- parser diagnostics；
- direct fetch status；
- Playwright 是否启用；
- 是否是 blocked/login page。

### 图片失败

检查：

- media status；
- upstream host；
- MIME；
- size limit；
- disk space。

## 7. Maintenance

每周/自动：

- prune sync logs；
- media LRU；
- SQLite optimize；
- orphan media records cleanup。

每月：

- backup restore drill；
- dependency updates；
- parser fixture review。
