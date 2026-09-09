# Security Policy

## Supported version

Security fixes currently target the latest commit on the `main` branch while V1 is under development.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not open a public issue containing access tokens, WeRSS keys, private feed URLs, article content, vault paths, or exploit details. Include the affected version, reproduction steps, impact, and any suggested mitigation. Maintainers will acknowledge a complete report as soon as practical and coordinate disclosure after a fix is available.

## Deployment guidance

- Generate a unique `FEED_SERVER_TOKEN` with at least 32 random characters and do not commit `.env` files.
- Prefer a private LAN or VPN. If remote internet access is required, put the server behind HTTPS and an appropriately configured reverse proxy.
- Treat the configured WeRSS instance as a trusted upstream. Keep `WERSS_API_KEY` only on the server.
- Back up the SQLite database and protect the server data directory; it contains subscriptions, normalized article content, and cached media.
- Keep Node.js, container images, Obsidian, and the plugin current.

## Security boundaries

The server rejects private, loopback, and link-local destinations for untrusted article/feed/media fetching and revalidates redirects. Downloads have timeout and size limits, media uses a MIME allowlist, and untrusted HTML is converted to a constrained document model. The plugin builds DOM nodes directly and does not inject upstream raw HTML.

Public WeChat access may return verification, login, or blocked pages. Obsidian Feed reports those conditions and does not attempt to bypass them. A disabled or unhealthy WeChat adapter must not prevent RSS synchronization.

The bearer token is an application secret, but it is stored in Obsidian plugin data rather than a hardware-secured key store. Anyone who can read that data may be able to access the Feed Server as the plugin.
