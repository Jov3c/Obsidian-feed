import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { loadConfig } from "./config.js";
import { createDatabase } from "./db/client.js";
import { migrateDatabase } from "./db/migrate.js";
import { createRuntimeApp } from "./runtime.js";

export async function startServer(environment: NodeJS.ProcessEnv = process.env) {
  const config = loadConfig(environment);
  mkdirSync(dirname(config.databasePath), { recursive: true });
  const database = createDatabase(config.databasePath);

  try {
    migrateDatabase(database);
    const app = createRuntimeApp({
      config,
      database,
      logger: true,
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
  const server = await startServer();
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await server.app.close();
    server.database.close();
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}
