import { Notice, Plugin, requestUrl } from "obsidian";

import { FeedApiClient } from "./api/client.js";
import { ObsidianFeedSettingsTab } from "./settings/settings-tab.js";
import { migratePluginData, type PluginDataV1, type PluginSettings } from "./state/plugin-data.js";
import { FeedView, FEED_VIEW_TYPE } from "./views/feed-view.js";

export default class ObsidianFeedPlugin extends Plugin {
  data!: PluginDataV1;
  api!: FeedApiClient;

  async onload(): Promise<void> {
    this.data = migratePluginData(await this.loadData());
    this.rebuildClient();
    this.registerView(FEED_VIEW_TYPE, (leaf) => new FeedView(leaf, this));
    this.addSettingTab(new ObsidianFeedSettingsTab(this.app, this));
    this.addRibbonIcon("rss", "Open Obsidian Feed", () => void this.openFeed());
    this.addCommand({
      id: "open-obsidian-feed",
      name: "Open Obsidian Feed",
      callback: () => void this.openFeed(),
    });
    this.addCommand({
      id: "add-feed-subscription",
      name: "Add feed subscription",
      callback: () => void this.withFeedView((view) => view.openAddModal()),
    });
    this.addCommand({
      id: "refresh-feed-list",
      name: "Refresh current feed list",
      callback: () => void this.withFeedView((view) => view.refresh()),
    });
  }

  async updateSettings(patch: Partial<PluginSettings>): Promise<void> {
    this.data.settings = { ...this.data.settings, ...patch };
    this.rebuildClient();
    await this.saveData(this.data);
  }

  async savePluginData(): Promise<void> {
    await this.saveData(this.data);
  }

  async testConnection(): Promise<void> {
    try {
      await requestUrl({
        url: `${this.data.settings.serverBaseUrl.replace(/\/+$/u, "")}/health/ready`,
        headers: { Authorization: `Bearer ${this.data.settings.serverToken}` },
      });
      new Notice("Feed Server connection succeeded");
    } catch {
      new Notice("Feed Server connection failed");
    }
  }

  private rebuildClient(): void {
    this.api = new FeedApiClient({
      baseUrl: this.data.settings.serverBaseUrl,
      token: this.data.settings.serverToken,
      request: async (options) => {
        const response = await requestUrl(options);
        return { status: response.status, json: response.json };
      },
    });
  }

  private async openFeed(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(FEED_VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getLeaf(false);
    if (!existing) await leaf.setViewState({ type: FEED_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private async withFeedView(action: (view: FeedView) => void | Promise<void>): Promise<void> {
    await this.openFeed();
    const view = this.app.workspace.getLeavesOfType(FEED_VIEW_TYPE)[0]?.view;
    if (view instanceof FeedView) await action(view);
  }
}
