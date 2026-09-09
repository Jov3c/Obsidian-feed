import type { ApiArticleDetail } from "@obsidian-feed/contracts";

function textWithBlockBreaks(root: Node): string {
  if (root.nodeType === root.TEXT_NODE) return root.textContent ?? "";
  const element = root instanceof root.ownerDocument!.defaultView!.HTMLElement ? root : null;
  const children = [...root.childNodes].map(textWithBlockBreaks).join("");
  return element &&
    ["P", "DIV", "LI", "BLOCKQUOTE", "H1", "H2", "H3", "H4"].includes(element.tagName)
    ? `${children}\n`
    : children;
}

export function selectedPlainText(selection: Selection | null): string {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return "";
  const fragment = selection.getRangeAt(0).cloneContents();
  return textWithBlockBreaks(fragment)
    .replace(/\u00a0/gu, " ")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export class ExcerptController {
  constructor(
    private readonly dependencies: {
      getArticle(articleId: string): Promise<ApiArticleDetail>;
      appendExcerpt(detail: ApiArticleDetail, selectedText: string): Promise<{ path: string }>;
    },
  ) {}

  async appendExcerpt(articleId: string, selectedText: string): Promise<{ path: string }> {
    const normalized = selectedText.replace(/\r\n?/gu, "\n").trim();
    if (!normalized) throw new Error("No text selected");
    const detail = await this.dependencies.getArticle(articleId);
    return this.dependencies.appendExcerpt(detail, normalized);
  }
}

export class SelectionActions {
  private floating: HTMLButtonElement | null = null;
  private lastSelectedText = "";

  constructor(
    private readonly document: Document,
    private readonly onExcerpt: (text: string) => void | Promise<void>,
  ) {}

  attach(content: HTMLElement, toolbar: HTMLElement): () => void {
    this.lastSelectedText = selectedPlainText(this.document.getSelection());
    const fallback = this.document.createElement("button");
    fallback.type = "button";
    fallback.className = "of-action of-excerpt-fallback";
    fallback.textContent = "摘录当前选区";
    const saveCurrent = () =>
      this.save(selectedPlainText(this.document.getSelection()) || this.lastSelectedText);
    fallback.addEventListener("click", saveCurrent);
    toolbar.append(fallback);

    const showFloating = () => {
      const selection = this.document.getSelection();
      const text = selectedPlainText(selection);
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const common = range?.commonAncestorContainer;
      const selectedInside = common
        ? content.contains(common.nodeType === common.ELEMENT_NODE ? common : common.parentNode)
        : false;
      this.removeFloating();
      if (!text || !selectedInside || !range) return;
      this.lastSelectedText = text;
      const button = this.document.createElement("button");
      button.type = "button";
      button.className = "of-action of-selection-action";
      button.textContent = "摘录";
      button.style.position = "fixed";
      button.style.zIndex = "1000";
      const rect =
        typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : null;
      button.style.left = `${Math.max(8, rect?.left ?? 8)}px`;
      button.style.top = `${Math.max(8, (rect?.bottom ?? 8) + 8)}px`;
      button.addEventListener("click", () => this.save(text));
      this.document.body.append(button);
      this.floating = button;
    };
    content.addEventListener("mouseup", showFloating);
    content.addEventListener("touchend", showFloating);
    return () => {
      fallback.removeEventListener("click", saveCurrent);
      fallback.remove();
      content.removeEventListener("mouseup", showFloating);
      content.removeEventListener("touchend", showFloating);
      this.removeFloating();
      this.lastSelectedText = "";
    };
  }

  private save(text: string): void {
    if (!text) return;
    this.removeFloating();
    void Promise.resolve(this.onExcerpt(text)).catch(() => undefined);
  }

  private removeFloating(): void {
    this.floating?.remove();
    this.floating = null;
  }
}
