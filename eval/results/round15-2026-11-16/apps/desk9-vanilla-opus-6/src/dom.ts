export type Child = Node | string | null | undefined | false;

export interface Props {
  testid?: string;
  class?: string;
  type?: string;
  attrs?: Record<string, string>;
  onclick?: (ev: MouseEvent) => void;
  oninput?: (ev: Event) => void;
  onkeydown?: (ev: KeyboardEvent) => void;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.testid) el.dataset.testid = props.testid;
  if (props.class) el.className = props.class;
  if (props.type) el.setAttribute("type", props.type);
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
  if (props.onclick) el.addEventListener("click", props.onclick as EventListener);
  if (props.oninput) el.addEventListener("input", props.oninput);
  if (props.onkeydown) el.addEventListener("keydown", props.onkeydown as EventListener);
  el.append(...flat(children));
  return el;
}

function flat(children: (Child | Child[])[]): (Node | string)[] {
  const out: (Node | string)[] = [];
  for (const c of children) {
    if (Array.isArray(c)) out.push(...flat(c));
    else if (c !== null && c !== undefined && c !== false) out.push(c);
  }
  return out;
}

export function button(testid: string | undefined, text: string, onclick: () => void, cls?: string): HTMLButtonElement {
  return h("button", { testid, type: "button", class: cls, onclick: () => onclick() }, text);
}

export function input(testid: string, label: string, onEnter?: () => void): HTMLInputElement {
  return h("input", {
    testid,
    type: "text",
    attrs: { "aria-label": label, autocomplete: "off" },
    onkeydown: onEnter
      ? ev => {
          if (ev.key === "Enter" && !ev.isComposing) {
            ev.preventDefault();
            onEnter();
          }
        }
      : undefined,
  });
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/** A container whose children are rebuilt only when the view's key changes. */
export class Slot {
  private key: string | undefined;
  constructor(readonly el: HTMLElement) {}
  render(key: string, build: () => (Child | Child[])[]): void {
    if (key === this.key) return;
    this.key = key;
    this.el.replaceChildren(...flat(build()));
  }
}
