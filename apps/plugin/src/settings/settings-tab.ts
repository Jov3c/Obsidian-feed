import { PluginSettingTab, Setting, type App } from "obsidian";

import type ObsidianFeedPlugin from "../main.js";

export class ObsidianFeedSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: ObsidianFeedPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("Feed Server").setHeading();
    new Setting(containerEl)
      .setName("Server URL")
      .setDesc(
        "On iPhone or iPad, use a LAN, VPN, or HTTPS address reachable from that device; 127.0.0.1 points to the device itself.",
      )
      .addText((text) =>
        text
          .setValue(this.plugin.data.settings.serverBaseUrl)
          .onChange((value) => this.plugin.updateSettings({ serverBaseUrl: value })),
      );
    new Setting(containerEl)
      .setName("Access token")
      .setDesc("The token is stored in Obsidian plugin data, not a hardware-secured key store.")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setValue(this.plugin.data.settings.serverToken)
          .onChange((value) => this.plugin.updateSettings({ serverToken: value }));
      });
    new Setting(containerEl).setName("Test connection").addButton((button) =>
      button.setButtonText("Test").onClick(async () => {
        await this.plugin.testConnection();
      }),
    );

    new Setting(containerEl).setName("Reading").setHeading();
    new Setting(containerEl).setName("Font size").addDropdown((dropdown) =>
      dropdown
        .addOptions({ small: "Small", standard: "Standard", large: "Large" })
        .setValue(this.plugin.data.settings.readerFontSize)
        .onChange((value) =>
          this.plugin.updateSettings({ readerFontSize: value as "small" | "standard" | "large" }),
        ),
    );
    new Setting(containerEl).setName("Line height").addDropdown((dropdown) =>
      dropdown
        .addOptions({ compact: "Compact", comfortable: "Comfortable", loose: "Loose" })
        .setValue(this.plugin.data.settings.readerLineHeight)
        .onChange((value) =>
          this.plugin.updateSettings({
            readerLineHeight: value as "compact" | "comfortable" | "loose",
          }),
        ),
    );
    new Setting(containerEl).setName("Reader width").addDropdown((dropdown) =>
      dropdown
        .addOptions({ narrow: "Narrow", standard: "Standard", wide: "Wide" })
        .setValue(this.plugin.data.settings.readerWidth)
        .onChange((value) =>
          this.plugin.updateSettings({ readerWidth: value as "narrow" | "standard" | "wide" }),
        ),
    );

    new Setting(containerEl).setName("Saving").setHeading();
    new Setting(containerEl)
      .setName("Save root")
      .addText((text) =>
        text
          .setValue(this.plugin.data.settings.saveRoot)
          .onChange((value) => this.plugin.updateSettings({ saveRoot: value })),
      );
    new Setting(containerEl).setName("Image mode").addDropdown((dropdown) =>
      dropdown
        .addOptions({ local: "Download locally", remote: "Keep server links" })
        .setValue(this.plugin.data.settings.imageSaveMode)
        .onChange((value) =>
          this.plugin.updateSettings({ imageSaveMode: value as "local" | "remote" }),
        ),
    );
    new Setting(containerEl)
      .setName("WeChat status")
      .setDesc(
        "WeChat credentials remain on your Feed Server and are never stored in this plugin.",
      );
  }
}
