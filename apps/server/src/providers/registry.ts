import { ProviderError, type ContentProvider, type ResolveInput } from "./types.js";

export class ProviderRegistry {
  private readonly providers = new Map<string, ContentProvider>();

  register(provider: ContentProvider): void {
    if (this.providers.has(provider.key))
      throw new Error(`Provider already registered: ${provider.key}`);
    this.providers.set(provider.key, provider);
  }

  async resolveForInput(input: ResolveInput): Promise<ContentProvider> {
    for (const provider of this.providers.values()) {
      if (await provider.canHandle(input)) return provider;
    }
    throw new ProviderError("UNSUPPORTED_SOURCE", "Unsupported content source", false, "registry");
  }

  getByKey(key: string): ContentProvider {
    const provider = this.providers.get(key);
    if (!provider)
      throw new ProviderError("UNSUPPORTED_SOURCE", `Unknown provider: ${key}`, false, key);
    return provider;
  }
}
