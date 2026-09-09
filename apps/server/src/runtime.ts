import type { FastifyInstance } from "fastify";

import { buildApp } from "./app.js";
import type { AppConfig } from "./config.js";
import type { Database } from "./db/client.js";
import { ArticleRepository } from "./db/repositories/article-repository.js";
import { MediaRepository } from "./db/repositories/media-repository.js";
import { SourceRepository, type SourceSyncPatch } from "./db/repositories/source-repository.js";
import { SyncLogRepository } from "./db/repositories/sync-log-repository.js";
import { SafeExternalHttpClient } from "./http/safe-http-client.js";
import { MediaService } from "./media/media-service.js";
import { parseArticle } from "./parsing/pipeline.js";
import { ProviderRegistry } from "./providers/registry.js";
import { RssProvider } from "./providers/rss/rss-provider.js";
import type { Source } from "./providers/types.js";
import type { WeChatAdapter } from "./providers/wechat/wechat-adapter.js";
import { registerConfiguredWeChatProvider } from "./providers/wechat/wechat-provider.js";
import { CursorService } from "./security/cursor.js";
import { ResolutionTokenService } from "./security/resolution-token.js";
import { ArticleApiService } from "./services/article-api-service.js";
import { ArticleContentService } from "./services/article-content-service.js";
import { IngestService } from "./services/ingest-service.js";
import { SourceApiService } from "./services/source-api-service.js";
import { SubscriptionService } from "./services/subscription-service.js";
import { Scheduler } from "./sync/scheduler.js";
import { SyncWorker } from "./sync/worker.js";

function providerSource(
  row: Awaited<ReturnType<SourceRepository["findById"]>>,
): (Source & { consecutiveFailures: number }) | undefined {
  if (!row) return undefined;
  return {
    id: row.id,
    type: row.sourceType,
    name: row.name,
    canonicalUrl: row.canonicalUrl,
    avatarUrl: row.avatarUrl,
    externalId: row.externalId,
    providerKey: row.providerKey,
    providerMeta: JSON.parse(row.providerMetaJson) as Record<string, unknown>,
    status: row.status,
    lastSyncedAt: row.lastSyncedAt,
    nextSyncAt: row.nextSyncAt,
    consecutiveFailures: row.consecutiveFailures,
  };
}

export function createRuntimeApp(input: {
  config: AppConfig;
  database: Database;
  providers?: ProviderRegistry;
  logger?: boolean;
}): FastifyInstance {
  const providers = input.providers ?? new ProviderRegistry();
  let wechatAdapter: WeChatAdapter | undefined;
  if (!input.providers) {
    registerConfiguredWeChatProvider(providers, input.config.wechat, (adapter) => {
      wechatAdapter = adapter;
    });
    providers.register(new RssProvider(new SafeExternalHttpClient()));
  }
  const sources = new SourceRepository(input.database);
  const articles = new ArticleRepository(input.database);
  const logs = new SyncLogRepository(input.database);
  const media = new MediaService(
    new MediaRepository(input.database),
    new SafeExternalHttpClient(),
    {
      dataDir: input.config.dataDir,
      maxBytes: input.config.media.maxBytes,
      timeoutMs: input.config.media.fetchTimeoutMs,
      maxRedirects: input.config.externalFetch.maxRedirects,
    },
  );
  const ingest = new IngestService({
    articles,
    parseArticle: (parseInput) => parseArticle(parseInput, { mediaRegistrar: media }),
  });
  const worker = new SyncWorker({
    sources: {
      findById: async (id) => providerSource(await sources.findById(id)),
      updateSyncState: (id, patch) => sources.updateSyncState(id, patch as SourceSyncPatch),
    },
    logs: {
      start: (sourceId, providerKey) => logs.start(sourceId, providerKey),
      finish: (id, result) =>
        logs.finish(id, {
          status: result.status,
          newArticles: result.newArticles,
          updatedArticles: result.updatedArticles,
          ...(result.errorCode ? { errorCode: result.errorCode } : {}),
          durationMs: result.durationMs,
        }),
    },
    providers,
    ingest,
    intervals: {
      rssMinutes: input.config.sync.rssIntervalMinutes,
      wechatMinutes: input.config.sync.wechatIntervalMinutes,
    },
  });
  const scheduler = new Scheduler(
    {
      listDue: async (now, limit) =>
        (await sources.listDue(now, limit)).map((source) => ({
          id: source.id,
          sourceType: source.sourceType,
        })),
    },
    worker,
    {
      tickMs: input.config.sync.tickSeconds * 1_000,
      startupDelayMs: 1_000,
      batchSize: 100,
      maxConcurrency: input.config.sync.maxConcurrency,
      wechatConcurrency: 1,
    },
  );
  const subscriptionService = new SubscriptionService({
    database: input.database,
    providers,
    tokens: new ResolutionTokenService({ secret: input.config.feedServerToken }),
  });
  const sourceService = new SourceApiService(sources, logs, (id) => worker.syncOneSource(id));
  const articleApi = new ArticleApiService(
    articles,
    sources,
    new CursorService(input.config.feedServerToken),
  );
  const articleContent = new ArticleContentService(articles, sources, providers, ingest);
  const articleService = {
    listArticles: (request: { limit: number; cursor?: string; sourceId?: string }) =>
      articleApi.listArticles(request),
    getArticle: async (id: string) => {
      await articleContent.ensureArticleContent(id);
      return articleApi.getArticle(id);
    },
  };
  const wechatHealth = async (): Promise<"ok" | "disabled" | "degraded"> => {
    if (input.config.wechat.adapter === null) return "disabled";
    return wechatAdapter ? wechatAdapter.health() : "degraded";
  };

  return buildApp({
    config: input.config,
    database: input.database,
    getWechatHealth: wechatHealth,
    subscriptionService,
    mediaService: media,
    articleService,
    sourceService,
    scheduler,
    systemStatus: async () => {
      input.database.sqlite.prepare("SELECT 1").get();
      return { version: 1, database: "ok", scheduler: "running", wechat: await wechatHealth() };
    },
    logger: input.logger ?? false,
  });
}
