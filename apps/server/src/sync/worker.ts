import type { ProviderArticle, Source, SyncPage } from "../providers/types.js";
import { ProviderError } from "../providers/types.js";
import { computeNextSync, computeSyncState, type SyncPolicyOutcome } from "./policy.js";

interface SourceWithFailures extends Source {
  consecutiveFailures?: number;
}
interface WorkerDependencies {
  sources: {
    findById(id: string): Promise<SourceWithFailures | undefined>;
    updateSyncState(id: string, patch: Record<string, unknown>): Promise<unknown>;
  };
  logs: {
    start(sourceId: string, providerKey: string): Promise<{ id: string }>;
    finish(
      id: string,
      result: {
        status: "success" | "failed";
        newArticles: number;
        updatedArticles: number;
        errorCode?: string;
        durationMs: number;
      },
    ): Promise<unknown>;
  };
  providers: { getByKey(key: string): { syncSource(source: Source): Promise<SyncPage> } };
  ingest: {
    ingestProviderArticles(
      source: Source,
      articles: ProviderArticle[],
    ): Promise<{ added: number; updated: number; failed: number }>;
  };
  now?: () => Date;
  random?: () => number;
  intervals?: { rssMinutes: number; wechatMinutes: number };
}

export interface SyncOutcome {
  status: "success" | "failed";
  newArticles: number;
  updatedArticles: number;
  errorCode?: string;
}

export class SyncWorker {
  private readonly now: () => Date;
  private readonly random: () => number;
  constructor(private readonly dependencies: WorkerDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.random = dependencies.random ?? Math.random;
  }

  async syncOneSource(sourceId: string): Promise<SyncOutcome> {
    const source = await this.dependencies.sources.findById(sourceId);
    if (!source) throw new Error(`Source not found: ${sourceId}`);
    const started = this.now();
    const log = await this.dependencies.logs.start(source.id, source.providerKey);
    let result: SyncOutcome | undefined;
    try {
      const page = await this.dependencies.providers
        .getByKey(source.providerKey)
        .syncSource(source);
      const stats = await this.dependencies.ingest.ingestProviderArticles(source, page.articles);
      const nextSyncAt = computeNextSync({
        now: this.now(),
        sourceType: source.type,
        outcome: "success",
        newArticles: stats.added,
        ...(this.dependencies.intervals
          ? {
              baseIntervalMinutes:
                source.type === "wechat"
                  ? this.dependencies.intervals.wechatMinutes
                  : this.dependencies.intervals.rssMinutes,
            }
          : {}),
        random: this.random,
      });
      await this.dependencies.sources.updateSyncState(source.id, {
        status: "active",
        consecutiveFailures: 0,
        lastSyncedAt: this.now().toISOString(),
        nextSyncAt: nextSyncAt.toISOString(),
      });
      result = { status: "success", newArticles: stats.added, updatedArticles: stats.updated };
    } catch (error) {
      const providerError =
        error instanceof ProviderError
          ? error
          : new ProviderError(
              "UPSTREAM_UNAVAILABLE",
              error instanceof Error ? error.message : "Sync failed",
              true,
              source.providerKey,
            );
      const policyOutcome: SyncPolicyOutcome =
        providerError.code === "UPSTREAM_AUTH_REQUIRED"
          ? "auth_required"
          : providerError.code === "UPSTREAM_RATE_LIMITED"
            ? "rate_limited"
            : "failure";
      const failures = (source.consecutiveFailures ?? 0) + 1;
      const nextSyncAt = computeNextSync({
        now: this.now(),
        sourceType: source.type,
        outcome: policyOutcome,
        consecutiveFailures: failures,
        ...(providerError.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: providerError.retryAfterSeconds }),
        random: this.random,
      });
      await this.dependencies.sources.updateSyncState(source.id, {
        status: computeSyncState(policyOutcome),
        consecutiveFailures: failures,
        nextSyncAt: nextSyncAt.toISOString(),
      });
      result = {
        status: "failed",
        newArticles: 0,
        updatedArticles: 0,
        errorCode: providerError.code,
      };
    } finally {
      await this.dependencies.logs.finish(log.id, {
        status: result?.status ?? "failed",
        newArticles: result?.newArticles ?? 0,
        updatedArticles: result?.updatedArticles ?? 0,
        ...(result?.errorCode ? { errorCode: result.errorCode } : {}),
        durationMs: this.now().getTime() - started.getTime(),
      });
    }
    if (!result) throw new Error("Sync did not produce an outcome");
    return result;
  }
}
