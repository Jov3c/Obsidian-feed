import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";

import type { Database } from "./db/client.js";
import { registerBearerAuth } from "./http/auth.js";
import { registerErrorHandler } from "./http/errors.js";
import { registerHealthRoutes, type WechatHealth } from "./http/routes/health.js";
import { registerMediaRoutes, type MediaRouteService } from "./http/routes/media.js";
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
import { SubscriptionService } from "./services/subscription-service.js";

export interface BuildAppDependencies {
  config: { feedServerToken: string; wechat?: WeChatRegistrationConfig };
  database: Database;
  getWechatHealth(): Promise<WechatHealth> | WechatHealth;
  subscriptionService?: SubscriptionRouteService;
  mediaService?: MediaRouteService;
  scheduler?: { start(): void; stop(): void };
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
