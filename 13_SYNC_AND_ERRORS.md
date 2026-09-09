# Obsidian Feed V1 — 同步调度、状态机与错误模型

## 1. Scheduler 目标

- 新文章能在合理时间出现；
- 不高频冲击微信采集服务；
- 单源故障隔离；
- 可解释；
- 可手动刷新但有节流。

## 2. 调度模型

Server 内一个轻量 scheduler loop：

```text
每 60 秒 tick
→ SELECT enabled subscriptions + source.next_sync_at <= now
→ 按 next_sync_at 排序
→ 最大并发 N
→ syncOneSource
```

默认：

```text
SYNC_TICK_SECONDS=60
SYNC_MAX_CONCURRENCY=4
WECHAT_SYNC_CONCURRENCY=1
RSS_SYNC_CONCURRENCY=4
```

## 3. 基础 interval

RSS：

- active：30min；
- 长期无更新可逐步 60/120min。

WeChat：

- 默认 60min；
- 活跃源最低 30min；
- 长期无更新 120/240min；
- 具体采集服务可能自己也调度，因此不应默认强制 refresh upstream。

## 4. Jitter

`next = base * random(0.9, 1.1)`。

避免整点同秒请求。

## 5. Adaptive policy

成功有新文章：

- `consecutive_failures=0`；
- interval 回到 source type 正常值。

成功无新文章连续 N 次：

- 3 次 → *1.5；
- 6 次 → *2；
- 上限由类型决定。

## 6. Failure backoff

retryable failure：

```text
1 → 15m
2 → 30m
3 → 1h
4 → 2h
5 → 4h
>=6 → 8h/12h cap
```

429：尊重 `Retry-After`，否则微信至少 1h，RSS 至少 15m。

Auth required：

- status = needs_auth；
- 自动同步暂停 12h 一次健康探测或直到用户手动触发；
- 不每分钟重试。

## 7. State machine

```text
active
  ├─429────────────► rate_limited
  ├─401/auth────────► needs_auth
  ├─network/5xx─────► unavailable (after threshold)
  ├─parse repeated──► parse_error
  └─user disable────► disabled

rate_limited ─success► active
needs_auth ─success──► active
unavailable ─success► active
parse_error ─success► active
```

单篇 article parse 失败不立即把整个 source 标记 parse_error。建议同 source 最近 5 篇 >=3 篇 parse fail 才 source-level parse_error。

## 8. syncOneSource pseudo flow

```ts
async function syncOneSource(sourceId: string) {
  const source = await repo.getSource(sourceId);
  const log = await syncLog.start(source);

  try {
    const provider = registry.getByKey(source.providerKey);
    const pages = await provider.syncSource(...);
    const stats = await ingest(pages);
    await policy.markSuccess(source, stats);
    await log.success(stats);
  } catch (err) {
    const normalized = normalizeProviderError(err);
    await policy.markFailure(source, normalized);
    await log.failure(normalized);
  }
}
```

## 9. Ingest

对每个 article：

1. normalize canonical URL；
2. upsert metadata；
3. 若新 article 或 content stale → enqueue/inline fetch body；
4. parse；
5. store document；
6. 单篇失败记录 article status，不中断整页其余文章。

V1 不需要独立 Redis queue。可以用进程内 bounded task pool。

## 10. Restart semantics

进程重启：

- DB 保留 next_sync_at；
- 启动 5–15 秒随机 delay 后 scheduler 生效；
- 过期 sources 分批执行；
- 不在 startup 同时同步所有来源。

## 11. Manual refresh

- source minimum interval；
- if currently syncing → 返回 `already_running`；
- if cooldown → 429；
- accepted 后可以同步执行到 15s 或异步返回 accepted；V1 推荐异步 job in process，API 立即返回。

## 12. Error codes

API stable codes：

```text
AUTH_INVALID
SOURCE_NOT_FOUND
SUBSCRIPTION_NOT_FOUND
UNSUPPORTED_SOURCE
INVALID_SOURCE_URL
RSS_DISCOVERY_FAILED
RSS_PARSE_FAILED
WECHAT_PROVIDER_NOT_CONFIGURED
WECHAT_AUTH_REQUIRED
WECHAT_RATE_LIMITED
WECHAT_UPSTREAM_UNAVAILABLE
ARTICLE_CONTENT_UNAVAILABLE
ARTICLE_CONTENT_BLOCKED
ARTICLE_PARSE_FAILED
SOURCE_REFRESH_THROTTLED
MEDIA_NOT_FOUND
MEDIA_FETCH_FAILED
SSRF_BLOCKED
UPSTREAM_TIMEOUT
INTERNAL_ERROR
```

## 13. User-facing Chinese message mapping

插件自己维护稳定文案，不直接把 server English/message 原样甩给用户。

例：

```ts
WECHAT_AUTH_REQUIRED -> "微信公众号采集服务需要重新授权"
WECHAT_RATE_LIMITED -> "公众号同步暂时受到频率限制，稍后会自动重试"
ARTICLE_CONTENT_BLOCKED -> "这篇文章当前无法获取正文，可以打开原文阅读"
```

## 14. Log redaction

必须 redact：

- Authorization；
- X-API-Key；
- token query；
- WeRSS credentials；
- cookie；
- 微信敏感 bearer/token。
