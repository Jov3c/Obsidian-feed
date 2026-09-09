import { XMLParser, XMLValidator } from "fast-xml-parser";

import { ProviderError, type ProviderArticle } from "../types.js";

interface ParsedFeed {
  title: string;
  siteUrl: string | null;
  articles: ProviderArticle[];
}

function list<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function text(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (value && typeof value === "object" && "#text" in value) return text(value["#text"]);
  return null;
}

function date(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function absolute(value: unknown, baseUrl: string): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    return new URL(raw, baseUrl).href;
  } catch {
    return null;
  }
}

function atomLink(value: unknown, baseUrl: string, rel = "alternate"): string | null {
  for (const link of list(value)) {
    if (typeof link === "object" && link !== null) {
      const attributes = link as Record<string, unknown>;
      const relation = text(attributes["@_rel"]) ?? "alternate";
      const href = text(attributes["@_href"]);
      if (relation === rel && href) return absolute(href, baseUrl);
    }
  }
  return null;
}

function parseRss(root: Record<string, unknown>, feedUrl: string): ParsedFeed {
  const channel = root.channel;
  if (!channel || typeof channel !== "object") throw new Error("RSS channel missing");
  const data = channel as Record<string, unknown>;
  const articles = list(data.item).map((raw): ProviderArticle => {
    const item = raw as Record<string, unknown>;
    const canonicalUrl = absolute(item.link, feedUrl);
    if (!canonicalUrl) throw new Error("RSS item link missing");
    const externalId = text(item.guid) ?? canonicalUrl;
    const rawContent = text(item["content:encoded"]) ?? text(item.description);
    return {
      externalId,
      canonicalUrl,
      title: text(item.title) ?? "Untitled article",
      author: text(item.author) ?? text(item["dc:creator"]),
      coverUrl: null,
      publishedAt: date(item.pubDate) ?? date(item["dc:date"]),
      ...(rawContent ? { rawContent, rawContentType: "html" as const } : {}),
    };
  });
  return {
    title: text(data.title) ?? "Untitled feed",
    siteUrl: absolute(data.link, feedUrl),
    articles,
  };
}

function parseAtom(root: Record<string, unknown>, feedUrl: string): ParsedFeed {
  const articles = list(root.entry).map((raw): ProviderArticle => {
    const entry = raw as Record<string, unknown>;
    const canonicalUrl = atomLink(entry.link, feedUrl);
    if (!canonicalUrl) throw new Error("Atom entry link missing");
    const author = entry.author;
    const authorName =
      author && typeof author === "object" ? text((author as Record<string, unknown>).name) : null;
    const rawContent = text(entry.content) ?? text(entry.summary);
    return {
      externalId: text(entry.id) ?? canonicalUrl,
      canonicalUrl,
      title: text(entry.title) ?? "Untitled article",
      author: authorName,
      coverUrl: null,
      publishedAt: date(entry.published) ?? date(entry.updated),
      ...(rawContent ? { rawContent, rawContentType: "html" as const } : {}),
    };
  });
  return {
    title: text(root.title) ?? "Untitled feed",
    siteUrl: atomLink(root.link, feedUrl),
    articles,
  };
}

export function parseFeedXml(xml: string, feedUrl: string): ParsedFeed {
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) {
    throw new ProviderError(
      "PARSE_FAILED",
      "DTD and entities are not allowed",
      false,
      "rss-native",
    );
  }
  try {
    const validation = XMLValidator.validate(xml);
    if (validation !== true) throw new Error(validation.err.msg);
    const parsed = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseTagValue: false,
      trimValues: false,
      processEntities: true,
    }).parse(xml) as Record<string, unknown>;
    const feed = parsed.rss
      ? parseRss(parsed.rss as Record<string, unknown>, feedUrl)
      : parsed.feed
        ? parseAtom(parsed.feed as Record<string, unknown>, feedUrl)
        : null;
    if (!feed) throw new Error("Unsupported feed root");
    const seen = new Set<string>();
    return {
      ...feed,
      articles: feed.articles.filter((article) => {
        const identity = article.externalId ?? article.canonicalUrl;
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      }),
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      "PARSE_FAILED",
      "Unable to parse RSS or Atom feed",
      false,
      "rss-native",
      undefined,
      error,
    );
  }
}
