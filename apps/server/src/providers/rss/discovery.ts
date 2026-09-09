import { parse, type DefaultTreeAdapterMap } from "parse5";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

const feedTypes = new Set(["application/rss+xml", "application/atom+xml"]);

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function visit(node: Node, baseUrl: string, feeds: string[]): void {
  if (isElement(node) && node.tagName === "link") {
    const attributes = Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]));
    const rels = new Set((attributes.rel ?? "").toLowerCase().split(/\s+/u));
    const type = (attributes.type ?? "").toLowerCase().split(";", 1)[0];
    if (rels.has("alternate") && type !== undefined && feedTypes.has(type) && attributes.href) {
      feeds.push(new URL(attributes.href, baseUrl).href);
    }
  }
  if ("childNodes" in node) {
    for (const child of node.childNodes) visit(child, baseUrl, feeds);
  }
}

export function discoverFeedUrls(html: string, baseUrl: string): string[] {
  const feeds: string[] = [];
  visit(parse(html), baseUrl, feeds);
  return [...new Set(feeds)];
}
