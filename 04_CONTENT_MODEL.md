# Obsidian Feed V1 — 统一内容模型

## 1. 目的

RSS 与微信公众号最终必须转成同一套模型。UI、Markdown 导出、测试不应知道原始 DOM 来自哪里。

## 2. Source

```ts
export type SourceType = "rss" | "wechat";
export type SourceStatus =
  "active" | "rate_limited" | "needs_auth" | "parse_error" | "unavailable" | "disabled";

export interface Source {
  id: string;
  type: SourceType;
  name: string;
  canonicalUrl: string | null;
  avatarUrl: string | null;
  externalId: string | null;
  providerKey: string;
  status: SourceStatus;
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
}
```

`providerKey` 示例：`rss-native`、`wechat-werss`。

## 3. Article metadata

```ts
export type ContentStatus = "pending" | "ready" | "partial" | "unavailable" | "failed";

export interface ArticleMeta {
  id: string;
  sourceId: string;
  externalId: string | null;
  canonicalUrl: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  contentStatus: ContentStatus;
  contentHash: string | null;
}
```

## 4. ArticleDocument

### 顶层

```ts
export interface ArticleDocument {
  version: 1;
  title: string;
  subtitle?: string;
  author?: string;
  sourceName: string;
  canonicalUrl: string;
  publishedAt?: string;
  language?: string;
  blocks: ArticleBlock[];
}
```

### Block types

V1 只允许：

```ts
export type ArticleBlock =
  | ParagraphBlock
  | HeadingBlock
  | ImageBlock
  | BlockquoteBlock
  | ListBlock
  | CodeBlock
  | TableBlock
  | DividerBlock;
```

不要引入任意 HTML block。

## 5. Inline content

```ts
export interface TextRun {
  type: "text";
  text: string;
  marks?: Array<"bold" | "italic" | "code" | "strike">;
  href?: string;
}
```

限制：

- `href` 只允许 `http:`, `https:`, `mailto:`；
- 不允许 `javascript:`；
- 不保存任意 inline style；
- 不保存事件属性；
- 不保存 class/id。

## 6. Paragraph

```ts
export interface ParagraphBlock {
  id: string;
  type: "paragraph";
  children: TextRun[];
}
```

Block `id` 应稳定：基于文章 canonical URL + block index + normalized text/image src 计算短 hash。用于阅读位置恢复。

## 7. Heading

```ts
export interface HeadingBlock {
  id: string;
  type: "heading";
  level: 2 | 3 | 4;
  children: TextRun[];
}
```

正文内 H1 统一降级到 H2，文章标题由 document title 单独渲染。

## 8. Image

```ts
export interface ImageBlock {
  id: string;
  type: "image";
  src: string;
  originalSrc?: string;
  alt?: string;
  caption?: TextRun[];
  width?: number;
  height?: number;
  animated?: boolean;
}
```

服务端存储时 `src` 应优先指向自己的 media route（如 `/v1/media/:id`）或已验证远程 URL。

## 9. Quote

```ts
export interface BlockquoteBlock {
  id: string;
  type: "blockquote";
  blocks: Array<ParagraphBlock | HeadingBlock>;
}
```

## 10. List

```ts
export interface ListItem {
  children: TextRun[];
  nested?: ListBlock;
}

export interface ListBlock {
  id: string;
  type: "list";
  ordered: boolean;
  start?: number;
  items: ListItem[];
}
```

嵌套最多 4 层；更多层扁平化，防止恶意深递归。

## 11. Code

```ts
export interface CodeBlock {
  id: string;
  type: "code";
  code: string;
  language?: string;
}
```

最大单 block 200KB；超出截断并将 content status 标记 partial。

## 12. Table

```ts
export interface TableBlock {
  id: string;
  type: "table";
  headers: TextRun[][];
  rows: TextRun[][][];
}
```

限制：

- 最大 100 行；
- 最大 20 列；
- 超出转为 paragraphs 或标记 partial；
- 不保留复杂 rowspan/colspan；必要时展开为普通网格。

## 13. Divider

```ts
export interface DividerBlock {
  id: string;
  type: "divider";
}
```

## 14. Normalize rules

所有 parser 完成后执行统一 normalize：

1. trim 纯空白 text run；
2. 合并连续相同 marks 的 TextRun；
3. 删除空 paragraph；
4. 连续超过 2 个 divider 合并成 1 个；
5. heading level 限定 2–4；
6. URL canonicalize；
7. block ids 生成；
8. 限制 blocks 总数（默认 5000）；
9. 计算 canonical JSON 后 SHA-256 作为 `content_hash`。

## 15. Schema migration

如果未来 `version: 2`：

```ts
migrateArticleDocument(input: unknown): ArticleDocumentVLatest
```

必须显式迁移。不得 Reader 里写一堆 `if (version...)`。

## 16. API wrapper

文章详情：

```ts
export interface ArticleDetail {
  article: ArticleMeta;
  source: Pick<Source, "id" | "type" | "name" | "avatarUrl">;
  document: ArticleDocument | null;
  parse: {
    parser: string;
    parserVersion: string;
    confidence: number | null;
  };
}
```

`document = null` 时 `contentStatus` 必须解释原因。
