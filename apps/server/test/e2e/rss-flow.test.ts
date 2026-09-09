import { afterEach, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "../../src/db/client.js";
import { migrateDatabase } from "../../src/db/migrate.js";
import { ProviderRegistry } from "../../src/providers/registry.js";
import { RssProvider } from "../../src/providers/rss/rss-provider.js";
import { createRuntimeApp } from "../../src/runtime.js";
import { closeServer, headers, listen, testConfig } from "./helpers.js";

describe("RSS end-to-end flow", () => {
  let database: Database | undefined;
  afterEach(() => database?.close());

  it("resolves, subscribes, syncs, lists and returns a parsed document", async () => {
    const fixture = await listen((request, response) => {
      if (request.url === "/article") {
        response.setHeader("content-type", "text/html");
        response.end("<article><p>End to end RSS body.</p></article>");
        return;
      }
      response.setHeader("content-type", "application/rss+xml");
      response.end(`<?xml version="1.0"?><rss version="2.0"><channel>
        <title>Fixture Feed</title><link>http://${request.headers.host}/</link>
        <item><guid>entry-1</guid><title>Fixture Article</title>
        <link>http://${request.headers.host}/article</link>
        </item></channel></rss>`);
    });
    const providers = new ProviderRegistry();
    providers.register(
      new RssProvider({
        getText: async (url) => {
          const response = await fetch(url);
          return {
            statusCode: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            finalUrl: response.url,
            body: await response.text(),
          };
        },
      }),
    );
    database = createDatabase(":memory:");
    migrateDatabase(database);
    const app = createRuntimeApp({ config: testConfig(), database, providers });
    try {
      expect(app.hasRoute({ method: "GET", url: "/v1/media/:id" })).toBe(true);
      expect((await app.inject({ method: "GET", url: "/v1/media/missing" })).statusCode).toBe(401);
      expect(
        (await app.inject({ method: "GET", url: "/v1/media/missing", headers })).statusCode,
      ).toBe(404);
      const resolved = await app.inject({
        method: "POST",
        url: "/v1/subscriptions/resolve",
        headers,
        payload: { input: `${fixture.origin}/feed.xml` },
      });
      expect(resolved.statusCode).toBe(200);
      const candidate = resolved.json().candidate as { resolutionToken: string };
      const subscribed = await app.inject({
        method: "POST",
        url: "/v1/subscriptions",
        headers,
        payload: { resolutionToken: candidate.resolutionToken },
      });
      expect(subscribed.statusCode).toBe(200);
      const sourceId = subscribed.json().subscription.source.id as string;
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/v1/sources/${sourceId}/refresh`,
            headers,
          })
        ).statusCode,
      ).toBe(202);

      let items: Array<{ id: string }> = [];
      for (let attempt = 0; attempt < 20 && items.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        items = (await app.inject({ method: "GET", url: "/v1/articles?limit=30", headers })).json()
          .items;
      }
      expect(items).toHaveLength(1);
      const detail = await app.inject({
        method: "GET",
        url: `/v1/articles/${items[0]!.id}`,
        headers,
      });
      expect(detail.statusCode).toBe(200);
      expect(JSON.stringify(detail.json().document)).toContain("End to end RSS body.");
    } finally {
      await app.close();
      await closeServer(fixture.server);
    }
  });
});
