import { and, eq, lte } from "drizzle-orm";

import { newId, type Database } from "../client.js";
import { sources, subscriptions } from "../schema.js";

export type SourceRow = typeof sources.$inferSelect;

export interface CreateSourceInput {
  type: SourceRow["sourceType"];
  name: string;
  canonicalUrl: string | null;
  avatarUrl: string | null;
  externalId: string | null;
  providerKey: string;
  providerMeta: Record<string, unknown>;
}

export type SourceSyncPatch = Partial<
  Pick<SourceRow, "status" | "lastSyncedAt" | "nextSyncAt" | "consecutiveFailures">
>;

export class SourceRepository {
  constructor(
    private readonly database: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async findById(id: string): Promise<SourceRow | undefined> {
    return this.database.orm.select().from(sources).where(eq(sources.id, id)).get();
  }

  async findByProviderExternal(
    providerKey: string,
    externalId: string,
  ): Promise<SourceRow | undefined> {
    return this.database.orm
      .select()
      .from(sources)
      .where(and(eq(sources.providerKey, providerKey), eq(sources.externalId, externalId)))
      .get();
  }

  async create(input: CreateSourceInput): Promise<SourceRow> {
    const timestamp = this.now().toISOString();
    return this.database.orm
      .insert(sources)
      .values({
        id: newId("src"),
        sourceType: input.type,
        name: input.name,
        canonicalUrl: input.canonicalUrl,
        avatarUrl: input.avatarUrl,
        externalId: input.externalId,
        providerKey: input.providerKey,
        providerMetaJson: JSON.stringify(input.providerMeta),
        status: "active",
        lastSyncedAt: null,
        nextSyncAt: null,
        consecutiveFailures: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning()
      .get();
  }

  async updateSyncState(id: string, patch: SourceSyncPatch): Promise<SourceRow | undefined> {
    return this.database.orm
      .update(sources)
      .set({ ...patch, updatedAt: this.now().toISOString() })
      .where(eq(sources.id, id))
      .returning()
      .get();
  }

  async listDue(now: string, limit: number): Promise<SourceRow[]> {
    const rows = this.database.orm
      .select({ source: sources })
      .from(sources)
      .innerJoin(subscriptions, eq(subscriptions.sourceId, sources.id))
      .where(and(eq(subscriptions.enabled, true), lte(sources.nextSyncAt, now)))
      .orderBy(sources.nextSyncAt)
      .limit(limit)
      .all();
    return rows.map(({ source }) => source);
  }
}
