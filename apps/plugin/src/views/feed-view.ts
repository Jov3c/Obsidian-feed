import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";

import type ObsidianFeedPlugin from "../main.js";
import { AddSubscriptionModal } from "./add-subscription-modal.js";
import { applyReaderPreferences } from "./appearance.js";
import { actionButton, element } from "./dom.js";
import { renderSubscriptions } from "./subscriptions-view.js";
import { renderToday, TodayController } from "./today-view.js";
import { ReaderViewController } from "./reader-view.js";

export const FEED_VIEW_TYPE = "obsidian-feed-main";
export type FeedRoute =
  | { name: "today" }
  | { name: "subscriptions" }
  | { name: "reader"; articleId: string; from: "today" | "subscriptions" };

export class FeedView extends ItemView {
  private route: FeedRoute = { name: "today" };
  private readonly today: TodayController;
  private readonly reader: ReaderViewController;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: ObsidianFeedPlugin,
  ) {
    super(leaf);
    this.today = new TodayController(
      (cursor) => this.plugin.api.listArticles({ limit: 30, ...(cursor ? { cursor } : {}) }),
      () => this.render(),
    );
    this.reader = new ReaderViewController(plugin);
  }

  getViewType(): string {
    return FEED_VIEW_TYPE;
  }
  getDisplayText(): string {
    return "Obsidian Feed";
  }
  getIcon(): string {
    return "rss";
  }

  async onOpen(): Promise<void> {
    this.route = { name: this.plugin.data.ui.lastRoute ?? "today" };
    this.render();
    if (this.route.name === "today") await this.today.reload();
    else await this.loadSubscriptions();
  }

  async showToday(): Promise<void> {
    this.route = { name: "today" };
    this.plugin.data.ui.lastRoute = "today";
    await this.plugin.savePluginData();
    this.render();
    await this.today.reload();
  }

  async showSubscriptions(): Promise<void> {
    this.route = { name: "subscriptions" };
    this.plugin.data.ui.lastRoute = "subscriptions";
    await this.plugin.savePluginData();
    await this.loadSubscriptions();
  }

  openReader(articleId: string): void {
    const from = this.route.name === "subscriptions" ? "subscriptions" : "today";
    this.route = { name: "reader", articleId, from };
    this.render();
  }

  currentArticleId(): string | null {
    return this.route.name === "reader" ? this.route.articleId : null;
  }

  async refresh(): Promise<void> {
    if (this.route.name === "subscriptions") await this.loadSubscriptions();
    else await this.today.reload();
  }

  openAddModal(): void {
    new AddSubscriptionModal(this.app, this.plugin.api, () => void this.loadSubscriptions()).open();
  }

  private async loadSubscriptions(): Promise<void> {
    this.prepareRoot();
    this.contentEl.replaceChildren(element(document, "p", "of-state", "正在加载订阅…"));
    try {
      const subscriptions = await this.plugin.api.listSubscriptions();
      if (this.route.name !== "subscriptions") return;
      renderSubscriptions(this.contentEl, subscriptions, {
        onAdd: () => this.openAddModal(),
        onRefresh: (id) =>
          void this.plugin.api.refreshSource(id).then(() => new Notice("已安排刷新")),
        onDisable: (id) =>
          void this.plugin.api.disableSubscription(id).then(() => this.loadSubscriptions()),
      });
      this.prependNavigation();
    } catch {
      this.contentEl.replaceChildren(
        element(document, "p", "of-state is-error", "订阅列表加载失败"),
      );
      this.prependNavigation();
    }
  }

  private render(): void {
    this.contentEl.empty();
    this.prepareRoot();
    if (this.route.name === "today") {
      renderToday(this.contentEl, this.today.state, {
        reading: this.plugin.data.reading,
        onOpen: (id) => this.openReader(id),
        onLoadMore: () => void this.today.loadMore(),
      });
      this.prependNavigation();
    } else if (this.route.name === "reader") {
      const back = this.route.from;
      void this.reader.render(
        this.contentEl,
        this.route.articleId,
        () => void (back === "today" ? this.showToday() : this.showSubscriptions()),
      );
    }
  }

  async onClose(): Promise<void> {
    this.reader.dispose();
  }

  private prependNavigation(): void {
    const navigation = element(document, "nav", "of-navigation");
    navigation.setAttribute("aria-label", "Feed navigation");
    navigation.append(
      actionButton(document, "今天", () => void this.showToday()),
      actionButton(document, "订阅", () => void this.showSubscriptions()),
    );
    this.contentEl.prepend(navigation);
  }

  applyPreferences(): void {
    applyReaderPreferences(this.contentEl, this.plugin.data.settings);
  }

  private prepareRoot(): void {
    this.contentEl.addClass("of-root");
    this.applyPreferences();
  }
}
