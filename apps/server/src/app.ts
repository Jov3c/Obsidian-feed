import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";

import type { Database } from "./db/client.js";
import { registerBearerAuth } from "./http/auth.js";
import { registerErrorHandler } from "./http/errors.js";
import { registerHealthRoutes, type WechatHealth } from "./http/routes/health.js";
import {
  registerSubscriptionRoutes,
  type SubscriptionRouteService,
} from "./http/routes/subscriptions.js";
import { SafeExternalHttpClient } from "./http/safe-http-client.js";
import { createRequestId } from "./http/request-id.js";
import { ProviderRegistry } from "./providers/registry.js";
import { RssProvider } from "./providers/rss/rss-provider.js";
import { ResolutionTokenService } from "./security/resolution-token.js";
import { SubscriptionService } from "./services/subscription-service.js";

export interface BuildAppDependencies {
  config: { feedServerToken: string };
  database: Database;
  getWechatHealth(): Promise<WechatHealth> | WechatHealth;
  subscriptionService?: SubscriptionRouteService;
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

  return app;
}

function createDefaultSubscriptionService(dependencies: BuildAppDependencies): SubscriptionService {
  const providers = new ProviderRegistry();
  providers.register(new RssProvider(new SafeExternalHttpClient()));
  return new SubscriptionService({
    database: dependencies.database,
    providers,
    tokens: new ResolutionTokenService({ secret: dependencies.config.feedServerToken }),
  });
}
