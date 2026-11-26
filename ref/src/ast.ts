// Abstract syntax for the reference interpreter (spec/02-core.md §1).
// Operators are spelled as in JS; this is a spelling, not surface syntax.

export type Expr =
  | { k: "lit"; v: unknown }
  | { k: "id"; name: string }
  | { k: "bin"; op: string; l: Expr; r: Expr }
  | { k: "un"; op: string; e: Expr }
  | { k: "pre"; name: string; init?: Expr }
  | { k: "peek"; e: Expr }
  | { k: "await"; e: Expr; init?: Expr; stream?: boolean }     // R-1, R-7; stream: `await*` (ST-6b)
  | { k: "latest"; e: Expr }                                   // R-9 probe
  | { k: "pending"; e: Expr }                                  // R-9 probe (`pending? e`)
  | { k: "if"; c: Expr; t: Expr; f: Expr }
  | { k: "tpl"; parts: (string | Expr)[] }                      // template literal
  | { k: "member"; o: Expr; p: string; opt?: boolean }          // opt: `?.`
  | { k: "index"; o: Expr; i: Expr; opt?: boolean }
  | { k: "call"; f: Expr; args: Expr[]; targs?: string }   // targs: TypeScript type arguments written at the call (`makeStore<Todos>(…)`, 07 §3), types only
  | { k: "arr"; items: Expr[] }
  | { k: "rec"; fields: ({ key: string; v: Expr } | { spread: Expr })[] }
  | { k: "fn"; params: string[]; body: Expr; stmts?: Stmt[]; ptypes?: (string | undefined)[] }   // ptypes: a parameter's TypeScript type (07 §3), types only   // stmts: a statement-bodied arrow (imperative scope, 07 §5)
  | { k: "draft"; seed: Expr; body: Stmt[] }                  // ST-3: the only writes in reactive scope, to `d`
  | { k: "use"; name: string }                                 // RG-7b: the nearest provision above
  | { k: "spread"; e: Expr }                                   // only inside an array literal
  | { k: "omit"; e: Expr; keys: string[] }                      // RG-4b: an object rest, `{ a, ...rest } = e` (the parser's own; Solid's `omit`)
  | { k: "throw"; e: Expr }                                    // R-f-3: a failure; an expression in reactive scope too
  | { k: "catch"; e: Expr; name?: string; classes?: string[]; alt: Expr }
  | { k: "stylemap"; css: string; line?: number }                // 07 CSS-5: `styles = <style>…</style>` — a class map, a constant
  | { k: "serverfn"; params: string[]; ptypes?: (string | undefined)[]; ret?: string; body: Stmt[] };   // 12 SF-1d: `server fn (a) { … }`, an expression — for a wrapper (`GET(server fn …)`)   // R-f-4: `e catch (x: A | B) => alt`; classes absent: every failure

export type Target = { name: string; path: (string | Expr)[]; ctx?: boolean };   // ctx: `use name` — a provided source (RG-7, O-4)

export type Stmt = (
  | { k: "write"; target: Target; e: Expr }
  | { k: "let"; name: string; e: Expr; type?: string }
  | { k: "expr"; e: Expr }
  | { k: "optimistic"; target: Target; e: Expr }                // AC-3
  | { k: "refresh"; name: string }                              // AC-4
  | { k: "affects"; name: string }                              // AC-5
  | { k: "action"; body: Stmt[] }                               // AC-1 inline
  | { k: "sif"; c: Expr; t: Stmt[]; f: Stmt[] }                 // imperative `if`
  | { k: "for"; name: string; e: Expr; body: Stmt[] }           // 07 §5: `for (const x of e) { … }`, a loop of imperative scope
  | { k: "return"; e?: Expr }
  | { k: "try"; body: Stmt[]; catchName?: string; catchClasses?: string[]; handler?: Stmt[]; fin?: Stmt[] }   // AC-7: traditional try/catch/finally in imperative scope
  | { k: "throw"; e: Expr }
) & { line?: number };                                             // the line the statement starts on, for diagnostics

