import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";

import type { Database } from "./db/client.js";
import { registerBearerAuth } from "./http/auth.js";
import { registerErrorHandler } from "./http/errors.js";
import { registerHealthRoutes, type WechatHealth } from "./http/routes/health.js";
import { createRequestId } from "./http/request-id.js";

export interface BuildAppDependencies {
  config: { feedServerToken: string };
  database: Database;
  getWechatHealth(): Promise<WechatHealth> | WechatHealth;
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

  return app;
}
