import { requestUrl } from "obsidian";

import type ObsidianFeedPlugin from "../main.js";
import { ImageViewer } from "../reader/image-viewer.js";
import { AuthenticatedMediaLoader } from "../reader/media-loader.js";
import { ArticleRenderer, type RenderHandle } from "../reader/renderer.js";
import { captureScrollPosition, restoreScrollPosition } from "../reader/scroll-state.js";
import { ToolbarController } from "../reader/toolbar-controller.js";
import { shouldMarkRead } from "../state/reading-state.js";
import { actionButton, element } from "./dom.js";

export class ReaderViewController {
  private sequence = 0;
  private handle: RenderHandle | null = null;
  private toolbar: ToolbarController | null = null;
  private scrollCleanup: (() => void) | null = null;
  private readonly viewer = new ImageViewer();

  constructor(private readonly plugin: ObsidianFeedPlugin) {}

  async render(container: HTMLElement, articleId: string, onBack: () => void): Promise<void> {
    const sequence = ++this.sequence;
    this.disposeRender();
    const document = container.ownerDocument;
    container.replaceChildren(
      actionButton(document, "返回", onBack),
      element(document, "p", "of-state", "正在加载正文…"),
    );
    try {
      const detail = await this.plugin.api.getArticle(articleId);
      if (sequence !== this.sequence) return;
      container.replaceChildren();
      const toolbar = element(document, "div", "of-reader-toolbar");
      const progress = element(document, "div", "of-reader-progress");
      toolbar.append(actionButton(document, "返回", onBack));
      const original = element(document, "a", "of-action", "打开原文");
      original.href = detail.article.canonicalUrl;
      original.rel = "noopener noreferrer";
      toolbar.append(original);
      const article = element(document, "article", "of-reader");
      article.append(element(document, "h1", "of-reader-title", detail.article.title));
      article.append(
        element(
          document,
          "p",
          "of-reader-meta",
          `${detail.source.name}${detail.article.publishedAt ? ` · ${new Date(detail.article.publishedAt).toLocaleDateString("zh-CN")}` : ""}`,
        ),
      );
      const content = element(document, "div", "of-reader-content");
      article.append(content);
      container.append(progress, toolbar, article);
      if (!detail.document) {
        content.append(element(document, "p", "of-state", "正文暂时无法获取，请打开原文阅读。"));
        return;
      }
      const loader = new AuthenticatedMediaLoader({
        baseUrl: this.plugin.data.settings.serverBaseUrl,
        token: this.plugin.data.settings.serverToken,
        request: async (options) => {
          const response = await requestUrl(options);
          return {
            status: response.status,
            arrayBuffer: response.arrayBuffer,
            headers: response.headers,
          };
        },
      });
      this.handle = new ArticleRenderer().renderDocument(content, detail.document, {
        mediaLoader: loader,
        onImageOpen: (source) => this.viewer.open(source, document),
      });
      this.toolbar = new ToolbarController(container, toolbar, progress);
      const openedAt = Date.now();
      let lastCapture = 0;
      const onScroll = () => {
        if (Date.now() - lastCapture < 500) return;
        lastCapture = Date.now();
        const position = captureScrollPosition(container);
        const current = this.plugin.data.reading[articleId];
        this.plugin.readingState.update(articleId, {
          ...position,
          read: current?.read === true || shouldMarkRead(position.progress, Date.now() - openedAt),
        });
      };
      container.addEventListener("scroll", onScroll, { passive: true });
      this.scrollCleanup = () => container.removeEventListener("scroll", onScroll);
      const saved = this.plugin.data.reading[articleId];
      if (saved) await restoreScrollPosition(container, saved);
    } catch {
      if (sequence === this.sequence)
        container.replaceChildren(
          actionButton(document, "返回", onBack),
          element(document, "p", "of-state is-error", "正文加载失败，可以稍后重试或打开原文。"),
        );
    }
  }

  dispose(): void {
    this.sequence += 1;
    this.disposeRender();
    this.viewer.close();
    void this.plugin.readingState.flush();
  }
  private disposeRender(): void {
    this.scrollCleanup?.();
    this.scrollCleanup = null;
    this.toolbar?.dispose();
    this.toolbar = null;
    this.handle?.dispose();
    this.handle = null;
  }
}
