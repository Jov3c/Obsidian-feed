import type { PluginSettings } from "../state/plugin-data.js";

export function applyReaderPreferences(
  root: HTMLElement,
  settings: Pick<PluginSettings, "readerFontSize" | "readerLineHeight" | "readerWidth">,
): void {
  root.dataset.ofFontSize = settings.readerFontSize;
  root.dataset.ofLineHeight = settings.readerLineHeight;
  root.dataset.ofReaderWidth = settings.readerWidth;
}
