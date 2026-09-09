import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import { createDatabase } from "../../src/db/client.js";

const token = "0123456789abcdef0123456789abcdef";
const cleanup: Array<() => Promise<void> | void> = [];

function createTestDependencies(wechat: "ok" | "degraded" | "disabled" = "disabled") {
  const database = createDatabase(":memory:");
  cleanup.push(() => database.close());
  return {
    config: { feedServerToken: token },
    database,
    getWechatHealth: () => wechat,
    logger: false as const,
  };
}

afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

describe("health endpoints", () => {
  it("serves liveness without authentication", async () => {
    const app = buildApp(createTestDependencies());
    cleanup.push(() => app.close());

    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("reports database and disabled WeChat readiness separately", async () => {
    const app = buildApp(createTestDependencies());
    cleanup.push(() => app.close());

    const response = await app.inject({
      method: "GET",
      url: "/health/ready",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", database: "ok", wechat: "disabled" });
  });

  it("marks readiness degraded without making WeChat a database failure", async () => {
    const app = buildApp(createTestDependencies("degraded"));
    cleanup.push(() => app.close());

    const response = await app.inject({
      method: "GET",
      url: "/health/ready",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.json()).toEqual({ status: "degraded", database: "ok", wechat: "degraded" });
  });
});
