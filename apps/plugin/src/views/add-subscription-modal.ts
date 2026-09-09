import type { ResolvedCandidate } from "@obsidian-feed/contracts";
import { Modal, Notice, Setting, type App } from "obsidian";

import type { FeedApiClient } from "../api/client.js";
import { FeedApiError } from "../api/errors.js";
import { messageForErrorCode } from "./subscriptions-view.js";

export class AddSubscriptionModal extends Modal {
  private input = "";
  private candidate: ResolvedCandidate | null = null;

  constructor(
    app: App,
    private readonly api: FeedApiClient,
    private readonly onSubscribed: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    this.contentEl.empty();
    this.contentEl.addClass("of-subscription-modal");
    this.setTitle("添加订阅");
    if (this.candidate) {
      new Setting(this.contentEl)
        .setName(this.candidate.name)
        .setDesc(this.candidate.kind === "wechat" ? "微信公众号" : "RSS");
      new Setting(this.contentEl)
        .addButton((button) =>
          button.setButtonText("返回").onClick(() => {
            this.candidate = null;
            this.render();
          }),
        )
        .addButton((button) =>
          button
            .setCta()
            .setButtonText("订阅")
            .onClick(() => this.subscribe()),
        );
      return;
    }
    new Setting(this.contentEl).setName("粘贴 RSS、网站或微信公众号文章链接").addText((text) =>
      text
        .setPlaceholder("https://…")
        .setValue(this.input)
        .onChange((value) => {
          this.input = value;
        }),
    );
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("取消").onClick(() => this.close()))
      .addButton((button) =>
        button
          .setCta()
          .setButtonText("识别")
          .onClick(() => this.resolve()),
      );
  }

  private async resolve(): Promise<void> {
    try {
      this.candidate = await this.api.resolveSubscription(this.input.trim());
      this.render();
    } catch (error) {
      new Notice(
        error instanceof FeedApiError ? messageForErrorCode(error.code) : "Feed Server 未连接",
      );
    }
  }

  private async subscribe(): Promise<void> {
    if (!this.candidate) return;
    try {
      await this.api.subscribe(this.candidate.resolutionToken);
      this.close();
      this.onSubscribed();
    } catch (error) {
      new Notice(
        error instanceof FeedApiError
          ? messageForErrorCode(error.code)
          : "订阅暂时失败，请稍后重试",
      );
    }
  }
}
