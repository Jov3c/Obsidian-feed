// @vitest-environment jsdom

import type { ApiArticleListItem } from "@obsidian-feed/contracts";
import { describe, expect, it, vi } from "vitest";

import { renderToday } from "../../src/views/today-view.js";

const item: ApiArticleListItem = {
  id: "art_1",
  title: "一篇值得阅读的文章",
  author: null,
  canonicalUrl: "https://example.com/1",
  publishedAt: "2026-09-09T02:32:00.000Z",
  contentStatus: "ready",
  source: { id: "src_1", type: "rss", name: "示例来源", avatarUrl: null },
};

describe("Today view", () => {
  it("renders only title, source and time with accessible read state", () => {
    const container = document.createElement("div");
    renderToday(
      container,
      { items: [item], nextCursor: null, loading: false, loadingMore: false, error: null },
      {
        reading: { art_1: { read: false, progress: 0 } },
        onOpen: vi.fn(),
        onLoadMore: vi.fn(),
      },
    );
    const row = container.querySelector<HTMLElement>(".of-article-row")!;
    expect(row.textContent).toContain("一篇值得阅读的文章");
    expect(row.textContent).toContain("示例来源");
    expect(row.textContent).not.toContain("摘要");
    expect(row.tabIndex).toBe(0);
    expect(row.getAttribute("aria-label")).toContain("未读");
    expect(row.classList.contains("is-unread")).toBe(true);
  });

  it("opens from keyboard Enter", () => {
    const container = document.createElement("div");
    const onOpen = vi.fn();
    renderToday(
      container,
      { items: [item], nextCursor: null, loading: false, loadingMore: false, error: null },
      { reading: {}, onOpen, onLoadMore: vi.fn() },
    );
    container
      .querySelector<HTMLElement>(".of-article-row")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onOpen).toHaveBeenCalledWith("art_1");
  });
});
