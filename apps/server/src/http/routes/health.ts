import type { FastifyInstance } from "fastify";

import type { Database } from "../../db/client.js";

export type WechatHealth = "ok" | "degraded" | "disabled";

export interface HealthRouteDependencies {
  database: Database;
  getWechatHealth(): Promise<WechatHealth> | WechatHealth;
}

export function registerHealthRoutes(
  app: FastifyInstance,
  dependencies: HealthRouteDependencies,
): void {
  app.get("/health/live", async () => ({ status: "ok" as const }));

  app.get("/health/ready", async () => {
    let database: "ok" | "error" = "ok";
    try {
      dependencies.database.sqlite.prepare("SELECT 1").get();
    } catch {
      database = "error";
    }

    const wechat = await dependencies.getWechatHealth();
    return {
      status: database === "ok" && wechat !== "degraded" ? ("ok" as const) : ("degraded" as const),
      database,
      wechat,
    };
  });
}
