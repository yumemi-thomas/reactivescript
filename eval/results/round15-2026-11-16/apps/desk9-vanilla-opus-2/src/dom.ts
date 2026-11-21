type Attrs = Record<string, string | boolean | undefined>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "testid") el.setAttribute("data-testid", String(v));
    else if (k === "class") el.className = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try { return JSON.stringify(e) ?? String(e); } catch { return String(e); }
}

/** Shows `text` in `el`, hiding it when text is null. */
export function setMsg(el: HTMLElement, text: string | null): void {
  el.textContent = text ?? "";
  el.hidden = text === null;
}

let tickCounter = 0;
/** A monotonic counter shared by every page, to order requests and their answers. */
export function tick(): number { return ++tickCounter; }

export type Page = { el: HTMLElement; dispose(): void };
