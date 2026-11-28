export type Child = Node | string | null | undefined | false;

/** Creates an element with attributes and children. Text is always set as text, never as HTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false) node.append(child);
  }
  return node;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs `action` when Enter is pressed in `input`. */
export function onEnter(input: HTMLInputElement, action: () => void): void {
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") action();
  });
}
