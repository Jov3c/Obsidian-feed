import type {
  ArticleBlock,
  BlockquoteBlock,
  ImageBlock,
  ListBlock,
  ListItem,
  ParagraphBlock,
  TextRun,
} from "@obsidian-feed/content-model";

import {
  attribute,
  childNodes,
  descendants,
  isElement,
  textContent,
  type DomElement,
  type DomNode,
} from "./dom.js";
import { inlineRuns } from "./inline.js";

const ignoredTags = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "form",
  "input",
  "button",
  "select",
  "textarea",
]);
const blockTags = new Set([
  "p",
  "div",
  "section",
  "article",
  "main",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "img",
  "blockquote",
  "ul",
  "ol",
  "pre",
  "table",
  "hr",
]);

const temporaryId = "pending";

function meaningful(runs: TextRun[]): boolean {
  return runs.some((run) => run.text.trim().length > 0);
}

function paragraph(nodes: DomNode[], baseUrl: string): ParagraphBlock | null {
  const children = inlineRuns(nodes, baseUrl);
  return meaningful(children) ? { id: temporaryId, type: "paragraph", children } : null;
}

function safeImageUrl(element: DomElement, baseUrl: string): string | null {
  for (const name of ["data-src", "data-original", "data-backsrc", "data-croporisrc", "src"]) {
    const value = attribute(element, name);
    if (!value) continue;
    try {
      const url = new URL(value, baseUrl);
      if (new Set(["http:", "https:"]).has(url.protocol)) return url.href;
    } catch {
      continue;
    }
  }
  return null;
}

function positiveInteger(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/u.test(value)) return undefined;
  const number = Number.parseInt(value, 10);
  return number > 0 ? number : undefined;
}

function imageBlock(element: DomElement, baseUrl: string): ImageBlock | null {
  const src = safeImageUrl(element, baseUrl);
  if (!src) return null;
  const width = positiveInteger(attribute(element, "width"));
  const height = positiveInteger(attribute(element, "height"));
  if ((width !== undefined && width <= 2) || (height !== undefined && height <= 2)) return null;
  return {
    id: temporaryId,
    type: "image",
    src,
    originalSrc: src,
    ...(attribute(element, "alt") ? { alt: attribute(element, "alt") } : {}),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(new URL(src).pathname.toLowerCase().endsWith(".gif") ? { animated: true } : {}),
  };
}

function directElements(element: DomElement, tagName: string): DomElement[] {
  return childNodes(element).filter(
    (node): node is DomElement => isElement(node) && node.tagName === tagName,
  );
}

function listBlock(element: DomElement, baseUrl: string): ListBlock | null {
  const items: ListItem[] = directElements(element, "li").flatMap((item) => {
    const nestedElement = childNodes(item).find(
      (node): node is DomElement =>
        isElement(node) && (node.tagName === "ul" || node.tagName === "ol"),
    );
    const inlineNodes = childNodes(item).filter((node) => node !== nestedElement);
    const children = inlineRuns(inlineNodes, baseUrl);
    const nested = nestedElement ? listBlock(nestedElement, baseUrl) : null;
    if (!meaningful(children) && !nested) return [];
    return [{ children, ...(nested ? { nested } : {}) }];
  });
  if (items.length === 0) return null;
  const start = element.tagName === "ol" ? positiveInteger(attribute(element, "start")) : undefined;
  return {
    id: temporaryId,
    type: "list",
    ordered: element.tagName === "ol",
    ...(start ? { start } : {}),
    items,
  };
}

