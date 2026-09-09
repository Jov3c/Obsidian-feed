export type TextMark = "bold" | "italic" | "code" | "strike";

export interface TextRun {
  type: "text";
  text: string;
  marks?: TextMark[] | undefined;
  href?: string | undefined;
}

export interface ParagraphBlock {
  id: string;
  type: "paragraph";
  children: TextRun[];
}

export interface HeadingBlock {
  id: string;
  type: "heading";
  level: 2 | 3 | 4;
  children: TextRun[];
}

export interface ImageBlock {
  id: string;
  type: "image";
  src: string;
  originalSrc?: string | undefined;
  alt?: string | undefined;
  caption?: TextRun[] | undefined;
  width?: number | undefined;
  height?: number | undefined;
  animated?: boolean | undefined;
}

export interface BlockquoteBlock {
  id: string;
  type: "blockquote";
  blocks: Array<ParagraphBlock | HeadingBlock>;
}

export interface ListItem {
  children: TextRun[];
  nested?: ListBlock | undefined;
}

export interface ListBlock {
  id: string;
  type: "list";
  ordered: boolean;
  start?: number | undefined;
  items: ListItem[];
}

export interface CodeBlock {
  id: string;
  type: "code";
  code: string;
  language?: string | undefined;
}

export interface TableBlock {
  id: string;
  type: "table";
  headers: TextRun[][];
  rows: TextRun[][][];
}

export interface DividerBlock {
  id: string;
  type: "divider";
}

export type ArticleBlock =
  | ParagraphBlock
  | HeadingBlock
  | ImageBlock
  | BlockquoteBlock
  | ListBlock
  | CodeBlock
  | TableBlock
  | DividerBlock;

export interface ArticleDocument {
  version: 1;
  title: string;
  subtitle?: string | undefined;
  author?: string | undefined;
  sourceName: string;
  canonicalUrl: string;
  publishedAt?: string | undefined;
  language?: string | undefined;
  blocks: ArticleBlock[];
}
