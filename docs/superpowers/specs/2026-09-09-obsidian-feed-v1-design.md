# Obsidian Feed V1 Design

**Date:** 2026-09-09  
**Status:** Approved design consolidated from product discussion

## Goal

Build a reading-first Obsidian plugin plus a small self-hosted Feed Server that aggregates RSS/Atom and WeChat public-account articles into a unified, sanitized document model, provides a quiet long-form reader on desktop and mobile, tracks reading state locally, and exports selected articles to durable Markdown.

## Product constraints

- No AI.
- No summaries.
- No recommendations.
- No multi-user account system.
- No cloud reading-state sync.
- No system push in V1.
- No Redis, Kafka, or microservices.
- No bypass of login, captcha, paywalls, or access controls.
- Saved knowledge must be ordinary Markdown.

## Architecture

The system has three ownership boundaries:

1. Feed Server owns source ingestion, content parsing, article metadata/body, synchronization and media cache.
2. Obsidian plugin local `data.json` owns settings, read/unread state and reading progress.
3. Obsidian Vault owns user-saved Markdown, localized images, personal notes and excerpts.

The plugin never calls WeRSS directly. It only calls the Feed Server. The server implements source-specific Providers. RSS is native; WeChat uses a replaceable adapter with WeRSS as the V1 default.

## Monorepo

```text
apps/plugin
apps/server
packages/contracts
packages/content-model
```

Both applications use TypeScript. Shared packages contain no framework-specific imports.

## Server

Node.js >=22.5.0, Fastify, Drizzle, SQLite `node:sqlite`, Zod and Vitest. Server API is `/v1` and authenticated by a single long Bearer token. This is intentionally single-user.

The server stores `sources`, `subscriptions`, `articles`, `article_contents`, `sync_logs`, and `media_cache`.

## Providers

`ContentProvider` exposes source resolution, ensuring subscription, source synchronization and article retrieval. External provider response shapes are parsed at the adapter boundary using Zod.

RSS Provider safely retrieves RSS/Atom, supports feed discovery, blocks SSRF, disables DTD/external entities and normalizes GUID/link identities.

WeChat Provider delegates to `WeChatAdapter`. V1 provides `WeRssAdapter`, configured with `WERSS_BASE_URL` and `WERSS_API_KEY`. It uses WeRSS article-link source resolution, source creation/listing and article listing APIs. If WeRSS has full article content, it is parsed. Otherwise the server attempts a safe direct article fetch; optional Playwright fallback may render a page but must not bypass login/captcha/access control.

## Article model

All raw content is converted to versioned `ArticleDocument V1`. Allowed blocks are paragraph, heading, image, blockquote, list, code, table and divider. Inline data is text plus a narrow mark set and validated links. Raw arbitrary HTML is not part of the model.

Reader rendering and Markdown export use the exact same document.

## Parsing

WeChat content uses source-specific container candidates plus deterministic scoring. Known high-confidence selectors are signals, not absolute trust. Candidate score uses text length, paragraph count, link density, controls and navigation/footer signals.

After selecting a container, the parser recursively produces semantic blocks, removes scripts/forms/iframes and filters tail noise such as QR/follow clusters using position + text + image context rather than raw keyword matching.

The parser emits a confidence score and version. Low-confidence content is marked partial or failed; the reader always provides an original-link fallback.

## Media

Images are registered in a server media cache. `ArticleDocument` references stable server media routes. Images lazy-load in the reader. The media fetcher validates URL destination and redirects, limits size, validates MIME and caches files using content hashes. SVG is excluded in V1.

## Plugin

The plugin uses Obsidian `ItemView`, native DOM and `requestUrl()`. It must work on desktop and mobile (`isDesktopOnly: false`) and must not depend on Node/Electron runtime APIs.

Core pages are Today, Subscriptions and Reader. Today lists metadata only. Reader loads detail on demand. Article rendering uses DOM text nodes and never raw `innerHTML`.

Reading state is local and saved with throttling/debounce. The plugin restores a stable block anchor plus offset, falling back to scroll ratio.

## Reading UX

Default desktop reading width is 720px, font 17px, line-height 1.8. Mobile is one column with 18–22px horizontal padding. Toolbar hides on downward scroll and returns on upward scroll. A thin progress bar is transient. Image viewer, external original link and reader typography settings are available. There is no summary/AI chrome.

## Markdown export

Saving produces YAML frontmatter, article title, source attribution, `我的笔记`, `我的摘录`, and a body region surrounded by stable markers. Re-saving updates metadata/body while preserving user-owned note/excerpt regions. Images can be localized into the Vault (default) or left as Feed Server media links.

## Scheduling

The server scheduler ticks every ~60 seconds and selects enabled sources whose `next_sync_at` is due. RSS and WeChat have separate concurrency and default intervals. Jitter prevents synchronization spikes. Failure uses typed status and exponential backoff. 429 and auth failures have conservative cooldowns.

## Security

All user-controlled external URLs use a central safe HTTP client with SSRF protection, DNS/IP validation, redirect re-validation, timeouts and body limits. Administrator-configured WeRSS uses a separate trusted-upstream client. External HTML/XML/API responses are untrusted. Secrets are redacted from logs. No client telemetry.

## Testing

TDD is required. Parser fixtures cover normal, nested section, image-heavy, QR footer, code/table, blocked and malicious cases. Security tests cover private IP and redirect SSRF, XSS payloads and oversized content. Adapter integration tests use a mock WeRSS server; CI never needs a real WeChat account.

## Deployment

Default is Docker Compose: Feed Server + optional WeRSS sidecar, each with separate persistent data. Mobile access should use a private VPN or HTTPS reverse proxy. Server media cache is disposable; SQLite is backed up safely.

## Acceptance

`21_ACCEPTANCE_CRITERIA.md` is the release gate and is normative if any shorter document is ambiguous. Machine-readable schemas under `schemas/` are normative for external contracts.
