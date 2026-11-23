// The scopes of a program's tree, read off the tree as data: what the loader names a declared method by (09 MO-8t) and
// what the checker counts a binding's mentions by (MO-11c, MO-10i). One walk, so every reader resolves a name alike.

/** A name bound around a node. `at`: the line of the declaration or the `let` that binds it; -1 for a parameter, props,
 *  a loop's variable, a caught error, a draft's `d`. An import binds nothing here: what is listed is what stands between
 *  a mention and the module's imports. */
export type Bound = { name: string; at: number };
type N = Record<string, unknown> & { k?: string; name?: string; line?: number };

const declared = (ds: unknown): Bound[] => ((ds ?? []) as N[]).filter(d => d.k !== "import" && d.k !== "provide" && d.name !== undefined).map(d => ({ name: d.name!, at: d.line ?? -1 }));
const lets = (ss: unknown): Bound[] => ((ss ?? []) as N[]).filter(x => x.k === "let").map(x => ({ name: x.name!, at: x.line ?? -1 }));
const names = (ps: unknown): Bound[] => ((ps ?? []) as (string | { name: string } | undefined)[]).filter(x => x !== undefined).map(x => ({ name: (typeof x === "string" ? x : x!.name).replace(/^\.\.\./, ""), at: -1 }));

/** Calls `visit` on every node of the tree with the names bound around it, innermost last; a visit that answers true
 *  keeps the walk out of the node. A block's declarations are bound in all of it (a component may be applied above its
 *  declaration), a statement list's `let`s in all of the list. */
export function scoped(v: unknown, visit: (node: N, bound: Bound[]) => boolean | void, bound: Bound[] = []): void {
  if (Array.isArray(v)) { for (const x of v) scoped(x, visit, bound); return; }
  if (!v || typeof v !== "object") return;
  const o = v as N;
  if (visit(o, bound)) return;
  const each = (keys: string[], more: Bound[] = []) => { for (const k of keys) scoped(o[k], visit, more.length ? [...bound, ...more] : bound); };
  const stmts = (k: string, more: Bound[] = []) => each([k], [...more, ...lets(o[k])]);
  const block = (decls: string, rest: string, more: Bound[] = []) => each([decls, rest], [...more, ...declared(o[decls])]);
  if (o.k === undefined && o.decls !== undefined && o.view !== undefined) return block("decls", "view");   // the program
  switch (o.k) {
    case "fn": return o.decls !== undefined ? block("decls", "tail", names(o.params)) : (each(["body"], names(o.params)), stmts("stmts", names(o.params)));
    case "component": return block("decls", "view", names([o.props]));
    case "action": case "server": case "serverfn": return stmts("body", names(o.params));
    case "error": return each(["msg"], names(o.params));
    case "effect": return each(["inputs"]), stmts("body");
    case "draft": return each(["seed"]), stmts("body", names(["d"]));
    case "catch": return each(["e"]), each(["alt"], names([o.name]));
    case "sif": return each(["c"]), stmts("t"), stmts("f");
    case "for": return each(["e"]), stmts("body", names([o.name]));
    case "try": return stmts("body"), stmts("handler", names([o.catchName])), stmts("fin");
    case "mif": return each(["c"]), block("tDecls", "t"), block("fDecls", "f");
    case "mfor": return each(["xs"]), block("decls", "body", names([o.name]));
    case "mview": return block("decls", "body", names(o.params));
    case "loading": return each(["on", "fallback"]), block("decls", "body");
    case "errored": return each(["fallback"], names([o.errName])), block("decls", "body");
    case "portal": return each(["to"]), block("decls", "body");
  }
  for (const x of Object.values(o)) scoped(x, visit, bound);
}
/** The binding a name is at a node: `name@line` for a declaration or a `let`; undefined for an import, a parameter, a
 *  name nothing here binds. */
export function bindingOf(name: string, bound: Bound[]): string | undefined {
  for (let i = bound.length - 1; i >= 0; i--) if (bound[i].name === name) return bound[i].at >= 0 ? `${name}@${bound[i].at}` : undefined;
  return undefined;
}
/** MO-11c, MO-10i: how many times each binding is mentioned as an expression of its own (an `id`, a `pre`), and where
 *  it is written as a call's whole argument — `f(x)` gives `x → (f, 0)`. By binding, not by spelling: a sibling
 *  component's local of the same name is another binding. Read off the tree as data, so no mention is missed: a
 *  callee, a path, a handler's statement. */
export function scopeFacts(tree: unknown): { mentions: Map<string, number>; argCalls: Map<string, [string, number][]> } {
  const mentions = new Map<string, number>(); const argCalls = new Map<string, [string, number][]>();
  scoped(tree, (o, bound) => {
    if ((o.k === "id" || o.k === "pre") && typeof o.name === "string") { const b = bindingOf(o.name, bound); if (b) mentions.set(b, (mentions.get(b) ?? 0) + 1); }
    const f = o.f as N | undefined; const args = o.args as N[] | undefined;
    if (o.k === "call" && f?.k === "id" && typeof f.name === "string" && Array.isArray(args)) args.forEach((a, i) => { if (a?.k !== "id" || typeof a.name !== "string") return; const b = bindingOf(a.name, bound); if (!b) return; let xs = argCalls.get(b); if (!xs) argCalls.set(b, xs = []); xs.push([f.name!, i]); });
  });
  return { mentions, argCalls };
}
