// Small DOM helpers. Text always goes in through textContent or text nodes, never innerHTML.

export type Child = Node | string | null | undefined | false;

export interface Props {
  testid?: string;
  cls?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  placeholder?: string;
  title?: string;
  onClick?: () => void;
  onSubmit?: (event: Event) => void;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.testid !== undefined) node.dataset.testid = props.testid;
  if (props.cls !== undefined) node.className = props.cls;
  if (props.title !== undefined) node.title = props.title;
  if (node instanceof HTMLButtonElement) {
    node.type = props.type ?? "button";
    node.disabled = props.disabled ?? false;
  }
  if (node instanceof HTMLInputElement && props.placeholder !== undefined) {
    node.placeholder = props.placeholder;
  }
  if (props.onClick) node.addEventListener("click", props.onClick);
  if (props.onSubmit) node.addEventListener("submit", props.onSubmit);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
