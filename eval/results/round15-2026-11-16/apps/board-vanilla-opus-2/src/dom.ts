// Small DOM helpers. Text always goes in through textContent, never innerHTML.

type Props = {
  testid?: string;
  text?: string;
  cls?: string;
  attrs?: Record<string, string>;
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Node | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.testid) node.dataset.testid = props.testid;
  if (props.cls) node.className = props.cls;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, v);
  for (const child of children) if (child) node.appendChild(child);
  return node;
}

export function button(testid: string, text: string, onClick: () => void, opts: { disabled?: boolean; title?: string; fkey?: string } = {}): HTMLButtonElement {
  const b = el("button", { testid, text, attrs: { type: "button" } });
  if (opts.title) b.title = opts.title;
  if (opts.disabled) b.disabled = true;
  if (opts.fkey) b.dataset.fkey = opts.fkey;
  b.addEventListener("click", onClick);
  return b;
}

/** Replace a node's children, keeping keyboard focus on an element with the same data-fkey if there was one. */
export function replaceChildren(parent: HTMLElement, children: Node[]): void {
  const active = document.activeElement;
  const fkey = active instanceof HTMLElement && parent.contains(active) ? active.dataset.fkey : undefined;
  parent.replaceChildren(...children);
  if (fkey) {
    const next = parent.querySelector<HTMLElement>(`[data-fkey="${CSS.escape(fkey)}"]`);
    if (next && !(next as HTMLButtonElement).disabled) next.focus();
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "unknown error";
}

/** A labelled single-line form: input + submit button. Enter submits too. */
export function inlineForm(
  inputTestid: string,
  buttonTestid: string,
  buttonText: string,
  placeholder: string,
  onSubmit: (input: HTMLInputElement) => void,
): { form: HTMLFormElement; input: HTMLInputElement; submit: HTMLButtonElement } {
  const input = el("input", { testid: inputTestid, attrs: { type: "text", placeholder, "aria-label": placeholder, autocomplete: "off" } });
  const submit = el("button", { testid: buttonTestid, text: buttonText, attrs: { type: "submit" } });
  const form = el("form", { cls: "inline-form" }, input, submit);
  form.addEventListener("submit", ev => {
    ev.preventDefault();
    if (submit.disabled) return;
    onSubmit(input);
  });
  return { form, input, submit };
}
