import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import { createDatabase } from "../../src/db/client.js";
import type { MediaFile, MediaRef } from "../../src/media/media-service.js";

const token = "0123456789abcdef0123456789abcdef";
const cleanup: Array<() => Promise<void> | void> = [];

function createApp() {
  const database = createDatabase(":memory:");
  const bytes = Buffer.from("image");
  const mediaService = {
    registerRemote: async (): Promise<MediaRef> => ({ id: "med_test", src: "/v1/media/med_test" }),
    getOrFetch: async (): Promise<MediaFile> => ({
      path: "unused",
      bytes,
      mimeType: "image/png",
      sizeBytes: bytes.length,
      etag: '"abc"',
    }),
  };
  const app = buildApp({
    config: { feedServerToken: token },
    database,
    getWechatHealth: () => "disabled",
    mediaService,
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

describe("media route", () => {
  it("requires bearer auth and serves validated private image bytes", async () => {
    const app = createApp();
    expect((await app.inject({ method: "GET", url: "/v1/media/med_test" })).statusCode).toBe(401);
    const response = await app.inject({
      method: "GET",
      url: "/v1/media/med_test",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({
      "content-type": "image/png",
      etag: '"abc"',
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
    });
    expect(response.rawPayload).toEqual(Buffer.from("image"));
  });

  it("returns 304 when If-None-Match matches", async () => {
    const response = await createApp().inject({
      method: "GET",
      url: "/v1/media/med_test",
      headers: { authorization: `Bearer ${token}`, "if-none-match": '"abc"' },
    });
    expect(response.statusCode).toBe(304);
    expect(response.body).toBe("");
  });
});