export type Param = { name: string; ref: boolean; type?: string; opt?: boolean };   // E-9; types are TS's, kept as text (07 §2); opt: `b?: T`, a trailing value parameter a call may leave out (E-9a)
export type Decl =
  | { k: "source"; name: string; init: Expr; line: number; question?: boolean; type?: string; exported?: boolean; key?: string }   // question: `source x = e` (ST-5)
  | { k: "eq"; name: string; e: Expr; line: number; deferred?: boolean; key?: string; type?: string; exported?: boolean }   // deferred: declared lag (V-16, D-40); key: ST-4
  | { k: "import"; /** MO-6d: `import * as Select from "m"` — the namespace's name; `names` are then the members the module names, `Select.Item`, each bound as `Select$Item` */ ns?: string; names: { name: string; alias: string }[]; from: string; pure: boolean; side?: "server" | "client"; line: number; fails?: string[]; resolved?: string; prelude?: boolean; declared?: string; declaredErrors?: string[]; declaredErrorFields?: Record<string, string[]>; declaredPure?: string[]; declaredSide?: Record<string, "server" | "client"> }   // R-io-4: io unless `pure`; R-f-8: `fails A | B` narrows its rejections; resolved: an `.rx` import's module key (MO-1, set by the loader); declared: a JS import's declaration file (MO-8)
  | { k: "error"; name: string; params: string[]; ptypes?: (string | undefined)[]; msg?: Expr; line: number; exported?: boolean }             // R-f-1: `error NotFound(id) => message`
  | { k: "typedecl"; name: string; line: number; text?: string; exported?: boolean }                                                           // `type T = …`: text only
  | { k: "effect"; inputs: Expr[]; body: Stmt[]; line: number }
  | { k: "fn"; name: string; params: Param[]; decls: Decl[]; tail: Expr; line: number; ret?: string; exported?: boolean; tparams?: string; named?: boolean }       // body: decls then a value; tparams: `<T>`, as text (07 §2); named: it declares only names for values (E-9b, set by the loader)
  | { k: "component"; name: string; props: string; decls: Decl[]; view: Markup[]; line: number; propsType?: string; noProps?: boolean; exported?: boolean; isDefault?: boolean; tparams?: string }  // body: decls then a view; noProps: `component C()` (RG-4b); isDefault: `export default component App` — the app's entry (MO-1c)
  | { k: "action"; name: string; params: string[]; ptypes?: (string | undefined)[]; /** AC-1f: how many of them a call must pass, where the last ones may be left out (`by?`) */ required?: number; body: Stmt[]; line: number; exported?: boolean }                   // AC-1
  | { k: "server"; name: string; params: string[]; ptypes?: (string | undefined)[]; ret?: string; body: Stmt[]; line: number; exported?: boolean }   // 12 SF-1: `server fn f(a) { … }` — the body runs on the server; it is io when its body is
  | { k: "provide"; name: string; e: Expr; line: number }                                        // RG-7a: `name` resolves to a context declaration
  | { k: "context"; name: string; type?: string; source: boolean; dflt?: Expr; line: number; exported?: boolean };   // RG-7: `context theme: Theme = e`; source: `context f: source T` (RG-7c)

