# Obsidian Feed V1 — 部署规范

## 1. 推荐拓扑

### Docker Compose

```text
compose
├── feed-server
└── werss (可选但微信功能需要)
```

SQLite 数据 volume 分开。

## 2. Server Docker

Multi-stage：

```text
node:22-slim build
→ pnpm install --frozen-lockfile
→ build
→ production image
```

如果启用 Playwright fallback，单独提供：

- `Dockerfile.playwright` 或 build arg；
- 基于官方 Playwright image；
- 不让默认轻量镜像被浏览器膨胀。

## 3. Ports

默认：

```text
Feed Server: 43110
WeRSS: 8001
```

Feed Server 容器访问 WeRSS：`http://werss:8001`。

WeRSS 不一定需要直接暴露到公网。

## 4. docker-compose 示例逻辑

```yaml
services:
  feed-server:
    build: ./apps/server
    ports:
      - "43110:43110"
    environment:
      FEED_SERVER_TOKEN: ${FEED_SERVER_TOKEN}
      DATABASE_PATH: /data/feed.sqlite
      DATA_DIR: /data
      WECHAT_ADAPTER: werss
      WERSS_BASE_URL: http://werss:8001
      WERSS_API_KEY: ${WERSS_API_KEY}
    volumes:
      - feed_data:/data
```

WeRSS 的部署遵循其项目自己的当前文档，Obsidian Feed 不复制其认证/登录实现。

## 5. Environment variables

### Required server

```env
PORT=43110
HOST=0.0.0.0
FEED_SERVER_TOKEN=<random>
DATABASE_PATH=/data/feed.sqlite
DATA_DIR=/data
```

### WeChat

```env
WECHAT_ADAPTER=werss
WERSS_BASE_URL=http://werss:8001
WERSS_API_KEY=<secret>
WERSS_REQUEST_TIMEOUT_MS=15000
WECHAT_INITIAL_BACKFILL_LIMIT=30
WECHAT_SYNC_PAGE_SIZE=20
WECHAT_SYNC_MAX_PAGES=3
WECHAT_PLAYWRIGHT_ENABLED=false
```

### Sync

```env
SYNC_TICK_SECONDS=60
SYNC_MAX_CONCURRENCY=4
RSS_SYNC_INTERVAL_MINUTES=30
WECHAT_SYNC_INTERVAL_MINUTES=60
```

### Media

```env
MEDIA_MAX_BYTES=20971520
MEDIA_CACHE_MAX_BYTES=2147483648
```

## 6. Token generation

文档提供：

```bash
openssl rand -hex 32
```

或者 Node crypto 脚本。

## 7. Phone access

iPhone Obsidian 要访问 server：

推荐优先级：

1. Tailscale 等私有网络；
2. 家庭局域网 + HTTPS/受信网络；
3. 反代到 HTTPS 域名 + 强 token。

不要推荐开放 `http://公网IP:43110`。

## 8. Reverse proxy

Nginx/Caddy：

- HTTPS；
- request body 小限制（API JSON 很小）；
- media response 不被错误截断；
- access log 同样避免 Authorization；
- WebSocket 不需要。

## 9. Backup

至少备份：

```text
/data/feed.sqlite (安全 SQLite backup)
/data/media/ (可选，可重新抓)
```

最重要的是 DB；media 是 cache，可以丢。

WeRSS 数据和凭据按 WeRSS 自己方法单独备份。

## 10. Restore

1. 停 server；
2. 恢复 SQLite backup；
3. 确保 migration version 不高于当前 binary；
4. 启动；
5. `/health/ready`；
6. 手动刷新一个 RSS；
7. 验证微信 adapter health。

## 11. Plugin distribution

开发：

```text
apps/plugin/main.js
apps/plugin/manifest.json
apps/plugin/styles.css
```

复制到：

```text
<Vault>/.obsidian/plugins/obsidian-feed/
```

正式发布可 GitHub Release + Community Plugin 提交。

## 12. Upgrade

Server：

- backup；
- pull image；
- run migrations；
- readiness；
- 回滚 image 时注意 schema backward compatibility。

Plugin：

- PluginData version migration；
- 旧阅读状态保留。
