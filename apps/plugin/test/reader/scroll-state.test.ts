// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { captureScrollPosition, restoreScrollPosition } from "../../src/reader/scroll-state.js";
import { ReadingStateStore, shouldMarkRead } from "../../src/state/reading-state.js";

describe("reading progress", () => {
  it("marks read at 85%, or at 70% after 30 seconds, but not on click alone", () => {
    expect(shouldMarkRead(0, 60_000)).toBe(false);
    expect(shouldMarkRead(0.85, 0)).toBe(true);
    expect(shouldMarkRead(0.7, 30_000)).toBe(true);
    expect(shouldMarkRead(0.7, 29_999)).toBe(false);
  });

  it("captures and restores a block anchor before falling back to ratio", async () => {
    const container = document.createElement("div");
    const block = document.createElement("p");
    block.dataset.blockId = "b2";
    container.append(block);
    Object.defineProperties(container, {
      scrollTop: { value: 400, writable: true },
      scrollHeight: { value: 1000 },
      clientHeight: { value: 200 },
    });
    container.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
    block.getBoundingClientRect = () => ({ top: 90 }) as DOMRect;
    const scrollTo = vi.fn();
    container.scrollTo = scrollTo;
    const position = captureScrollPosition(container);
    expect(position).toMatchObject({ progress: 0.5, anchorBlockId: "b2", anchorOffset: 10 });
    await restoreScrollPosition(container, position);
    expect(scrollTo).toHaveBeenCalledWith({ top: 400, behavior: "instant" });
  });

  it("debounces persistence while updating memory immediately and flushes on demand", async () => {
    vi.useFakeTimers();
    const data = { reading: {} as Record<string, { read: boolean; progress: number }> };
    const persist = vi.fn();
    const store = new ReadingStateStore(data, persist, 2000);
    store.update("art_1", { progress: 0.2 });
    store.update("art_1", { progress: 0.3 });
    expect(data.reading.art_1?.progress).toBe(0.3);
    expect(persist).not.toHaveBeenCalled();
    await store.flush();
    expect(persist).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
