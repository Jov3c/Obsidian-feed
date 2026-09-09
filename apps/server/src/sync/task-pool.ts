export class SyncTaskPool {
  private active = 0;
  private activeWechat = 0;
  private readonly queue: Array<{ type: "rss" | "wechat"; run: () => Promise<void> }> = [];

  constructor(
    private readonly globalLimit: number,
    private readonly wechatLimit = 1,
  ) {}

  submit<T>(type: "rss" | "wechat", task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        type,
        run: async () => {
          try {
            resolve(await task());
          } catch (error) {
            reject(error);
          }
        },
      });
      this.pump();
    });
  }

  private pump(): void {
    while (this.active < this.globalLimit) {
      const index = this.queue.findIndex(
        (item) => item.type !== "wechat" || this.activeWechat < this.wechatLimit,
      );
      if (index < 0) return;
      const [item] = this.queue.splice(index, 1);
      if (!item) return;
      this.active += 1;
      if (item.type === "wechat") this.activeWechat += 1;
      void item.run().finally(() => {
        this.active -= 1;
        if (item.type === "wechat") this.activeWechat -= 1;
        this.pump();
      });
    }
  }
}
