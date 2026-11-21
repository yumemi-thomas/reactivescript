// Small DOM helpers shared by the pages. No framework: elements are built with
// createElement and updated through their properties.

export type Attrs = Record<string, string | boolean | undefined>;
export type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? "" : value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

/** The text of an error for the page, whatever was thrown. */
export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

let keySeq = 0;
/** A local identity for a view-model object; server ids may not exist yet. */
export function newKey(): number {
  keySeq += 1;
  return keySeq;
}
