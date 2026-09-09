import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { MediaRepository } from "../db/repositories/media-repository.js";
import { AppError } from "../http/errors.js";
import type { HttpLimits, HttpStreamResponse } from "../http/safe-http-client.js";
import { assertSafeExternalUrl } from "../http/safe-url.js";
import { mediaPath } from "./media-path.js";
import { sniffImageMime } from "./mime.js";

interface StreamHttpClient {
  getStream(url: string, limits: HttpLimits): Promise<HttpStreamResponse>;
}
export interface MediaRef {
  id: string;
  src: string;
}
export interface MediaFile {
  path: string;
  bytes: Buffer;
  mimeType: string;
  sizeBytes: number;
  etag: string;
}

export class MediaService {
  private readonly inFlight = new Map<string, Promise<MediaFile>>();
  private readonly maxBytes: number;
  private readonly dataDir: string;
  private readonly validateUrl: (url: string) => Promise<unknown>;

  constructor(
    private readonly repository: MediaRepository,
    private readonly http: StreamHttpClient,
    options: {
      dataDir: string;
      maxBytes: number;
      timeoutMs?: number;
      maxRedirects?: number;
      validateUrl?: (url: string) => Promise<unknown>;
    },
  ) {
    this.dataDir = options.dataDir;
    this.maxBytes = options.maxBytes;
    this.options = options;
    this.validateUrl = options.validateUrl ?? ((url) => assertSafeExternalUrl(url));
  }
  private readonly options: { timeoutMs?: number; maxRedirects?: number };

  async registerRemote(input: string): Promise<MediaRef> {
    const url = new URL(input);
    url.hash = "";
    await this.validateUrl(url.href);
    const row = await this.repository.createPending(url.href);
    return { id: row.id, src: `/v1/media/${row.id}` };
  }

  async getOrFetch(id: string): Promise<MediaFile> {
    const active = this.inFlight.get(id);
    if (active) return active;
    const promise = this.load(id).finally(() => this.inFlight.delete(id));
    this.inFlight.set(id, promise);
    return promise;
  }

  private async load(id: string): Promise<MediaFile> {
    const row = await this.repository.findById(id);
    if (!row) throw new AppError("MEDIA_NOT_FOUND", 404, false, "Media not found");
    if (
      row.status === "ready" &&
      row.localPath &&
      row.mimeType &&
      row.sha256 &&
      row.sizeBytes !== null
    ) {
      try {
        const bytes = await readFile(row.localPath);
        await this.repository.update(id, { lastAccessedAt: new Date().toISOString() });
        return {
          path: row.localPath,
          bytes,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
          etag: `"${row.sha256}"`,
        };
      } catch {
        /* refetch missing cache file */
      }
    }
    try {
      const response = await this.http.getStream(row.originalUrl, {
        maxBytes: this.maxBytes,
        timeoutMs: this.options.timeoutMs ?? 15_000,
        maxRedirects: this.options.maxRedirects ?? 5,
      });
      if (response.statusCode < 200 || response.statusCode >= 300)
        throw new Error(`HTTP ${response.statusCode}`);
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of response.body) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        size += buffer.length;
        if (size > this.maxBytes)
          throw new AppError("UPSTREAM_UNAVAILABLE", 502, false, "Media exceeded size limit");
        chunks.push(buffer);
      }
      const bytes = Buffer.concat(chunks);
      const mime = sniffImageMime(bytes);
      if (!mime) throw new AppError("UPSTREAM_UNAVAILABLE", 502, false, "Unsupported image type");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const path = mediaPath(this.dataDir, sha256, mime.extension);
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${id}.tmp`;
      await writeFile(temporary, bytes, { flag: "wx" });
      try {
        await rename(temporary, path);
      } catch (error) {
        await unlink(temporary).catch(() => undefined);
        try {
          await readFile(path);
        } catch {
          throw error;
        }
      }
      await this.repository.update(id, {
        localPath: path,
        mimeType: mime.mimeType,
        sizeBytes: bytes.length,
        sha256,
        etag: response.headers.etag ?? null,
        lastModified: response.headers["last-modified"] ?? null,
        status: "ready",
        lastAccessedAt: new Date().toISOString(),
      });
      return { path, bytes, mimeType: mime.mimeType, sizeBytes: bytes.length, etag: `"${sha256}"` };
    } catch (error) {
      await this.repository.update(id, { status: "failed" });
      throw error;
    }
  }
}
