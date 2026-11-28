type Child = Node | string | null | undefined | false;

export interface Props {
  testid?: string;
  text?: string;
  cls?: string;
  onClick?: (ev: Event) => void;
  attrs?: Record<string, string>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.testid) el.dataset.testid = props.testid;
  if (props.cls) el.className = props.cls;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
  if (props.text !== undefined) el.textContent = props.text;
  if (props.onClick) el.addEventListener("click", props.onClick);
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function button(testid: string, text: string, onClick: () => void, cls?: string): HTMLButtonElement {
  return h("button", { testid, text, cls, attrs: { type: "button" }, onClick: () => onClick() });
}

export function input(testid: string, value = "", label?: string): HTMLInputElement {
  const el = h("input", { testid, attrs: { type: "text", autocomplete: "off" } });
  el.value = value;
  if (label) el.setAttribute("aria-label", label);
  return el;
}

/** Sets text only when it changed, to avoid needless DOM churn. */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return String(e);
  } catch {
    return "unknown error";
  }
}

export interface Page {
  el: HTMLElement;
  dispose(): void;
}
