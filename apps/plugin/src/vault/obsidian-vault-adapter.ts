import { normalizePath, TFile, type Vault } from "obsidian";

import type { VaultAdapter, VaultFile } from "./exporter.js";
import type { BinaryVaultAdapter } from "./media-downloader.js";

export class ObsidianVaultAdapter implements VaultAdapter, BinaryVaultAdapter {
  constructor(private readonly vault: Vault) {}

  async exists(path: string): Promise<boolean> {
    return this.vault.getAbstractFileByPath(normalizePath(path)) !== null;
  }

  async read(path: string): Promise<string> {
    const file = this.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) throw new Error("Note not found");
    return this.vault.read(file);
  }

  async create(path: string, content: string): Promise<VaultFile> {
    const normalized = normalizePath(path);
    await this.ensureParent(normalized);
    return this.vault.create(normalized, content);
  }

  async modify(path: string, content: string): Promise<VaultFile> {
    const file = this.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) throw new Error("Note not found");
    await this.vault.modify(file, content);
    return file;
  }

  async createBinary(path: string, value: ArrayBuffer): Promise<void> {
    const normalized = normalizePath(path);
    await this.ensureParent(normalized);
    await this.vault.createBinary(normalized, value);
  }

  async findByArticleId(id: string): Promise<string | null> {
    const marker = `obsidian_feed_article_id: ${JSON.stringify(id)}`;
    for (const file of this.vault.getMarkdownFiles()) {
      if ((await this.vault.cachedRead(file)).includes(marker)) return file.path;
    }
    return null;
  }

  private async ensureParent(path: string): Promise<void> {
    const parts = path.split("/").slice(0, -1);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.vault.getAbstractFileByPath(current)) await this.vault.createFolder(current);
    }
  }
}
