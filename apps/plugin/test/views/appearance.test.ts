// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { applyReaderPreferences } from "../../src/views/appearance.js";

describe("reader appearance", () => {
  it("projects validated settings to scoped data attributes", () => {
    const root = document.createElement("div");
    applyReaderPreferences(root, {
      readerFontSize: "large",
      readerLineHeight: "compact",
      readerWidth: "wide",
    });
    expect(root.dataset.ofFontSize).toBe("large");
    expect(root.dataset.ofLineHeight).toBe("compact");
    expect(root.dataset.ofReaderWidth).toBe("wide");
  });
});
