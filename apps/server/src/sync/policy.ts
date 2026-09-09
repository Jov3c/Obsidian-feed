import type { Source } from "../providers/types.js";

export type SyncPolicyOutcome = "success" | "failure" | "rate_limited" | "auth_required";

export interface NextSyncInput {
  now: Date;
  sourceType: Source["type"];
  outcome: SyncPolicyOutcome;
  newArticles?: number;
  emptyStreak?: number;
  consecutiveFailures?: number;
  retryAfterSeconds?: number;
  baseIntervalMinutes?: number;
  random?: () => number;
}

export function computeSyncState(outcome: SyncPolicyOutcome): Source["status"] {
  if (outcome === "auth_required") return "needs_auth";
  if (outcome === "rate_limited") return "rate_limited";
  if (outcome === "failure") return "unavailable";
  return "active";
}

export function computeNextSync(input: NextSyncInput): Date {
  let minutes: number;
  if (input.outcome === "auth_required") {
    minutes = 720;
  } else if (input.outcome === "rate_limited") {
    const floor = input.sourceType === "wechat" ? 60 : 15;
    minutes = Math.max(floor, (input.retryAfterSeconds ?? 0) / 60);
    minutes = Math.min(minutes, input.sourceType === "wechat" ? 720 : 480);
  } else if (input.outcome === "failure") {
    const delays = [15, 30, 60, 120, 240];
    const failures = Math.max(1, input.consecutiveFailures ?? 1);
    minutes = delays[failures - 1] ?? (input.sourceType === "wechat" ? 720 : 480);
  } else {
    const base = input.baseIntervalMinutes ?? (input.sourceType === "wechat" ? 60 : 30);
    const emptyStreak = input.newArticles === 0 ? (input.emptyStreak ?? 0) : 0;
    const multiplier = emptyStreak >= 6 ? 2 : emptyStreak >= 3 ? 1.5 : 1;
    const cap = Math.max(base, input.sourceType === "wechat" ? 240 : 120);
    minutes = Math.min(base * multiplier, cap);
  }
  const random = input.random ?? Math.random;
  const jitter = 0.9 + random() * 0.2;
  return new Date(input.now.getTime() + minutes * jitter * 60_000);
}
