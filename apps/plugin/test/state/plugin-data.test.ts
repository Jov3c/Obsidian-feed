import { describe, expect, it } from "vitest";

import { defaultPluginData, migratePluginData } from "../../src/state/plugin-data.js";

describe("PluginDataV1", () => {
  it("provides mobile-safe V1 defaults", () => {
    expect(defaultPluginData()).toMatchObject({
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
    });
  });

  it("falls back from invalid old data while preserving recognizable reading entries", () => {
    const migrated = migratePluginData({
      settings: null,
      reading: {
        art_ok: { read: true, progress: 0.5, anchorBlockId: "b1", anchorOffset: 20 },
        art_bad: "broken",
      },
      unrelated: true,
    });
    expect(migrated.settings).toEqual(defaultPluginData().settings);
    expect(migrated.reading).toEqual({
      art_ok: { read: true, progress: 0.5, anchorBlockId: "b1", anchorOffset: 20 },
    });
  });
});
