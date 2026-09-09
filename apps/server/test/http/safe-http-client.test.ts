import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";

import {
  SafeExternalHttpClient,
  type RawHttpResponse,
  type RequestOnce,
} from "../../src/http/safe-http-client.js";
import { TrustedUpstreamClient } from "../../src/http/trusted-upstream-client.js";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 as const }];

function response(
  statusCode: number,
  body: string,
  headers: Record<string, string> = {},
): RawHttpResponse {
  return {
    statusCode,
    headers,
    body: Readable.from(Buffer.from(body)),
  };
}

describe("SafeExternalHttpClient", () => {
  it("blocks a redirect from a public host to a private target", async () => {
    let requests = 0;
    const requestOnce: RequestOnce = async () => {
      requests += 1;
      return response(302, "", { location: "http://127.0.0.1/admin" });
    };
    const client = new SafeExternalHttpClient({ lookup: publicLookup, requestOnce });

    await expect(
      client.getText("https://example.com/start", { maxBytes: 1024 }),
    ).rejects.toMatchObject({
      code: "SSRF_BLOCKED",
    });
    expect(requests).toBe(1);
  });

  it("rejects responses larger than the configured body limit", async () => {
    const client = new SafeExternalHttpClient({
      lookup: publicLookup,
      requestOnce: async () => response(200, "too large"),
    });

    await expect(client.getText("https://example.com/feed", { maxBytes: 3 })).rejects.toMatchObject(
      {
        code: "UPSTREAM_UNAVAILABLE",
      },
    );
  });

  it("returns final URL, status, headers and text for a safe response", async () => {
    const client = new SafeExternalHttpClient({
      lookup: publicLookup,
      requestOnce: async () => response(200, "hello", { "content-type": "text/plain" }),
    });

    await expect(client.getText("https://example.com/feed", { maxBytes: 100 })).resolves.toEqual({
      statusCode: 200,
      headers: { "content-type": "text/plain" },
      finalUrl: "https://example.com/feed",
      body: "hello",
    });
  });
});

describe("TrustedUpstreamClient", () => {
  it("keeps every request on the configured upstream origin", async () => {
    const client = new TrustedUpstreamClient("http://werss:8001", {
      requestOnce: async () => response(200, "ok"),
    });

    await expect(
      client.getText("https://attacker.example/steal", { maxBytes: 100 }),
    ).rejects.toThrow("relative");
  });
});
