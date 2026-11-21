// Small DOM helpers shared by the pages.

type Attrs = Record<string, string | boolean | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (name === "testid") el.setAttribute("data-testid", String(value));
    else if (value === true) el.setAttribute(name, "");
    else el.setAttribute(name, value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}

/** Replace a container's children, keeping keyboard focus on the element with the same data-key if one is rebuilt. */
export function replaceChildrenKeepingFocus(container: HTMLElement, children: Node[]): void {
  const active = document.activeElement;
  const key = active instanceof HTMLElement && container.contains(active) ? active.dataset.key : undefined;
  container.replaceChildren(...children);
  if (key !== undefined) {
    const next = container.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
    if (next && !(next as HTMLButtonElement).disabled) next.focus();
  }
}

let nextId = 0;
export function uid(): number {
  return ++nextId;
}
