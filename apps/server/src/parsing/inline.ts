import type { TextMark, TextRun } from "@obsidian-feed/content-model";

import { attribute, childNodes, isElement, type DomNode } from "./dom.js";

const ignoredTags = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "form",
  "input",
  "button",
]);
const markForTag: Partial<Record<string, TextMark>> = {
  strong: "bold",
  b: "bold",
  em: "italic",
  i: "italic",
  del: "strike",
  s: "strike",
  code: "code",
};

function safeHref(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, baseUrl);
    return new Set(["http:", "https:", "mailto:"]).has(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function inlineRuns(
  nodes: DomNode[],
  baseUrl: string,
  inheritedMarks: TextMark[] = [],
  inheritedHref?: string,
): TextRun[] {
  const runs: TextRun[] = [];
  for (const node of nodes) {
    if ("value" in node && typeof node.value === "string") {
      if (node.value.length > 0) {
        runs.push({
          type: "text",
          text: node.value,
          ...(inheritedMarks.length > 0 ? { marks: [...new Set(inheritedMarks)] } : {}),
          ...(inheritedHref ? { href: inheritedHref } : {}),
        });
      }
      continue;
    }
    if (!isElement(node) || ignoredTags.has(node.tagName)) continue;
    if (node.tagName === "br") {
      runs.push({ type: "text", text: "\n" });
      continue;
    }
    const mark = markForTag[node.tagName];
    const marks = mark ? [...inheritedMarks, mark] : inheritedMarks;
    const href = node.tagName === "a" ? safeHref(attribute(node, "href"), baseUrl) : inheritedHref;
    runs.push(...inlineRuns(childNodes(node), baseUrl, marks, href));
  }
  return runs;
}
