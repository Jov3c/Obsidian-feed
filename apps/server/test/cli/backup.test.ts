import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { backupSqliteDatabase } from "../../src/cli/backup.js";
import { createDatabase } from "../../src/db/client.js";

describe("SQLite backup", () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
  });

  it("creates an independently openable snapshot containing committed rows", async () => {
    const directory = mkdtempSync(join(tmpdir(), "obsidian-feed-backup-"));
    directories.push(directory);
    const sourcePath = join(directory, "live.sqlite");
    const destinationPath = join(directory, "backups", "snapshot.sqlite");
    const source = createDatabase(sourcePath);
    source.sqlite.exec("CREATE TABLE backup_probe (value TEXT NOT NULL)");
    source.sqlite.prepare("INSERT INTO backup_probe (value) VALUES (?)").run("preserved");

    await backupSqliteDatabase(source.sqlite, destinationPath);
    source.close();

    const snapshot = new DatabaseSync(destinationPath, { readOnly: true });
    expect(snapshot.prepare("SELECT value FROM backup_probe").get()).toEqual({
      value: "preserved",
    });
    expect(snapshot.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
    snapshot.close();
  });
});
