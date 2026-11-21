export type Child = Node | string | null | undefined | false;

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
  if (el instanceof HTMLButtonElement) el.type = "button";
  if (props.text !== undefined) el.textContent = props.text;
  if (props.onClick) el.addEventListener("click", props.onClick);
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function textInput(testid: string, label: string, value = ""): HTMLInputElement {
  const input = h("input", { testid, attrs: { "aria-label": label, autocomplete: "off" } });
  input.type = "text";
  input.value = value;
  return input;
}

/** Sets an element's message; empty text hides it. */
export function setMessage(el: HTMLElement, text: string | null): void {
  el.textContent = text ?? "";
  el.hidden = !text;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

let seq = 0;
/** A global, increasing sequence number for ordering requests and operations. */
export const nextSeq = (): number => ++seq;

/** Runs `fn` when Enter is pressed in `input`. */
export function onEnter(input: HTMLInputElement, fn: () => void): void {
  input.addEventListener("keydown", ev => {
    if (ev.key === "Enter" && !ev.isComposing) {
      ev.preventDefault();
      fn();
    }
  });
}

/**
 * An optimistically updated value: pending operations and the last server-confirmed one,
 * resolved over a base value that was read at some sequence number.
 */
export class Field<T> {
  private pending: { seq: number; value: T }[] = [];
  private confirmed: { seq: number; value: T } | null = null;
  private lastBySource = new Map<string, number>();

  start(value: T, source: string): Op {
    const op = { seq: nextSeq(), source };
    this.pending.push({ seq: op.seq, value });
    this.lastBySource.set(source, op.seq);
    return op;
  }

  accept(op: Op, value: T): void {
    this.drop(op);
    if (!this.confirmed || op.seq > this.confirmed.seq) this.confirmed = { seq: op.seq, value };
  }

  decline(op: Op): void {
    this.drop(op);
  }

  /** No newer operation from the same source has started since `op`. */
  isLatest(op: Op): boolean {
    return this.lastBySource.get(op.source) === op.seq;
  }

  isPending(): boolean {
    return this.pending.length > 0;
  }

  resolve(base: T, baseSeq: number): T {
    let newest: { seq: number; value: T } | null = null;
    for (const p of this.pending) if (!newest || p.seq > newest.seq) newest = p;
    if (newest && (!this.confirmed || newest.seq > this.confirmed.seq)) return newest.value;
    if (this.confirmed && this.confirmed.seq > baseSeq) return this.confirmed.value;
    return base;
  }

  private drop(op: Op): void {
    this.pending = this.pending.filter(p => p.seq !== op.seq);
  }
}

export type Op = { seq: number; source: string };
