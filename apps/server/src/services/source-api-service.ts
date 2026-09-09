import type { RefreshResult, SourceStatusResponse } from "@obsidian-feed/contracts";

import type { SourceRepository } from "../db/repositories/source-repository.js";
import type { SyncLogRepository } from "../db/repositories/sync-log-repository.js";
import { AppError } from "../http/errors.js";

export class SourceApiService {
  private readonly running = new Set<string>();

  constructor(
    private readonly sources: SourceRepository,
    private readonly logs: SyncLogRepository,
    private readonly refreshSource?: (id: string) => Promise<unknown>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getStatus(id: string): Promise<SourceStatusResponse> {
    const source = await this.sources.findById(id);
    if (!source) throw new AppError("SOURCE_NOT_FOUND", 404, false, "Source not found");
    const last = await this.logs.latestForSource(id);
    return {
      id,
      status: source.status,
      lastSyncedAt: source.lastSyncedAt,
      nextSyncAt: source.nextSyncAt,
      lastError:
        last?.status === "failed" && last.errorCode && last.errorMessage
          ? { code: last.errorCode, message: last.errorMessage }
          : null,
    };
  }

  async refresh(id: string): Promise<RefreshResult> {
    const source = await this.sources.findById(id);
    if (!source) throw new AppError("SOURCE_NOT_FOUND", 404, false, "Source not found");
    if (this.running.has(id)) return { status: "already_running", sourceId: id };
    if (
      source.lastSyncedAt &&
      this.now().getTime() - new Date(source.lastSyncedAt).getTime() < 5 * 60_000
    ) {
      throw new AppError("SOURCE_REFRESH_THROTTLED", 429, true, "Source refresh is throttled", 300);
    }
    this.running.add(id);
    queueMicrotask(() => {
      void Promise.resolve(this.refreshSource?.(id)).finally(() => this.running.delete(id));
    });
    return { status: "accepted", sourceId: id };
  }
}
