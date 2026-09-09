import type { ApiArticleListItem } from "@obsidian-feed/contracts";

import type { ReadingState } from "../state/plugin-data.js";
import { actionButton, element } from "./dom.js";

export interface TodayState {
  items: ApiArticleListItem[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

function timeLabel(value: string | null): string {
  if (!value) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function renderToday(
  container: HTMLElement,
  state: TodayState,
  dependencies: {
    reading: Record<string, ReadingState>;
    onOpen(id: string): void;
    onLoadMore(): void;
  },
): void {
  container.replaceChildren();
  const document = container.ownerDocument;
  const list = element(document, "div", "of-article-list");
  for (const item of state.items) {
    const read = dependencies.reading[item.id]?.read ?? false;
    const row = element(document, "div", `of-article-row ${read ? "is-read" : "is-unread"}`);
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `${item.title}，${item.source.name}，${read ? "已读" : "未读"}`);
    row.append(element(document, "div", "of-article-title", item.title));
    row.append(
      element(
        document,
        "div",
        "of-article-meta",
        `${item.source.name} · ${timeLabel(item.publishedAt)}`,
      ),
    );
    const open = () => dependencies.onOpen(item.id);
    row.addEventListener("click", open);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
    list.append(row);
  }
  container.append(list);
  if (state.loading) container.append(element(document, "p", "of-state", "正在加载…"));
  else if (state.error) container.append(element(document, "p", "of-state is-error", state.error));
  else if (state.nextCursor)
    container.append(
      actionButton(document, state.loadingMore ? "正在加载…" : "加载更多", dependencies.onLoadMore),
    );
  else if (state.items.length === 0)
    container.append(element(document, "p", "of-state", "今天还没有新文章。"));
}

export class TodayController {
  state: TodayState = {
    items: [],
    nextCursor: null,
    loading: false,
    loadingMore: false,
    error: null,
  };
  private sequence = 0;

  constructor(
    private readonly load: (cursor?: string) => Promise<{
      items: ApiArticleListItem[];
      nextCursor: string | null;
    }>,
    private readonly changed: () => void,
  ) {}

  async reload(): Promise<void> {
    const sequence = ++this.sequence;
    this.state = { ...this.state, loading: true, error: null };
    this.changed();
    try {
      const page = await this.load();
      if (sequence !== this.sequence) return;
      this.state = {
        ...this.state,
        items: page.items,
        nextCursor: page.nextCursor,
        loading: false,
      };
    } catch {
      if (sequence === this.sequence)
        this.state = { ...this.state, loading: false, error: "文章列表加载失败" };
    }
    this.changed();
  }

  async loadMore(): Promise<void> {
    const cursor = this.state.nextCursor;
    if (!cursor || this.state.loadingMore) return;
    const sequence = this.sequence;
    this.state = { ...this.state, loadingMore: true };
    this.changed();
    try {
      const page = await this.load(cursor);
      if (sequence !== this.sequence) return;
      this.state = {
        ...this.state,
        items: [...this.state.items, ...page.items],
        nextCursor: page.nextCursor,
        loadingMore: false,
      };
    } catch {
      if (sequence === this.sequence)
        this.state = { ...this.state, loadingMore: false, error: "更多文章加载失败" };
    }
    this.changed();
  }
}
