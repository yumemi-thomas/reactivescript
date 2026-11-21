// Small helpers for building the DOM without a framework. Text always goes in through
// textContent-style nodes, never innerHTML, so server data cannot inject markup.

export type Attrs = Record<string, string | boolean>;
export type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false) continue;
    node.setAttribute(name, value === true ? "" : value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

/** Replaces the slot's content with `node`, or empties it when `node` is null. */
export function setSlot(slot: HTMLElement, node: Node | null): void {
  slot.replaceChildren(...(node ? [node] : []));
}

export function alertLine(testId: string, text: string): HTMLParagraphElement {
  return h("p", { role: "alert", class: "alert", "data-testid": testId }, text);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Runs `action` when Enter is pressed (ignoring IME composition). */
export function onEnter(action: () => void): (event: KeyboardEvent) => void {
  return (event) => {
    if (event.key === "Enter" && !event.isComposing) action();
  };
}
