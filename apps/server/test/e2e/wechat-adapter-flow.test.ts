import { afterEach, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "../../src/db/client.js";
import { migrateDatabase } from "../../src/db/migrate.js";
import { ProviderError } from "../../src/providers/types.js";
import { WeRssAdapter } from "../../src/providers/wechat/werss-adapter.js";
import { createRuntimeApp } from "../../src/runtime.js";
import { closeServer, headers, listen, testConfig } from "./helpers.js";

describe("WeChat adapter end-to-end flow", () => {
  let database: Database | undefined;
  afterEach(() => database?.close());

  it("uses mock WeRSS through subscription, sync and parsing, and preserves 429 semantics", async () => {
    let rateLimited = false;
    const fixture = await listen((request, response) => {
      response.setHeader("content-type", "application/json");
      if (request.url?.startsWith("/api/v1/wx/mps/by_article")) {
        response.end(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              mp_info: { mp_name: "Fixture WeChat", logo: null, biz: "biz_fixture" },
              description: "Fixture account",
            },
          }),
        );
      } else if (request.method === "GET" && request.url?.startsWith("/api/v1/wx/mps?")) {
        response.end(JSON.stringify({ code: 0, message: "ok", data: { list: [], total: 0 } }));
      } else if (request.method === "POST" && request.url === "/api/v1/wx/mps") {
        response.end(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              id: "upstream_1",
              mp_name: "Fixture WeChat",
              mp_cover: null,
              faker_id: "faker_1",
            },
          }),
        );
      } else if (request.url?.startsWith("/api/v1/wx/articles")) {
        if (rateLimited) {
          response.statusCode = 429;
          response.setHeader("retry-after", "120");
          response.end(JSON.stringify({ code: 429, message: "slow down", data: {} }));
        } else {
          response.end(
            JSON.stringify({
              code: 0,
              message: "ok",
              data: {
                list: [
                  {
                    id: "wx_article_1",
                    title: "Fixture WeChat Article",
                    url: "https://mp.weixin.qq.com/s/fixture-article",
                    author: "Fixture Author",
                    pic_url: null,
                    publish_time: 1_788_825_600,
                    content: '<div id="js_content"><p>End to end WeChat body.</p></div>',
                  },
                ],
                total: 1,
              },
            }),
          );
        }
      } else {
        response.statusCode = 404;
        response.end(JSON.stringify({ code: 404, message: "not found", data: {} }));
      }
    });
    const wechat = {
      adapter: "werss" as const,
      baseUrl: fixture.origin,
      apiKey: "werss-secret",
      requestTimeoutMs: 2_000,
      initialBackfillLimit: 30,
      pageSize: 20,
      maxPages: 3,
      playwrightEnabled: false,
    };
    database = createDatabase(":memory:");
    migrateDatabase(database);
    const app = createRuntimeApp({ config: testConfig({ wechat }), database });
    try {
      const resolved = await app.inject({
        method: "POST",
        url: "/v1/subscriptions/resolve",
        headers,
        payload: { input: "https://mp.weixin.qq.com/s/fixture-source" },
      });
      expect(resolved.statusCode).toBe(200);
      const subscribed = await app.inject({
        method: "POST",
        url: "/v1/subscriptions",
        headers,
        payload: { resolutionToken: resolved.json().candidate.resolutionToken },
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
      expect(JSON.stringify(detail.json().document)).toContain("End to end WeChat body.");

      const ready = await app.inject({ method: "GET", url: "/health/ready", headers });
      expect(ready.json()).toMatchObject({ status: "ok", database: "ok", wechat: "ok" });

      rateLimited = true;
      const adapter = new WeRssAdapter({
        baseUrl: fixture.origin,
        apiKey: "werss-secret",
        requestTimeoutMs: 2_000,
      });
      await expect(
        adapter.listArticles(
          { id: "upstream_1", externalId: "faker_1", name: "Fixture", avatarUrl: null },
          { limit: 20, offset: 0 },
        ),
      ).rejects.toMatchObject<Partial<ProviderError>>({
        code: "UPSTREAM_RATE_LIMITED",
        retryable: true,
        retryAfterSeconds: 120,
      });
    } finally {
      await app.close();
      await closeServer(fixture.server);
    }
  });
});
