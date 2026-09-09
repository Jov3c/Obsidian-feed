import { eq } from "drizzle-orm";

import { newId, type Database } from "../client.js";
import { subscriptions } from "../schema.js";

export type SubscriptionRow = typeof subscriptions.$inferSelect;

export class SubscriptionRepository {
  constructor(
    private readonly database: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async enableForSource(sourceId: string): Promise<SubscriptionRow> {
    const timestamp = this.now().toISOString();
    return this.database.orm
      .insert(subscriptions)
      .values({
        id: newId("sub"),
        sourceId,
        enabled: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: subscriptions.sourceId,
        set: { enabled: true, updatedAt: timestamp },
      })
      .returning()
      .get();
  }

  async disable(id: string): Promise<SubscriptionRow | undefined> {
    return this.database.orm
      .update(subscriptions)
      .set({ enabled: false, updatedAt: this.now().toISOString() })
      .where(eq(subscriptions.id, id))
      .returning()
      .get();
  }

  async listEnabled(): Promise<SubscriptionRow[]> {
    return this.database.orm
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.enabled, true))
      .all();
  }
}
