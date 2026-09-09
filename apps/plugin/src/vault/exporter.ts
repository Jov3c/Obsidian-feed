import type { ApiArticleDetail } from "@obsidian-feed/contracts";

import { yamlFrontmatter } from "./frontmatter.js";
import { articleDocumentToMarkdown } from "./markdown.js";
import { articleNotePath } from "./path.js";

export interface VaultFile {
  path: string;
}
export interface VaultAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  create(path: string, content: string): Promise<VaultFile>;
  modify(path: string, content: string): Promise<VaultFile>;
  findByArticleId(id: string): Promise<string | null>;
}

const bodyStart = "<!-- obsidian-feed:body:start -->";
const bodyEnd = "<!-- obsidian-feed:body:end -->";

function section(value: string, start: string, end: string): string | null {
  const from = value.indexOf(start);
  const to = value.indexOf(end, from + start.length);
  if (from < 0 || to < 0 || value.indexOf(start, from + start.length) >= 0) return null;
  return value.slice(from + start.length, to);
}

export class ArticleExporter {
  constructor(
    private readonly vault: VaultAdapter,
    private readonly options: { saveRoot: string; now?: () => Date },
  ) {}

  async save(detail: ApiArticleDetail): Promise<VaultFile> {
    if (!detail.document) throw new Error("Article document is unavailable");
    const now = this.options.now?.() ?? new Date();
    const date = now.toISOString().slice(0, 10);
    const desired = articleNotePath({
      root: this.options.saveRoot,
      sourceType: detail.source.type,
      sourceName: detail.source.name,
      title: detail.article.title,
      fallbackDate: date,
    });
    const identified = await this.vault.findByArticleId(detail.article.id);
    let path = identified ?? desired;
    const generated = this.generate(detail, now);
    if (identified) {
      const existing = await this.vault.read(identified);
      const notes = section(existing, "## 我的笔记", "## 我的摘录");
      const excerpts = section(existing, "## 我的摘录", "\n---\n");
      const validMarkers = section(existing, bodyStart, bodyEnd);
      if (notes === null || excerpts === null || validMarkers === null) {
        path = identified.replace(/\.md$/u, "-updated.md");
        return this.vault.create(path, generated);
      }
      const preserved = generated
        .replace("## 我的笔记\n\n", `## 我的笔记${notes}`)
        .replace("## 我的摘录\n\n", `## 我的摘录${excerpts}`);
      return this.vault.modify(path, preserved);
    }
    if (await this.vault.exists(path)) {
      let index = 2;
      while (await this.vault.exists(path.replace(/\.md$/u, ` (${index}).md`))) index += 1;
      path = path.replace(/\.md$/u, ` (${index}).md`);
    }
    return this.vault.create(path, generated);
  }

  private generate(detail: ApiArticleDetail, now: Date): string {
    const published = detail.article.publishedAt?.slice(0, 10);
    const frontmatter = yamlFrontmatter({
      type: "article",
      source_type: detail.source.type,
      source: detail.source.name,
      author: detail.article.author ?? undefined,
      published,
      saved_at: now.toISOString(),
      original_url: detail.article.canonicalUrl,
      obsidian_feed_article_id: detail.article.id,
    });
    const body = articleDocumentToMarkdown(detail.document!, { imageUrl: (image) => image.src });
    return `${frontmatter}\n\n# ${detail.article.title}\n\n> 来源：[${detail.source.name}](${detail.article.canonicalUrl})\n\n## 我的笔记\n\n\n## 我的摘录\n\n\n---\n\n${bodyStart}\n## 正文\n\n${body}${bodyEnd}\n`;
  }
}