export type Markup = (
  | { k: "el"; tag: string; attrs: { name: string; e: Expr }[]; children: Markup[] }
  | { k: "read"; e: Expr }
  | { k: "text"; s: string }
  | { k: "style"; css: string }                                                   // 07 §6b CSS-1: a scoped stylesheet, raw text
  | { k: "mif"; c: Expr; t: Markup[]; tDecls: Decl[]; f: Markup[]; fDecls: Decl[] }
  | { k: "mfor"; name: string; xs: Expr; decls: Decl[]; body: Markup[] }
  | { k: "mview"; prop?: string; params: string[]; decls: Decl[]; body: Markup[] }   // MO-11k: `view (a, b) { … }` (children) or `view renderItem (a) { … }`, a JS component's render prop
  | { k: "loading"; on?: Expr; fallback: Markup[]; decls: Decl[]; body: Markup[] }    // H-5/H-6
  | { k: "errored"; fallback: Markup[]; decls: Decl[]; body: Markup[]; errName?: string; classes?: string[] }   // H-12; errName: `fallback(e)`; classes: `fallback(e: A | B)` (R-f-4), absent: every failure
  | { k: "portal"; to?: Expr; decls: Decl[]; body: Markup[] }                     // RG-8: rendered at the end of the document (or `to(e)`), owned here
) & { line?: number };                                                                   // the source line, for diagnostics

export type Program = { decls: Decl[]; view: Markup[]; legacyView?: boolean };   // a reactive block: declarations, then its view. A module's view is `<App />` for its default component (MO-1c); legacyView: markup written at the top level (refused, TOP_LEVEL_MARKUP)

/** A context read anywhere in it (`use c`, RG-7b). */
const readsContext = (x: unknown): boolean => x !== null && typeof x === "object" && ((x as { k?: string }).k === "use" || (x as { ctx?: boolean }).ctx === true || Object.values(x).some(readsContext));
/** E-9, RG-6: a call of it happens once, where it is written — it has a `ref` parameter, its body declares, or it reads a
 *  context (RG-7b: the provision above the region of the call, as MO-12b's `uses(c)` on a JS fn). */
export const instantiates = (f: Extract<Decl, { k: "fn" }>): boolean => f.params.some(p => p.ref) || hasRegion(f);
/** RG-6a: its call is a region of its own. */
export const hasRegion = (f: Extract<Decl, { k: "fn" }>): boolean => !f.named && f.decls.length > 0 || readsContext(f.tail);
/** E-9: what makes it instantiate, for a message (bug 22): its first `ref` parameter, its first declaration, or a context. */
export function instantiatesWhy(f: Extract<Decl, { k: "fn" }>): string {
  const p = f.params.find(p => p.ref); if (p) return `takes a \`ref\` parameter, \`${p.name}\``;
  const d = f.decls[0];
  if (d) {
    const named = (what: string) => "name" in d && d.name ? `${what}, \`${d.name}\`` : what;
    switch (d.k) {
      case "source": return `declares ${named("a source")}`;
      case "eq": return `declares ${named("an equation")}`;
      case "typedecl": return `declares ${named("a type")}`;
      case "effect": return "declares an effect";
      case "provide": return `provides ${named("a context")}`;
      default: return `declares ${named(`a${/^[aeiou]/.test(d.k) ? "n" : ""} ${d.k}`)}`;
    }
  }
  return "reads a context";
}
/** E-9b: a body that only names values — plain equations, and nothing in it that waits, remembers, reads a context or
 *  makes anything. Whether one of them is a call that instantiates is the loader's to see (`nameLocals`). */
export const namesOnly = (f: Extract<Decl, { k: "fn" }>): boolean => f.decls.length > 0 && !f.params.some(p => p.ref) && f.decls.every(d => (d.k === "eq" && !d.deferred && d.key === undefined) || d.k === "typedecl")   // a type declares no node (E-9: a source, an effect, a region)
  && !/"k":"(?:await|pre|use|draft|serverfn|stylemap)"|"ctx":true/.test(JSON.stringify([f.decls, f.tail]));
/** E-9b: how the names of a fn's body are read from its result: `order`, the ones reached, a name after those it reads;
 *  `once`, those read in one place and not in a closure, whose expression can stand there (E-3: it is then evaluated when
 *  that place is, as in the one-line form). The others are shared: evaluated at most once for a call. */
