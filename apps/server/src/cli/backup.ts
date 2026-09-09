import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

export async function backupSqliteDatabase(
  database: DatabaseSync,
  destinationPath: string,
): Promise<string> {
  const destination = resolve(destinationPath);
  if (existsSync(destination)) throw new Error(`Backup destination already exists: ${destination}`);
  mkdirSync(dirname(destination), { recursive: true });
  await backup(database, destination);
  return destination;
}

function defaultBackupPath(databasePath: string, now = new Date()): string {
  const timestamp = now
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d{3}Z$/u, "Z");
  return join(dirname(databasePath), "backups", `feed-${timestamp}.sqlite`);
}

export async function runBackupCli(
  environment: NodeJS.ProcessEnv = process.env,
  argumentsValue: string[] = process.argv.slice(2),
): Promise<string> {
  const databasePath = resolve(environment.DATABASE_PATH ?? "data/feed.sqlite");
  if (!existsSync(databasePath)) throw new Error(`Database does not exist: ${databasePath}`);
  const destination = argumentsValue[0] ?? defaultBackupPath(databasePath);
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return await backupSqliteDatabase(database, destination);
  } finally {
    database.close();
  }
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  const destination = await runBackupCli();
  process.stdout.write(`${destination}\n`);
}
