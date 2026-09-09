import type {
  ArticleBlock,
  ArticleDocument,
  ImageBlock,
  ListBlock,
  TextRun,
} from "@obsidian-feed/content-model/types";

function escapeText(value: string): string {
  return value.replace(/([\\`*_[\]<>#])/gu, "\\$1");
}

function runMarkdown(run: TextRun): string {
  let value = escapeText(run.text);
  if (run.marks?.includes("code")) {
    const ticks = "`".repeat(
      Math.max(1, ...(run.text.match(/`+/gu) ?? []).map((item) => item.length + 1)),
    );
    value = `${ticks}${run.text}${ticks}`;
  } else {
    if (run.marks?.includes("bold")) value = `**${value}**`;
    if (run.marks?.includes("italic")) value = `_${value}_`;
    if (run.marks?.includes("strike")) value = `~~${value}~~`;
  }
  return run.href ? `[${value}](${run.href})` : value;
}

const runs = (value: TextRun[]) => value.map(runMarkdown).join("");

function listMarkdown(block: ListBlock, depth = 0): string {
  return block.items
    .map((item, index) => {
      const marker = block.ordered ? `${(block.start ?? 1) + index}.` : "-";
      const line = `${"  ".repeat(depth)}${marker} ${runs(item.children)}`;
      return item.nested ? `${line}\n${listMarkdown(item.nested, depth + 1)}` : line;
    })
    .join("\n");
}

function blockMarkdown(block: ArticleBlock, imageUrl: (block: ImageBlock) => string): string {
  if (block.type === "paragraph") return runs(block.children);
  if (block.type === "heading") return `${"#".repeat(block.level)} ${runs(block.children)}`;
  if (block.type === "image") {
    const source = imageUrl(block);
    const isWikiLink = source.startsWith("![[") && source.slice(-2) === "]]";
    return isWikiLink ? source : `![${escapeText(block.alt ?? "")}](${source})`;
  }
  if (block.type === "blockquote")
    return block.blocks
      .map((nested) => blockMarkdown(nested, imageUrl))
      .join("\n\n")
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  if (block.type === "list") return listMarkdown(block);
  if (block.type === "code") {
    const longest = Math.max(3, ...(block.code.match(/`+/gu) ?? []).map((item) => item.length + 1));
    const fence = "`".repeat(longest);
    return `${fence}${block.language ?? ""}\n${block.code}\n${fence}`;
  }
  if (block.type === "table") {
    const columns = Math.max(block.headers.length, ...block.rows.map((row) => row.length));
    const values = (row: TextRun[][]) =>
      Array.from({ length: columns }, (_, index) =>
        runs(row[index] ?? [])
          .replaceAll("|", "\\|")
          .replaceAll("\n", " "),
      );
    const headerValues = values(block.headers);
    const rowValues = block.rows.map(values);
    const widths = Array.from({ length: columns }, (_, index) =>
      Math.max(
        3,
        headerValues[index]?.length ?? 0,
        ...rowValues.map((row) => row[index]?.length ?? 0),
      ),
    );
    const cells = (row: string[]) =>
      `| ${row.map((cell, index) => cell.padEnd(widths[index] ?? 3)).join(" | ")} |`;
    return [
      cells(headerValues),
      `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`,
      ...rowValues.map(cells),
    ].join("\n");
  }
  return "---";
}

export function articleDocumentToMarkdown(
  document: ArticleDocument,
  options: { imageUrl?: (block: ImageBlock) => string } = {},
): string {
  const imageUrl = options.imageUrl ?? ((block: ImageBlock) => block.src);
  return `${document.blocks.map((block) => blockMarkdown(block, imageUrl)).join("\n\n")}\n`;
}
