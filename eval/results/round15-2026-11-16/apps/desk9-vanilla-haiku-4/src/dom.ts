// Small DOM helpers: no framework, every element is built with createElement.

export type Child = Node | string | null | undefined | false;

export interface Opts {
  text?: string;
  testid?: string;
  cls?: string;
  type?: string;
  placeholder?: string;
  value?: string;
  hidden?: boolean;
  attrs?: Record<string, string>;
  onclick?: () => void;
  oninput?: () => void;
  onenter?: () => void;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: Opts = {},
  ...kids: Child[]
): HTMLElementTagNameMap[K] {
  const n: HTMLElement = document.createElement(tag);
  if (opts.text !== undefined) n.textContent = opts.text;
  if (opts.testid !== undefined) n.setAttribute("data-testid", opts.testid);
  if (opts.cls !== undefined) n.className = opts.cls;
  if (opts.hidden) n.hidden = true;
  if (n instanceof HTMLInputElement) {
    if (opts.type !== undefined) n.type = opts.type;
    if (opts.placeholder !== undefined) n.placeholder = opts.placeholder;
    if (opts.value !== undefined) n.value = opts.value;
  }
  for (const [k, v] of Object.entries(opts.attrs ?? {})) n.setAttribute(k, v);
  if (opts.onclick) {
    const fn = opts.onclick;
    n.addEventListener("click", () => fn());
  }
  if (opts.oninput) {
    const fn = opts.oninput;
    n.addEventListener("input", () => fn());
    n.addEventListener("change", () => fn());
  }
  if (opts.onenter) {
    const fn = opts.onenter;
    n.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fn();
      }
    });
  }
  for (const k of kids) {
    if (k !== null && k !== undefined && k !== false) n.append(k);
  }
  return n as HTMLElementTagNameMap[K];
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
