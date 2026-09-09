import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { HttpTextResponse } from "../../src/http/safe-http-client.js";
import { ProviderError } from "../../src/providers/types.js";
import { RssProvider } from "../../src/providers/rss/rss-provider.js";

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/rss");
const fixture = (name: string) => readFileSync(join(fixtureDirectory, name), "utf8");

class FakeHttpClient {
  readonly requested: string[] = [];

  constructor(private readonly responses: Record<string, HttpTextResponse>) {}

  async getText(url: string): Promise<HttpTextResponse> {
    this.requested.push(url);
    const response = this.responses[url];
    if (response === undefined) throw new Error(`Unexpected URL: ${url}`);
    return response;
  }
}

function httpResponse(url: string, body: string, contentType: string): HttpTextResponse {
  return { statusCode: 200, finalUrl: url, headers: { "content-type": contentType }, body };
}

describe("RssProvider", () => {
  it("resolves and synchronizes RSS 2.0 full content with stable identity", async () => {
    const url = "https://example.com/feed.xml";
    const http = new FakeHttpClient({
      [url]: httpResponse(url, fixture("rss2-full.xml"), "application/rss+xml"),
    });
    const provider = new RssProvider(http);

    const resolved = await provider.resolveSource({ rawInput: url });
    const page = await provider.syncSource({
      id: "src_1",
      type: "rss",
      name: resolved.name,
      canonicalUrl: resolved.canonicalUrl,
      avatarUrl: null,
      externalId: resolved.externalId,
      providerKey: provider.key,
      status: "active",
      lastSyncedAt: null,
      nextSyncAt: null,
    });

    expect(resolved).toMatchObject({
      type: "rss",
      providerKey: "rss-native",
      name: "Example RSS",
      canonicalUrl: url,
      externalId: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(page.articles).toEqual([
      expect.objectContaining({
        externalId: "post-1",
        canonicalUrl: "https://example.com/posts/first",
        title: "First post",
        author: "Ada",
        publishedAt: "2026-09-09T03:22:11.000Z",
        rawContent: "<p>Complete article body.</p>",
        rawContentType: "html",
      }),
    ]);
  });

  it("parses Atom entries and resolves relative entry links", async () => {
    const url = "https://atom.example/atom.xml";
    const http = new FakeHttpClient({
      [url]: httpResponse(url, fixture("atom.xml"), "application/atom+xml"),
    });
    const provider = new RssProvider(http);

    const source = await provider.resolveSource({ rawInput: url });
    const page = await provider.syncSource({
      id: "src_atom",
      type: "rss",
      name: source.name,
      canonicalUrl: source.canonicalUrl,
      avatarUrl: null,
      externalId: source.externalId,
      providerKey: provider.key,
      status: "active",
      lastSyncedAt: null,
      nextSyncAt: null,
    });

    expect(source.name).toBe("Example Atom");
    expect(page.articles[0]).toMatchObject({
      externalId: "tag:atom.example,2026:one",
      canonicalUrl: "https://atom.example/posts/one",
      author: "Grace",
      rawContent: "<p>Atom full body.</p>",
    });
  });

  it("discovers a relative feed URL from an HTML page", async () => {
    const siteUrl = "https://site.example/blog";
    const feedUrl = "https://site.example/feed.xml";
    const http = new FakeHttpClient({
      [siteUrl]: httpResponse(
        siteUrl,
        '<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head></html>',
        "text/html",
      ),
      [feedUrl]: httpResponse(feedUrl, fixture("rss2-full.xml"), "application/rss+xml"),
    });

    const resolved = await new RssProvider(http).resolveSource({ rawInput: siteUrl });

    expect(resolved.canonicalUrl).toBe(feedUrl);
    expect(http.requested).toEqual([siteUrl, feedUrl]);
  });

  it("rejects DTD/XXE input", async () => {
    const url = "https://example.com/xxe.xml";
    const provider = new RssProvider(
      new FakeHttpClient({
        [url]: httpResponse(url, fixture("xxe.xml"), "application/rss+xml"),
      }),
    );

    await expect(provider.resolveSource({ rawInput: url })).rejects.toMatchObject({
      code: "PARSE_FAILED",
    });
  });

  it("rejects malformed XML", async () => {
    const url = "https://example.com/malformed.xml";
    const provider = new RssProvider(
      new FakeHttpClient({
        [url]: httpResponse(url, fixture("malformed.xml"), "application/rss+xml"),
      }),
    );

    await expect(provider.resolveSource({ rawInput: url })).rejects.toMatchObject({
      code: "PARSE_FAILED",
    });
  });

  it("does not request invalid input", async () => {
    const http = new FakeHttpClient({});
    const provider = new RssProvider(http);

    await expect(provider.resolveSource({ rawInput: "not a URL" })).rejects.toBeInstanceOf(
      ProviderError,
    );
    expect(http.requested).toEqual([]);
  });
});
