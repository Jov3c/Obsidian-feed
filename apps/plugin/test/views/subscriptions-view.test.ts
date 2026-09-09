// @vitest-environment jsdom

import type { ApiSubscription } from "@obsidian-feed/contracts";
import { describe, expect, it, vi } from "vitest";

import { messageForErrorCode, renderSubscriptions } from "../../src/views/subscriptions-view.js";

const subscriptions: ApiSubscription[] = [
  {
    id: "sub_w",
    enabled: true,
    source: {
      id: "src_w",
      type: "wechat",
      name: "公众号",
      avatarUrl: null,
      canonicalUrl: null,
      externalId: "w",
      providerKey: "wechat-werss",
      status: "needs_auth",
      lastSyncedAt: null,
      nextSyncAt: null,
    },
  },
  {
    id: "sub_r",
    enabled: true,
    source: {
      id: "src_r",
      type: "rss",
      name: "RSS Blog",
      avatarUrl: null,
      canonicalUrl: "https://example.com/feed",
      externalId: "r",
      providerKey: "rss-native",
      status: "active",
      lastSyncedAt: "2026-09-09T00:00:00.000Z",
      nextSyncAt: null,
    },
  },
];

describe("Subscriptions view", () => {
  it("groups WeChat and RSS with touch-accessible actions and status", () => {
    const container = document.createElement("div");
    renderSubscriptions(container, subscriptions, {
      onAdd: vi.fn(),
      onRefresh: vi.fn(),
      onDisable: vi.fn(),
    });
    expect(
      [...container.querySelectorAll(".of-subscription-group-title")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["微信公众号", "RSS"]);
    expect(container.textContent).toContain("需要重新授权");
    expect(container.querySelectorAll("button").length).toBeGreaterThanOrEqual(3);
  });

  it("maps stable server error codes to understandable Chinese", () => {
    expect(messageForErrorCode("WECHAT_AUTH_REQUIRED")).toBe("微信公众号采集服务需要重新授权");
    expect(messageForErrorCode("AUTH_INVALID")).toBe("Feed Server 未连接");
  });
});