export function localsOf(f: Extract<Decl, { k: "fn" }>): { order: string[]; once: Set<string> } {
  const eqs = new Map(f.decls.flatMap(d => d.k === "eq" ? [[d.name, d.e] as const] : []));
  const seen = new Map<string, number>(), held = new Set<string>(), order: string[] = [];
  const reach = (n: string) => { const c = seen.get(n) ?? 0; seen.set(n, c + 1); if (!c) { go(eqs.get(n), false); order.push(n); } };
  const go = (x: unknown, inner: boolean): void => {
    if (x === null || typeof x !== "object") return;
    const o = x as { k?: string; name?: string };
    if (o.k === "id" && eqs.has(o.name!)) { if (inner) held.add(o.name!); reach(o.name!); return; }
    const c = inner || o.k === "fn"; for (const v of Object.values(o)) go(v, c);
  };
  go(f.tail, false);
  return { order, once: new Set(order.filter(n => seen.get(n) === 1 && !held.has(n))) };
}

/** RG-7b: the `use c` written in what `provide c = e` is given — they read what is above that provision, wherever they
 *  run (a closure in e too: it is written above the provision). Not those of a block inside e that provides c itself:
 *  they are that block's. */
export function ownUses(name: string, e: unknown, out = new Set<object>()): Set<object> {
  if (!e || typeof e !== "object") return out;
  if (Array.isArray(e)) { for (const x of e) ownUses(name, x, out); return out; }
  const o = e as Record<string, unknown>;
  if (o.k === "use" && o.name === name) { out.add(o); return out; }
  if (Array.isArray(o.decls) && o.decls.some(d => (d as { k?: string; name?: string })?.k === "provide" && (d as { name?: string }).name === name)) return out;
  for (const [k, v] of Object.entries(o)) if (k !== "k") ownUses(name, v, out);
  return out;
}
/** C-1: the contexts an expression uses where it stands — not in a closure, which runs later, unless a call has it: its
 *  callee, or what it is given, which the call may run. `skip`: uses that are not counted (a provision's own). */
export function usesNow(e: unknown, skip?: Set<object>, out = new Set<string>()): Set<string> {
  const go = (n: unknown, called: boolean): void => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { for (const x of n) go(x, called); return; }
    const o = n as Record<string, unknown>;
    if (o.k === "use") { if (!skip?.has(o)) out.add(o.name as string); return; }
    if (o.k === "serverfn" || (o.k === "fn" && !called)) return;
    const inner = o.k === "call" || (called && o.k !== "fn");
    for (const [k, v] of Object.entries(o)) if (k !== "k") go(v, inner);
  };
  go(e, false); return out;
}
/** C-2: `pre self` somewhere in it. */
export const readsOwn = (x: unknown, self: string): boolean => x !== null && typeof x === "object" && (((x as { k?: string }).k === "pre" && (x as { name?: string }).name === self) || Object.values(x).some(v => readsOwn(v, self)));
/** C-2: the places of an equation that builds on its own last value (`pre self`) whose value the result may hold: an item,
 *  a field, an arm, an argument, what a draft's write gives. A whole store held there is a copy (`kept`), as a write of its
 *  source replaces the root (ST-2a) and what the equation holds is the value it was. */
export function keptParts(e: Expr, self: string, out: Expr[] = []): Expr[] {
  if (!readsOwn(e, self)) return out;
  const stmts = (ss: Stmt[]): void => { for (const s of ss) if (s.k === "write") go(s.e); };
  const go = (x: Expr): void => {
    switch (x.k) {
      case "id": case "member": case "index": case "use": case "peek": case "latest": out.push(x); return;
      case "arr": x.items.forEach(go); return;
      case "rec": for (const f of x.fields) if (!("spread" in f)) go(f.v); return;
      case "if": go(x.t); go(x.f); return;
      case "bin": if (x.op === "&&" || x.op === "||" || x.op === "??") { go(x.l); go(x.r); } return;
      case "call": x.args.forEach(go); return;
      case "await": go(x.e); return;
      case "catch": go(x.e); go(x.alt); return;
      case "draft": stmts(x.body); return;
    }
  };
  go(e); return out;
}
