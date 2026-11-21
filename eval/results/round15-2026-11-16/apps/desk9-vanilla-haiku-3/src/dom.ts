// Small DOM helpers. Everything is built with createElement and textContent, never innerHTML,
// so text that comes from the server cannot inject markup.

export type Child = Node | string | false | null | undefined;

export interface Props {
  testid?: string;
  value?: string;
  placeholder?: string;
  pressed?: boolean;
  hidden?: boolean;
  onClick?: () => void;
}

const seen = new WeakMap<HTMLInputElement, string>();

/** Sets an input's value and records it, so watchText does not report a programmatic change. */
export function setText(input: HTMLInputElement, value: string): void {
  input.value = value;
  seen.set(input, value);
}

/** Calls onChange when the user edits the input, once per distinct value (input and change both lead here). */
export function watchText(input: HTMLInputElement, onChange: (value: string) => void): void {
  seen.set(input, input.value);
  const handle = (): void => {
    if (seen.get(input) === input.value) return;
    seen.set(input, input.value);
    onChange(input.value);
  };
  input.addEventListener("input", handle);
  input.addEventListener("change", handle);
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...kids: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (tag === "button") node.setAttribute("type", "button");
  if (props.testid !== undefined) node.setAttribute("data-testid", props.testid);
  if (props.value !== undefined && node instanceof HTMLInputElement) setText(node, props.value);
  if (props.placeholder !== undefined && node instanceof HTMLInputElement) node.placeholder = props.placeholder;
  if (props.pressed !== undefined) node.setAttribute("aria-pressed", String(props.pressed));
  if (props.hidden) node.hidden = true;
  if (props.onClick) node.addEventListener("click", props.onClick);
  for (const kid of kids) {
    if (kid !== false && kid !== null && kid !== undefined) node.append(kid);
  }
  return node;
}

/** The message of a rejected call, whatever was thrown. */
export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** The nodes and strings of a list of children, without the empty ones. */
export function content(kids: Child[]): (Node | string)[] {
  return kids.filter((k): k is Node | string => k !== false && k !== null && k !== undefined);
}
