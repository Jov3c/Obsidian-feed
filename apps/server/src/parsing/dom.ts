import { parse, type DefaultTreeAdapterMap } from "parse5";

export type DomNode = DefaultTreeAdapterMap["node"];
export type DomElement = DefaultTreeAdapterMap["element"];

export function isElement(node: DomNode): node is DomElement {
  return "tagName" in node;
}

export function childNodes(node: DomNode): DomNode[] {
  return "childNodes" in node ? [...node.childNodes] : [];
}

export function attribute(element: DomElement, name: string): string | undefined {
  return element.attrs.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value;
}

const nonTextTags = new Set(["script", "style", "noscript", "template"]);

export function textContent(node: DomNode): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if (isElement(node) && nonTextTags.has(node.tagName)) return "";
  return childNodes(node).map(textContent).join("");
}

export function descendants(root: DomNode): DomNode[] {
  const result: DomNode[] = [];
  const visit = (node: DomNode) => {
    result.push(node);
    childNodes(node).forEach(visit);
  };
  visit(root);
  return result;
}

export function parseDom(html: string): { root: DomNode; nodeCount: number; maxDepth: number } {
  const root = parse(html);
  let nodeCount = 0;
  let maxDepth = 0;
  const visit = (node: DomNode, depth: number) => {
    nodeCount += 1;
    maxDepth = Math.max(maxDepth, depth);
    childNodes(node).forEach((child) => visit(child, depth + 1));
  };
  visit(root, 0);
  return { root, nodeCount, maxDepth };
}

export function hasClass(element: DomElement, className: string): boolean {
  return new Set((attribute(element, "class") ?? "").split(/\s+/u)).has(className);
}
