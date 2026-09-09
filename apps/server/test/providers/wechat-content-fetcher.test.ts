import { describe, expect, it } from "vitest";

import type { HttpTextResponse } from "../../src/http/safe-http-client.js";
import { DirectContentFetcher } from "../../src/providers/wechat/direct-content-fetcher.js";
import { DisabledPlaywrightContentFetcher } from "../../src/providers/wechat/playwright-content-fetcher.js";

const response = (body: string, contentType = "text/html; charset=utf-8"): HttpTextResponse => ({
  statusCode: 200,
  headers: { "content-type": contentType },
  finalUrl: "https://mp.weixin.qq.com/s/example",
  body,
});

describe("WeChat content fetchers", () => {
  it("fetches only bounded HTML through the safe external client", async () => {
    const calls: unknown[] = [];
    const fetcher = new DirectContentFetcher({
      getText: async (...args: unknown[]) => {
        calls.push(args);
        return response("<main>article</main>");
      },
    });

    await expect(fetcher.fetch("https://mp.weixin.qq.com/s/example")).resolves.toMatchObject({
      html: "<main>article</main>",
    });
    expect(calls[0]).toEqual([
      "https://mp.weixin.qq.com/s/example",
      expect.objectContaining({ maxBytes: 5 * 1024 * 1024 }),
    ]);
  });

  it.each([
    ["non-HTML", response("{}", "application/json")],
    ["login wall", response("<html>请先登录后继续访问</html>")],
  ])("rejects %s responses", async (_name, upstream) => {
    const fetcher = new DirectContentFetcher({ getText: async () => upstream });
    await expect(fetcher.fetch("https://mp.weixin.qq.com/s/example")).rejects.toMatchObject({
      code: "CONTENT_BLOCKED",
    });
  });

  it("ships the optional browser path disabled without a browser dependency", async () => {
    await expect(
      new DisabledPlaywrightContentFetcher().fetch("https://mp.weixin.qq.com/s/example"),
    ).rejects.toMatchObject({ code: "CONTENT_UNAVAILABLE" });
  });
});
