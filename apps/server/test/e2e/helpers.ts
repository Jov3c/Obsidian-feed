import { createServer, type RequestListener, type Server } from "node:http";

import type { AppConfig } from "../../src/config.js";

export const token = "0123456789abcdef0123456789abcdef";
export const headers = { authorization: `Bearer ${token}` };

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 43110,
    host: "127.0.0.1",
    feedServerToken: token,
    databasePath: ":memory:",
    dataDir: "data",
    wechat: {
      adapter: null,
      baseUrl: null,
      apiKey: null,
      requestTimeoutMs: 2_000,
      initialBackfillLimit: 30,
      pageSize: 20,
      maxPages: 3,
      playwrightEnabled: false,
    },
    sync: {
      tickSeconds: 60,
      maxConcurrency: 2,
      rssIntervalMinutes: 30,
      wechatIntervalMinutes: 60,
    },
    externalFetch: { maxBytes: 5_242_880, maxRedirects: 5 },
    media: { maxBytes: 20_971_520, cacheMaxBytes: 2_147_483_648, fetchTimeoutMs: 2_000 },
    ...overrides,
  };
}

export async function listen(
  handler: RequestListener,
): Promise<{ server: Server; origin: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server did not listen");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

export async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
