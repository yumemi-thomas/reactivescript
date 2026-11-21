// Small DOM helpers. Text is always inserted with textContent, never as HTML.

export type Child = Node | string | null | undefined | false;

export interface Opts {
  cls?: string;
  testid?: string;
  attrs?: Record<string, string>;
  disabled?: boolean;
  hidden?: boolean;
  on?: Record<string, (event: Event) => void>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: Opts = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.cls) node.className = opts.cls;
  if (opts.testid !== undefined) node.dataset.testid = opts.testid;
  if (opts.attrs) {
    for (const [name, value] of Object.entries(opts.attrs)) node.setAttribute(name, value);
  }
  if (opts.disabled) node.setAttribute("disabled", "");
  if (opts.hidden) node.hidden = true;
  if (opts.on) {
    for (const [name, listener] of Object.entries(opts.on)) node.addEventListener(name, listener);
  }
  const nodes: Node[] = [];
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    nodes.push(typeof child === "string" ? document.createTextNode(child) : child);
  }
  node.append(...nodes);
  return node;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
