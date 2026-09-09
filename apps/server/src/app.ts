import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";

import type { Database } from "./db/client.js";
import { ArticleRepository } from "./db/repositories/article-repository.js";
import { SourceRepository } from "./db/repositories/source-repository.js";
import { SyncLogRepository } from "./db/repositories/sync-log-repository.js";
import { registerBearerAuth } from "./http/auth.js";
import { registerErrorHandler } from "./http/errors.js";
import { registerHealthRoutes, type WechatHealth } from "./http/routes/health.js";
import { registerMediaRoutes, type MediaRouteService } from "./http/routes/media.js";
import { registerArticleRoutes, type ArticleRouteService } from "./http/routes/articles.js";
import { registerSourceRoutes, type SourceRouteService } from "./http/routes/sources.js";
import { registerSystemRoutes } from "./http/routes/system.js";
import {
  registerSubscriptionRoutes,
  type SubscriptionRouteService,
} from "./http/routes/subscriptions.js";
import { SafeExternalHttpClient } from "./http/safe-http-client.js";
import { createRequestId } from "./http/request-id.js";
import { ProviderRegistry } from "./providers/registry.js";
import { RssProvider } from "./providers/rss/rss-provider.js";
import {
  registerConfiguredWeChatProvider,
  type WeChatRegistrationConfig,
} from "./providers/wechat/wechat-provider.js";
import { ResolutionTokenService } from "./security/resolution-token.js";
import { CursorService } from "./security/cursor.js";
import { ArticleApiService } from "./services/article-api-service.js";
import { SourceApiService } from "./services/source-api-service.js";
import { SubscriptionService } from "./services/subscription-service.js";

export interface BuildAppDependencies {
  config: { feedServerToken: string; wechat?: WeChatRegistrationConfig };
  database: Database;
  getWechatHealth(): Promise<WechatHealth> | WechatHealth;
  subscriptionService?: SubscriptionRouteService;
  mediaService?: MediaRouteService;
  scheduler?: { start(): void; stop(): void };
  articleService?: ArticleRouteService;
  sourceService?: SourceRouteService;
  systemStatus?: () => Promise<Record<string, unknown>> | Record<string, unknown>;
  logger?: boolean | FastifyBaseLogger;
}

export function buildApp(dependencies: BuildAppDependencies): FastifyInstance {
  const app = Fastify({
    logger: dependencies.logger ?? true,
    genReqId: createRequestId,
  });

  registerErrorHandler(app);
  registerBearerAuth(app, dependencies.config.feedServerToken);
  registerHealthRoutes(app, dependencies);
  const subscriptionService =
    dependencies.subscriptionService ?? createDefaultSubscriptionService(dependencies);
  registerSubscriptionRoutes(app, subscriptionService);
  if (dependencies.mediaService) registerMediaRoutes(app, dependencies.mediaService);
  registerArticleRoutes(
    app,
    dependencies.articleService ??
      new ArticleApiService(
        new ArticleRepository(dependencies.database),
        new SourceRepository(dependencies.database),
        new CursorService(dependencies.config.feedServerToken),
      ),
  );
  registerSourceRoutes(
    app,
    dependencies.sourceService ??
      new SourceApiService(
        new SourceRepository(dependencies.database),
        new SyncLogRepository(dependencies.database),
      ),
  );
  registerSystemRoutes(
    app,
    dependencies.systemStatus ??
      (() => ({ version: 1, scheduler: dependencies.scheduler ? "running" : "disabled" })),
  );
  if (dependencies.scheduler) {
    app.addHook("onReady", () => dependencies.scheduler?.start());
    app.addHook("onClose", () => dependencies.scheduler?.stop());
  }

  return app;
}

function createDefaultSubscriptionService(dependencies: BuildAppDependencies): SubscriptionService {
  const providers = new ProviderRegistry();
  registerConfiguredWeChatProvider(providers, dependencies.config.wechat);
  providers.register(new RssProvider(new SafeExternalHttpClient()));
  return new SubscriptionService({
    database: dependencies.database,
    providers,
    tokens: new ResolutionTokenService({ secret: dependencies.config.feedServerToken }),
  });
}
