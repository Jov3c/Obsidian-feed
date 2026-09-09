import { describe, expect, it } from "vitest";

import type {
  RawArticleContent,
  WeChatAdapter,
  WechatSourceCandidate,
  WechatUpstreamArticle,
  WechatUpstreamSource,
} from "../../src/providers/wechat/wechat-adapter.js";
import { ProviderRegistry } from "../../src/providers/registry.js";
import {
  registerConfiguredWeChatProvider,
  WeChatProvider,
} from "../../src/providers/wechat/wechat-provider.js";

class FakeAdapter implements WeChatAdapter {
  readonly key = "werss";
  resolveCalls = 0;
  listCalls: Array<{ limit: number; offset: number }> = [];

  async health() {
    return "ok" as const;
  }
  async resolveByArticleUrl(): Promise<WechatSourceCandidate> {
    this.resolveCalls += 1;
    return { name: "Example MP", avatarUrl: null, encodedId: "encoded", intro: null };
  }
  async ensureSubscribed(): Promise<WechatUpstreamSource> {
    return { id: "MP_WXS_example", externalId: "encoded", name: "Example MP", avatarUrl: null };
  }
  async listArticles(_source: WechatUpstreamSource, options: { limit: number; offset: number }) {
    this.listCalls.push(options);
    const articles: WechatUpstreamArticle[] = Array.from({ length: options.limit }, (_, index) => ({
      id: `article-${options.offset + index}`,
      canonicalUrl: `https://mp.weixin.qq.com/s/${options.offset + index}`,
      title: `Article ${options.offset + index}`,
      author: null,
      coverUrl: null,
      publishedAt: null,
      rawContent: index === 0 ? "<p>full</p>" : null,
    }));
    return { articles, total: 100, offset: options.offset, limit: options.limit };
  }
  async fetchContent(article: WechatUpstreamArticle): Promise<RawArticleContent> {
    return { html: article.rawContent, canonicalUrl: article.canonicalUrl };
  }
}

describe("WeChatProvider", () => {
  it("registers only when the complete WeRSS configuration is present", () => {
    const disabled = new ProviderRegistry();
    const enabled = new ProviderRegistry();

    expect(registerConfiguredWeChatProvider(disabled, undefined)).toBe(false);
    expect(
      registerConfiguredWeChatProvider(enabled, {
        adapter: "werss",
        baseUrl: "http://werss:8001",
        apiKey: "secret",
        requestTimeoutMs: 15_000,
        initialBackfillLimit: 30,
        pageSize: 20,
        maxPages: 3,
      }),
    ).toBe(true);
    expect(() => disabled.getByKey("wechat-werss")).toThrow();
    expect(enabled.getByKey("wechat-werss")).toBeInstanceOf(WeChatProvider);
  });

  it("rejects non-WeChat input without calling the adapter", async () => {
    const adapter = new FakeAdapter();
    const provider = new WeChatProvider(adapter, {
      initialBackfillLimit: 30,
      pageSize: 20,
      maxPages: 3,
    });

    expect(await provider.canHandle({ rawInput: "https://example.com/article" })).toBe(false);
    await expect(
      provider.resolveSource({ rawInput: "https://example.com/article" }),
    ).rejects.toMatchObject({ code: "INVALID_URL" });
    expect(adapter.resolveCalls).toBe(0);
  });

  it("maps a candidate and stores only adapter-neutral provider metadata", async () => {
    const adapter = new FakeAdapter();
    const provider = new WeChatProvider(adapter, {
      initialBackfillLimit: 30,
      pageSize: 20,
      maxPages: 3,
    });

    const source = await provider.resolveSource({ rawInput: "https://mp.weixin.qq.com/s/example" });
    await provider.ensureSubscribed(source);

    expect(provider.key).toBe("wechat-werss");
    expect(source).toMatchObject({
      type: "wechat",
      externalId: "encoded",
      name: "Example MP",
      providerMeta: { upstreamSourceId: "MP_WXS_example" },
    });
  });

  it("caps initial backfill and preserves embedded full content", async () => {
    const adapter = new FakeAdapter();
    const provider = new WeChatProvider(adapter, {
      initialBackfillLimit: 30,
      pageSize: 20,
      maxPages: 3,
    });

    const page = await provider.syncSource({
      id: "src_wechat",
      type: "wechat",
      name: "Example MP",
      canonicalUrl: null,
      avatarUrl: null,
      externalId: "encoded",
      providerKey: provider.key,
      providerMeta: { upstreamSourceId: "MP_WXS_example" },
      status: "active",
      lastSyncedAt: null,
      nextSyncAt: null,
    });

    expect(page.articles).toHaveLength(30);
    expect(page.articles[0]).toMatchObject({
      externalId: "article-0",
      rawContent: "<p>full</p>",
      rawContentType: "html",
    });
    expect(adapter.listCalls).toEqual([
      { limit: 20, offset: 0 },
      { limit: 10, offset: 20 },
    ]);
  });
});
