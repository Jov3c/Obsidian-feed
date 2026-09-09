import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";

function createOrm(sqlite: DatabaseSync) {
  return drizzle({ client: sqlite });
}

export type OrmDatabase = ReturnType<typeof createOrm>;

export interface Database {
  sqlite: DatabaseSync;
  orm: OrmDatabase;
  close(): void;
}

export function newId(prefix: "src" | "sub" | "art" | "sync" | "med"): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export function createDatabase(path: string): Database {
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec("PRAGMA busy_timeout = 5000");
  sqlite.exec("PRAGMA synchronous = NORMAL");

  return {
    sqlite,
    orm: createOrm(sqlite),
    close: () => sqlite.close(),
  };
}
