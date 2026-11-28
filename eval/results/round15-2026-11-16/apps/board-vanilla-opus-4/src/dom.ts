export type Child = Node | string | null | undefined | false;

export interface Props {
  testid?: string;
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
  focusKey?: string;
  disabled?: boolean;
  onClick?: () => void;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, children: Child[] = []): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.testid) el.dataset.testid = props.testid;
  if (props.className) el.className = props.className;
  if (props.focusKey) el.dataset.focusKey = props.focusKey;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
  if (props.text !== undefined) el.textContent = props.text;
  if (props.disabled !== undefined && "disabled" in el) (el as HTMLButtonElement).disabled = props.disabled;
  if (el instanceof HTMLButtonElement && !props.attrs?.type) el.type = "button";
  if (props.onClick) el.addEventListener("click", props.onClick);
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** Replace a container's children, keeping keyboard focus on the equivalent element if it still exists. */
export function replaceChildren(container: HTMLElement, children: Child[]): void {
  const active = document.activeElement;
  const key = active instanceof HTMLElement && container.contains(active) ? active.dataset.focusKey : undefined;
  container.replaceChildren(...children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false));
  if (key) {
    const next = Array.from(container.querySelectorAll<HTMLElement>("[data-focus-key]")).find(e => e.dataset.focusKey === key);
    if (next && !(next as HTMLButtonElement).disabled) next.focus();
  }
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Show or hide a message element: hidden (and empty) when there is no message. */
export function setMessage(el: HTMLElement, message: string | null): void {
  el.textContent = message ?? "";
  el.hidden = message === null;
}