function tableBlock(element: DomElement, baseUrl: string): ArticleBlock | null {
  const rows = descendants(element).filter(
    (node): node is DomElement => isElement(node) && node.tagName === "tr",
  );
  const parsed = rows.map((row) => {
    const cells = childNodes(row).filter(
      (node): node is DomElement =>
        isElement(node) && (node.tagName === "th" || node.tagName === "td"),
    );
    return {
      header: cells.length > 0 && cells.every((cell) => cell.tagName === "th"),
      cells: cells.map((cell) => inlineRuns(childNodes(cell), baseUrl)),
    };
  });
  const headerIndex = parsed.findIndex((row) => row.header);
  const headers = headerIndex >= 0 ? parsed[headerIndex]!.cells : [];
  const body = parsed.filter((_, index) => index !== headerIndex).map((row) => row.cells);
  if (headers.length === 0 && body.length === 0) return null;
  return { id: temporaryId, type: "table", headers, rows: body };
}

function extractContainer(element: DomElement, baseUrl: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  let inlineBuffer: DomNode[] = [];
  const flush = () => {
    const block = paragraph(inlineBuffer, baseUrl);
    if (block) blocks.push(block);
    inlineBuffer = [];
  };
  for (const child of childNodes(element)) {
    if (
      isElement(child) &&
      (ignoredTags.has(child.tagName) ||
        /position\s*:\s*fixed/iu.test(attribute(child, "style") ?? ""))
    ) {
      continue;
    }
    if (isElement(child) && blockTags.has(child.tagName)) {
      flush();
      blocks.push(...extractElement(child, baseUrl));
    } else {
      inlineBuffer.push(child);
    }
  }
  flush();
  return blocks;
}

function extractElement(element: DomElement, baseUrl: string): ArticleBlock[] {
  if (ignoredTags.has(element.tagName)) return [];
  if (/position\s*:\s*fixed/iu.test(attribute(element, "style") ?? "")) return [];
  if (element.tagName === "p") {
    const result: ArticleBlock[] = [];
    const text = paragraph(childNodes(element), baseUrl);
    if (text) result.push(text);
    for (const image of descendants(element)) {
      if (isElement(image) && image.tagName === "img") {
        const block = imageBlock(image, baseUrl);
        if (block) result.push(block);
      }
    }
    return result;
  }
  if (/^h[1-6]$/u.test(element.tagName)) {
    const children = inlineRuns(childNodes(element), baseUrl);
    if (!meaningful(children)) return [];
    const rawLevel = Number.parseInt(element.tagName.slice(1), 10);
    const level = Math.min(4, Math.max(2, rawLevel)) as 2 | 3 | 4;
    return [{ id: temporaryId, type: "heading", level, children }];
  }
  if (element.tagName === "img") {
    const image = imageBlock(element, baseUrl);
    return image ? [image] : [];
  }
  if (element.tagName === "ul" || element.tagName === "ol") {
    const list = listBlock(element, baseUrl);
    return list ? [list] : [];
  }
  if (element.tagName === "pre") {
    const codeElement = descendants(element).find(
      (node): node is DomElement => isElement(node) && node.tagName === "code",
    );
    const code = textContent(codeElement ?? element).replace(/^\n|\n$/gu, "");
    if (!code) return [];
    const language = codeElement
      ? /(?:language-|lang-)([\w+-]+)/u.exec(attribute(codeElement, "class") ?? "")?.[1]
      : undefined;
    return [{ id: temporaryId, type: "code", code, ...(language ? { language } : {}) }];
  }
  if (element.tagName === "table") {
    const table = tableBlock(element, baseUrl);
    return table ? [table] : [];
  }
  if (element.tagName === "hr") return [{ id: temporaryId, type: "divider" }];
  if (element.tagName === "blockquote") {
    const nested = extractContainer(element, baseUrl).filter(
      (block): block is BlockquoteBlock["blocks"][number] =>
        block.type === "paragraph" || block.type === "heading",
    );
    return nested.length > 0 ? [{ id: temporaryId, type: "blockquote", blocks: nested }] : [];
  }
  return extractContainer(element, baseUrl);
}

export function extractBlocks(element: DomElement, baseUrl: string): ArticleBlock[] {
  return extractContainer(element, baseUrl);
}
