import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../../src/app.js";
import { createDatabase } from "../../src/db/client.js";
import { ProviderError, type Source } from "../../src/providers/types.js";
import { SyncTaskPool } from "../../src/sync/task-pool.js";
import { SyncWorker } from "../../src/sync/worker.js";

const source: Source = {
  id: "src_1",
  type: "rss",
  name: "Feed",
  canonicalUrl: "https://example.com/feed",
  avatarUrl: null,
  externalId: "feed",
  providerKey: "rss-native",
  providerMeta: {},
  status: "active",
  lastSyncedAt: null,
  nextSyncAt: null,
};

describe("SyncWorker", () => {
  it("syncs, ingests, updates state, and finalizes a success log", async () => {
    const finish = vi.fn();
    const updateSyncState = vi.fn();
    const worker = new SyncWorker({
      sources: { findById: async () => source, updateSyncState },
      logs: { start: async () => ({ id: "sync_1" }), finish },
      providers: {
        getByKey: () => ({ syncSource: async () => ({ articles: [], hasMore: false }) }),
      },
      ingest: {
        ingestProviderArticles: async () => ({ processed: 0, added: 0, updated: 0, failed: 0 }),
      },
      now: () => new Date("2026-09-09T00:00:00.000Z"),
      random: () => 0.5,
    });
    await expect(worker.syncOneSource("src_1")).resolves.toMatchObject({
      status: "success",
      newArticles: 0,
    });
    expect(updateSyncState).toHaveBeenCalledWith(
      "src_1",
      expect.objectContaining({ status: "active", consecutiveFailures: 0 }),
    );
    expect(finish).toHaveBeenCalledWith("sync_1", expect.objectContaining({ status: "success" }));
  });

  it("normalizes provider failures and always finalizes the log", async () => {
    const finish = vi.fn();
    const updateSyncState = vi.fn();
    const worker = new SyncWorker({
      sources: { findById: async () => source, updateSyncState },
      logs: { start: async () => ({ id: "sync_2" }), finish },
      providers: {
        getByKey: () => ({
          syncSource: async () => {
            throw new ProviderError("UPSTREAM_RATE_LIMITED", "slow down", true, "rss-native", 3600);
          },
        }),
      },
      ingest: {
        ingestProviderArticles: async () => ({ processed: 0, added: 0, updated: 0, failed: 0 }),
      },
      now: () => new Date("2026-09-09T00:00:00.000Z"),
      random: () => 0.5,
    });
    await expect(worker.syncOneSource("src_1")).resolves.toMatchObject({
      status: "failed",
      errorCode: "UPSTREAM_RATE_LIMITED",
    });
    expect(updateSyncState).toHaveBeenCalledWith(
      "src_1",
      expect.objectContaining({ status: "rate_limited", consecutiveFailures: 1 }),
    );
    expect(finish).toHaveBeenCalledWith(
      "sync_2",
      expect.objectContaining({ status: "failed", errorCode: "UPSTREAM_RATE_LIMITED" }),
    );
  });
});

describe("sync scheduling", () => {
  it("enforces separate global and WeChat concurrency", async () => {
    const pool = new SyncTaskPool(2, 1);
    let active = 0;
    let activeWechat = 0;
    let maxActive = 0;
    let maxWechat = 0;
    const task = (type: "rss" | "wechat") =>
      pool.submit(type, async () => {
        active += 1;
        if (type === "wechat") activeWechat += 1;
        maxActive = Math.max(maxActive, active);
        maxWechat = Math.max(maxWechat, activeWechat);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        if (type === "wechat") activeWechat -= 1;
      });
    await Promise.all([task("wechat"), task("wechat"), task("rss")]);
    expect(maxActive).toBe(2);
    expect(maxWechat).toBe(1);
  });

  it("starts and stops an injected scheduler with the app lifecycle", async () => {
    const database = createDatabase(":memory:");
    const scheduler = { start: vi.fn(), stop: vi.fn() };
    const app = buildApp({
      config: { feedServerToken: "0123456789abcdef0123456789abcdef" },
      database,
      getWechatHealth: () => "disabled",
      scheduler,
      logger: false,
    });
    await app.ready();
    await app.close();
    database.close();
    expect(scheduler.start).toHaveBeenCalledOnce();
    expect(scheduler.stop).toHaveBeenCalledOnce();
  });
});
