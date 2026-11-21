type Attrs = Record<string, string | boolean | undefined>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === "testid") node.setAttribute("data-testid", String(value));
    else if (key === "class") node.className = String(value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

export function button(label: string, testid: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const b = h("button", { type: "button", testid });
  b.textContent = label;
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}

export function textInput(testid: string, placeholder: string, onEnter: () => void): HTMLInputElement {
  const input = h("input", { type: "text", testid, placeholder, "aria-label": placeholder });
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); onEnter(); }
  });
  return input;
}

export function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

/** A page's lifetime: callbacks from requests made by a discarded page are dropped. */
export class Lifetime {
  alive = true;
  end(): void { this.alive = false; }
  /** wraps a promise so its outcome only reaches the handlers while the page is alive */
  watch<T>(p: Promise<T>, ok: (v: T) => void, fail: (e: unknown) => void): void {
    p.then(
      v => { if (this.alive) ok(v); },
      e => { if (this.alive) fail(e); },
    );
  }
}
