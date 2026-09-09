# Obsidian Feed V1 — 数据库规格

## 1. 技术选择

- SQLite；
- Node.js `node:sqlite`；
- Drizzle ORM；
- WAL mode；
- foreign keys ON；
- migrations checked into repo。

V1 不使用 Redis。

## 2. 表

```text
sources
subscriptions
articles
article_contents
sync_logs
media_cache
```

## 3. sources

字段：

```text
id TEXT PK
source_type TEXT NOT NULL CHECK rss|wechat
name TEXT NOT NULL
canonical_url TEXT
avatar_url TEXT
external_id TEXT
provider_key TEXT NOT NULL
provider_meta_json TEXT NOT NULL DEFAULT '{}'
status TEXT NOT NULL
last_synced_at TEXT
next_sync_at TEXT
consecutive_failures INTEGER NOT NULL DEFAULT 0
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

索引：

- `(provider_key, external_id)` unique when external_id not null；
- `next_sync_at`；
- `status`。

## 4. subscriptions

```text
id TEXT PK
source_id TEXT NOT NULL FK sources(id)
enabled INTEGER NOT NULL DEFAULT 1
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

`source_id` unique。

取消订阅：`enabled=0`。

## 5. articles

```text
id TEXT PK
source_id TEXT NOT NULL FK sources(id)
external_id TEXT
canonical_url TEXT NOT NULL
title TEXT NOT NULL
author TEXT
cover_url TEXT
published_at TEXT
fetched_at TEXT NOT NULL
content_hash TEXT
content_status TEXT NOT NULL
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

唯一性：

- `(source_id, external_id)` partial unique when external_id exists；
- `(source_id, canonical_url)` unique。

索引：

- `(published_at DESC, id DESC)`；
- `(source_id, published_at DESC)`；
- `content_status`。

## 6. article_contents

```text
article_id TEXT PK FK articles(id) ON DELETE CASCADE
document_json TEXT
raw_snapshot_path TEXT
parser TEXT
parser_version TEXT
parse_confidence REAL
parse_diagnostics_json TEXT NOT NULL DEFAULT '{}'
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

`raw_snapshot_path` 默认 null。V1 生产环境默认不长期保留第三方原始 HTML；测试 fixtures 另算。

## 7. sync_logs

```text
id TEXT PK
source_id TEXT FK sources(id)
provider_key TEXT NOT NULL
started_at TEXT NOT NULL
finished_at TEXT
status TEXT NOT NULL
new_articles INTEGER NOT NULL DEFAULT 0
updated_articles INTEGER NOT NULL DEFAULT 0
error_code TEXT
error_message TEXT
duration_ms INTEGER
created_at TEXT NOT NULL
```

保留策略：默认 30 天或 5000 条，以先到者为准。

## 8. media_cache

```text
id TEXT PK
original_url TEXT NOT NULL UNIQUE
local_path TEXT
mime_type TEXT
size_bytes INTEGER
sha256 TEXT
etag TEXT
last_modified TEXT
status TEXT NOT NULL
last_accessed_at TEXT
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

status：`pending|ready|failed`。

## 9. ID 生成

使用项目自己的 `newId(prefix)`：

```text
src_<uuidv7/cuid2>
sub_<...>
art_<...>
sync_<...>
med_<...>
```

禁止把数据库自增整数暴露为 API 主 ID。

## 10. 时间

数据库统一 ISO 8601 UTC：

```text
2026-09-09T03:22:11.123Z
```

UI 根据本地时区显示。

上游秒/毫秒 timestamp 必须在 Adapter 边界转换。

## 11. Transaction

单次 source sync：

- 外部网络抓取不要持有 DB transaction；
- 得到一页结果后短事务 upsert；
- article metadata 与 content 可以分阶段提交；
- content parse 失败不回滚已成功的 metadata。

## 12. Upsert

文章匹配顺序：

1. external id；
2. canonical URL；
3. 仅在两者缺失时 fallback hash。

如果标题更新：更新 metadata；
如果 content hash 不变：不重写 document_json。

## 13. SQLite pragmas

启动：

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

## 14. Migration

Server 启动行为：

- production 不自动 destructive migration；
- 容器 entrypoint 执行 `drizzle-kit migrate` 或项目 migration runner；
- migration 失败 → server 不监听业务端口；
- `/health/live` 可仍显示 process alive，但 `/health/ready` false。

## 15. 备份

SQLite 文件和 WAL 在备份时必须使用安全方式：

- 推荐 server CLI `pnpm db:backup` 使用 SQLite backup API / VACUUM INTO；
- 不建议在高写入时直接裸 copy db + 忽略 WAL。
