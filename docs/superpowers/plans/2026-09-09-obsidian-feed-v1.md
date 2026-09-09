# Obsidian Feed V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-shaped V1 Obsidian reading client and self-hosted Feed Server for RSS/Atom and WeChat public-account articles, with deterministic parsing, local reading state, and Markdown export.

**Architecture:** A pnpm TypeScript monorepo contains an Obsidian plugin, a Fastify/SQLite server, shared API contracts, and a versioned ArticleDocument package. The server owns content/sync/media, the plugin owns reading state, and the Vault owns saved knowledge. WeChat is integrated through a replaceable adapter with WeRSS as the V1 default.

**Tech Stack:** TypeScript strict, pnpm workspace, Node.js >=22.5.0, Fastify, Drizzle + node:sqlite, Zod, Vitest, esbuild, Obsidian Plugin API, native DOM.

**Spec:** `docs/superpowers/specs/2026-09-09-obsidian-feed-v1-design.md`

## Global Constraints

- V1 contains no AI dependencies, summaries, recommendation system, multi-user accounts, Redis, Kafka, or telemetry.
- Plugin `manifest.json` has `isDesktopOnly: false` and runtime code cannot depend on Node/Electron APIs.
- External untrusted data must be runtime-validated at boundaries.
- Reader never injects raw source HTML with `innerHTML`.
- User-controlled URLs use SSRF-safe HTTP; administrator-configured WeRSS uses a separate trusted client.
- Server owns content; plugin owns reading state; Vault owns saved Markdown and attachments.
- Article list API never returns full ArticleDocument.
- ArticleDocument schema version is exactly `1` for V1.
- Saved Markdown preserves user note/excerpt regions on re-save.
- Implement via TDD: failing test → minimal code → passing test → commit.

---

## Target File Structure

```text
obsidian-feed/
├── apps/
│   ├── plugin/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── api/
│   │   │   ├── state/
│   │   │   ├── views/
│   │   │   ├── reader/
│   │   │   ├── vault/
│   │   │   └── settings/
│   │   ├── test/
│   │   ├── manifest.json
│   │   ├── styles.css
│   │   └── esbuild.config.mjs
│   └── server/
│       ├── src/
│       │   ├── app.ts
│       │   ├── config.ts
│       │   ├── http/
│       │   ├── db/
│       │   ├── providers/
│       │   ├── parsing/
│       │   ├── media/
│       │   └── sync/
│       ├── test/
│       ├── drizzle/
│       └── Dockerfile
├── packages/
│   ├── contracts/src/
│   └── content-model/src/
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

### Task 1: Bootstrap monorepo and quality gates

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `.gitignore`
- Create: `apps/server/package.json`
- Create: `apps/plugin/package.json`
- Create: `packages/contracts/package.json`
- Create: `packages/content-model/package.json`

**Interfaces:**

- Produces root scripts: `build`, `test`, `typecheck`, `lint`, `format:check`.
- Produces workspace package names: `@obsidian-feed/server`, `@obsidian-feed/plugin`, `@obsidian-feed/contracts`, `@obsidian-feed/content-model`.

- [ ] **Step 1: Write root package metadata and workspace declaration**

`pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

Root `package.json` scripts:

```json
{
  "private": true,
  "packageManager": "pnpm@10",
  "engines": { "node": ">=22.5.0" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "lint": "eslint .",
    "format:check": "prettier --check ."
  }
}
```

- [ ] **Step 2: Configure strict TypeScript**

`tsconfig.base.json` must contain:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 3: Install dependencies and run empty quality gates**

Run:

```bash
pnpm install
pnpm lint
pnpm typecheck
```

