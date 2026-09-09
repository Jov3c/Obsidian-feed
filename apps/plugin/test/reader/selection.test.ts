// @vitest-environment jsdom

import type { ApiArticleDetail } from "@obsidian-feed/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ExcerptController,
  SelectionActions,
  selectedPlainText,
} from "../../src/reader/selection.js";

describe("selection excerpts", () => {
  beforeEach(() => {
    getSelection()?.removeAllRanges();
    document.body.replaceChildren();
  });

  it("reads selected content as normalized plain text without HTML", () => {
    document.body.innerHTML = "<p>First <strong>safe</strong></p><p>Second</p>";
    const selection = getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(document.body);
    selection.addRange(range);

    expect(selectedPlainText(selection)).toBe("First safe\nSecond");
  });

  it("loads the article and exposes appendExcerpt(articleId, selectedText)", async () => {
    const detail = { article: { id: "art_1" } } as ApiArticleDetail;
    const getArticle = vi.fn().mockResolvedValue(detail);
    const appendExcerpt = vi.fn().mockResolvedValue({ path: "Feed/Article.md" });
    const controller = new ExcerptController({ getArticle, appendExcerpt });

    await expect(controller.appendExcerpt("art_1", "Chosen text")).resolves.toEqual({
      path: "Feed/Article.md",
    });
    expect(getArticle).toHaveBeenCalledWith("art_1");
    expect(appendExcerpt).toHaveBeenCalledWith(detail, "Chosen text");
  });

  it("provides a toolbar fallback and a desktop floating action", () => {
    document.body.innerHTML =
      "<div id='toolbar'></div><article id='content'><p>Chosen text</p></article>";
    const toolbar = document.querySelector<HTMLElement>("#toolbar")!;
    const content = document.querySelector<HTMLElement>("#content")!;
    const selection = getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(content.querySelector("p")!);
    selection.addRange(range);
    expect(selectedPlainText(selection)).toBe("Chosen text");
    const onExcerpt = vi.fn();
    const actions = new SelectionActions(document, onExcerpt);

    const dispose = actions.attach(content, toolbar);
    expect(selectedPlainText(getSelection())).toBe("Chosen text");
    toolbar.querySelector<HTMLButtonElement>("button")!.click();
    content.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    expect(onExcerpt).toHaveBeenCalledWith("Chosen text");
    expect(document.querySelector(".of-selection-action")?.textContent).toBe("摘录");
    dispose();
    expect(document.querySelector(".of-selection-action")).toBeNull();
  });
});
