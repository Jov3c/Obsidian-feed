import { z } from "zod";

import type {
  ArticleBlock,
  ArticleDocument,
  BlockquoteBlock,
  ListBlock,
  ListItem,
} from "./article-document.js";

const allowedLinkProtocols = new Set(["http:", "https:", "mailto:"]);

function isAllowedLink(value: string): boolean {
  try {
    return allowedLinkProtocols.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

export const textMarkSchema = z.enum(["bold", "italic", "code", "strike"]);

export const textRunSchema = z
  .object({
    type: z.literal("text"),
    text: z.string().max(200_000),
    marks: z
      .array(textMarkSchema)
      .refine((marks) => new Set(marks).size === marks.length, "Marks must be unique")
      .optional(),
    href: z.string().max(4096).refine(isAllowedLink, "Unsupported link protocol").optional(),
  })
  .strict();

export const paragraphBlockSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: z.literal("paragraph"),
    children: z.array(textRunSchema),
  })
  .strict();

export const headingBlockSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: z.literal("heading"),
    level: z.union([z.literal(2), z.literal(3), z.literal(4)]),
    children: z.array(textRunSchema),
  })
  .strict();

export const imageBlockSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: z.literal("image"),
    src: z.string().min(1).max(4096),
    originalSrc: z.url().max(4096).optional(),
    alt: z.string().max(2000).optional(),
    caption: z.array(textRunSchema).optional(),
    width: z.number().int().min(1).max(100_000).optional(),
    height: z.number().int().min(1).max(100_000).optional(),
    animated: z.boolean().optional(),
  })
  .strict();

export const blockquoteBlockSchema: z.ZodType<BlockquoteBlock> = z
  .object({
    id: z.string().min(1).max(128),
    type: z.literal("blockquote"),
    blocks: z.array(z.union([paragraphBlockSchema, headingBlockSchema])),
  })
  .strict();

const listItemSchema: z.ZodType<ListItem> = z.lazy(() =>
  z
    .object({
      children: z.array(textRunSchema),
      nested: listBlockSchema.optional(),
    })
    .strict(),
);

export const listBlockSchema: z.ZodType<ListBlock> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1).max(128),
      type: z.literal("list"),
      ordered: z.boolean(),
      start: z.number().int().min(1).max(1_000_000).optional(),
      items: z.array(listItemSchema).max(10_000),
    })
    .strict(),
);

export const codeBlockSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: z.literal("code"),
    code: z.string().max(200_000),
    language: z.string().max(100).optional(),
  })
  .strict();

export const tableBlockSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: z.literal("table"),
    headers: z.array(z.array(textRunSchema)).max(20),
    rows: z.array(z.array(z.array(textRunSchema)).max(20)).max(100),
  })
  .strict();

export const dividerBlockSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: z.literal("divider"),
  })
  .strict();

export const articleBlockSchema: z.ZodType<ArticleBlock> = z.union([
  paragraphBlockSchema,
  headingBlockSchema,
  imageBlockSchema,
  blockquoteBlockSchema,
  listBlockSchema,
  codeBlockSchema,
  tableBlockSchema,
  dividerBlockSchema,
]);

export const articleDocumentSchema: z.ZodType<ArticleDocument> = z
  .object({
    version: z.literal(1),
    title: z.string().min(1).max(1000),
    subtitle: z.string().max(2000).optional(),
    author: z.string().max(500).optional(),
    sourceName: z.string().min(1).max(500),
    canonicalUrl: z.url().max(4096),
    publishedAt: z.iso.datetime({ offset: true }).optional(),
    language: z.string().max(32).optional(),
    blocks: z.array(articleBlockSchema).max(5000),
  })
  .strict();
