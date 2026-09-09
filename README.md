# Obsidian Feed

Obsidian Feed is a reading-first RSS and public WeChat article reader for Obsidian. It consists of a self-hosted Feed Server and an Obsidian plugin. The server discovers sources, schedules synchronization, normalizes untrusted article HTML into a constrained `ArticleDocument`, and proxies cached images; the plugin renders that document without injecting raw HTML and can save it as Markdown in your vault.

V1 deliberately has no AI features, summaries, recommendations, account system, client telemetry, Redis, Kafka, or system push notifications.

## Requirements

- Node.js 22.5 or newer and pnpm 10, or Docker with Compose
- A server address reachable from every device that runs the plugin
- Optional: a self-managed WeRSS service for public WeChat subscriptions

The plugin does not work by itself: a running Feed Server is required.

## Deploy the Feed Server

Copy the example environment file and replace the token with at least 32 random characters:

```sh
cp .env.example .env
docker compose up -d --build
```

The server listens on port `43110` by default and stores its SQLite database and media cache in the `feed-data` volume. Check liveness at `/health/live`; `/health/ready` and all `/v1` routes require `Authorization: Bearer <FEED_SERVER_TOKEN>`.

For a local source build:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm build
FEED_SERVER_TOKEN=replace-with-a-long-random-token pnpm --filter @obsidian-feed/server start
```

Operational commands are available after building:

```sh
pnpm --filter @obsidian-feed/server status
pnpm --filter @obsidian-feed/server db:backup -- --output ./backups
```

### Optional WeChat support

Set `WECHAT_ADAPTER=werss`, `WERSS_BASE_URL`, and `WERSS_API_KEY` together. WeRSS is an upstream trust boundary: it can see the public WeChat URLs being resolved and supplies source/article metadata. Its API key stays on the server and is never sent to the plugin.

If WeRSS is unavailable or unconfigured, WeChat features degrade explicitly while RSS remains usable. Obsidian Feed only reads publicly accessible articles; it does not bypass login, verification, CAPTCHA, payment, or platform access controls.

## Install the Obsidian plugin

Build the workspace, then copy these files into `<vault>/.obsidian/plugins/obsidian-feed/`:

- `apps/plugin/dist/main.js`
- `apps/plugin/manifest.json`
- `apps/plugin/styles.css`

Enable **Obsidian Feed** in Community plugins. In its settings, enter the Feed Server URL and the same access token used by the server.

On a phone or tablet, `127.0.0.1` refers to that device, not your server. Use a private LAN/VPN address or an HTTPS endpoint reachable by the mobile device. Avoid exposing the service directly to the public internet.

## Network and data use

The plugin connects only to the Feed Server address you configure. The server connects to RSS feeds, public article/media URLs, and the optional configured WeRSS endpoint. Reading progress and plugin preferences stay in Obsidian plugin data; subscriptions, normalized article data, synchronization state, and cached media stay in the server's data directory. No client telemetry is collected.

See [SECURITY.md](SECURITY.md) for the threat model and deployment guidance.

## Development

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

The automated suite uses local fixtures and a mock WeRSS server; it does not require external accounts. Real-device validation is tracked separately and must not be inferred from automated tests.

## Copyright and platform respect

Use Obsidian Feed only for material you are allowed to access and retain. Article text, images, and publisher branding remain the property of their respective owners. Respect publisher terms, copyright, robots policies where applicable, rate limits, and platform access controls. This project does not include or copy source code or assets from the projects that inspired it.
