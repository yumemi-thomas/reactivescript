type Attrs = Record<string, string | boolean | undefined>;
export type Child = Node | string | null | undefined | false;

/** Creates an element. Attribute values are set as attributes; `true` sets a bare attribute, `false`/`undefined` omit it. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? "" : value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

/** A button of type "button" that runs `onClick`. */
export function button(label: string, attrs: Attrs, onClick: () => void): HTMLButtonElement {
  const node = el("button", { type: "button", ...attrs }, label);
  node.addEventListener("click", onClick);
  return node;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message !== "") return err.message;
  if (err instanceof Error) return "request failed";
  return String(err);
}

/** Runs a request so that a synchronous throw becomes a rejection like any other failure. */
export function attempt<T>(call: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve) => resolve(call()));
}
