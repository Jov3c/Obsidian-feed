import { describe, expect, it } from "vitest";

import { loadConfig, secretsForRedaction } from "../src/config.js";

const token = "0123456789abcdef0123456789abcdef";

describe("loadConfig", () => {
  it("keeps WeChat disabled when no adapter is configured", () => {
    const config = loadConfig({ FEED_SERVER_TOKEN: token });

    expect(config.wechat).toMatchObject({ adapter: null, baseUrl: null, apiKey: null });
    expect(config.port).toBe(43_110);
  });

  it("rejects a partial WeRSS configuration", () => {
    expect(() =>
      loadConfig({
        FEED_SERVER_TOKEN: token,
        WECHAT_ADAPTER: "werss",
        WERSS_BASE_URL: "http://werss:8001",
      }),
    ).toThrow();
  });

  it("exposes configured secrets only through the redaction helper", () => {
    const config = loadConfig({
      FEED_SERVER_TOKEN: token,
      WECHAT_ADAPTER: "werss",
      WERSS_BASE_URL: "http://werss:8001",
      WERSS_API_KEY: "werss_secret",
    });

    expect(secretsForRedaction(config)).toEqual([token, "werss_secret"]);
  });
});
