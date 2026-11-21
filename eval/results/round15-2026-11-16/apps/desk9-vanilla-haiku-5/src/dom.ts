// Small DOM helpers. Everything is built with createElement and textContent; no HTML strings are parsed.

export type Child = Node | string;

export interface Opts {
  test?: string;
  text?: string;
  attrs?: Record<string, string>;
  pressed?: boolean;
  current?: boolean;
  hidden?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function node<T extends HTMLElement>(el: T, opts: Opts = {}, children: Child[] = []): T {
  if (opts.test !== undefined) el.setAttribute("data-testid", opts.test);
  if (opts.text !== undefined) el.textContent = opts.text;
  for (const [name, value] of Object.entries(opts.attrs ?? {})) el.setAttribute(name, value);
  if (opts.pressed !== undefined) el.setAttribute("aria-pressed", String(opts.pressed));
  if (opts.current) el.setAttribute("aria-current", "true");
  if (opts.hidden !== undefined) el.hidden = opts.hidden;
  if (opts.disabled !== undefined) el.toggleAttribute("disabled", opts.disabled);
  const handler = opts.onClick;
  if (handler !== undefined) el.addEventListener("click", () => handler());
  el.append(...children);
  return el;
}

export const div = (opts: Opts = {}, children: Child[] = []): HTMLDivElement =>
  node(document.createElement("div"), opts, children);

export const p = (opts: Opts = {}, children: Child[] = []): HTMLParagraphElement =>
  node(document.createElement("p"), opts, children);

export const span = (opts: Opts = {}, children: Child[] = []): HTMLSpanElement =>
  node(document.createElement("span"), opts, children);

export const h2 = (opts: Opts = {}, children: Child[] = []): HTMLHeadingElement =>
  node(document.createElement("h2"), opts, children);

export const ul = (opts: Opts = {}, children: Child[] = []): HTMLUListElement =>
  node(document.createElement("ul"), opts, children);

export const li = (opts: Opts = {}, children: Child[] = []): HTMLLIElement =>
  node(document.createElement("li"), opts, children);

export const section = (opts: Opts = {}, children: Child[] = []): HTMLElement =>
  node(document.createElement("section"), opts, children);

export function button(label: string, onClick: () => void, opts: Opts = {}): HTMLButtonElement {
  return node(document.createElement("button"), {
    ...opts,
    text: label,
    onClick,
    attrs: { type: "button", ...opts.attrs },
  });
}

/** A single-line text input. `onInput` runs on every edit; omit it to read the value on demand. */
export function field(
  test: string,
  value: string,
  onInput?: (value: string) => void,
  attrs: Record<string, string> = {},
): HTMLInputElement {
  const el = document.createElement("input");
  el.type = "text";
  el.value = value;
  const handler = onInput;
  if (handler !== undefined) el.addEventListener("input", () => handler(el.value));
  return node(el, { test, attrs });
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
