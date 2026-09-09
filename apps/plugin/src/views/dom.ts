export function element<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function actionButton(
  document: Document,
  label: string,
  action: () => void,
): HTMLButtonElement {
  const button = element(document, "button", "of-action", label);
  button.type = "button";
  button.addEventListener("click", action);
  return button;
}
