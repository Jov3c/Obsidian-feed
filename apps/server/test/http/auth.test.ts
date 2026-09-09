import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import { createDatabase } from "../../src/db/client.js";

const token = "0123456789abcdef0123456789abcdef";
const cleanup: Array<() => Promise<void> | void> = [];

function createApp() {
  const database = createDatabase(":memory:");
  const app = buildApp({
    config: { feedServerToken: token },
    database,
    getWechatHealth: () => "disabled",
    logger: false,
  });
  cleanup.push(() => database.close());
  cleanup.push(() => app.close());
  return app;
}

afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

describe("Bearer authentication", () => {
  it("rejects a missing token on readiness", async () => {
    const response = await createApp().inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: "AUTH_INVALID",
        message: "Invalid or missing bearer token",
        retryable: false,
        requestId: expect.stringMatching(/^req_/),
      },
    });
    expect(response.body).not.toContain("stack");
    expect(response.body).not.toContain(token);
  });

  it("rejects a wrong token before an unknown business route is resolved", async () => {
    const response = await createApp().inject({
      method: "GET",
      url: "/v1/not-registered",
      headers: { authorization: "Bearer wrong-token" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("AUTH_INVALID");
  });

  it("serializes framework errors with the stable public shape", async () => {
    const response = await createApp().inject({
      method: "GET",
      url: "/v1/not-registered",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Request failed",
        retryable: false,
        requestId: expect.stringMatching(/^req_/),
      },
    });
  });
});
