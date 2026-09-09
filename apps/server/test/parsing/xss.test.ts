import { articleDocumentSchema } from "@obsidian-feed/content-model";
import { describe, expect, it } from "vitest";

import { parseArticle } from "../../src/parsing/pipeline.js";

describe("parser security boundaries", () => {
  it("never emits scripts, handlers, iframes, forms, or javascript URLs", async () => {
    const result = await parseArticle({
      sourceType: "wechat",
      title: "Security",
      sourceName: "Fixture",
      canonicalUrl: "https://mp.weixin.qq.com/s/security",
      html: `<div id="js_content"><script>alert(1)</script><p onclick="steal()"><a href="javascript:alert(1)">unsafe</a><a href="https://safe.example/path">safe</a></p><iframe src="https://evil.example"></iframe><form><input></form><img data-src="javascript:alert(2)"><p>正文内容保持可读。</p></div>`,
    });

    expect(articleDocumentSchema.safeParse(result.document).success).toBe(true);
    const serialized = JSON.stringify(result.document);
    expect(serialized).not.toMatch(/script|onclick|iframe|form|javascript:/iu);
    expect(serialized).toContain("unsafe");
    expect(serialized).toContain("https://safe.example/path");
  });

  it.each([
    ["NUL bytes", '<div id="js_content"><p>before\0after</p></div>'],
    [
      "extreme depth",
      `<div id="js_content">${"<section>".repeat(205)}text${"</section>".repeat(205)}</div>`,
    ],
  ])("rejects %s during precheck", async (_name, html) => {
    const result = await parseArticle({
      sourceType: "wechat",
      title: "Invalid",
      sourceName: "Fixture",
      canonicalUrl: "https://mp.weixin.qq.com/s/invalid",
      html,
    });
    expect(result.status).toBe("failed");
    expect(result.document).toBeNull();
  });
});
