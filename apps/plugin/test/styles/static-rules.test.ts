import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

describe("plugin CSS", () => {
  it("keeps selectors scoped and has no network imports", () => {
    expect(css).not.toMatch(/@import|url\(\s*["']?https?:/iu);
    for (const line of css.split("\n")) {
      const selector = line.trim();
      if (!selector.endsWith("{") || selector.startsWith("@")) continue;
      expect(selector, `unscoped selector: ${selector}`).toContain(".of-");
    }
  });

  it("maps every reading setting to the exact specified value", () => {
    expect(css).toContain('[data-of-font-size="small"]');
    expect(css).toContain("--of-font-size: 16px");
    expect(css).toContain("--of-font-size: 17px");
    expect(css).toContain("--of-font-size: 19px");
    expect(css).toContain("--of-line-height: 1.65");
    expect(css).toContain("--of-line-height: 1.8");
    expect(css).toContain("--of-line-height: 1.95");
    expect(css).toContain("--of-reader-width: 640px");
    expect(css).toContain("--of-reader-width: 720px");
    expect(css).toContain("--of-reader-width: 820px");
  });

  it("includes responsive, safe-area, focus, overflow and reduced-motion rules", () => {
    expect(css).toContain("@media (max-width: 700px)");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("min-width: 44px");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain("max-width: 100%");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
