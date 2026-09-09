import type { ReadingState } from "../state/plugin-data.js";

export interface ReadingPosition {
  progress: number;
  anchorBlockId?: string;
  anchorOffset?: number;
}

export function captureScrollPosition(container: HTMLElement): ReadingPosition {
  const maximum = Math.max(0, container.scrollHeight - container.clientHeight);
  const progress = maximum === 0 ? 0 : Math.min(1, Math.max(0, container.scrollTop / maximum));
  const top = container.getBoundingClientRect().top;
  const blocks = [...container.querySelectorAll<HTMLElement>("[data-block-id]")];
  const anchor =
    blocks.filter((block) => block.getBoundingClientRect().top <= top).at(-1) ?? blocks[0];
  const anchorBlockId = anchor?.dataset.blockId;
  return {
    progress,
    ...(anchor && anchorBlockId
      ? {
          anchorBlockId,
          anchorOffset: top - anchor.getBoundingClientRect().top,
        }
      : {}),
  };
}

export async function restoreScrollPosition(
  container: HTMLElement,
  state: Pick<ReadingState, "progress" | "anchorBlockId" | "anchorOffset">,
): Promise<void> {
  await Promise.resolve();
  if (state.anchorBlockId) {
    const anchor = [...container.querySelectorAll<HTMLElement>("[data-block-id]")].find(
      (block) => block.dataset.blockId === state.anchorBlockId,
    );
    if (anchor) {
      const delta =
        anchor.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        (state.anchorOffset ?? 0);
      container.scrollTo({ top: container.scrollTop + delta, behavior: "instant" });
      return;
    }
  }
  const maximum = Math.max(0, container.scrollHeight - container.clientHeight);
  container.scrollTo({ top: maximum * state.progress, behavior: "instant" });
}
