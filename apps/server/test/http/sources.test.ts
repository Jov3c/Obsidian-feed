import { refreshResultSchema, sourceStatusResponseSchema } from "@obsidian-feed/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import { createDatabase } from "../../src/db/client.js";
import { AppError } from "../../src/http/errors.js";

const token = "0123456789abcdef0123456789abcdef";
const cleanup: Array<() => Promise<void> | void> = [];

function createApp(throttled = false) {
  const database = createDatabase(":memory:");
  const app = buildApp({
    config: { feedServerToken: token },
    database,
    getWechatHealth: () => "disabled",
    sourceService: {
      getStatus: async () => ({
        id: "src_1",
        status: "active" as const,
        lastSyncedAt: null,
        nextSyncAt: null,
        lastError: null,
      }),
      refresh: async () => {
        if (throttled)
          throw new AppError("SOURCE_REFRESH_THROTTLED", 429, true, "Refresh throttled", 60);
        return { status: "accepted" as const, sourceId: "src_1" };
      },
    },
    systemStatus: async () => ({ version: 1, scheduler: "running" }),
    logger: false,
  });
  cleanup.push(
    () => database.close(),
    () => app.close(),
  );
  return app;
}

afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

describe("source and system routes", () => {
  it("matches source status, refresh, and system OpenAPI shapes", async () => {
    const app = createApp();
    const headers = { authorization: `Bearer ${token}` };
    expect(
      sourceStatusResponseSchema.parse(
        (await app.inject({ method: "GET", url: "/v1/sources/src_1/status", headers })).json(),
      ).id,
    ).toBe("src_1");
    expect(
      refreshResultSchema.parse(
        (await app.inject({ method: "POST", url: "/v1/sources/src_1/refresh", headers })).json(),
      ).status,
    ).toBe("accepted");
    expect((await app.inject({ method: "GET", url: "/v1/system/status", headers })).json()).toEqual(
      { version: 1, scheduler: "running" },
    );
  });

  it("returns 429 and Retry-After when refresh is throttled", async () => {
    const response = await createApp(true).inject({
      method: "POST",
      url: "/v1/sources/src_1/refresh",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(429);
    expect(response.json().error).toMatchObject({
      code: "SOURCE_REFRESH_THROTTLED",
      retryAfterSeconds: 60,
    });
  });
});
