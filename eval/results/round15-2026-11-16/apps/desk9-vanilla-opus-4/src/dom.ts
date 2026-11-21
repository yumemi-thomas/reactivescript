// Tiny DOM helpers: no framework, just element construction.

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | boolean | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "testid") el.setAttribute("data-testid", String(v));
    else if (k === "class") el.className = String(v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, children);
  return el;
}

function append(el: Node, children: (Child | Child[])[]): void {
  for (const c of children) {
    if (Array.isArray(c)) append(el, c);
    else if (c === null || c === undefined || c === false) continue;
    else el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
}

/** Replace all children of `el`. */
export function fill(el: Element, ...children: (Child | Child[])[]): void {
  el.replaceChildren();
  append(el, children);
}

export function button(testid: string, text: string, onClick: () => void, attrs: Attrs = {}): HTMLButtonElement {
  const b = h("button", { type: "button", testid, ...attrs }, text);
  b.addEventListener("click", onClick);
  return b;
}

export function input(testid: string, label: string, value = "", attrs: Attrs = {}): HTMLInputElement {
  const i = h("input", { type: "text", testid, "aria-label": label, autocomplete: "off", ...attrs });
  i.value = value;
  return i;
}

export function message(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

/** Submit on Enter, as a convenience for text inputs paired with a button. */
export function onEnter(i: HTMLInputElement, fn: () => void): void {
  i.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); fn(); }
  });
}
