// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { ImageViewer } from "../../src/reader/image-viewer.js";

describe("ImageViewer accessibility", () => {
  beforeEach(() => document.body.replaceChildren());

  it("focuses an aria-modal dialog, closes with Escape, and restores focus", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const viewer = new ImageViewer();

    viewer.open("blob:test", document);
    const dialog = document.querySelector<HTMLElement>(".of-image-viewer")!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(dialog);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".of-image-viewer")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
