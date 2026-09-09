import type {
  ArticleBlock,
  ArticleDocument,
  ListBlock,
  TextRun,
} from "@obsidian-feed/content-model/types";

interface MediaLoader {
  load(path: string): Promise<string>;
  dispose(): void;
}
export interface RenderHandle {
  dispose(): void;
}

function safeHref(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function appendRuns(parent: HTMLElement, runs: TextRun[]): void {
  const document = parent.ownerDocument;
  for (const run of runs) {
    let node: HTMLElement = document.createElement("span");
    node.textContent = run.text;
    for (const mark of run.marks ?? []) {
      const wrapper = document.createElement(
        mark === "bold" ? "strong" : mark === "italic" ? "em" : mark === "strike" ? "s" : "code",
      );
      wrapper.append(node);
      node = wrapper;
    }
    const href = run.href ? safeHref(run.href) : null;
    if (href) {
      const link = document.createElement("a");
      link.href = href;
      link.rel = "noopener noreferrer";
      link.append(node);
      parent.append(link);
    } else parent.append(node);
  }
}

function renderList(document: Document, block: ListBlock): HTMLElement {
  const list = document.createElement(block.ordered ? "ol" : "ul");
  if (block.ordered && block.start) (list as HTMLOListElement).start = block.start;
  for (const item of block.items) {
    const row = document.createElement("li");
    appendRuns(row, item.children);
    if (item.nested) row.append(renderList(document, item.nested));
    list.append(row);
  }
  return list;
}

function renderBlock(
  document: Document,
  block: ArticleBlock,
  dependencies: { mediaLoader: MediaLoader; onImageOpen(src: string): void },
): HTMLElement {
  let node: HTMLElement;
  if (block.type === "paragraph" || block.type === "heading") {
    node = document.createElement(block.type === "paragraph" ? "p" : `h${block.level}`);
    appendRuns(node, block.children);
  } else if (block.type === "image") {
    const figure = document.createElement("figure");
    const image = document.createElement("img");
    image.alt = block.alt ?? "";
    image.loading = "lazy";
    void dependencies.mediaLoader
      .load(block.src)
      .then((source) => {
        image.src = source;
        image.addEventListener("click", () => dependencies.onImageOpen(source));
      })
      .catch(() => figure.classList.add("is-error"));
    figure.append(image);
    if (block.caption) {
      const caption = document.createElement("figcaption");
      appendRuns(caption, block.caption);
      figure.append(caption);
    }
    node = figure;
  } else if (block.type === "blockquote") {
    node = document.createElement("blockquote");
    for (const nested of block.blocks) node.append(renderBlock(document, nested, dependencies));
  } else if (block.type === "list") node = renderList(document, block);
  else if (block.type === "code") {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = block.code;
    if (block.language) code.dataset.language = block.language;
    pre.append(code);
    node = pre;
  } else if (block.type === "table") {
    const wrapper = document.createElement("div");
    wrapper.className = "of-table-wrap";
    const table = document.createElement("table");
    if (block.headers.length) {
      const head = table.createTHead().insertRow();
      for (const cell of block.headers) {
        const th = document.createElement("th");
        appendRuns(th, cell);
        head.append(th);
      }
    }
    const body = table.createTBody();
    for (const row of block.rows) {
      const tr = body.insertRow();
      for (const cell of row) appendRuns(tr.insertCell(), cell);
    }
    wrapper.append(table);
    node = wrapper;
  } else node = document.createElement("hr");
  node.dataset.blockId = block.id;
  return node;
}

export class ArticleRenderer {
  renderDocument(
    container: HTMLElement,
    documentValue: ArticleDocument,
    dependencies: { mediaLoader: MediaLoader; onImageOpen(src: string): void },
  ): RenderHandle {
    container.replaceChildren();
    const fragment = container.ownerDocument.createDocumentFragment();
    for (const block of documentValue.blocks)
      fragment.append(renderBlock(container.ownerDocument, block, dependencies));
    container.append(fragment);
    return { dispose: () => dependencies.mediaLoader.dispose() };
  }
}
