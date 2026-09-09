# Obsidian Feed V1 — 测试策略

## 1. 原则

本项目最容易“看起来能用、实际不稳”的位置是：

1. 微信响应变化；
2. 正文解析；
3. Markdown 导出；
4. 移动端阅读状态；
5. SSRF/XSS；
6. 同步去重与退避。

因此这些必须有自动测试。

## 2. Test pyramid

### Unit

- URL normalize；
- SSRF policy；
- candidate score；
- block normalize；
- Markdown converter；
- path sanitizer；
- sync policy；
- error mapping；
- cursor encode/decode。

### Integration

- Fastify route + SQLite；
- Provider mock server；
- WeRSS adapter；
- RSS fetch；
- media cache；
- migrations。

### Plugin unit/integration

使用 jsdom/happy-dom 或可兼容环境测试纯 DOM renderer；Obsidian API 用薄 mock。

### Manual/E2E

真实 Obsidian desktop + iOS/Android device checklist。

## 3. Required fixtures

### RSS

- RSS 2.0 full content；
- Atom；
- description only；
- duplicate GUID；
- malformed date；
- relative URLs；
- XXE attempt；
- 6MB oversize。

### WeChat

- text-heavy；
- many nested section；
- image-heavy；
- QR footer；
- code/table；
- short article；
- blocked/login page；
- malformed/truncated HTML；
- duplicated footer；
- data-src images。

## 4. Parser tests

不要只 snapshot 整个 JSON。写语义 assertion：

```ts
expect(doc.title).toBe("...");
expect(allText(doc)).toContain("正文关键句");
expect(allText(doc)).not.toContain("长按识别二维码");
expect(doc.blocks.filter(b => b.type === "image")).toHaveLength(3);
expect(result.confidence).toBeGreaterThan(0.8);
```

同时可以 snapshot block type sequence：

```text
paragraph,paragraph,image,heading,paragraph
```

## 5. Security tests

### SSRF cases

必须拒绝：

```text
http://127.0.0.1
http://localhost
http://169.254.169.254
http://10.0.0.1
http://[::1]
http://2130706433 (numeric variants if URL parser resolves)
redirect public → private
DNS resolves public+private mixed
```

### XSS article

Input 包含：

- `<script>`；
- `onerror`；
- `javascript:`；
- malicious SVG；
- CSS expression-like payload。

输出 ArticleDocument 不得包含可执行内容。

Renderer DOM 不得产生 script/event handlers。

## 6. Database tests

- migration from empty；
- source external id unique；
- article canonical URL unique per source；
- cancel subscription 不 cascade delete article；
- article delete cascades content；
- WAL pragma applied；
- concurrent read during sync。

## 7. Sync tests

Fake clock：

- success no articles；
- success new article；
- repeated empty increases interval；
- 429 respects Retry-After；
- auth sets needs_auth；
- network 5xx backoff；
- one article parse failure does not fail entire source；
- duplicate article does not duplicate DB；
- process restart respects persisted nextSyncAt。

## 8. API contract tests

对 `schemas/openapi.yaml`：

- route path/method 都存在；
- response DTO 通过 Zod；
- errors shape stable；
- list endpoint 不含 `document`；
- detail endpoint document version = 1；
- 401 missing token；
- token redacted logs。

## 9. WeRSS adapter tests

使用本地 mock HTTP server 模拟：

- `POST /api/v1/wx/mps/by_article`；
- `POST /api/v1/wx/mps`；
- `GET /api/v1/wx/articles`；
- 401；
- 429；
- 500；
- schema drift。

CI 不依赖真实微信账号。

## 10. Markdown golden tests

每种 block 输入固定 ArticleDocument，输出 golden `.md`：

- escaping；
- nested list；
- code fence；
- table；
- local image；
- remote image；
- frontmatter special characters；
- saved note update retains user notes。

## 11. Plugin renderer tests

- paragraph uses text node；
- links reject javascript；
- image lazy attr；
- block ids in DOM；
- table wrapper scrollable；
- error state keeps header；
- reading state debounce。

## 12. Manual mobile acceptance matrix

| 场景 | iPhone | iPad | Android |
|---|---|---|---|
| 打开 Today | 必测 | 必测 | 至少一次 |
| 阅读长文 10min | 必测 | 必测 | 至少一次 |
| 顶栏隐藏/恢复 | 必测 | 必测 | 必测 |
| 退出再进入恢复位置 | 必测 | 必测 | 必测 |
| 图片大图 | 必测 | 必测 | 必测 |
| 保存文章+图片 | 必测 | 必测 | 必测 |
| 摘录 | 必测 | 必测 | 必测 |

## 13. CI gates

PR 必须：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Server 另外：

```text
pnpm --filter @obsidian-feed/server test:integration
```

插件 build 后检查产物：

- `main.js`；
- `manifest.json`；
- `styles.css`；
- 无 server-only dependency bundle；
- size 阈值（例如 main.js gzip < 500KB，具体可调整）。
