import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { articleDocumentSchema, type ArticleBlock } from "@obsidian-feed/content-model";
import { describe, expect, it } from "vitest";

import { parseArticle } from "../../src/parsing/pipeline.js";
import { scoreCandidate } from "../../src/parsing/wechat/score.js";

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/wechat");
const fixture = (name: string) => readFileSync(join(fixtureDirectory, name), "utf8");

const baseInput = {
  sourceType: "wechat" as const,
  title: "测试文章",
  sourceName: "测试公众号",
  canonicalUrl: "https://mp.weixin.qq.com/s/example",
  author: "作者",
};

function blockText(block: ArticleBlock): string {
  if (block.type === "paragraph" || block.type === "heading")
    return block.children.map((run) => run.text).join("");
  if (block.type === "code") return block.code;
  if (block.type === "list")
    return block.items.map((item) => item.children.map((run) => run.text).join("")).join(" ");
  if (block.type === "table")
    return [...block.headers, ...block.rows.flat()]
      .flat()
      .map((run) => run.text)
      .join(" ");
  return "";
}

describe("deterministic article parsing", () => {
  it("scores candidate features with the specified pure formula", () => {
    expect(
      scoreCandidate({
        textLength: 500,
        paragraphCount: 4,
        headingCount: 1,
        imageCount: 2,
        linkTextLength: 50,
        linkCount: 1,
        buttonCount: 0,
        formControlCount: 0,
        navLike: false,
        footerLike: false,
        depth: 3,
        semanticRoot: true,
        knownWechatRoot: false,
      }),
    ).toBe(102);
  });

  it("extracts normal text and preserves a legitimate sentence containing 关注", async () => {
    const result = await parseArticle({ ...baseInput, html: fixture("normal-text.html") });

    expect(result.status).toBe("ready");
    expect(result.parser).toBe("wechat-parser");
    expect(result.parserVersion).toBe("1.0.0");
    expect(result.confidence).toBeGreaterThanOrEqual(0.65);
    expect(articleDocumentSchema.safeParse(result.document).success).toBe(true);
    expect(result.document?.blocks[0]).toMatchObject({ type: "heading", level: 2 });
    expect(result.document?.blocks.map(blockText).join("\n")).toContain("大家都很关注 AI");
  });

  it("flattens nested sections without changing text order", async () => {
    const result = await parseArticle({ ...baseInput, html: fixture("many-sections.html") });
    expect(result.document?.blocks.map(blockText)).toEqual([
      "第一层内容。",
      "第二层内容。",
      "第三层内容。",
    ]);
  });

  it("prefers data-src and canonicalizes image URLs", async () => {
    const result = await parseArticle({ ...baseInput, html: fixture("image-heavy.html") });
    const images = result.document?.blocks.filter((block) => block.type === "image") ?? [];
    expect(images).toMatchObject([
      { src: "https://mmbiz.qpic.cn/a.jpg", alt: "第一张图" },
      { src: "https://mp.weixin.qq.com/b.jpg", alt: "第二张图" },
      { src: "https://mmbiz.qpic.cn/c.gif", alt: "第三张图" },
    ]);
  });

  it("recognizes additional public WeChat lazy-image attributes", async () => {
    const result = await parseArticle({
      ...baseInput,
      html: `<div id="js_content">
        <p>正文保留。</p>
        <img data-backsrc="https://mmbiz.qpic.cn/back.jpg" alt="背景候选">
        <img data-croporisrc="//mmbiz.qpic.cn/crop.jpg" alt="裁剪原图">
      </div>`,
    });
    expect(result.document?.blocks.filter((block) => block.type === "image")).toMatchObject([
      { src: "https://mmbiz.qpic.cn/back.jpg", alt: "背景候选" },
      { src: "https://mmbiz.qpic.cn/crop.jpg", alt: "裁剪原图" },
    ]);
  });

  it("registers retained images through an injected media boundary", async () => {
    const registered: string[] = [];
    const result = await parseArticle(
      { ...baseInput, html: fixture("image-heavy.html") },
      {
        mediaRegistrar: {
          registerRemote: async (url) => {
            registered.push(url);
            return { id: `med_${registered.length}`, src: `/v1/media/med_${registered.length}` };
          },
        },
      },
    );
    expect(registered).toEqual([
      "https://mmbiz.qpic.cn/a.jpg",
      "https://mp.weixin.qq.com/b.jpg",
      "https://mmbiz.qpic.cn/c.gif",
    ]);
    expect(
      result.document?.blocks.filter((block) => block.type === "image").map((block) => block.src),
    ).toEqual(["/v1/media/med_1", "/v1/media/med_2", "/v1/media/med_3"]);
  });

  it("keeps readable text when an image cannot be registered safely", async () => {
    const result = await parseArticle(
      {
        ...baseInput,
        html: '<div id="js_content"><p>正文仍应保留。</p><img src="http://127.0.0.1/private.png"></div>',
      },
      {
        mediaRegistrar: {
          registerRemote: async () => {
            throw new Error("private media rejected");
          },
        },
      },
    );

    expect(result.document?.blocks.map(blockText).join(" ")).toContain("正文仍应保留");
    expect(result.document?.blocks.some((block) => block.type === "image")).toBe(false);
  });

  it("removes only a contextual QR/follow tail cluster", async () => {
    const result = await parseArticle({ ...baseInput, html: fixture("qr-footer.html") });
    const serialized = JSON.stringify(result.document);
    expect(serialized).not.toContain("长按识别二维码");
    expect(serialized).not.toContain("qr.png");
    expect(serialized).toContain("大家都很关注内容质量");
  });

  it("preserves code, nested lists, and table structure", async () => {
    const result = await parseArticle({ ...baseInput, html: fixture("code-table.html") });
    expect(result.document?.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "code",
          language: "ts",
          code: expect.stringContaining("const answer = 42"),
        }),
        expect.objectContaining({
          type: "list",
          ordered: false,
          items: [
            expect.objectContaining({ nested: expect.objectContaining({ type: "list" }) }),
            expect.anything(),
          ],
        }),
        expect.objectContaining({
          type: "table",
          headers: [
            [expect.objectContaining({ text: "名称" })],
            [expect.objectContaining({ text: "值" })],
          ],
        }),
      ]),
    );
  });

  it("fails closed for login/captcha pages", async () => {
    const result = await parseArticle({ ...baseInput, html: fixture("blocked.html") });
    expect(result).toMatchObject({
      status: "failed",
      document: null,
      confidence: 0,
      diagnostics: { blocked: true },
    });
  });

  it("recovers useful text from malformed HTML", async () => {
    const result = await parseArticle({ ...baseInput, html: fixture("malformed.html") });
    expect(result.document?.blocks.map(blockText).join(" ")).toBe(
      "结构损坏但仍可恢复的正文 后续文字仍按顺序出现",
    );
  });
});
