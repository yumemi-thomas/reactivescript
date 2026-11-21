export type Child = Node | string | null | undefined | false;

export interface Props {
  testid?: string;
  text?: string;
  cls?: string;
  onClick?: () => void;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.testid) el.setAttribute("data-testid", props.testid);
  if (props.cls) el.className = props.cls;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.onClick) {
    const fn = props.onClick;
    el.addEventListener("click", () => fn());
  }
  if (el instanceof HTMLButtonElement) el.type = "button";
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

export function textInput(testid: string, value = ""): HTMLInputElement {
  const el = h("input", { testid });
  el.type = "text";
  el.value = value;
  return el;
}

/** Replace all children of `el`. */
export function fill(el: HTMLElement, ...children: Child[]): void {
  const nodes: Node[] = [];
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    nodes.push(typeof c === "string" ? document.createTextNode(c) : c);
  }
  el.replaceChildren(...nodes);
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

/** Runs `fn` when Enter is pressed in `input`. */
export function onEnter(input: HTMLInputElement, fn: () => void): void {
  input.addEventListener("keydown", ev => {
    if (ev.key === "Enter" && !ev.isComposing) {
      ev.preventDefault();
      fn();
    }
  });
}
