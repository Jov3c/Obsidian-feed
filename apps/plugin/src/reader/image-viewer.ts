export class ImageViewer {
  private overlay: HTMLDivElement | null = null;
  private returnFocus: HTMLElement | null = null;
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.close();
  };

  open(source: string, document: Document): void {
    this.close();
    this.returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overlay = document.createElement("div");
    overlay.className = "of-image-viewer";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "图片预览");
    overlay.tabIndex = -1;
    const image = document.createElement("img");
    image.src = source;
    image.alt = "";
    overlay.append(image);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) this.close();
    });
    document.addEventListener("keydown", this.onKeyDown);
    document.body.append(overlay);
    this.overlay = overlay;
    overlay.focus();
  }

  close(): void {
    if (!this.overlay) return;
    this.overlay.ownerDocument.removeEventListener("keydown", this.onKeyDown);
    this.overlay.remove();
    this.overlay = null;
    if (this.returnFocus?.isConnected) this.returnFocus.focus();
    this.returnFocus = null;
  }
}
