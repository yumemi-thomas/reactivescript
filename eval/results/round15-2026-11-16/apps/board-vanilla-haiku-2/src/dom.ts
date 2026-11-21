export type Child = Node | string | null | undefined | false;

/** Creates an element. Text is always set as text (never as HTML). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: { testid?: string; cls?: string } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs.testid !== undefined) node.dataset.testid = attrs.testid;
  if (attrs.cls !== undefined) node.className = attrs.cls;
  node.append(...children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false));
  return node;
}

export function button(
  label: string,
  onClick: () => void,
  opts: { testid?: string; disabled?: boolean } = {},
): HTMLButtonElement {
  const b = h("button", { testid: opts.testid }, label);
  b.type = "button";
  b.disabled = opts.disabled ?? false;
  b.addEventListener("click", onClick);
  return b;
}

export function textInput(testid: string, placeholder: string, onEnter: () => void): HTMLInputElement {
  const input = h("input", { testid });
  input.type = "text";
  input.placeholder = placeholder;
  input.setAttribute("aria-label", placeholder);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.isComposing) onEnter();
  });
  return input;
}

export function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
