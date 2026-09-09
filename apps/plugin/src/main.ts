import { Notice, Plugin, requestUrl } from "obsidian";

import { FeedApiClient } from "./api/client.js";
import { ObsidianFeedSettingsTab } from "./settings/settings-tab.js";
import { migratePluginData, type PluginDataV1, type PluginSettings } from "./state/plugin-data.js";

export default class ObsidianFeedPlugin extends Plugin {
  data!: PluginDataV1;
  api!: FeedApiClient;

  async onload(): Promise<void> {
    this.data = migratePluginData(await this.loadData());
    this.rebuildClient();
    this.addSettingTab(new ObsidianFeedSettingsTab(this.app, this));
    this.addRibbonIcon(
      "rss",
      "Open Obsidian Feed",
      () => new Notice("Obsidian Feed views are loading"),
    );
    this.addCommand({
      id: "open-obsidian-feed",
      name: "Open Obsidian Feed",
      callback: () => new Notice("Obsidian Feed views are loading"),
    });
  }

  async updateSettings(patch: Partial<PluginSettings>): Promise<void> {
    this.data.settings = { ...this.data.settings, ...patch };
    this.rebuildClient();
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
}
