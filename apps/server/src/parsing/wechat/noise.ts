import type { ArticleBlock } from "@obsidian-feed/content-model";

function textOf(block: ArticleBlock): string {
  if (block.type === "paragraph" || block.type === "heading") {
    return block.children.map((run) => run.text).join("");
  }
  return "";
}

function squareImage(block: ArticleBlock | undefined): boolean {
  if (block?.type !== "image" || !block.width || !block.height) return false;
  return Math.max(block.width, block.height) / Math.min(block.width, block.height) <= 1.2;
}

function bodySignal(blocks: ArticleBlock[]): boolean {
  const textLength = blocks.reduce((total, block) => total + textOf(block).length, 0);
  const paragraphs = blocks.filter((block) => block.type === "paragraph").length;
  const images = blocks.filter((block) => block.type === "image").length;
  return textLength >= 300 || (paragraphs >= 3 && images >= 2);
}

export function removeTailNoise(blocks: ArticleBlock[]): ArticleBlock[] {
  if (blocks.length < 2) return blocks;
  const last = blocks.at(-1);
  const text = last ? textOf(last).trim() : "";
  const hasQrHint = /二维码|扫码|长按识别/iu.test(text);
  const hasFollowHint = /关注|公众号/iu.test(text);
  const imageIndex = blocks.length - 2;
  if (
    text.length > 0 &&
    text.length < 80 &&
    hasQrHint &&
    hasFollowHint &&
    squareImage(blocks[imageIndex]) &&
    bodySignal(blocks.slice(0, imageIndex))
  ) {
    return blocks.slice(0, imageIndex);
  }
  return blocks;
}
