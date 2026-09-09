import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Database } from "./client.js";

const initialMigrationUrl = new URL("../../drizzle/0000_initial.sql", import.meta.url);

export function migrateDatabase(
  database: Database,
  migrationPath = fileURLToPath(initialMigrationUrl),
): void {
  database.sqlite.exec(readFileSync(migrationPath, "utf8"));
}
