import { eq } from "drizzle-orm";

import { newId, type Database } from "../client.js";
import { syncLogs } from "../schema.js";

export type SyncLogRow = typeof syncLogs.$inferSelect;

export class SyncLogRepository {
  constructor(
    private readonly database: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async start(sourceId: string | null, providerKey: string): Promise<SyncLogRow> {
    const timestamp = this.now().toISOString();
    return this.database.orm
      .insert(syncLogs)
      .values({
        id: newId("sync"),
        sourceId,
        providerKey,
        startedAt: timestamp,
        status: "running",
        createdAt: timestamp,
      })
      .returning()
      .get();
  }

  async finish(
    id: string,
    result: {
      status: "success" | "failed";
      newArticles?: number;
      updatedArticles?: number;
      errorCode?: string | null;
      errorMessage?: string | null;
      durationMs: number;
    },
  ): Promise<SyncLogRow | undefined> {
    return this.database.orm
      .update(syncLogs)
      .set({
        finishedAt: this.now().toISOString(),
        status: result.status,
        newArticles: result.newArticles ?? 0,
        updatedArticles: result.updatedArticles ?? 0,
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
        durationMs: result.durationMs,
      })
      .where(eq(syncLogs.id, id))
      .returning()
      .get();
  }
}
