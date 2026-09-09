import type { ApiSubscription } from "@obsidian-feed/contracts";

import { actionButton, element } from "./dom.js";

export function messageForErrorCode(code: string): string {
  const messages: Record<string, string> = {
    WECHAT_AUTH_REQUIRED: "微信公众号采集服务需要重新授权",
    WECHAT_RATE_LIMITED: "公众号同步暂时受到频率限制，稍后会自动重试",
    INVALID_SOURCE_URL: "这不是可识别的 RSS/Atom 或微信公众号文章链接",
    UNSUPPORTED_SOURCE: "这不是可识别的 RSS/Atom 或微信公众号文章链接",
    AUTH_INVALID: "Feed Server 未连接",
    UPSTREAM_TIMEOUT: "该链接暂时无法访问",
  };
  return messages[code] ?? "操作暂时失败，请稍后重试";
}

function statusText(subscription: ApiSubscription): string {
  if (subscription.source.status === "needs_auth") return "需要重新授权";
  if (subscription.source.status === "rate_limited") return "同步受限";
  if (subscription.source.status === "unavailable") return "暂时不可用";
  if (!subscription.source.lastSyncedAt) return "等待首次同步";
  return "已同步";
}

export function renderSubscriptions(
  container: HTMLElement,
  subscriptions: ApiSubscription[],
  actions: {
    onAdd(): void;
    onRefresh(sourceId: string): void;
    onDisable(subscriptionId: string): void;
  },
): void {
  container.replaceChildren();
  const document = container.ownerDocument;
  const header = element(document, "div", "of-section-header");
  header.append(element(document, "h2", "of-section-title", "订阅"));
  header.append(actionButton(document, "添加", actions.onAdd));
  container.append(header);
  for (const [type, label] of [
    ["wechat", "微信公众号"],
    ["rss", "RSS"],
  ] as const) {
    const entries = subscriptions.filter(
      (subscription) => subscription.enabled && subscription.source.type === type,
    );
    if (entries.length === 0) continue;
    const group = element(document, "section", "of-subscription-group");
    group.append(element(document, "h3", "of-subscription-group-title", label));
    for (const subscription of entries) {
      const row = element(document, "div", "of-subscription-row");
      const text = element(document, "div", "of-subscription-copy");
      text.append(element(document, "div", "of-subscription-name", subscription.source.name));
      text.append(element(document, "div", "of-subscription-status", statusText(subscription)));
      const controls = element(document, "div", "of-subscription-actions");
      controls.append(
        actionButton(document, "刷新", () => actions.onRefresh(subscription.source.id)),
        actionButton(document, "取消订阅", () => actions.onDisable(subscription.id)),
      );
      row.append(text, controls);
      group.append(row);
    }
    container.append(group);
  }
}