Expected: commands exit 0 after package-level placeholder scripts are configured.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "chore: bootstrap obsidian feed monorepo"
```

---

### Task 2: Implement ArticleDocument and shared contracts

**Files:**

- Create: `packages/content-model/src/article-document.ts`
- Create: `packages/content-model/src/schema.ts`
- Create: `packages/content-model/src/normalize.ts`
- Create: `packages/content-model/src/hash.ts`
- Create: `packages/content-model/src/index.ts`
- Create: `packages/content-model/test/schema.test.ts`
- Create: `packages/content-model/test/normalize.test.ts`
- Create: `packages/contracts/src/source.ts`
- Create: `packages/contracts/src/article.ts`
- Create: `packages/contracts/src/subscription.ts`
- Create: `packages/contracts/src/error.ts`
- Create: `packages/contracts/src/index.ts`

**Interfaces:**

- Produces: `ArticleDocument`, `ArticleBlock`, `articleDocumentSchema`, `normalizeArticleDocument(input)`, `hashArticleDocument(doc)`.
- Produces API DTO Zod schemas matching `schemas/openapi.yaml`.

- [ ] **Step 1: Write schema tests**

Test valid document and malicious/invalid variants:

```ts
it("rejects arbitrary html blocks", () => {
  expect(() =>
    articleDocumentSchema.parse({
      version: 1,
      title: "x",
      sourceName: "s",
      canonicalUrl: "https://example.com/a",
      blocks: [{ id: "b1", type: "html", html: "<script>x</script>" }],
    }),
  ).toThrow();
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
pnpm --filter @obsidian-feed/content-model test
```

Expected: FAIL because schema is not implemented.

- [ ] **Step 3: Implement V1 discriminated block schema**

Use Zod discriminated union. Link validation must accept only `http:`, `https:`, `mailto:` for inline href.

- [ ] **Step 4: Implement normalization**

Required behaviors tested:

- empty paragraphs removed;
- adjacent identical-mark runs merged;
- heading level clamped/rejected to 2–4 (prefer schema reject, parser maps before schema);
- maximum block count enforced;
- stable block ids generated if parser helper calls id function;
- canonical hash excludes no business content.

- [ ] **Step 5: Implement API contracts**

Create Zod schemas for source, subscription, article list item/page/detail, resolved candidate and error response.

- [ ] **Step 6: Run tests/typecheck**

```bash
pnpm --filter @obsidian-feed/content-model test
pnpm --filter @obsidian-feed/contracts test
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages
 git commit -m "feat(model): add article document and api contracts"
```

---

### Task 3: Add server config, SQLite schema, migrations, repositories

**Files:**

- Create: `apps/server/src/config.ts`
- Create: `apps/server/src/db/client.ts`
- Create: `apps/server/src/db/schema.ts`
- Create: `apps/server/src/db/migrate.ts`
- Create: `apps/server/src/db/repositories/source-repository.ts`
- Create: `apps/server/src/db/repositories/article-repository.ts`
- Create: `apps/server/src/db/repositories/subscription-repository.ts`
- Create: `apps/server/src/db/repositories/sync-log-repository.ts`
- Create: `apps/server/src/db/repositories/media-repository.ts`
- Create: `apps/server/drizzle/0000_initial.sql`
- Create: `apps/server/test/db/schema.test.ts`

**Interfaces:**

- Produces `AppConfig`, `Database`, repositories with typed methods.
- DB tables exactly match `schemas/sqlite.sql`.

- [ ] **Step 1: Write migration/repository tests**

Use temp SQLite file. Assert:

```ts
expect(await sourceRepo.create(...)).toMatchObject({ status: "active" });
await subscriptionRepo.disable(id);
expect(await articleRepo.list(...)).toHaveLength(0); // no cascade deletion from disabling subscription
```

Also assert PRAGMAs `foreign_keys=1`, journal mode `wal`.

- [ ] **Step 2: Run failing test**

```bash
pnpm --filter @obsidian-feed/server test -- db/schema.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement Zod-based config loader**

Required env defaults and validation from `config/example.env`. Secret fields must be tagged for redaction helper.

- [ ] **Step 4: Implement Drizzle schema and migration**

Use `node:sqlite`. On connection execute required PRAGMAs.

- [ ] **Step 5: Implement repositories**

Minimum methods:

```ts
sourceRepo.findById(id)
sourceRepo.findByProviderExternal(providerKey, externalId)
sourceRepo.create(input)
sourceRepo.updateSyncState(...)
sourceRepo.listDue(now, limit)

subscriptionRepo.enableForSource(sourceId)
subscriptionRepo.disable(id)
subscriptionRepo.listEnabled()

articleRepo.upsertMeta(input)
articleRepo.setContent(articleId, ...)
articleRepo.getDetail(articleId)
articleRepo.listPage({limit,cursor,sourceId})
```

- [ ] **Step 6: Pass tests**

```bash
pnpm --filter @obsidian-feed/server test -- db
```

- [ ] **Step 7: Commit**

```bash
git add apps/server
 git commit -m "feat(server): add sqlite persistence layer"
```

---

### Task 4: Build Fastify app, auth, error model, health endpoints

**Files:**

- Create: `apps/server/src/app.ts`
- Create: `apps/server/src/main.ts`
- Create: `apps/server/src/http/auth.ts`
- Create: `apps/server/src/http/errors.ts`
- Create: `apps/server/src/http/request-id.ts`
- Create: `apps/server/src/http/routes/health.ts`
- Create: `apps/server/test/http/health.test.ts`
- Create: `apps/server/test/http/auth.test.ts`

**Interfaces:**

- Produces `buildApp(deps)` for tests and `startServer()` for runtime.
- Produces `AppError` and standard error serializer.

- [ ] **Step 1: Write failing auth and health tests**

Assertions:

- `/health/live` works without token;
- `/health/ready` rejects missing token;
- business route placeholder rejects wrong token;
- error contains `requestId` and no stack.

- [ ] **Step 2: Run tests and confirm failure**

```bash
pnpm --filter @obsidian-feed/server test -- http
```

- [ ] **Step 3: Implement bearer auth hook**

Use constant-time token comparison where practical. Never log header value.

- [ ] **Step 4: Implement error serializer**

Typed `AppError` fields:

```ts
code: string;
statusCode: number;
retryable: boolean;
retryAfterSeconds?: number;
publicMessage: string;
```

- [ ] **Step 5: Implement health**

Read DB; query adapter registry health. WeChat disabled/degraded does not make RSS server unavailable.

- [ ] **Step 6: Pass tests and commit**

```bash
pnpm --filter @obsidian-feed/server test -- http
 git add apps/server && git commit -m "feat(server): add authenticated api shell"
```

---

### Task 5: Implement SSRF-safe external HTTP client

**Files:**

- Create: `apps/server/src/http/safe-url.ts`
- Create: `apps/server/src/http/safe-http-client.ts`
- Create: `apps/server/src/http/trusted-upstream-client.ts`
- Create: `apps/server/test/security/ssrf.test.ts`
- Create: `apps/server/test/http/safe-http-client.test.ts`

**Interfaces:**

- Produces `SafeExternalHttpClient.getText(url, limits)` and `.getStream(url, limits)`.
- Produces `TrustedUpstreamClient` bound to one configured base URL.

- [ ] **Step 1: Write SSRF failing tests**

Include loopback, private IPv4, link-local, IPv6 loopback, redirect public→private and mocked DNS public+private.

- [ ] **Step 2: Confirm failures**

```bash
pnpm --filter @obsidian-feed/server test -- security/ssrf.test.ts
```

- [ ] **Step 3: Implement IP classification and DNS resolution validation**

Use Node `dns.promises.lookup(host, { all: true })`; reject if any resolved target violates policy for untrusted external URLs.

- [ ] **Step 4: Implement redirect loop manually or with a client hook that revalidates every Location**

Limits: timeout, max bytes, max 5 redirects.

- [ ] **Step 5: Implement trusted upstream client**

It may access Docker/private host configured by admin but cannot accept arbitrary absolute URLs from user input; every call is relative to fixed `baseUrl`.

- [ ] **Step 6: Pass tests and commit**

```bash
pnpm --filter @obsidian-feed/server test -- security http/safe-http-client.test.ts
 git add apps/server && git commit -m "security(server): add ssrf-safe http clients"
```

---

### Task 6: Implement native RSS/Atom provider

**Files:**

- Create: `apps/server/src/providers/types.ts`
- Create: `apps/server/src/providers/registry.ts`
- Create: `apps/server/src/providers/rss/rss-provider.ts`
- Create: `apps/server/src/providers/rss/feed-parser.ts`
- Create: `apps/server/src/providers/rss/discovery.ts`
- Create: `apps/server/test/providers/rss-provider.test.ts`
- Create fixtures under: `apps/server/test/fixtures/rss/`

**Interfaces:**

- Produces `ContentProvider` and `ProviderRegistry`.
- `RssProvider.key = "rss-native"`.

- [ ] **Step 1: Add RSS 2.0, Atom, malformed, XXE fixtures and tests**

Test `resolveSource`, GUID identity, relative URL resolution, feed discovery and XXE rejection.

- [ ] **Step 2: Verify failure**

```bash
pnpm --filter @obsidian-feed/server test -- providers/rss-provider.test.ts
```

- [ ] **Step 3: Implement secure XML parsing**

Reject DTD/ENTITY before parser. Parse known RSS/Atom fields only.

- [ ] **Step 4: Implement feed discovery**

HTML `<link rel=alternate>` with RSS/Atom MIME. Canonicalize candidate relative URLs against final page URL.

- [ ] **Step 5: Implement provider**

Return raw embedded article HTML when present. No DB access inside provider.

- [ ] **Step 6: Pass test and commit**

```bash
pnpm --filter @obsidian-feed/server test -- providers/rss-provider.test.ts
 git add apps/server && git commit -m "feat(server): add rss and atom provider"
```

---

### Task 7: Implement provider resolution tokens and subscription API

**Files:**

- Create: `apps/server/src/services/subscription-service.ts`
- Create: `apps/server/src/security/resolution-token.ts`
- Create: `apps/server/src/http/routes/subscriptions.ts`
- Create: `apps/server/test/services/subscription-service.test.ts`
- Create: `apps/server/test/http/subscriptions.test.ts`

**Interfaces:**

- Produces `resolveSubscription(rawInput)` and `createSubscription(resolutionToken)`.

- [ ] **Step 1: Write failing tests**

Cases:

- RSS resolve returns short-lived token;
- tampered token rejected;
- expired token rejected using fake clock;
- duplicate subscribe re-enables existing subscription without duplicate source.

- [ ] **Step 2: Implement HMAC resolution token**

Payload includes issuedAt/expiresAt/provider/candidate. Sign with derived HMAC key from server secret using HKDF or dedicated config secret.

- [ ] **Step 3: Implement service transaction boundaries**

Provider `ensureSubscribed()` happens before/around source persistence as needed; DB creation must remain idempotent.

- [ ] **Step 4: Implement routes matching OpenAPI**

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @obsidian-feed/server test -- subscription
 git add apps/server && git commit -m "feat(server): add subscription resolution api"
```

---

### Task 8: Implement WeRSS adapter and WeChat provider

**Files:**

- Create: `apps/server/src/providers/wechat/wechat-adapter.ts`
- Create: `apps/server/src/providers/wechat/wechat-provider.ts`
- Create: `apps/server/src/providers/wechat/werss-schemas.ts`
- Create: `apps/server/src/providers/wechat/werss-adapter.ts`
- Create: `apps/server/test/providers/werss-adapter.test.ts`
- Create: `apps/server/test/providers/wechat-provider.test.ts`

**Interfaces:**

- `WeRssAdapter.resolveByArticleUrl(url)`
- `WeRssAdapter.ensureSubscribed(candidate)`
- `WeRssAdapter.listArticles(source, options)`
- `WeRssAdapter.fetchContent(article)`
- `WeChatProvider.key = "wechat-werss"`

- [ ] **Step 1: Start a Fastify mock upstream in tests**

Mock:

```text
POST /api/v1/wx/mps/by_article
POST /api/v1/wx/mps
GET  /api/v1/wx/articles
```

Return representative WeRSS wrapper responses.

- [ ] **Step 2: Write failing mapping/error tests**

- valid article URL resolves source;
- non-WeChat URL rejected before upstream;
- API key header present;
- 401 → `WECHAT_AUTH_REQUIRED`;
- 429 → `WECHAT_RATE_LIMITED`;
- malformed schema → `UPSTREAM_UNAVAILABLE`/schema error;
- logs do not contain API key.

- [ ] **Step 3: Implement Zod schemas and adapter**

Do not leak WeRSS types outside folder.

- [ ] **Step 4: Implement pagination/backfill limits**

First subscribe max `WECHAT_INITIAL_BACKFILL_LIMIT` (default 30). Sync max pages config 3.

- [ ] **Step 5: Register provider conditionally**

If adapter config absent, registry should report WeChat capability disabled; RSS remains operational.

- [ ] **Step 6: Pass and commit**

```bash
pnpm --filter @obsidian-feed/server test -- werss wechat-provider
 git add apps/server && git commit -m "feat(server): add replaceable wechat provider via werss"
```

---

### Task 9: Implement deterministic parsing core and WeChat parser

**Files:**

- Create: `apps/server/src/parsing/pipeline.ts`
- Create: `apps/server/src/parsing/dom.ts`
- Create: `apps/server/src/parsing/inline.ts`
- Create: `apps/server/src/parsing/normalize.ts`
- Create: `apps/server/src/parsing/wechat/candidates.ts`
- Create: `apps/server/src/parsing/wechat/score.ts`
- Create: `apps/server/src/parsing/wechat/noise.ts`
- Create: `apps/server/src/parsing/wechat/wechat-parser.ts`
- Create: `apps/server/src/parsing/rss/rss-content-parser.ts`
- Create: `apps/server/src/parsing/generic/generic-parser.ts`
- Create fixtures under `apps/server/test/fixtures/wechat/`
- Create: `apps/server/test/parsing/wechat-parser.test.ts`
- Create: `apps/server/test/parsing/xss.test.ts`

**Interfaces:**

- Produces:

```ts
parseArticle(input: RawParseInput): Promise<ParseResult>
interface ParseResult {
  document: ArticleDocument | null;
  status: "ready" | "partial" | "failed";
  parser: string;
  parserVersion: string;
  confidence: number;
  diagnostics: Record<string, unknown>;
}
```

- [ ] **Step 1: Add semantic fixture tests**

Use assertions specified in `07_CONTENT_PARSING.md`.

- [ ] **Step 2: Run failure**

```bash
pnpm --filter @obsidian-feed/server test -- parsing
```

- [ ] **Step 3: Implement candidate features and score as pure functions**

Do not mix DOM mutation into scoring.

- [ ] **Step 4: Implement block extraction**

Recursive section/div flattening; semantic allowed block set only.

- [ ] **Step 5: Implement tail noise detection**

Require combined QR/follow + position context; add regression test that normal “关注” text remains.

- [ ] **Step 6: Implement XSS elimination**

No script/style/form/iframe/event attributes enter model; href scheme validation.

- [ ] **Step 7: Implement confidence and parser version**

- [ ] **Step 8: Pass tests and commit**

```bash
pnpm --filter @obsidian-feed/server test -- parsing
 git add apps/server && git commit -m "feat(parser): add deterministic article parsing pipeline"
```

---

### Task 10: Implement article ingestion and content fetching

**Files:**

- Create: `apps/server/src/services/ingest-service.ts`
- Create: `apps/server/src/services/article-content-service.ts`
- Create: `apps/server/src/providers/wechat/direct-content-fetcher.ts`
- Create: `apps/server/src/providers/wechat/playwright-content-fetcher.ts`
- Create: `apps/server/test/services/ingest-service.test.ts`
- Create: `apps/server/test/providers/wechat-content-fetcher.test.ts`

**Interfaces:**

- Produces `ingestProviderArticles(source, articles)`.
- Produces `ensureArticleContent(articleId)`.

- [ ] **Step 1: Write failing ingestion tests**

- external id dedupe;
- canonical URL dedupe;
- content hash unchanged → no unnecessary DB rewrite;
- one parse failure does not abort other articles;
- metadata can exist with content failed.

- [ ] **Step 2: Implement direct content fetch**

Use SafeExternalHttpClient, only HTML, 5MB, block/login page detector.

- [ ] **Step 3: Implement optional Playwright adapter behind config**

Keep it isolated and dynamically imported so default server image does not require browser package/runtime unless configured. If implementation package architecture makes optional peer dependency difficult, define interface now and ship disabled stub; do not make Playwright mandatory for baseline acceptance. A real enabled build must be a separate deployment target.

- [ ] **Step 4: Implement ingestion**

External network outside DB transaction; short upsert transactions.

- [ ] **Step 5: Pass and commit**

```bash
pnpm --filter @obsidian-feed/server test -- ingest wechat-content
 git add apps/server && git commit -m "feat(server): ingest article metadata and content"
```

---

### Task 11: Implement media cache and proxy

**Files:**

- Create: `apps/server/src/media/media-service.ts`
- Create: `apps/server/src/media/media-path.ts`
- Create: `apps/server/src/media/mime.ts`
- Create: `apps/server/src/http/routes/media.ts`
- Create: `apps/server/test/media/media-service.test.ts`
- Create: `apps/server/test/http/media.test.ts`

**Interfaces:**

- `registerRemote(url): Promise<MediaRef>`
- `getOrFetch(id): Promise<MediaFile>`

- [ ] **Step 1: Write failing tests**

- same URL returns same media id;
- oversized image rejected;
- SVG rejected;
- redirect private IP blocked;
- concurrent same media uses one upstream fetch;
- ETag/304 works.

- [ ] **Step 2: Implement registry and disk path**

Use temp file + atomic rename; hash content.

- [ ] **Step 3: Integrate parser image registration**

Parser should call an injected `MediaRegistrar`, not concrete DB service, so parser unit tests remain pure/mockable.

- [ ] **Step 4: Add authenticated media route**

Plugin media URLs require Bearer token; renderer must load images in a way that can authenticate. Because `<img src>` cannot attach custom Authorization headers, choose one of these concrete V1 mechanisms and test it:

**Required choice:** plugin fetches image bytes via `requestUrl` with Bearer token and creates an object URL for rendering. ArticleDocument stores media endpoint path/id, not a public unauthenticated URL. `ArticleRenderer` delegates image loading to `AuthenticatedMediaLoader`.

Do **not** make media route unauthenticated merely for `<img>` convenience.

- [ ] **Step 5: Pass and commit**

```bash
pnpm --filter @obsidian-feed/server test -- media
 git add apps/server && git commit -m "feat(server): add authenticated media cache"
```

---

### Task 12: Implement scheduler, adaptive policy, sync logs

**Files:**

- Create: `apps/server/src/sync/policy.ts`
- Create: `apps/server/src/sync/worker.ts`
- Create: `apps/server/src/sync/scheduler.ts`
- Create: `apps/server/src/sync/task-pool.ts`
- Create: `apps/server/test/sync/policy.test.ts`
- Create: `apps/server/test/sync/worker.test.ts`

**Interfaces:**

- `computeNextSync(input): Date`
- `syncOneSource(sourceId): Promise<SyncOutcome>`
- `Scheduler.start()/stop()`.

- [ ] **Step 1: Write fake-clock policy tests**

Cover success/new, empty, repeated failure, 429 Retry-After, auth required and max cap.

- [ ] **Step 2: Implement policy pure functions**

Keep random jitter injectable for deterministic tests.

- [ ] **Step 3: Implement bounded task pool**

Separate global + WeChat concurrency semantics.

- [ ] **Step 4: Implement worker and logs**

Always finalize sync log in `finally`; normalize error before status update.

- [ ] **Step 5: Implement scheduler lifecycle in app**

Startup delay; clean stop on SIGTERM.

- [ ] **Step 6: Pass and commit**

```bash
pnpm --filter @obsidian-feed/server test -- sync
 git add apps/server && git commit -m "feat(server): add adaptive source scheduler"
```

---

### Task 13: Implement article/source APIs and cursor pagination

**Files:**

- Create: `apps/server/src/security/cursor.ts`
- Create: `apps/server/src/http/routes/articles.ts`
- Create: `apps/server/src/http/routes/sources.ts`
- Create: `apps/server/src/http/routes/system.ts`
- Create: `apps/server/test/http/articles.test.ts`
- Create: `apps/server/test/http/sources.test.ts`

**Interfaces:**

- Matches `schemas/openapi.yaml`.

- [ ] **Step 1: Write route tests**

Assert article list contains no document/body field. Cursor page 1+2 has no duplicates. Detail returns document or null with status. Refresh throttling returns 429.

- [ ] **Step 2: Implement signed/opaque cursor**

Cursor payload contains `publishedAtFallback`, `id`, optional filter binding. Reject tampered cursor.

- [ ] **Step 3: Implement routes**

- [ ] **Step 4: OpenAPI/contract verification**

Add a test that schemas returned by routes parse with `@obsidian-feed/contracts`.

- [ ] **Step 5: Pass and commit**

```bash
pnpm --filter @obsidian-feed/server test -- http/articles http/sources
 git add apps/server && git commit -m "feat(server): expose article and source api"
```

---

### Task 14: Bootstrap Obsidian plugin, settings, local state, API client

**Files:**

- Create: `apps/plugin/manifest.json`
- Create: `apps/plugin/esbuild.config.mjs`
- Create: `apps/plugin/src/main.ts`
- Create: `apps/plugin/src/state/plugin-data.ts`
- Create: `apps/plugin/src/api/client.ts`
- Create: `apps/plugin/src/api/errors.ts`
- Create: `apps/plugin/src/settings/settings-tab.ts`
- Create: `apps/plugin/test/state/plugin-data.test.ts`
- Create: `apps/plugin/test/api/client.test.ts`

**Interfaces:**

- Produces `FeedApiClient`, `PluginDataV1`, settings tab.

- [ ] **Step 1: Write plugin-data migration/default tests**

Invalid/missing old data → defaults without losing recognizable reading entries.

- [ ] **Step 2: Implement build and manifest**

Bundle excludes `obsidian` external. `isDesktopOnly=false`.

- [ ] **Step 3: Implement API client around `requestUrl()`**

Inject request function for tests. Add Bearer header. Runtime parse responses with shared Zod schemas.

- [ ] **Step 4: Implement settings UI**

Server URL, password token, test connection, reading/save settings.

- [ ] **Step 5: Run plugin tests/build**

```bash
pnpm --filter @obsidian-feed/plugin test
pnpm --filter @obsidian-feed/plugin build
```

- [ ] **Step 6: Commit**

```bash
git add apps/plugin
 git commit -m "feat(plugin): bootstrap obsidian client and settings"
```

---

### Task 15: Implement Today and Subscriptions views

**Files:**

- Create: `apps/plugin/src/views/feed-view.ts`
- Create: `apps/plugin/src/views/today-view.ts`
- Create: `apps/plugin/src/views/subscriptions-view.ts`
- Create: `apps/plugin/src/views/add-subscription-modal.ts`
- Create: `apps/plugin/src/views/dom.ts`
- Create: `apps/plugin/test/views/today-view.test.ts`
- Create: `apps/plugin/test/views/subscriptions-view.test.ts`

**Interfaces:**

- Main route state from `10_OBSIDIAN_PLUGIN.md`.

- [ ] **Step 1: Write DOM tests**

Today rows contain title/source/time, no summary text/field, readable state class and keyboard role.

- [ ] **Step 2: Implement main ItemView and routing**

Use one reusable leaf; preserve `from` route for back navigation.

- [ ] **Step 3: Implement Today cursor loading**

Guard stale async response with request sequence.

- [ ] **Step 4: Implement subscriptions and modal**

Resolve → candidate confirm → subscribe. Error code maps to Chinese UI messages.

- [ ] **Step 5: Pass and commit**

```bash
pnpm --filter @obsidian-feed/plugin test -- views
 git add apps/plugin && git commit -m "feat(plugin): add today and subscriptions views"
```

---

### Task 16: Implement Reader renderer and authenticated media loading

**Files:**

- Create: `apps/plugin/src/reader/renderer.ts`
- Create: `apps/plugin/src/reader/media-loader.ts`
- Create: `apps/plugin/src/reader/image-viewer.ts`
- Create: `apps/plugin/src/views/reader-view.ts`
- Create: `apps/plugin/test/reader/renderer.test.ts`
- Create: `apps/plugin/test/reader/media-loader.test.ts`

**Interfaces:**

- `ArticleRenderer.renderDocument(container, doc, deps)`.
- `AuthenticatedMediaLoader.load(mediaPath): Promise<string>` returns object URL and exposes dispose.

- [ ] **Step 1: Write XSS-safe renderer tests**

Assert code/text are text nodes, javascript href not rendered, no script/event attrs, block ids applied.

- [ ] **Step 2: Implement block renderers one type per helper**

No `innerHTML`.

- [ ] **Step 3: Implement authenticated images**

Use `requestUrl({url, headers:{Authorization}, ...})` to get ArrayBuffer, `Blob`, `URL.createObjectURL`. Revoke object URLs on reader dispose.

- [ ] **Step 4: Implement image viewer**

Keyboard Escape and mobile-friendly overlay.

- [ ] **Step 5: Implement Reader view loading/error/original-link**

- [ ] **Step 6: Pass and commit**

```bash
pnpm --filter @obsidian-feed/plugin test -- reader
 git add apps/plugin && git commit -m "feat(plugin): add secure article reader"
```

---

### Task 17: Implement reading progress, read state, toolbar behavior

**Files:**

- Create: `apps/plugin/src/state/reading-state.ts`
- Create: `apps/plugin/src/reader/scroll-state.ts`
- Create: `apps/plugin/src/reader/toolbar-controller.ts`
- Create: `apps/plugin/test/reader/scroll-state.test.ts`
- Modify: `apps/plugin/src/views/reader-view.ts`

**Interfaces:**

- `ReadingStateStore.update(articleId, patch)`.
- `captureScrollPosition(container): ReadingPosition`.
- `restoreScrollPosition(container, state): Promise<void>`.

- [ ] **Step 1: Write fake DOM/time tests**

- 85% → read;
- 70% + 30s → read;
- click alone does not;
- block anchor restore preferred over ratio;
- save debounce not on every scroll.

- [ ] **Step 2: Implement store with in-memory immediate + debounced persistence**

Flush on view close/plugin unload.

- [ ] **Step 3: Implement toolbar direction thresholds and progress bar**

Respect reduced-motion.

- [ ] **Step 4: Pass and commit**

```bash
pnpm --filter @obsidian-feed/plugin test -- scroll-state
 git add apps/plugin && git commit -m "feat(plugin): persist reading progress and read state"
```

---

### Task 18: Implement Markdown conversion and note-preserving export

**Files:**

- Create: `apps/plugin/src/vault/markdown.ts`
- Create: `apps/plugin/src/vault/frontmatter.ts`
- Create: `apps/plugin/src/vault/path.ts`
- Create: `apps/plugin/src/vault/exporter.ts`
- Create: `apps/plugin/test/vault/markdown.test.ts`
- Create: `apps/plugin/test/vault/exporter.test.ts`
- Create golden files under: `apps/plugin/test/fixtures/markdown/`

**Interfaces:**

- `articleDocumentToMarkdown(doc, options)`.
- `ArticleExporter.save(detail): Promise<TFile>`.

- [ ] **Step 1: Write golden conversion tests**

Paragraph, marks, code fence, nested list, table, quote, images, YAML escaping.

- [ ] **Step 2: Write re-save preservation test**

Existing file contains custom user text in `我的笔记` and `我的摘录`; after save it must remain byte-equivalent in those regions while body updates.

- [ ] **Step 3: Implement path sanitizer**

Test forbidden chars and traversal.

- [ ] **Step 4: Implement body markers and safe update**

If markers missing/ambiguous in existing identified note, do not destructive overwrite; create updated copy and notify.

- [ ] **Step 5: Pass and commit**

```bash
pnpm --filter @obsidian-feed/plugin test -- vault
 git add apps/plugin && git commit -m "feat(plugin): export durable markdown notes"
```

---

### Task 19: Implement Vault image localization and excerpts

**Files:**

- Create: `apps/plugin/src/vault/media-downloader.ts`
- Create: `apps/plugin/src/reader/selection.ts`
- Modify: `apps/plugin/src/vault/exporter.ts`
- Modify: `apps/plugin/src/views/reader-view.ts`
- Create: `apps/plugin/test/vault/media-downloader.test.ts`
- Create: `apps/plugin/test/reader/selection.test.ts`

**Interfaces:**

- `localizeArticleImages(detail, notePath)`.
- `appendExcerpt(articleId, selectedText)`.

- [ ] **Step 1: Write media tests**

Use injected request function and fake Vault. Validate size/MIME/name and failure fallback.

- [ ] **Step 2: Implement local mode**

Download through authenticated Feed Server media endpoint, not original WeChat URL.

- [ ] **Step 3: Write excerpt tests**

No note → create note; note exists → append inside excerpt section; identical rapid duplicate suppressed.

- [ ] **Step 4: Implement selection UI hooks**

Desktop floating action plus command/menu fallback for mobile selection limitations.

- [ ] **Step 5: Pass and commit**

```bash
pnpm --filter @obsidian-feed/plugin test -- media-downloader selection
 git add apps/plugin && git commit -m "feat(plugin): localize images and save excerpts"
```

---

### Task 20: Apply reading-first CSS, responsive/mobile accessibility

**Files:**

- Create/Modify: `apps/plugin/styles.css`
- Create: `apps/plugin/test/styles/static-rules.test.ts`
- Modify relevant view modules for ARIA/keyboard behavior.

**Interfaces:**

- CSS variables exactly map settings: 16/17/19px, 1.65/1.8/1.95, 640/720/820px.

- [ ] **Step 1: Add static CSS test/check**

Ensure all selectors are `.of-*` scoped except intentional root variables; ensure mobile media query exists and no network `@import`.

- [ ] **Step 2: Implement typography and layout**

Use Obsidian theme variables, safe-area, table scroll, responsive images.

- [ ] **Step 3: Add keyboard/focus behavior**

44px touch targets, visible focus, Enter row open, Escape viewer.

- [ ] **Step 4: Manual desktop theme smoke test**

Default light/dark plus two common themes; document screenshots/notes locally if project process wants them, but do not require image artifacts in source.

- [ ] **Step 5: Commit**

```bash
git add apps/plugin
 git commit -m "feat(plugin): polish responsive reading experience"
```

---

### Task 21: Docker, Compose, backup CLI and operational status

**Files:**

- Create: `apps/server/Dockerfile`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `apps/server/src/cli/backup.ts`
- Create: `apps/server/src/cli/status.ts`
- Create: `apps/server/src/http/routes/system.ts` if not already complete
- Create: `apps/server/test/cli/backup.test.ts`

**Interfaces:**

- `pnpm --filter @obsidian-feed/server db:backup`
- `GET /v1/system/status`.

- [ ] **Step 1: Write backup test against temp SQLite**

Backup must open and contain expected rows.

- [ ] **Step 2: Implement Docker image**

Node 22 slim; non-root user where practical; `/data` writable; healthcheck.

- [ ] **Step 3: Implement Compose Feed Server service and documented WeRSS network integration**

Do not hard-code a WeRSS admin password. Use env references.

- [ ] **Step 4: Implement status and backup CLI**

- [ ] **Step 5: Build container and smoke test**

```bash
docker build -f apps/server/Dockerfile -t obsidian-feed-server:test .
docker run --rm ... obsidian-feed-server:test
```

Call health endpoint.

- [ ] **Step 6: Commit**

```bash
git add .
 git commit -m "ops: add self-hosted deployment and backup tooling"
```

---

### Task 22: End-to-end integration and release gates

**Files:**

- Create: `apps/server/test/e2e/rss-flow.test.ts`
- Create: `apps/server/test/e2e/wechat-adapter-flow.test.ts`
- Create: `apps/plugin/test/e2e/reader-flow.test.ts` (mocked API / DOM)
- Modify: `README.md`
- Create: `SECURITY.md`
- Create: `LICENSE` (MIT if owner accepts recommendation)

**Interfaces:**

- Demonstrates full source→article→document→plugin rendering→Markdown conversion chain in tests without real external accounts.

- [ ] **Step 1: RSS E2E**

Start local fixture server + Feed Server test app; resolve feed, subscribe, sync, list article, get detail. Assert document text.

- [ ] **Step 2: WeChat adapter E2E using mock WeRSS**

Resolve article URL, subscribe, list upstream articles, fetch fixture HTML, parse, detail ready. Simulate 429 path.

- [ ] **Step 3: Plugin reader flow using mocked API**

Today metadata → open reader → secure render → update progress → export Markdown.

- [ ] **Step 4: Documentation disclosures**

README must state:

- self-hosted server requirement;
- network use;
- WeChat upstream trust boundary;
- no AI/telemetry;
- mobile server accessibility;
- copyright/platform-respect statement;
- installation/deployment.

- [ ] **Step 5: Run all automated gates**

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Expected: all PASS.

- [ ] **Step 6: Run acceptance checklist**

Open `21_ACCEPTANCE_CRITERIA.md`; mark only evidence-backed items complete. Do not mark real-device mobile tests complete without real testing.

- [ ] **Step 7: Manual real-device phase**

Test actual Obsidian desktop/iPhone/iPad/Android matrix. Record defects as issues; fix with TDD and rerun gates.

- [ ] **Step 8: Final verification commit**

```bash
git add .
git commit -m "release: prepare obsidian feed v1 candidate"
```

---

## Plan Self-Review Results

### Spec coverage

- Product pages/UX: Tasks 15–20.
- RSS: Task 6 + 22.
- WeChat/provider abstraction: Task 8 + 10 + 22.
- Parsing/ArticleDocument: Tasks 2 + 9.
- DB/API: Tasks 3, 4, 7, 13.
- Sync: Task 12.
- Media: Tasks 11 + 16 + 19.
- Markdown/excerpts: Tasks 18–19.
- Security: Tasks 4–5, 9, 11, 22.
- Deployment/operations: Task 21.
- Mobile: Tasks 14–20 + final manual gate.

### Placeholder scan

No implementation task relies on unresolved placeholders, cross-task shorthand, or unspecified generic error handling. Optional Playwright is explicitly scoped behind an interface/config and is not required for baseline unless the enabled deployment target is chosen.

### Type consistency

Shared names used by later tasks originate in Tasks 2 and 6/8. `ArticleDocument`, `ContentProvider`, `WeChatAdapter`, `FeedApiClient`, `ReadingStateStore`, and `ArticleExporter` have single canonical names in this plan.
