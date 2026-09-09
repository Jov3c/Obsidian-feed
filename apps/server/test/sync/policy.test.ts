import { describe, expect, it } from "vitest";

import { computeNextSync, computeSyncState } from "../../src/sync/policy.js";

const now = new Date("2026-09-09T00:00:00.000Z");
const minutes = (value: number) => new Date(now.getTime() + value * 60_000);

describe("adaptive sync policy", () => {
  it("returns to the normal interval after success with new articles", () => {
    expect(
      computeNextSync({
        now,
        sourceType: "rss",
        outcome: "success",
        newArticles: 2,
        random: () => 0.5,
      }),
    ).toEqual(minutes(30));
    expect(
      computeNextSync({
        now,
        sourceType: "rss",
        outcome: "success",
        newArticles: 2,
        baseIntervalMinutes: 12,
        random: () => 0.5,
      }),
    ).toEqual(minutes(12));
  });

  it("backs off empty feeds at streaks three and six with a type cap", () => {
    expect(
      computeNextSync({
        now,
        sourceType: "rss",
        outcome: "success",
        newArticles: 0,
        emptyStreak: 3,
        random: () => 0.5,
      }),
    ).toEqual(minutes(45));
    expect(
      computeNextSync({
        now,
        sourceType: "wechat",
        outcome: "success",
        newArticles: 0,
        emptyStreak: 6,
        random: () => 0.5,
      }),
    ).toEqual(minutes(120));
  });

  it("uses exponential failure delays, Retry-After, and the maximum cap", () => {
    expect(
      computeNextSync({
        now,
        sourceType: "rss",
        outcome: "failure",
        consecutiveFailures: 1,
        random: () => 0.5,
      }),
    ).toEqual(minutes(15));
    expect(
      computeNextSync({
        now,
        sourceType: "wechat",
        outcome: "failure",
        consecutiveFailures: 9,
        random: () => 0.5,
      }),
    ).toEqual(minutes(720));
    expect(
      computeNextSync({
        now,
        sourceType: "wechat",
        outcome: "rate_limited",
        consecutiveFailures: 1,
        retryAfterSeconds: 7200,
        random: () => 0.5,
      }),
    ).toEqual(minutes(120));
  });

  it("pauses auth failures for twelve hours and maps statuses", () => {
    expect(
      computeNextSync({
        now,
        sourceType: "wechat",
        outcome: "auth_required",
        consecutiveFailures: 1,
        random: () => 0.5,
      }),
    ).toEqual(minutes(720));
    expect(computeSyncState("auth_required")).toBe("needs_auth");
    expect(computeSyncState("rate_limited")).toBe("rate_limited");
    expect(computeSyncState("success")).toBe("active");
  });
});
