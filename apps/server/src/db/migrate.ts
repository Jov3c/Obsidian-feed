import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Database } from "./client.js";

function defaultMigrationPath(): string {
  const candidates = [
    new URL("../../drizzle/0000_initial.sql", import.meta.url),
    new URL("../drizzle/0000_initial.sql", import.meta.url),
  ];
  const path = candidates.map((url) => fileURLToPath(url)).find(existsSync);
  if (!path) throw new Error("Initial database migration was not found");
  return path;
}

export function migrateDatabase(database: Database, migrationPath = defaultMigrationPath()): void {
  database.sqlite.exec(readFileSync(migrationPath, "utf8"));
}
