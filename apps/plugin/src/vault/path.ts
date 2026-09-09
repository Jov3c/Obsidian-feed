export function sanitizePathSegment(value: string, fallback = "未命名文章"): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/gu, " ")
    .replace(/^\.+/u, "")
    .replace(/[.\s]+$/u, "")
    .replace(/\s+/gu, " ")
    .trim();
  const safe = cleaned || fallback;
  return [...safe].slice(0, 120).join("");
}

export function articleNotePath(input: {
  root: string;
  sourceType: "rss" | "wechat";
  sourceName: string;
  title: string;
  fallbackDate: string;
}): string {
  const type = input.sourceType === "wechat" ? "微信公众号" : "RSS";
  const title = sanitizePathSegment(input.title, `未命名文章-${input.fallbackDate}`);
  return [
    sanitizePathSegment(input.root, "Feed"),
    type,
    sanitizePathSegment(input.sourceName),
    `${title}.md`,
  ].join("/");
}
