import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDatabase } from "../../src/db/client.js";
import { migrateDatabase } from "../../src/db/migrate.js";
import { MediaRepository } from "../../src/db/repositories/media-repository.js";
import type { HttpStreamResponse } from "../../src/http/safe-http-client.js";
import { MediaService } from "../../src/media/media-service.js";

const cleanup: Array<() => Promise<void> | void> = [];
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

async function fixture(
  getStream = vi.fn(async (): Promise<HttpStreamResponse> => ({
    statusCode: 200,
    headers: { "content-type": "image/png" },
    finalUrl: "https://images.example/a.png",
    body: Readable.from(png),
  })),
) {
  const directory = await mkdtemp(join(tmpdir(), "obsidian-feed-media-"));
  const database = createDatabase(":memory:");
  migrateDatabase(database);
  cleanup.push(
    () => database.close(),
    () => rm(directory, { recursive: true, force: true }),
  );
  return {
    service: new MediaService(
      new MediaRepository(database),
      { getStream },
      { dataDir: directory, maxBytes: 20, validateUrl: async () => undefined },
    ),
    getStream,
  };
}

afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

describe("MediaService", () => {
  it("returns the same media id for the same normalized URL", async () => {
    const { service } = await fixture();
    const first = await service.registerRemote("https://images.example/a.png#fragment");
    const second = await service.registerRemote("https://images.example/a.png");
    expect(second).toEqual(first);
  });

  it("single-flights concurrent fetches and atomically stores validated bytes", async () => {
    const { service, getStream } = await fixture();
    const media = await service.registerRemote("https://images.example/a.png");
    const [first, second] = await Promise.all([
      service.getOrFetch(media.id),
      service.getOrFetch(media.id),
    ]);
    expect(getStream).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(await readFile(first.path)).toEqual(png);
    expect(first).toMatchObject({
      mimeType: "image/png",
      sizeBytes: png.length,
      etag: expect.stringMatching(/^"[a-f0-9]{64}"$/),
    });
  });

  it.each([
    ["oversized", Buffer.concat([png, Buffer.alloc(20)])],
    ["SVG", Buffer.from("<svg><script/></svg>")],
  ])("rejects %s media", async (_name, body) => {
    const { service } = await fixture(
      vi.fn(async () => ({
        statusCode: 200,
        headers: {},
        finalUrl: "https://images.example/a",
        body: Readable.from(body),
      })),
    );
    const media = await service.registerRemote("https://images.example/a");
    await expect(service.getOrFetch(media.id)).rejects.toBeDefined();
  });
});
