import { z } from "zod";

const optionalUrl = z.string().url().optional();

const environmentSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65_535).default(43_110),
    HOST: z.string().min(1).default("0.0.0.0"),
    FEED_SERVER_TOKEN: z.string().min(32),
    DATABASE_PATH: z.string().min(1).default("data/feed.sqlite"),
    DATA_DIR: z.string().min(1).default("data"),
    WECHAT_ADAPTER: z.enum(["werss"]).optional(),
    WERSS_BASE_URL: optionalUrl,
    WERSS_API_KEY: z.string().min(1).optional(),
    WERSS_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    WECHAT_INITIAL_BACKFILL_LIMIT: z.coerce.number().int().positive().default(30),
    WECHAT_SYNC_PAGE_SIZE: z.coerce.number().int().positive().default(20),
    WECHAT_SYNC_MAX_PAGES: z.coerce.number().int().positive().default(3),
    WECHAT_PLAYWRIGHT_ENABLED: z.enum(["true", "false"]).default("false"),
    SYNC_TICK_SECONDS: z.coerce.number().int().positive().default(60),
    SYNC_MAX_CONCURRENCY: z.coerce.number().int().positive().default(4),
    RSS_SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(30),
    WECHAT_SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
    EXTERNAL_FETCH_MAX_BYTES: z.coerce.number().int().positive().default(5_242_880),
    EXTERNAL_FETCH_MAX_REDIRECTS: z.coerce.number().int().min(0).default(5),
    MEDIA_MAX_BYTES: z.coerce.number().int().positive().default(20_971_520),
    MEDIA_CACHE_MAX_BYTES: z.coerce.number().int().positive().default(2_147_483_648),
    MEDIA_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  })
  .superRefine((value, context) => {
    const fields = [value.WECHAT_ADAPTER, value.WERSS_BASE_URL, value.WERSS_API_KEY];
    const configuredFields = fields.filter((field) => field !== undefined).length;
    if (configuredFields > 0 && configuredFields < fields.length) {
      context.addIssue({
        code: "custom",
        message: "WECHAT_ADAPTER, WERSS_BASE_URL and WERSS_API_KEY must be configured together",
        path: ["WECHAT_ADAPTER"],
      });
    }
  });

export interface AppConfig {
  port: number;
  host: string;
  feedServerToken: string;
  databasePath: string;
  dataDir: string;
  wechat: {
    adapter: "werss" | null;
    baseUrl: string | null;
    apiKey: string | null;
    requestTimeoutMs: number;
    initialBackfillLimit: number;
    pageSize: number;
    maxPages: number;
    playwrightEnabled: boolean;
  };
  sync: {
    tickSeconds: number;
    maxConcurrency: number;
    rssIntervalMinutes: number;
    wechatIntervalMinutes: number;
  };
  externalFetch: { maxBytes: number; maxRedirects: number };
  media: { maxBytes: number; cacheMaxBytes: number; fetchTimeoutMs: number };
}

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const value = environmentSchema.parse(environment);
  const wechatConfigured =
    value.WECHAT_ADAPTER === "werss" &&
    value.WERSS_BASE_URL !== undefined &&
    value.WERSS_API_KEY !== undefined;

  return {
    port: value.PORT,
    host: value.HOST,
    feedServerToken: value.FEED_SERVER_TOKEN,
    databasePath: value.DATABASE_PATH,
    dataDir: value.DATA_DIR,
    wechat: {
      adapter: wechatConfigured ? "werss" : null,
      baseUrl: wechatConfigured ? (value.WERSS_BASE_URL ?? null) : null,
      apiKey: wechatConfigured ? (value.WERSS_API_KEY ?? null) : null,
      requestTimeoutMs: value.WERSS_REQUEST_TIMEOUT_MS,
      initialBackfillLimit: value.WECHAT_INITIAL_BACKFILL_LIMIT,
      pageSize: value.WECHAT_SYNC_PAGE_SIZE,
      maxPages: value.WECHAT_SYNC_MAX_PAGES,
      playwrightEnabled: value.WECHAT_PLAYWRIGHT_ENABLED === "true",
    },
    sync: {
      tickSeconds: value.SYNC_TICK_SECONDS,
      maxConcurrency: value.SYNC_MAX_CONCURRENCY,
      rssIntervalMinutes: value.RSS_SYNC_INTERVAL_MINUTES,
      wechatIntervalMinutes: value.WECHAT_SYNC_INTERVAL_MINUTES,
    },
    externalFetch: {
      maxBytes: value.EXTERNAL_FETCH_MAX_BYTES,
      maxRedirects: value.EXTERNAL_FETCH_MAX_REDIRECTS,
    },
    media: {
      maxBytes: value.MEDIA_MAX_BYTES,
      cacheMaxBytes: value.MEDIA_CACHE_MAX_BYTES,
      fetchTimeoutMs: value.MEDIA_FETCH_TIMEOUT_MS,
    },
  };
}

export function secretsForRedaction(config: AppConfig): string[] {
  return [config.feedServerToken, config.wechat.apiKey].filter(
    (secret): secret is string => secret !== null,
  );
}
