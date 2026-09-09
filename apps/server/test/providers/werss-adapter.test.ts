import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { ProviderError } from "../../src/providers/types.js";
import { WeRssAdapter } from "../../src/providers/wechat/werss-adapter.js";

const apiKey = "werss_test_secret_key";
const cleanup: Array<() => Promise<void>> = [];

async function startMock(register: (app: FastifyInstance) => void): Promise<string> {
  const app = Fastify({ logger: false });
  register(app);
  await app.listen({ host: "127.0.0.1", port: 0 });
  cleanup.push(() => app.close());
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("Mock server did not bind TCP");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

describe("WeRssAdapter", () => {
  it("maps current wrapper responses and sends the API key", async () => {
    const seenKeys: string[] = [];
    const baseUrl = await startMock((app) => {
      app.addHook("onRequest", async (request) =>
        seenKeys.push(String(request.headers["x-api-key"])),
      );
      app.post("/api/v1/wx/mps/by_article", async () => ({
        code: 0,
        message: "success",
        data: {
          id: "article-1",
          title: "An article",
          content: "<p>body</p>",
          mp_info: {
            mp_name: "Example MP",
            logo: "https://img.example/avatar.jpg",
            biz: "ZmFrZXI=",
          },
        },
      }));
      app.post("/api/v1/wx/mps", async () => ({
        code: 0,
        message: "success",
        data: {
          id: "MP_WXS_fake",
          mp_name: "Example MP",
          mp_cover: "https://img.example/avatar.jpg",
          faker_id: "ZmFrZXI=",
        },
      }));
      app.get("/api/v1/wx/articles", async (request) => {
        expect(request.query).toMatchObject({ mp_id: "MP_WXS_fake", limit: "20", offset: "0" });
        return {
          code: 0,
          message: "success",
          data: {
            list: [
              {
                id: "a1",
                mp_id: "MP_WXS_fake",
                title: "First",
                url: "https://mp.weixin.qq.com/s/one",
                pic_url: "https://img.example/one.jpg",
                publish_time: 1788922800000,
                content: "<p>full</p>",
              },
            ],
            total: 1,
          },
        };
      });
    });
    const adapter = new WeRssAdapter({ baseUrl, apiKey, requestTimeoutMs: 2_000 });

    const candidate = await adapter.resolveByArticleUrl("https://mp.weixin.qq.com/s/example");
    const source = await adapter.ensureSubscribed(candidate);
    const page = await adapter.listArticles(source, { limit: 20, offset: 0 });

    expect(candidate).toMatchObject({
      name: "Example MP",
      encodedId: "ZmFrZXI=",
      avatarUrl: "https://img.example/avatar.jpg",
    });
    expect(source).toMatchObject({ id: "MP_WXS_fake", externalId: "ZmFrZXI=" });
    expect(page.articles[0]).toMatchObject({
      id: "a1",
      canonicalUrl: "https://mp.weixin.qq.com/s/one",
      publishedAt: "2026-09-09T03:00:00.000Z",
      rawContent: "<p>full</p>",
    });
    expect(await adapter.fetchContent(page.articles[0]!)).toEqual({
      html: "<p>full</p>",
      canonicalUrl: "https://mp.weixin.qq.com/s/one",
    });
    expect(seenKeys).toEqual([apiKey, apiKey, apiKey]);
  });

  it.each([
    [401, "UPSTREAM_AUTH_REQUIRED"],
    [429, "UPSTREAM_RATE_LIMITED"],
  ] as const)("maps HTTP %s to %s", async (statusCode, code) => {
    const baseUrl = await startMock((app) => {
      app.post("/api/v1/wx/mps/by_article", async (_request, reply) =>
        reply.status(statusCode).send({ detail: "denied" }),
      );
    });
    const adapter = new WeRssAdapter({ baseUrl, apiKey, requestTimeoutMs: 2_000 });

    await expect(
      adapter.resolveByArticleUrl("https://mp.weixin.qq.com/s/example"),
    ).rejects.toMatchObject({ code });
  });

  it("rejects malformed upstream data without exposing the API key", async () => {
    const baseUrl = await startMock((app) => {
      app.post("/api/v1/wx/mps/by_article", async () => ({
        code: 0,
        message: "success",
        data: { unexpected: true },
      }));
    });
    const adapter = new WeRssAdapter({ baseUrl, apiKey, requestTimeoutMs: 2_000 });

    const error = await adapter
      .resolveByArticleUrl("https://mp.weixin.qq.com/s/example")
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(JSON.stringify(error)).not.toContain(apiKey);
    expect(String(error)).not.toContain(apiKey);
  });
});
