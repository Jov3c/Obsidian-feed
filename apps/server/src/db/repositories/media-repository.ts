import { eq } from "drizzle-orm";

import { newId, type Database } from "../client.js";
import { mediaCache } from "../schema.js";

export type MediaRow = typeof mediaCache.$inferSelect;

export class MediaRepository {
  constructor(
    private readonly database: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async findById(id: string): Promise<MediaRow | undefined> {
    return this.database.orm.select().from(mediaCache).where(eq(mediaCache.id, id)).get();
  }

  async findByOriginalUrl(originalUrl: string): Promise<MediaRow | undefined> {
    return this.database.orm
      .select()
      .from(mediaCache)
      .where(eq(mediaCache.originalUrl, originalUrl))
      .get();
  }

  async createPending(originalUrl: string): Promise<MediaRow> {
    const existing = await this.findByOriginalUrl(originalUrl);
    if (existing) return existing;
    const timestamp = this.now().toISOString();
    return this.database.orm
      .insert(mediaCache)
      .values({
        id: newId("med"),
        originalUrl,
        status: "pending",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning()
      .get();
  }

  async update(
    id: string,
    patch: Partial<Omit<MediaRow, "id" | "originalUrl" | "createdAt">>,
  ): Promise<MediaRow | undefined> {
    return this.database.orm
      .update(mediaCache)
      .set({ ...patch, updatedAt: this.now().toISOString() })
      .where(eq(mediaCache.id, id))
      .returning()
      .get();
  }
}
