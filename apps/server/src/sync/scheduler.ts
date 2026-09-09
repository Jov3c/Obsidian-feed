import { SyncTaskPool } from "./task-pool.js";

interface DueSource {
  id: string;
  sourceType: "rss" | "wechat";
}

export class Scheduler {
  private interval: ReturnType<typeof setInterval> | null = null;
  private startup: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private readonly sources: { listDue(now: string, limit: number): Promise<DueSource[]> },
    private readonly worker: { syncOneSource(id: string): Promise<unknown> },
    private readonly options: {
      tickMs: number;
      startupDelayMs: number;
      batchSize: number;
      maxConcurrency: number;
      wechatConcurrency?: number;
    },
    private readonly now: () => Date = () => new Date(),
  ) {}

  start(): void {
    if (this.interval || this.startup) return;
    this.startup = setTimeout(() => {
      this.startup = null;
      void this.tick();
      this.interval = setInterval(() => void this.tick(), this.options.tickMs);
    }, this.options.startupDelayMs);
  }

  stop(): void {
    if (this.startup) clearTimeout(this.startup);
    if (this.interval) clearInterval(this.interval);
    this.startup = null;
    this.interval = null;
  }

  async tick(): Promise<void> {
    const due = await this.sources.listDue(this.now().toISOString(), this.options.batchSize);
    const pool = new SyncTaskPool(this.options.maxConcurrency, this.options.wechatConcurrency ?? 1);
    await Promise.all(
      due.map((source) =>
        pool.submit(source.sourceType, () => this.worker.syncOneSource(source.id)),
      ),
    );
  }
}
