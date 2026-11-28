// Shared DOM helpers and the app-level contract the pages use.

export type Child = Node | string | null | undefined | false;

export type Destroy = () => void;

export interface HelpInit {
  query: string;
  hitId: number;
}

export interface App {
  /** The number of open issues, as the issues page last showed it. */
  setOpenCount(n: number): void;
  /** Leave for the help page, which searches for `query` and selects hit `hitId`. */
  openHelp(init: HelpInit): void;
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Calls an API function; a synchronous throw becomes a rejection. */
export function call<T>(f: () => Promise<T>): Promise<T> {
  try {
    return f();
  } catch (e) {
    return Promise.reject(e);
  }
}

export function toNodes(kids: Child[]): Node[] {
  const out: Node[] = [];
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    out.push(typeof k === "string" ? document.createTextNode(k) : k);
  }
  return out;
}

/** Replaces the contents of `region` with `kids`. */
export function fill(region: Element, ...kids: Child[]): void {
  region.replaceChildren(...toNodes(kids));
}

export interface Opts {
  testid?: string;
  cls?: string;
  attrs?: Record<string, string>;
  value?: string;
  onClick?: () => void;
  onInput?: (value: string) => void;
  onEnter?: () => void;
}

/** Creates an element with `opts` and appends `kids`. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: Opts = {},
  ...kids: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.testid !== undefined) node.setAttribute("data-testid", opts.testid);
  if (opts.cls !== undefined) node.className = opts.cls;
  for (const [k, v] of Object.entries(opts.attrs ?? {})) node.setAttribute(k, v);
  if (opts.onClick) {
    const f = opts.onClick;
    node.addEventListener("click", () => f());
  }
  if (node instanceof HTMLInputElement) {
    const input = node;
    if (opts.value !== undefined) input.value = opts.value;
    if (opts.onInput) {
      const f = opts.onInput;
      input.addEventListener("input", () => f(input.value));
    }
    if (opts.onEnter) {
      const f = opts.onEnter;
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") f();
      });
    }
  }
  node.append(...toNodes(kids));
  return node;
}
