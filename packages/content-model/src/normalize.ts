import type {
  ArticleBlock,
  ArticleDocument,
  BlockquoteBlock,
  ListBlock,
  TextRun,
} from "./article-document.js";
import { createStableBlockId } from "./hash.js";
import { articleDocumentSchema } from "./schema.js";

function equalMarks(left: TextRun, right: TextRun): boolean {
  return (
    left.href === right.href &&
    JSON.stringify(left.marks ?? []) === JSON.stringify(right.marks ?? [])
  );
}

function normalizeTextRuns(runs: TextRun[]): TextRun[] {
  const merged: TextRun[] = [];

  for (const run of runs) {
    if (run.text.trim().length === 0) continue;

    const previous = merged.at(-1);
    if (previous && equalMarks(previous, run)) {
      previous.text += run.text;
      continue;
    }

    merged.push({ ...run, marks: run.marks ? [...run.marks] : undefined });
  }

  const lastIndex = merged.length - 1;
  return merged
    .map((run, index) => ({
      ...run,
      text: run.text
        .replace(index === 0 ? /^\s+/u : /$^/u, "")
        .replace(index === lastIndex ? /\s+$/u : /$^/u, ""),
    }))
    .filter((run) => run.text.length > 0);
}

function withoutId(block: ArticleBlock): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(block)) {
    if (key !== "id") content[key] = value;
  }
  return content;
}

function normalizeBlock(block: ArticleBlock, canonicalUrl: string, path: string): ArticleBlock {
  let normalized: ArticleBlock;

  switch (block.type) {
    case "paragraph":
    case "heading":
      normalized = { ...block, children: normalizeTextRuns(block.children) };
      break;
    case "image":
      normalized = {
        ...block,
        ...(block.caption ? { caption: normalizeTextRuns(block.caption) } : {}),
      };
      break;
    case "blockquote":
      normalized = {
        ...block,
        blocks: block.blocks.map((nested, index) =>
          normalizeBlock(nested, canonicalUrl, `${path}.quote.${index}`),
        ) as BlockquoteBlock["blocks"],
      };
      break;
    case "list":
      normalized = {
        ...block,
        items: block.items.map((item, index) => ({
          ...item,
          children: normalizeTextRuns(item.children),
          ...(item.nested
            ? {
                nested: normalizeBlock(
                  item.nested,
                  canonicalUrl,
                  `${path}.item.${index}.nested`,
                ) as ListBlock,
              }
            : {}),
        })),
      };
      break;
    case "code":
    case "table":
    case "divider":
      normalized = structuredClone(block);
      break;
  }

  return {
    ...normalized,
    id: createStableBlockId(canonicalUrl, path, withoutId(normalized)),
  };
}

export function normalizeArticleDocument(input: unknown): ArticleDocument {
  const document = articleDocumentSchema.parse(input);
  const blocks: ArticleBlock[] = [];

  for (const [index, block] of document.blocks.entries()) {
    const normalized = normalizeBlock(block, document.canonicalUrl, String(index));

    if (
      (normalized.type === "paragraph" || normalized.type === "heading") &&
      normalized.children.length === 0
    ) {
      continue;
    }

    if (normalized.type === "divider" && blocks.at(-1)?.type === "divider") continue;
    blocks.push(normalized);
  }

  return articleDocumentSchema.parse({ ...document, blocks });
}
