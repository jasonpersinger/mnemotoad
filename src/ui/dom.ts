export function element<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = parent.ownerDocument.createElement(tag); if (text !== undefined) node.textContent = text;
  if (className) node.className = className; parent.append(node); return node;
}
export function button(parent: HTMLElement, text: string, action: () => void, className?: string): HTMLButtonElement {
  const node = element(parent, 'button', text, className); node.type = 'button'; node.addEventListener('click', action); return node;
}
