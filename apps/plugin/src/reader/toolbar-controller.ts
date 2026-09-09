export class ToolbarController {
  private previous = 0;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private readonly onScroll = () => {
    const current = this.container.scrollTop;
    const delta = current - this.previous;
    if (current <= 0 || delta < -12) this.toolbar.classList.remove("is-hidden");
    else if (delta > 24) this.toolbar.classList.add("is-hidden");
    this.previous = current;
    const maximum = Math.max(1, this.container.scrollHeight - this.container.clientHeight);
    this.progress.style.transform = `scaleX(${Math.min(1, current / maximum)})`;
    this.progress.classList.add("is-visible");
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => this.progress.classList.remove("is-visible"), 1_200);
  };

  constructor(
    private readonly container: HTMLElement,
    private readonly toolbar: HTMLElement,
    private readonly progress: HTMLElement,
  ) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches)
      toolbar.classList.add("reduce-motion");
    container.addEventListener("scroll", this.onScroll, { passive: true });
  }

  dispose(): void {
    this.container.removeEventListener("scroll", this.onScroll);
    if (this.idle) clearTimeout(this.idle);
  }
}
