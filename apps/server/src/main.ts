import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db/client.js";
import { migrateDatabase } from "./db/migrate.js";

export async function startServer(environment: NodeJS.ProcessEnv = process.env) {
  const config = loadConfig(environment);
  mkdirSync(dirname(config.databasePath), { recursive: true });
  const database = createDatabase(config.databasePath);

  try {
    migrateDatabase(database);
    const app = buildApp({
      config,
      database,
      getWechatHealth: () => (config.wechat.adapter === null ? "disabled" : "degraded"),
    });
    await app.listen({ host: config.host, port: config.port });
    return { app, database };
  } catch (error) {
    database.close();
    throw error;
  }
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  await startServer();
}
