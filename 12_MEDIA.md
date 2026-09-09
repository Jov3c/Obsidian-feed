# Obsidian Feed V1 — 媒体代理与缓存规范

## 1. 目的

让插件不需要理解微信 CDN、Referer、图片懒加载、过期 URL，同时避免阅读时把全部图片下载进 Vault。

## 2. 流程

```text
Parser sees image URL
       ↓
MediaService.register(url)
       ↓
med_xxx
       ↓
ArticleDocument.src = /v1/media/med_xxx
       ↓
Reader lazy loads
       ↓
MediaService fetch/cache/serve
```

## 3. Registration

`registerRemote(url)`：

1. URL normalize；
2. SSRF guard；
3. hash URL；
4. existing record reuse；
5. 创建 `pending` record；
6. 不必同步下载，允许 lazy fetch。

## 4. Fetch

GET media 时：

1. 查 DB；
2. ready + file exists → serve；
3. pending/missing → fetch；
4. validate final redirect URL；
5. enforce body limit；
6. MIME sniff/validate；
7. stream 到 temp；
8. SHA-256；
9. atomic rename；
10. DB ready；
11. serve。

同 media id 并发请求使用 single-flight，避免重复下载。

## 5. Limits

默认：

```text
MEDIA_MAX_BYTES=20971520        # 20MB
MEDIA_FETCH_TIMEOUT_MS=15000
MEDIA_MAX_REDIRECTS=5
MEDIA_CACHE_MAX_BYTES=2147483648 # 2GB
```

## 6. MIME allowlist

V1 serve：

- image/jpeg；
- image/png；
- image/gif；
- image/webp；
- image/avif（客户端支持则）；

SVG 默认拒绝/不代理，避免脚本/复杂安全面。未来若支持，必须 sanitize SVG。

音视频 V1 不做完整播放器。如果文章有 video/audio：

- parser 可以保留外部链接文本；
- 不缓存视频；
- 不把 iframe 放入 ArticleDocument。

## 7. Cache path

```text
<data-dir>/media/ab/cd/<sha256>.<ext>
```

不使用原始文件名。

## 8. Response headers

```text
Content-Type: validated mime
Content-Length
ETag: "<sha256>"
Cache-Control: private, max-age=86400
X-Content-Type-Options: nosniff
```

支持 304。

## 9. Cache eviction

后台每日/启动时低频：

- 总大小 > max → 按 `last_accessed_at` LRU 删除；
- 先删长期未访问；
- 不删除正在 fetch 的 temp；
- DB status 更新；
- 文章仍可在下次访问重新拉。

## 10. Failed images

失败后：

- status=failed；
- 保存最近错误码，不保存完整敏感 URL 到普通 log（可 hash/截断）；
- 1h 后允许 retry；
- Reader 显示图片加载失败，不影响正文。

## 11. QR/footer images

二维码是否属于正文由 parser 在注册 media 之前判断。MediaService 不做视觉语义识别。

## 12. GIF

保留原始 gif；不转 jpg。Reader 正常动画。

## 13. Privacy

使用代理意味着 Feed Server 会访问原始图片 host，但 Obsidian 客户端不会直接把用户 IP 暴露给每个图片站点（取决于 server 部署位置）。README 说明媒体代理行为。
