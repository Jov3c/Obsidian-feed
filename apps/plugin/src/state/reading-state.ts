import type { PluginDataV1, ReadingState } from "./plugin-data.js";

export function shouldMarkRead(progress: number, elapsedMs: number): boolean {
  return progress >= 0.85 || (progress >= 0.7 && elapsedMs >= 30_000);
}

export class ReadingStateStore {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(
    private readonly data: Pick<PluginDataV1, "reading">,
    private readonly persist: () => Promise<void> | void,
    private readonly debounceMs = 2_000,
  ) {}

  update(articleId: string, patch: Partial<ReadingState>): ReadingState {
    const current = this.data.reading[articleId] ?? { read: false, progress: 0 };
    const next = { ...current, ...patch };
    this.data.reading[articleId] = next;
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.debounceMs);
    return next;
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty) return;
    this.dirty = false;
    await this.persist();
  }
}
