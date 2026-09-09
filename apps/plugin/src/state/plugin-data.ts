export interface ReadingState {
  read: boolean;
  progress: number;
  anchorBlockId?: string;
  anchorOffset?: number;
}

export interface PluginSettings {
  serverBaseUrl: string;
  serverToken: string;
  saveRoot: string;
  imageSaveMode: "local" | "remote";
  readerFontSize: "small" | "standard" | "large";
  readerLineHeight: "compact" | "comfortable" | "loose";
  readerWidth: "narrow" | "standard" | "wide";
}

export interface PluginDataV1 {
  version: 1;
  settings: PluginSettings;
  reading: Record<string, ReadingState>;
  ui: { lastRoute?: "today" | "subscriptions" };
}

export function defaultPluginData(): PluginDataV1 {
  return {
    version: 1,
    settings: {
      serverBaseUrl: "http://127.0.0.1:43110",
      serverToken: "",
      saveRoot: "Feed",
      imageSaveMode: "local",
      readerFontSize: "standard",
      readerLineHeight: "comfortable",
      readerWidth: "standard",
    },
    reading: {},
    ui: {},
  };
}

function readingEntries(value: unknown): Record<string, ReadingState> {
  if (typeof value !== "object" || value === null) return {};
  const result: Record<string, ReadingState> = {};
  for (const [id, candidate] of Object.entries(value)) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const item = candidate as Record<string, unknown>;
    if (typeof item.read !== "boolean" || typeof item.progress !== "number") continue;
    result[id] = {
      read: item.read,
      progress: Math.min(1, Math.max(0, item.progress)),
      ...(typeof item.anchorBlockId === "string" ? { anchorBlockId: item.anchorBlockId } : {}),
      ...(typeof item.anchorOffset === "number" ? { anchorOffset: item.anchorOffset } : {}),
    };
  }
  return result;
}

export function migratePluginData(value: unknown): PluginDataV1 {
  const defaults = defaultPluginData();
  if (typeof value !== "object" || value === null) return defaults;
  const input = value as Record<string, unknown>;
  const settings =
    typeof input.settings === "object" && input.settings !== null
      ? { ...defaults.settings, ...(input.settings as Partial<PluginSettings>) }
      : defaults.settings;
  return {
    version: 1,
    settings,
    reading: readingEntries(input.reading),
    ui: typeof input.ui === "object" && input.ui !== null ? (input.ui as PluginDataV1["ui"]) : {},
  };
}
