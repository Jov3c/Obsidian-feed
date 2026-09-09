import type { ApiArticleDetail } from "@obsidian-feed/contracts";
import type { ArticleBlock, ArticleDocument } from "@obsidian-feed/content-model/types";

import { sanitizePathSegment } from "./path.js";

export interface BinaryVaultAdapter {
  exists(path: string): Promise<boolean>;
  createBinary(path: string, value: ArrayBuffer): Promise<void>;
}

export interface BinaryRequestOptions {
  url: string;
  method: "GET";
  headers: Record<string, string>;
}

export interface BinaryResponse {
  status: number;
  arrayBuffer: ArrayBuffer;
  headers: Record<string, string>;
}

const mimeExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function responseHeader(headers: Record<string, string>, name: string): string | undefined {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}

function saveRootFromNotePath(notePath: string): string {
  const parts = notePath.replaceAll("\\", "/").split("/").filter(Boolean);
  return parts.slice(0, Math.max(1, parts.length - 3)).join("/");
}

function mapBlocks(blocks: ArticleBlock[], replace: (source: string) => string): ArticleBlock[] {
  return blocks.map((block) => {
    if (block.type === "image") return { ...block, src: replace(block.src) };
    return block;
  });
}

export class VaultMediaDownloader {
  private readonly baseUrl: URL;
  private readonly maxImageBytes: number;
  private readonly maxArticleBytes: number;

  constructor(
    private readonly vault: BinaryVaultAdapter,
    private readonly options: {
      baseUrl: string;
      token: string;
      request(options: BinaryRequestOptions): Promise<BinaryResponse>;
      saveRoot?: string;
      maxImageBytes?: number;
      maxArticleBytes?: number;
    },
  ) {
    this.baseUrl = new URL(options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`);
    this.maxImageBytes = options.maxImageBytes ?? 20 * 1024 * 1024;
    this.maxArticleBytes = options.maxArticleBytes ?? 200 * 1024 * 1024;
  }

  async localizeArticleImages(
    detail: ApiArticleDetail,
    notePath: string,
  ): Promise<ArticleDocument> {
    if (!detail.document) throw new Error("Article document is unavailable");
    const sources: string[] = [];
    const seen = new Set<string>();
    const collect = (blocks: ArticleBlock[]) => {
      for (const block of blocks) {
        if (block.type === "image" && !seen.has(block.src)) {
          sources.push(block.src);
          seen.add(block.src);
        }
      }
    };
    collect(detail.document.blocks);

    const localized = new Map<string, string>();
    let totalBytes = 0;
    const root = this.options.saveRoot
      ? sanitizePathSegment(this.options.saveRoot, "Feed")
      : saveRootFromNotePath(notePath);
    const articleDirectory = sanitizePathSegment(detail.article.id, "article");
    for (const [index, source] of sources.entries()) {
      try {
        const url = new URL(source, this.baseUrl);
        if (url.origin !== this.baseUrl.origin || !url.pathname.startsWith("/v1/media/")) continue;
        const response = await this.options.request({
          url: url.href,
          method: "GET",
          headers: { Authorization: `Bearer ${this.options.token}` },
        });
        if (response.status < 200 || response.status >= 300) continue;
        const mime = responseHeader(response.headers, "content-type")?.split(";", 1)[0]?.trim();
        const extension = mime ? mimeExtensions[mime.toLowerCase()] : undefined;
        const size = response.arrayBuffer.byteLength;
        if (!extension || size > this.maxImageBytes || totalBytes + size > this.maxArticleBytes)
          continue;
        const name = `${String(index + 1).padStart(3, "0")}-${stableHash(source)}.${extension}`;
        const path = `${root}/_attachments/${articleDirectory}/${name}`;
        if (!(await this.vault.exists(path)))
          await this.vault.createBinary(path, response.arrayBuffer);
        totalBytes += size;
        localized.set(source, `![[${path}]]`);
      } catch {
        // A failed image remains remote and never prevents saving the article.
      }
    }
    return {
      ...detail.document,
      blocks: mapBlocks(detail.document.blocks, (src) => localized.get(src) ?? src),
    };
  }
}
