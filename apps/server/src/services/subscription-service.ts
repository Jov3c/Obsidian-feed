import type { ApiSubscription, ResolvedCandidate } from "@obsidian-feed/contracts";

import type { Database } from "../db/client.js";
import { SourceRepository, type SourceRow } from "../db/repositories/source-repository.js";
import { SubscriptionRepository } from "../db/repositories/subscription-repository.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { ResolvedSource } from "../providers/types.js";
import type { ResolutionTokenService } from "../security/resolution-token.js";

export class SubscriptionNotFoundError extends Error {
  constructor() {
    super("Subscription not found");
    this.name = "SubscriptionNotFoundError";
  }
}

function sourceResponse(source: SourceRow): ApiSubscription["source"] {
  return {
    id: source.id,
    type: source.sourceType,
    name: source.name,
    avatarUrl: source.avatarUrl,
    canonicalUrl: source.canonicalUrl,
    externalId: source.externalId,
    providerKey: source.providerKey,
    status: source.status,
    lastSyncedAt: source.lastSyncedAt,
    nextSyncAt: source.nextSyncAt,
  };
}

export class SubscriptionService {
  private readonly sources: SourceRepository;
  private readonly subscriptions: SubscriptionRepository;

  constructor(
    private readonly dependencies: {
      database: Database;
      providers: ProviderRegistry;
      tokens: ResolutionTokenService;
    },
  ) {
    this.sources = new SourceRepository(dependencies.database);
    this.subscriptions = new SubscriptionRepository(dependencies.database);
  }

  async resolveSubscription(rawInput: string): Promise<ResolvedCandidate> {
    const provider = await this.dependencies.providers.resolveForInput({ rawInput });
    const candidate = await provider.resolveSource({ rawInput });
    return {
      kind: candidate.type,
      providerKey: candidate.providerKey,
      name: candidate.name,
      canonicalUrl: candidate.canonicalUrl,
      avatarUrl: candidate.avatarUrl,
      externalId: candidate.externalId,
      resolutionToken: this.dependencies.tokens.issue(candidate),
    };
  }

  async createSubscription(resolutionToken: string): Promise<ApiSubscription> {
    const { provider, candidate } = this.dependencies.tokens.verify(resolutionToken);
    const contentProvider = this.dependencies.providers.getByKey(provider);
    await contentProvider.ensureSubscribed(candidate as ResolvedSource);

    let source =
      candidate.externalId === null
        ? undefined
        : await this.sources.findByProviderExternal(candidate.providerKey, candidate.externalId);
    if (!source) {
      try {
        source = await this.sources.create({
          type: candidate.type,
          name: candidate.name,
          canonicalUrl: candidate.canonicalUrl,
          avatarUrl: candidate.avatarUrl,
          externalId: candidate.externalId,
          providerKey: candidate.providerKey,
          providerMeta: candidate.providerMeta,
        });
      } catch (error) {
        source =
          candidate.externalId === null
            ? undefined
            : await this.sources.findByProviderExternal(
                candidate.providerKey,
                candidate.externalId,
              );
        if (!source) throw error;
      }
    }
    const subscription = await this.subscriptions.enableForSource(source.id);
    return { id: subscription.id, enabled: subscription.enabled, source: sourceResponse(source) };
  }

  async listSubscriptions(includeDisabled: boolean): Promise<ApiSubscription[]> {
    const rows = await this.subscriptions.list(includeDisabled);
    return Promise.all(
      rows.map(async (subscription) => {
        const source = await this.sources.findById(subscription.sourceId);
        if (!source) throw new Error(`Source missing for subscription ${subscription.id}`);
        return {
          id: subscription.id,
          enabled: subscription.enabled,
          source: sourceResponse(source),
        };
      }),
    );
  }

  async disableSubscription(id: string): Promise<void> {
    if (!(await this.subscriptions.disable(id))) throw new SubscriptionNotFoundError();
  }
}
