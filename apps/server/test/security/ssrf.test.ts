import { describe, expect, it } from "vitest";

import { assertSafeExternalUrl } from "../../src/http/safe-url.js";

describe("external URL safety", () => {
  it.each([
    "http://127.0.0.1",
    "http://localhost",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.1",
    "http://172.16.0.1",
    "http://192.168.1.1",
    "http://[::1]",
    "http://[fe80::1]",
    "http://[fc00::1]",
    "http://2130706433",
    "http://service.local",
    "file:///etc/passwd",
    "http://user:password@example.com",
  ])("rejects non-public target %s", async (url) => {
    await expect(assertSafeExternalUrl(url)).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });

  it("rejects a hostname resolving to a mix of public and private addresses", async () => {
    await expect(
      assertSafeExternalUrl("https://mixed.example/article", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.2", family: 4 },
      ]),
    ).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });

  it("returns a pinned public address for an allowed URL", async () => {
    await expect(
      assertSafeExternalUrl("https://example.com/article", async () => [
        { address: "93.184.216.34", family: 4 },
      ]),
    ).resolves.toMatchObject({
      url: new URL("https://example.com/article"),
      address: "93.184.216.34",
      family: 4,
    });
  });
});
