type Child = Node | string | null | undefined | false;

export interface Props {
  testid?: string;
  class?: string;
  text?: string;
  type?: string;
  disabled?: boolean;
  label?: string;
  key?: string;
  attrs?: Record<string, string>;
  onClick?: () => void;
}

/** Small element builder. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.testid) el.dataset.testid = props.testid;
  if (props.class) el.className = props.class;
  if (props.key) el.dataset.key = props.key;
  if (props.label) el.setAttribute("aria-label", props.label);
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
  if (el instanceof HTMLButtonElement) {
    el.type = (props.type as "button" | "submit" | "reset" | undefined) ?? "button";
    if (props.disabled) el.disabled = true;
  } else if (el instanceof HTMLInputElement) {
    el.type = props.type ?? "text";
    if (props.disabled) el.disabled = true;
  }
  if (props.onClick) {
    const fn = props.onClick;
    el.addEventListener("click", () => fn());
  }
  if (props.text !== undefined) el.textContent = props.text;
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** Call `fn` when Enter is pressed in `input`. */
export function onEnter(input: HTMLInputElement, fn: () => void): void {
  input.addEventListener("keydown", ev => {
    if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); fn(); }
  });
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try { return JSON.stringify(e) ?? String(e); } catch { return String(e); }
}

/**
 * Replace `host`'s children with `nodes`, keeping keyboard focus on the element
 * with the same data-key if focus was inside `host`.
 */
export function replaceKeepingFocus(host: HTMLElement, nodes: Node[]): void {
  const active = document.activeElement;
  const key = active instanceof HTMLElement && host.contains(active) ? active.dataset.key : undefined;
  host.replaceChildren(...nodes);
  if (key) {
    const next = host.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
    if (next && !(next as HTMLButtonElement).disabled) next.focus();
  }
}
