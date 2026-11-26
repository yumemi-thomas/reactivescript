// The checker: spec/08-constraints.md made executable. Runs over the AST before the interpreter.
// Every diagnostic is an error (CN-1a). Codes keep Solid's names where one exists (CN-1b); `rule`
// is the spec rule enforced. Names resolve lexically (a component body sees its declaration
// site, never its caller — RG-7a); provisions resolve through the static application tree (RG-7b).
import { HARNESS, language, scalar, listOf } from "./names.ts";
import type { Decl, Expr, Markup, Param, Program, Stmt } from "./ast.ts";
import { hasRegion, instantiates, instantiatesWhy, ownUses, usesNow } from "./ast.ts";
import type { Diagnostic } from "./errors.ts";
import { childrenParam, fnText, expandType, otherMention, shown, shownIn, usedIn, typesOf, viewUses, viewNotShown, takesView, viewCtx, genericCtx, declaresViewFn, type ViewUses, type ModuleSet, type Shown, type Types } from "./modules.ts";
import { closes, splitTop, fieldRows, instance, isGenerated, isViewType, type JsDecl, type Shape } from "./parse.ts";
import { misnested, misnestedInside, P_CLOSERS, P_SCOPE, EMPTY_SHAPE, USE, carriedBy, type Shape } from "./content.ts";
import { ModelBuilder, type Model, type RegionKind, type CompKind } from "./model.ts";
import { scopeFacts, scoped } from "./scope.ts";
import { actionWaits, guessFacts, inferredAction, runFindings, scalarType, triggerText, type RunOpts } from "./infer.ts";

/** MO-10i (closed 2026-11-22): what is called on a draft is a method of plain data, by name — an Array's, a Map's, a Set's,
 *  a string's or a number's. `DRAFT_CALLBACKS` are the ones that call a function they are given, now, with parts of the data. */
const DRAFT_METHODS = new Set([
  "push", "pop", "shift", "unshift", "splice", "reverse", "fill", "copyWithin", "includes", "indexOf", "lastIndexOf", "at", "slice", "concat", "join", "flat", "keys", "values", "entries", "with", "toReversed", "toSpliced",
  "set", "get", "has", "add", "delete", "clear",
  "trim", "trimStart", "trimEnd", "toUpperCase", "toLowerCase", "startsWith", "endsWith", "padStart", "padEnd", "split", "replace", "replaceAll", "charAt", "charCodeAt", "codePointAt", "substring", "repeat", "normalize", "localeCompare", "match", "search",
  "toFixed", "toPrecision", "toString", "toLocaleString", "valueOf", "hasOwnProperty",
]);
/** W2: an Array's methods that answer a list of some of the items it holds, as they are. */
const SAME_ITEMS = new Set(["filter", "toSorted", "toReversed", "slice", "concat", "reverse", "sort"]);
const DRAFT_CALLBACKS = new Set(["forEach", "map", "filter", "find", "findIndex", "findLast", "findLastIndex", "some", "every", "flatMap", "reduce", "reduceRight", "sort", "toSorted"]);
/** W-1a: an Array's methods that change it in place. */
const ARRAY_MUTATORS = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin"]);
/** The function of the language a name is, where it is mentioned (`names.ts`). */
const lang = (env: Env, name: string) => language(name, env.lookup(name), env.conformance);
/** MO-8j: the language's methods and functions that call a function they are given while the call runs. */
const CALLS_NOW = new Set(["map", "filter", "some", "every", "find", "reduce", "forEach", "flatMap", "toSorted", "replace"]);
/** W2 (2026-11-26): a path into a value — fields by name, an item of a list `*` — "" is the value itself. */
export const joinPath = (a: string, b: string): string => a === "" ? b : b === "" ? a : `${a}.${b}`;
/** …with each index an item (`0.go` is `*.go`). */
export const itemPath = (p: string): string => p === "" ? "" : p.split(".").map(s => /^\d+$/.test(s) ? "*" : s).join(".");
/** MO-8j, W2 (2026-11-26): the paths of a fn's i-th parameter that its body calls while the fn runs ("": the parameter
 *  itself; `go`: its field; `*`: an item of it). Called by its name or a path of it, or given (by a path) to one of
 *  `CALLS_NOW` — whose callback's parameter is then an item of what it is called on —, or to a parameter of another fn
 *  that calls that one now (`isFn`: a fn of the module or one imported by its row; `called`: its paths): a fixpoint
 *  over the module's fns, the cycle cut where it closes (by the caller of `called`). Outside any closure,
 *  or in a closure given to one of `CALLS_NOW`. A closure kept, a statement body, a call of JavaScript: not read — what
 *  is not known to call now is not refused. */
export function calledPaths(d: Extract<Decl, { k: "fn" }>, i: number, isFn: (name: string) => boolean, called: (name: string, j: number) => Set<string>): Set<string> {
  const p = d.params[i]?.name, out = new Set<string>(); if (p === undefined) return out;
  type Names = Map<string, string | null>;   // a name for a path of the parameter; null: a name that is no path (a closure's parameter, a local)
  const pathOf = (x: Expr, names: Names): string | undefined => {
    switch (x.k) {
      case "id": return names.get(x.name) ?? undefined;
      case "member": { const o = pathOf(x.o, names); return o === undefined ? undefined : joinPath(o, x.p); }
      case "index": { const o = pathOf(x.o, names); if (o === undefined) return undefined; const k = litKey(x.i); return joinPath(o, k === undefined || /^\d+$/.test(k) ? "*" : k); }
      case "peek": return pathOf(x.e, names);
      default: return undefined;
    }
  };
  const scoped = (names: Names, ps: string[], item?: string, k = 0) => { const m: Names = new Map(names); for (const q of ps) m.set(q, null); if (item !== undefined && ps[k] !== undefined) m.set(ps[k], item); return m; };
  const fnOf = (n: string, names: Names) => !names.has(n) && isFn(n);
  const visit = (x: Expr, now: boolean, names: Names): void => {
    switch (x.k) {
      case "call": {
        const fp = pathOf(x.f, names); if (now && fp !== undefined) out.add(fp);
        const method = x.f.k === "member" ? x.f.p : x.f.k === "id" && !names.has(x.f.name) && !fnOf(x.f.name, names) ? x.f.name : undefined;
        const c = now && method !== undefined && CALLS_NOW.has(method);
        const recv = !c ? undefined : x.f.k === "member" ? x.f.o : x.args[0];
        const rp = recv && pathOf(recv, names), k = method === "reduce" ? 1 : 0;
        const cbs = !c ? [] : x.f.k === "member" ? x.args : x.args.slice(1);
        const g = x.f.k === "id" && fnOf(x.f.name, names) ? x.f.name : undefined;
        if (x.f.k !== "id") visit(x.f, now, names);
        x.args.forEach((a, j) => {
          const ap = pathOf(a, names);
          if (cbs.includes(a)) {
            if (ap !== undefined) { out.add(ap); return; }
            if (a.k === "fn") { if (!a.stmts) visit(a.body, true, scoped(names, a.params, rp === undefined ? undefined : joinPath(rp, "*"), k)); return; }
            if (a.k === "id" && rp !== undefined && fnOf(a.name, names)) for (const q of called(a.name, k)) out.add(joinPath(joinPath(rp, "*"), q));
            visit(a, now, names); return;
          }
          if (g !== undefined && now && ap !== undefined) for (const q of called(g, j)) out.add(joinPath(ap, q));
          if (a.k === "fn") { if (!a.stmts) visit(a.body, false, scoped(names, a.params)); return; }
          visit(a, now, names);
        });
        return;
      }
      case "fn": if (!x.stmts) visit(x.body, false, scoped(names, x.params)); return;
      case "bin": visit(x.l, now, names); visit(x.r, now, names); return;
      case "un": case "peek": case "latest": case "pending": case "spread": case "omit": case "throw": visit(x.e, now, names); return;
      case "await": visit(x.e, now, names); if (x.init) visit(x.init, now, names); return;
      case "pre": if (x.init) visit(x.init, now, names); return;
      case "if": visit(x.c, now, names); visit(x.t, now, names); visit(x.f, now, names); return;
      case "catch": visit(x.e, now, names); visit(x.alt, now, names); return;
      case "tpl": for (const q of x.parts) if (typeof q !== "string") visit(q, now, names); return;
      case "member": visit(x.o, now, names); return;
      case "index": visit(x.o, now, names); visit(x.i, now, names); return;
      case "arr": for (const y of x.items) visit(y, now, names); return;
      case "rec": for (const f of x.fields) visit("spread" in f ? f.spread : f.v, now, names); return;
      case "draft": visit(x.seed, now, names); return;
      default: return;   // lit, id, use, stylemap, serverfn
    }
  };
  const names: Names = new Map([[p, ""]]); for (const x of d.decls) if ("name" in x && typeof x.name === "string") names.set(x.name, null);
  for (const x of d.decls) {
    if (x.k === "eq") { const ap = pathOf(x.e, names); if (ap !== undefined) names.set(x.name, ap); else { names.set(x.name, null); visit(x.e, true, names); } }   // a name for a path of it is that path
    else if (x.k === "source") visit(x.init, true, names);
  }
  visit(d.tail, true, names);
  return new Set([...out].map(itemPath));
}
/** W2: whether a value with these io parts holds one at a path that is called (paths as `itemPath` writes them). */
export const callsHeld = (parts: Iterable<string>, called: Set<string>): string | undefined => { for (const q of parts) { const n = itemPath(q); if (called.has(n)) return n; } return undefined; };
/** `map(…)` is the language's only where nothing binds `map`. */
const ownMap = (e: Expr, env: Env): boolean => !(e.k === "call" && e.f.k === "id" && !lang(env, e.f.name));
const isHandler = (attr: string) => /^on[A-Z:]/.test(attr) || attr === "ref";                // SC-4; `ref`: called once with the element (07 §4)

// ---------------------------------------------------------------- regions and symbols
type Region = {
  id: number; depth: number;
  parent: Region | null;               // lexical
  component: Region | null;            // nearest enclosing component root (possibly self)
  isComponentRoot: boolean;
  fn?: Sym;                            // RG-6a: the region of a fn's calls
  provParent: Region | null;           // where provisions come from when not a component root (children: the component's root)
  appSites: Region[];                  // component roots: the regions it is applied in
  provides: Set<string>;
  catches?: Catch;                     // an `errored` body: what its boundary discharges (R-f-4)
  kids?: { comp: Region; site: Region; view?: string };   // children passed to a component: read where it reads props.children (R-f-5)
  js?: boolean;                        // a declared JS component's root (MO-11a)
  sig?: CompSig;                       // an imported component's root: its signature stands in for its body (MO-3)
  key?: string;                        // E-5a: a component root's identity across modules (`file#name`), for what its props are given
  hostKey?: string;                    // MO-11u: a declared JS component some fn of its declaration `renders(…)` beneath: `declaration#Name`
};
// ---------------------------------------------------------------- failures (R-f)
/** What a catch or a boundary discharges: named classes, or every failure. `Error` is the top: only "all" discharges it. */
type Catch = Set<string> | "all";
/** A read of a component's prop: its failures are the argument's, known only at each application (R-f-5). `pre`: catches already applied. */
/** RG-4c: what is given to a context that holds a view, around a place: a view of the walked component (`own`), markup written there, or a value. */
type Carrier = { key: string; own?: string; content?: Markup[]; env?: Env; text?: boolean };
type PropRef = { comp: Region; field: string; pre: Catch[]; from?: Region };   // from: RG-4c, read through a context that holds a view: the block that provides it, above every place that shows it
type Fails = { cls: Set<string>; props: PropRef[] };
/** One step on the way up from a read: what it discharges — failures (`f`: a boundary or a catch) and provisions (`p`). */
type Step = { f?: Catch; p?: Catch };
/** Where a prop goes once read: up to the component's root (`term` null) or out of an action (an error). */
type PFEntry = { chain: Step[]; term: null | { line: number; name: string } };
const caught = (c: Catch, cls: string) => c === "all" || (cls !== "Error" && c.has(cls));
const escF = (chain: Step[], cls: string) => !chain.some(s => s.f && caught(s.f, cls));
const escP = (chain: Step[], name: string) => !chain.some(s => s.p && (s.p === "all" || s.p.has(name)));
/** RG-7b: the same for a `use` written in its own provision: the first provision on its way up is that one, and is not its. */
const escAbove = (chain: Step[], name: string) => { const i = chain.findIndex(s => s.p && (s.p === "all" || s.p.has(name))); return i < 0 || escP(chain.slice(i + 1), name); };
/** MO-3: an exported component as an importer sees it — what escapes its root, the provisions it needs from above, and per prop
 *  what it discharges on every path from its reads (`f`, `p`), and what an action reading it catches. */
export type CompSig = { /** MO-11a: a JavaScript component's declaration (not printed) */ js?: boolean; /** 07 §2: `<T>`, as text */ tparams?: string; made?: boolean; own: { cls: string; what: string; at?: string }[]; requires: string[]; props: Record<string, { f: Catch; p: Catch; rendered: boolean; action?: { f: Catch; name: string }; component?: boolean; render?: boolean; renderOptional?: boolean; view?: { optional: boolean; mixed: boolean; values: string[]; type?: string }; callback?: boolean; pure?: boolean; takes?: [string, boolean, string[]][]; components?: boolean; }>; hosts?: Record<string, HostSite[]>; shape?: Shape; stored?: Record<string, string[]>; through?: boolean };   // through: MO-14f (2026-11-25), in a host's view — the component's view applies a component the host renders through, so it renders its applier's children there (not printed: a host's view is checked from source)   // keeps: MO-11l, the props whose value never leaves the component   // shape: SV-7d; stored: O-3, a prop the component stores where it outlives it ("module", or a provision's key)
/** MO-11u: one application of a component a declared fn `renders(…)` beneath, as the components that fn is given see it:
 *  what is discharged and provided between that application's children and the root of the component it is written in
 *  (in a module's own list: the program's). */
export type HostSite = { f: Catch; p: Catch };
/** MO-11u: a call of a fn declared `renders(H)` that was given components — what they let out of H's children, H's own
 *  `uses(…)` and `provides(…)` taken off: judged at each application of H in the program (`judgeHosted`). */
export type Hosted = { host: string; name: string; fn: string; line: number; fails: string[]; requires: string[]; inner?: Record<string, HostSite[]> };   // inner: the places those components themselves apply a host (a routed layout's `<Toaster />`), from their own root, with what H uses and provides above them
const siteKeyOf = (x: HostSite) => { const ck = (c: Catch) => c === "all" ? "*" : [...c].sort().join("|"); return `${ck(x.f)}~${ck(x.p)}`; };
const joinCatch = (a: Catch, b: Catch): Catch => a === "all" || b === "all" ? "all" : new Set([...a, ...b]);
const noFails = (): Fails => ({ cls: new Set(), props: [] });
/** A context key (`file#name`, `@n` for one declared in a block) → its name. */
const JS_GLOBALS = new Set("Math JSON Date Number String Boolean Array Object Promise Set Map WeakMap WeakSet Symbol RegExp BigInt Intl URL console document window globalThis navigator localStorage sessionStorage location history setTimeout setInterval clearTimeout clearInterval requestAnimationFrame queueMicrotask structuredClone parseInt parseFloat isNaN crypto performance alert".split(" "));
/** A type's text on one line, as a signature's row is (MO-9b): a line's end between two members is their `;`. */
const oneLine = (t: string) => t.split("\n").map(x => x.trim()).filter(Boolean).reduce((a, b) => a === "" ? b : a + (/[{([<|&,;:>]$/.test(a) || /^[})\]>|&]/.test(b) ? " " : "; ") + b, "");
type Use = { region: Region; name: string; line: number; display: string; above?: boolean };   // above (RG-7b): written in its own provision — what is above that provision
export const keyName = (k: string) => k.split("#").pop()!.replace(/@\d+$/, "");
const addF = (a: Fails, b: Fails) => { for (const x of b.cls) a.cls.add(x); a.props.push(...b.props); return a; };
const catchOf = (classes?: string[]): Catch => classes ? new Set(classes) : "all";
/** EF-5's cleanup shapes: a `return` of a closure anywhere in the body, a closure as its last expression, or an expression body that is one. */
function returnsClosure(f: Extract<Expr, { k: "fn" }>): boolean {
  const inStmts = (ss: Stmt[]): boolean => ss.some(s => (s.k === "return" && s.e?.k === "fn") || (s.k === "sif" && (inStmts(s.t) || inStmts(s.f))) || (s.k === "for" && inStmts(s.body)) || (s.k === "try" && (inStmts(s.body) || inStmts(s.handler ?? []) || inStmts(s.fin ?? []))));
  if (!f.stmts) return f.body.k === "fn";
  const last = f.stmts[f.stmts.length - 1];
  return inStmts(f.stmts) || (last?.k === "expr" && last.e.k === "fn");
}
/** A closure whose body makes another closure (O-3: what calling it returns may hold one). */
function containsFn(f: Extract<Expr, { k: "fn" }>): boolean {
  const any = (v: unknown): boolean => !!v && typeof v === "object" && (Array.isArray(v) ? v.some(any) : ((v as { k?: string }).k === "fn" || Object.values(v as object).some(any)));
  return any(f.body) || any(f.stmts ?? []);
}
/** A short rendering of an expression, for messages. */
export function show(e: Expr): string {
  switch (e.k) {
    case "lit": return JSON.stringify(e.v); case "id": return e.name; case "member": return `${show(e.o)}.${e.p}`;
    case "call": return `${show(e.f)}(…)`; case "await": return `await ${show(e.e)}`; case "latest": return `latest ${show(e.e)}`;
    case "peek": return `peek ${show(e.e)}`; case "throw": return `throw ${show(e.e)}`; case "index": return `${show(e.o)}[…]`;
    case "use": return `use ${e.name}`; case "catch": return `${show(e.e)} catch …`; case "tpl": return "`…`"; case "bin": return `${show(e.l)} ${e.op} ${show(e.r)}`; case "if": return `${show(e.c)} ? … : …`;
    default: return "…";
  }
}
type SymKind = "source" | "eq" | "props" | "value" | "fn" | "action" | "comp" | "import" | "errclass" | "context" | "server";
/** MO-10k: the kind of value the checker confines by mention (`Checker.tainted`): the instance a declared primitive made
 *  (E-10, E-5a). */
type Taint = "instance";
type Sym = {
  kind: SymKind; name: string; region: Region; line: number;
  question?: boolean;                  // source x = e
  eqDecl?: Extract<Decl, { k: "eq" }>;  // a declared equation: a guess may sit over it (AC-3, ST-5c)
  lit?: { ids: Extract<Expr, { k: "id" }>[]; env: Env; line: number; sites: Set<Expr>; exported: boolean };   // MO-11c: bound to a literal of components, read as the literal where it is given to a prop that holds components
  io?: boolean;                        // calling it is io (R-io)
  retIo?: string;                      // MO-10b (2026-11-26): a declared fn's result type, each `io` before a function part left where it stood
  constTy?: string;                    // MO-8t: a declared JS value's type (`export const client: { … }`), read a step at a time as a declared result's is
  param?: boolean;                     // a fn's parameter: never a write target (O-4)
  instantiating?: boolean;             // fn with ref params or declarations (E-9)
  params?: { name: string; ref: boolean }[];
  arity?: number;                      // an action declared here: how many arguments a call passes (AC-1f)
  arityMin?: number;                   // …at least, where its last parameters may be left out (`by?`)
  outlasts?: boolean;                     // an action declared here: whether its change can outlast the call (an `await`, `refresh`, `affects`; AC-1h)
  captures?: Sym[];                    // a value holding a closure: the reactive names it captured (O-3)
  retCaptures?: Sym[];                 // what calling that value can return holding (O-3)
  propOf?: { comp: Region; field: string };   // O-3: not a name but a prop's argument, stored — its captures are the caller's ("*": all of props)
  mapsRecords?: boolean;               // an unkeyed equation that maps into fresh records (ST-4b)
  rows?: () => Set<string>;            // inferred rows of its value (R-13)
  comp?: Extract<Decl, { k: "component" }>;
  expr?: Expr; env?: Env;              // an equation's (or a question source's) expression and the scope it reads in — C-3
  compRegion?: Region; compEnv?: Env;   // a component: its root region, and the scope its body names from
  failsT?: () => Fails;                // R-f-2: the failures of its value (an equation, a question source) or of a call (a fn)
  fnTail?: Expr; fnEnv?: Env;          // a fn: its result, for what an `await` of a call to it rejects with
  rejects?: Set<string>;               // an import: what its promises reject with (R-f-8)
  imported?: string;                   // a source imported from an .rx module: read-only here (MO-2)
  ctx?: { key: string; source: boolean; dflt: boolean; contract: { rows: Set<string>; fails: Set<string> } | null; ty?: string; view?: { fn: boolean; param?: string } };   // view: it holds a view (RG-4c)   // ty: its declared type, the row words taken out (MO-10k: read a step at a time, as a declared result's is)
  side?: "server" | "client";          // 12 SF-5: JS that runs on one side only
  ioVia?: string;                      // 12 SF-1: a server fn that is io — the call in its body that makes it so
  serverRejects?: () => Set<string>;   // SF-6b: what a call's promise rejects with — its body's failures, and Error (transit)
  foreign?: Shape;                     // MO-10: a declared JS primitive (a fn) or an instance of one (an equation): what its result is
  rowOf?: { e: Expr; env: Env };       // E-5a: a `for` row's binding — the list it is a row of
  viaField?: boolean;                  // RFC 14: bound from a field of an instance (`w = size.width`), which tracks (MO-10b)
  reader?: boolean;                    // MO-10d: bound from a foreign accessor — it may hold, as a question's reader does
  cbs?: ([boolean, string[]] | null)[];   // MO-10g: where a declared JS fn takes callbacks
  held?: [string, boolean, string[]][];   // MO-10l: a JS fn's result parts — `ref` items of its tuple, `ref` fields of its record — that wait or fail where they are read (part, holds, classes); on a binding of its result too. MO-10f: the same of a prop's fields, by the component's props type
  waits?: [boolean, string[]];   // MO-10l: a JS fn whose whole result is an accessor that waits or fails (holds, classes)
  result?: Result;                     // MO-13i: an imported fn — the parts of its result, where they are known
  fnDecls?: Set<string>;               // MO-13i: an instantiating fn of this module — the names its body declares
  actionParts?: string[];              // R-io-3: an import — the parts of its value (a fn's: of its result) that are actions, as paths
  needs?: string[];                    // MO-12b: the JS contexts a declared hook reads (keys) — a use at each call
  gives?: string[];                    // MO-12c: the JS contexts a declared factory's component provides to what it renders
  generated?: string;                  // MO-8l: a JS fn declared by a generated draft (node_modules/.rx-types): its package's specifier
  makes?: boolean;                     // MO-8l: …whose row says itself that a call makes something
  undeclared?: string;                 // MO-8k: a JS import with no declaration in any of the four places: its specifier
  pureFn?: boolean;                    // MO-11g: a JS fn declared or imported `pure` that makes nothing: among a factory's arguments it hands the components it is given on
  drafts?: [number, number[]][];       // MO-10i: a JS fn's callbacks whose parameters are its drafts (argument index, parameter positions)
  partDrafts?: Record<string, [number, number[]][]>;   // MO-10i: the same, for its result's function parts (tuple index or field)
  jsDraft?: boolean;                   // MO-10i: a callback's parameter the library declares a draft: its paths are written
  handed?: boolean;                    // MO-11k, W-1a: a view lambda's parameter: what the component hands its render prop, the component's own value
  draftFn?: number;                    // MO-10i: the closure whose parameter the draft is (its fnStack id)
  rowKey?: string;                     // ST-4: `xs key id`, the field its rows are keyed by
  draftArgs?: number[];                // MO-10i (2026-11-22): a declared JS fn's parameters marked `draft`: changed in place by the call
  disposer?: string;                   // EF-5a (2026-11-22): a declared JS fn whose result undoes the call (a subscription's disposer): the declared type that says so, `() => void` or `{ unsubscribe: () => void }` (tyUndoes)
  updater?: number[];                  // MO-10i (2026-11-22): a closure bound to this name that is used only as the callback of a function that hands it a draft: the parameter positions that are drafts
  retTy?: string;                      // MO-10k: a declared JS fn's result type as written (rows and `ref` taken out), and on a binding of its result or of a part of it, that part's: the closed set of what the value answers (`tyStep`)
  made?: { e: Expr; env: Env; ty?: string };   // W-1a: what a source or an equation is made from, and the type written on it
  eqExpr?: { e: Expr; env: Env };   // every equation's expression (E-10: whether it ever changes)
  val?: { e: Expr; env: Env };          // MO-10k: the expression a name is bound to — an equation's, a local's
  srcs?: { e: Expr; env: Env }[];       // MO-10k: what else a name's value may come from — a closure's parameter: the call's other arguments and its receiver; a loop's variable: what it loops over; an effect's `$n`: its input
  ofFn?: Expr;                          // MO-10k: a closure literal's parameter: that closure 
  retFlows?: { names: Set<string>; env: Env };   // MO-10k: what an `.rx` fn or an action of this module may give back: the names its result mentions, in its scope
  nests?: { kids: string; inside: string };   // MO-11i: how a declared factory nests what it is given
  rendersIn?: { key: string; name: string; credit: string[] };   // MO-11u: a declared JS fn `renders(H)` — H's key (`declaration#H`), its name as written, and the contexts H itself uses and provides
  factory?: { args: Expr[]; env: Env; values?: string[]; nests?: { kids: string; inside: string }; exported?: Sym };   // MO-11f; exported: MO-11j, the component an importer sees: a component a JS factory made — the call's arguments, and the components in them
  exportKey?: string;                  // E-5a: an .rx import's `file#name`, whose changing the whole-program pass knows
  through?: boolean;                   // MO-14f: a JS component the host renders through — applied in a component's view, it renders that component's children there
  viewOf?: { comp: Sym; view: string };   // RG-4c: the parameter of a view (the field it is given for) of `comp`, an .rx component: its props
  noProps?: string;                    // RG-4b: the props of `component C()`, which declares none — C's name: reading them is UNBOUND
  fnDecl?: Extract<Decl, { k: "fn" }>; declEnv?: Env; /** MO-9b, W2: an imported fn's row, `calls(…)`: the paths of each parameter it calls while it runs */ calls?: string[][];   // a fn's declaration and the scope it names from (SF-3: what it reaches)   // a context (RG-7): its identity, whether it carries a source, and its declared rows (null: inferred from its provisions)
};
const reactiveKinds = new Set<SymKind>(["source", "eq", "props"]);

class Env {
  vars = new Map<string, Sym>(); parent: Env | null; region: Region; conformance: boolean;   // CP-4c: loaded for the scenario runners
  constructor(parent: Env | null, region: Region, conformance = !!parent?.conformance) { this.parent = parent; this.region = region; this.conformance = conformance; }
  lookup(n: string): Sym | undefined { return this.vars.get(n) ?? this.parent?.lookup(n); }
}
type Ctx = { scope: "reactive" | "imperative"; inFn?: boolean; lifted?: boolean; inAction?: boolean; server?: boolean };   // server: inside a server function's body (12)

// ---------------------------------------------------------------- free names
/** Free identifiers of an expression (`pre:x` for `pre x`), minus names bound inside it. */
export function freeNames(e: Expr, bound: Set<string>, out: Set<string>): void {
  const go = (x: Expr) => freeNames(x, bound, out);
  switch (e.k) {
    case "lit": case "use": return;
    case "id": if (!bound.has(e.name)) out.add(e.name); return;
    case "pre": if (!bound.has(e.name)) out.add(`pre:${e.name}`); return;
    case "peek": go(e.e); return;
    case "await": go(e.e); if (e.init) go(e.init); return;
    case "latest": case "pending": case "un": case "spread": case "omit": go(e.e); return;
    case "bin": go(e.l); go(e.r); return;
    case "if": go(e.c); go(e.t); go(e.f); return;
    case "tpl": for (const p of e.parts) if (typeof p !== "string") go(p); return;
    case "member": go(e.o); return;
    case "index": go(e.o); go(e.i); return;
    case "call": go(e.f); e.args.forEach(go); return;
    case "arr": e.items.forEach(go); return;
    case "rec": for (const f of e.fields) go("spread" in f ? f.spread : f.v); return;
    case "fn": { const b = new Set([...bound, ...e.params]); freeNames(e.body, b, out); if (e.stmts) freeNamesStmts(e.stmts, b, out); return; }
    case "draft": { go(e.seed); freeNamesStmts(e.body, new Set([...bound, "d"]), out); return; }
    case "throw": go(e.e); return;
    case "catch": go(e.e); freeNames(e.alt, e.name ? new Set([...bound, e.name]) : bound, out); return;
  }
}
/** C-3a: what a value written by an apply block is computed from — the names its expression reads, and the names it
 *  calls. Not what is under `peek(…)` (a reading said to be taken once), nor what a statement-bodied closure reads (it
 *  runs later, as an event of its own). */
export function writeReads(e: Expr, bound: Set<string>, names: Set<string>, callees: Set<string>): void {
  const go = (x: Expr) => writeReads(x, bound, names, callees);
  switch (e.k) {
    case "lit": case "use": case "pre": case "peek": case "draft": case "stylemap": case "serverfn": return;
    case "id": if (!bound.has(e.name)) names.add(e.name); return;
    case "await": go(e.e); if (e.init) go(e.init); return;
    case "latest": case "pending": case "un": case "spread": case "omit": case "throw": go(e.e); return;
    case "bin": go(e.l); go(e.r); return;
    case "if": go(e.c); go(e.t); go(e.f); return;
    case "tpl": for (const p of e.parts) if (typeof p !== "string") go(p); return;
    case "member": go(e.o); return;
    case "index": go(e.o); go(e.i); return;
    case "call": if (e.f.k === "id" && !bound.has(e.f.name)) callees.add(e.f.name); else go(e.f); e.args.forEach(go); return;
    case "arr": e.items.forEach(go); return;
    case "rec": for (const f of e.fields) go("spread" in f ? f.spread : f.v); return;
    case "fn": if (!e.stmts) writeReads(e.body, new Set([...bound, ...e.params]), names, callees); return;
    case "catch": go(e.e); writeReads(e.alt, e.name ? new Set([...bound, e.name]) : bound, names, callees); return;
  }
}
function freeNamesStmts(ss: Stmt[], bound0: Set<string>, out: Set<string>): void {
  const bound = new Set(bound0);
  for (const s of ss) {
    const go = (x: Expr) => freeNames(x, bound, out);
    switch (s.k) {
      case "let": go(s.e); bound.add(s.name); break;
      case "write": case "optimistic": if (!s.target.ctx && !bound.has(s.target.name)) out.add(s.target.name); s.target.path.forEach(p => typeof p !== "string" && go(p)); go(s.e); break;
      case "expr": case "throw": go(s.e); break;
      case "return": if (s.e) go(s.e); break;
      case "refresh": case "affects": if (!bound.has(s.name)) out.add(s.name); break;
      case "action": freeNamesStmts(s.body, bound, out); break;
      case "sif": go(s.c); freeNamesStmts(s.t, bound, out); freeNamesStmts(s.f, bound, out); break;
      case "for": go(s.e); freeNamesStmts(s.body, new Set([...bound, s.name]), out); break;
      case "try": freeNamesStmts(s.body, bound, out); if (s.handler) freeNamesStmts(s.handler, new Set([...bound, ...(s.catchName ? [s.catchName] : [])]), out); if (s.fin) freeNamesStmts(s.fin, bound, out); break;
    }
  }
}
/** MO-10k (ruled 2026-11-22): the names an expression's value may come from, **by mention**. One syntactic rule, no values
 *  followed: a value comes from the names written in the expression, except where what is written there cannot be handed
 *  on — an operand of an operator that makes a primitive (arithmetic, a comparison, `!`, `typeof`, a template), a
 *  condition, a key, the argument of a builtin that answers a primitive (`len`, `str`, `sum`, `every`, `indexOf`). A call
 *  is opaque: what it gives may be anything it was given (its callee, its arguments); a closure gives what it returns (its
 *  parameters give nothing by themselves: the call that hands them a value is where they are named). Names bound inside
 *  (`bound`) give nothing; a closure's own locals (`locals`) give what their values do. `use c` is written `use:c`, for
 *  the checks that must know a value came from where they cannot look. */
/** ST-4d: a key two rows of a list literal share — `[{ id: 1, … }, { id: 1, … }]` keyed by `id` — as written. */
function duplicateKey(e: Expr, key: string): string | undefined {
  if (e.k !== "arr") return undefined;
  const seen: string[] = [];
  for (const it of e.items) {
    if (it.k !== "rec") continue;
    const v = recField(it.fields, key); if (!v || v.k !== "lit" || v.v === undefined || v.v === null) continue;
    const shown = show(v);
    if (seen.includes(shown)) return shown;
    seen.push(shown);
  }
  return undefined;
}
/** What `flows` asks of where it is read: whether a name is a builtin there (not bound), and whether an expression is a
 *  primitive by its declaration (`Checker.declPrim`). */
type Look = { builtin: (n: string) => boolean; prim: (e: Expr) => boolean };
/** The name a path is read from: `table` of `table.getState().page`. */
function pathRoot(e: Expr): string | undefined {
  if (e.k === "id") return e.name;
  if (e.k === "member" || e.k === "index") return pathRoot(e.o);
  if (e.k === "call") return pathRoot(e.f);
  return undefined;
}
/** E-10, E-5a (2026-11-22, a closure given to a closure): how a closure's body uses one of its parameters, as far as
 *  what it may call goes. `callees`: the paths of the parameter it calls (`g()`, `o.total()`, `o.fmt[0]()`; a step is a
 *  field or a literal index); `passed`: what those calls are given; `any`: the parameter is used some other way that may
 *  come to a call — handed to a call, kept in a local, a record or an array, written, looped over, called through a
 *  computed slot. A read that makes a primitive (an operand, a template's part, a test), a value that is dropped, and
 *  the value the closure answers (whoever calls that is read where it is called) are none of these. */
type ParamUses = { any: boolean; callees: string[][]; passed: Expr[] };
/** The path an expression reads of `p`: `p` itself, `p.a`, `p["a"]`, `p[0]`; a computed step is `undefined`. */
function paramChain(e: Expr, p: string): (string | undefined)[] | undefined {
  if (e.k === "id") return e.name === p ? [] : undefined;
  if (e.k === "member") { const c = paramChain(e.o, p); return c && [...c, e.p]; }
  if (e.k === "index") { const c = paramChain(e.o, p); return c && [...c, litKey(e.i)]; }
  return undefined;
}
const PRIM_OPS = new Set(["+", "-", "*", "/", "%", "**", "==", "!=", "===", "!==", "<", ">", "<=", ">=", "in", "instanceof", "&", "|", "^"]);
function paramUses(n: Expr | Stmt, p: string, tail: boolean, prim: boolean, u: ParamUses): void {
  const rest = (x: Expr | Stmt) => { for (const k of subExprs(x as Expr)) paramUses(k, p, false, false, u); };
  switch (n.k) {
    // statements (a `throw` is an expression's shape)
    case "expr": paramUses(n.e, p, false, true, u); return;                                // its value is dropped
    case "return": if (n.e) paramUses(n.e, p, true, false, u); return;
    case "sif": paramUses(n.c, p, false, true, u); for (const s of [...n.t, ...n.f]) paramUses(s, p, false, false, u); return;
    case "write": case "optimistic": for (const seg of n.target.path) if (typeof seg !== "string") paramUses(seg, p, false, false, u); paramUses(n.e, p, false, false, u); return;
    case "let": case "refresh": case "affects": case "action": case "for": case "try": rest(n); return;
  }
  const e = n as Expr;
  if (paramChain(e, p) !== undefined) { if (!(tail || prim)) u.any = true; return; }
  switch (e.k) {
    case "call": {
      const path = paramChain(e.f, p);
      if (path === undefined) paramUses(e.f, p, false, false, u);
      else if (path.some(k => k === undefined)) u.any = true;
      else { u.callees.push(path as string[]); u.passed.push(...e.args); }
      for (const a of e.args) paramUses(a, p, false, false, u);
      return;
    }
    case "fn":
      if (e.params.includes(p)) return;                                                    // another value under the name
      if (e.stmts) for (const st of e.stmts) paramUses(st, p, false, false, u); else paramUses(e.body, p, true, false, u);
      return;
    case "bin": { const pr = prim || PRIM_OPS.has(e.op); paramUses(e.l, p, tail && !pr, pr, u); paramUses(e.r, p, tail && !pr, pr, u); return; }
    case "un": paramUses(e.e, p, false, true, u); return;
    case "tpl": for (const part of e.parts) if (typeof part !== "string") paramUses(part, p, false, true, u); return;
    case "if": paramUses(e.c, p, false, true, u); paramUses(e.t, p, tail, prim, u); paramUses(e.f, p, tail, prim, u); return;
    case "index": paramUses(e.o, p, false, false, u); paramUses(e.i, p, false, true, u); return;
    default: rest(e);
  }
}
/** Every provision a program writes, by its context's name, and every name it declares by `action`: read from the text. */
function providesIn(decls: Decl[], view: Markup[], provided: Map<string, Expr[]>, actions: Set<string>): void {
  for (const d of decls) {
    if (d.k === "provide") { if (!provided.has(d.name)) provided.set(d.name, []); provided.get(d.name)!.push(d.e); }
    else if (d.k === "action") actions.add(d.name);
    else if (d.k === "component") providesIn(d.decls, d.view, provided, actions);
    else if (d.k === "fn") providesIn(d.decls, [], provided, actions);
  }
  for (const m of view) switch (m.k) {
    case "el": providesIn([], m.children, provided, actions); break;
    case "mif": providesIn(m.tDecls, m.t, provided, actions); providesIn(m.fDecls, m.f, provided, actions); break;
    case "mfor": case "mview": case "portal": providesIn(m.decls, m.body, provided, actions); break;
    case "loading": case "errored": providesIn([], m.fallback, provided, actions); providesIn(m.decls, m.body, provided, actions); break;
  }
}
type RecFields = Extract<Expr, { k: "rec" }>["fields"];
function recField(fields: RecFields, key: string): Expr | undefined {
  if (fields.some(f => "spread" in f)) return undefined;
  const hit = fields.filter(f => !("spread" in f) && f.key === key);
  return hit.length === 1 ? (hit[0] as { v: Expr }).v : undefined;
}
/** A slot of a literal written where it is read: `[clock, 5][1]` is `5`, `{ a: x, b: y }.b` is `y`. Only what the
 *  expression itself says: no spread before the slot, one field of that name. */
function literalPart(e: Expr): Expr | undefined {
  if (e.k === "index") {
    if (e.o.k === "arr" && e.i.k === "lit" && typeof e.i.v === "number") { const k = litKey(e.i); if (k === undefined) return undefined; const n = Number(k); if (e.o.items.slice(0, n + 1).some(x => x.k === "spread")) return undefined; return e.o.items[n]; }
    if (e.o.k === "rec") { const k = litKey(e.i); return k === undefined ? undefined : recField(e.o.fields, k); }
    return undefined;
  }
  if (e.k === "member" && e.o.k === "rec") return recField(e.o.fields, e.p);
  return undefined;
}
function flows(e: Expr, bound: Set<string>, locals: Map<string, Set<string>>, builtin: Look, out: Set<string>): void {
  const go = (x: Expr) => flows(x, bound, locals, builtin, out);
  // what its declaration says is a primitive holds nothing (a declared scalar field, what a declared method answers)
  if ((e.k === "member" || e.k === "index" || e.k === "call") && (() => { const n = pathRoot(e); return n !== undefined && !bound.has(n) && !locals.has(n); })() && builtin.prim(e)) return;
  switch (e.k) {
    case "lit": case "tpl": case "un": case "pending": case "stylemap": case "serverfn": return;
    case "id": { const l = locals.get(e.name); if (l) { for (const n of l) out.add(n); } else if (!bound.has(e.name)) out.add(e.name); return; }
    case "pre": if (!bound.has(e.name)) out.add(e.name); if (e.init) go(e.init); return;
    case "use": out.add(`use:${e.name}`); return;
    case "peek": case "latest": case "spread": case "omit": case "throw": go(e.e); return;
    case "await": go(e.e); if (e.init) go(e.init); return;
    case "bin": if (e.op === "??" || e.op === "||" || e.op === "&&") { go(e.l); go(e.r); } return;
    case "if": go(e.t); go(e.f); return;
    case "member": case "index": {                                                         // a slot of a literal written here is that slot: `[clock, 5][1]` is `5`
      const lp = literalPart(e); if (lp) { go(lp); return; }
      go(e.o);
      return;
    }
    case "call": if (e.f.k === "id" && scalar(e.f.name, bound.has(e.f.name) || locals.has(e.f.name) || !builtin.builtin(e.f.name))) return; go(e.f); e.args.forEach(go); return;
    case "arr": e.items.forEach(go); return;
    case "rec": for (const f of e.fields) go("spread" in f ? f.spread : f.v); return;
    case "fn": {
      const ps = e.params.map(p => p.replace(/^\.\.\./, "")); const b = new Set([...bound, ...ps]); const ls = new Map(locals); for (const p of ps) ls.delete(p);
      if (e.stmts) flowsReturns(e.stmts, b, ls, builtin, out); else flows(e.body, b, ls, builtin, out);
      return;
    }
    case "catch": { go(e.e); if (e.name) { const ls = new Map(locals); ls.delete(e.name); flows(e.alt, new Set([...bound, e.name]), ls, builtin, out); } else go(e.alt); return; }
    case "draft": {
      go(e.seed); const b = new Set([...bound, "d"]); const ls = new Map(locals); ls.delete("d");
      for (const s of e.body) {
        if (s.k === "let") { const v = new Set<string>(); flows(s.e, b, ls, builtin, v); b.delete(s.name); ls.set(s.name, v); }
        else if (s.k === "write") flows(s.e, b, ls, builtin, out);
      }
      return;
    }
  }
}
/** What a statement body returns (`flows`): each `return`'s value, its `let`s standing for their values. */
function flowsReturns(ss: Stmt[], bound: Set<string>, locals: Map<string, Set<string>>, builtin: Look, out: Set<string>): void {
  for (const s of ss) {
    switch (s.k) {
      case "let": { const v = new Set<string>(); flows(s.e, bound, locals, builtin, v); bound.delete(s.name); locals.set(s.name, v); break; }
      case "return": if (s.e) flows(s.e, bound, locals, builtin, out); break;
      case "sif": flowsReturns(s.t, new Set(bound), new Map(locals), builtin, out); flowsReturns(s.f, new Set(bound), new Map(locals), builtin, out); break;
      case "for": { const v = new Set<string>(); flows(s.e, bound, locals, builtin, v); const b = new Set(bound); const ls = new Map(locals); b.delete(s.name); ls.set(s.name, v); flowsReturns(s.body, b, ls, builtin, out); break; }
      case "action": flowsReturns(s.body, new Set(bound), new Map(locals), builtin, out); break;
      case "try": {
        flowsReturns(s.body, new Set(bound), new Map(locals), builtin, out);
        if (s.handler) { const b = new Set(bound); const ls = new Map(locals); if (s.catchName) { b.add(s.catchName); ls.delete(s.catchName); } flowsReturns(s.handler, b, ls, builtin, out); }
        if (s.fin) flowsReturns(s.fin, new Set(bound), new Map(locals), builtin, out);
        break;
      }
    }
  }
}
/** What an `.rx` fn gives (`flows`): its tail, its own equations and sources standing for their values, its parameters for
 *  nothing. */
function flowsFn(params: Param[], decls: Decl[], tail: Expr, builtin: Look, out: Set<string>): void {
  const bound = new Set(params.map(p => p.name)); const locals = new Map<string, Set<string>>();
  for (const d of decls) if ("name" in d) bound.add(d.name);
  // equations may be read before they are written: to a fixpoint (a name gives what any name it reads gives)
  for (;;) {
    let grew = false;
    for (const d of decls) {
      if (d.k !== "eq" && d.k !== "source") continue;
      const v = new Set<string>(); const b = new Set(bound); for (const k of locals.keys()) b.delete(k);
      flows(d.k === "eq" ? d.e : d.init, b, locals, builtin, v);
      let old = locals.get(d.name); if (!old) { old = new Set(); locals.set(d.name, old); }
      const n0 = old.size; for (const x of v) old.add(x); if (old.size !== n0) grew = true;
    }
    if (!grew) break;
  }
  for (const k of locals.keys()) bound.delete(k);
  flows(tail, bound, locals, builtin, out);
}
/** Free names outside `peek` — the reads that make an initializer a snapshot (E-4). */
/** RFC 14: the names read outside `peek` at the root of a field or index read (`size.width`, `todos.items[0]`): a
 *  primitive's instance never changes, but what is read through it tracks (MO-10b); a method called on it is not a read
 *  of a field. */
/** A method callee: `o.p`, or `o["p"]` — a literal key names the method as a dot does (RFC 14, 34). */
function methodCallee(f: Expr): { o: Expr; p: string } | undefined {
  if (f.k === "member") return { o: f.o, p: f.p };
  if (f.k === "index" && !(f.i.k === "lit" && typeof f.i.v === "number")) { const p = litKey(f.i); if (p !== undefined) return { o: f.o, p }; }
  return undefined;
}
function rootedReads(e: Expr, out: Set<string>): void {
  if (e.k === "peek" || e.k === "fn") return;
  const mc = e.k === "call" ? methodCallee(e.f) : undefined;
  if (e.k === "call" && mc) {                                            // a method called on the instance (`route.addChildren(…)`) reads
    if (mc.o.k !== "id") rootedReads(mc.o, out);                         // no field of it; a field on the way does (`a.b.m()` reads b)
    for (const x of e.args) rootedReads(x, out);
    return;
  }
  if (e.k === "member" || e.k === "index") {
    let x: Expr = e; while (x.k === "member" || x.k === "index") { if (x.k === "index") rootedReads(x.i, out); x = x.o; }
    if (x.k === "id") out.add(x.name); else rootedReads(x, out);
    return;
  }
  for (const v of Object.values(e as object)) {
    if (Array.isArray(v)) v.forEach(x => { if (x && typeof x === "object") { if ("k" in x) rootedReads(x as Expr, out); else if ("v" in x) rootedReads((x as { v: Expr }).v, out); else if ("spread" in x) rootedReads((x as { spread: Expr }).spread, out); } });
    else if (v && typeof v === "object" && "k" in (v as object)) rootedReads(v as Expr, out);
  }
}
/** MO-11g: a JS fn that, called among a factory's arguments, hands the components it is given on to the factory — one
 *  declared (or imported) `pure` that makes nothing: it keeps nothing, and what it is given comes back only in its result
 *  (MO-10k's reading of `pure` at the JS boundary). An io fn, or one that instantiates, may keep or render them itself. */
const handsOn = (g: Sym | undefined): boolean => !!g && g.kind === "import" && !!g.pureFn;
/** RFC 14 (bounded, 2026-11-21): the methods called on a name outside `peek` and closures (`route.addChildren(…)`):
 *  a method of a stable instance is a call whose answer may change (E-10). */
function methodCalls(e: Expr, out: [string, string][]): void {
  if (e.k === "peek" || e.k === "fn") return;
  const m = e.k === "call" ? methodCallee(e.f) : undefined;
  if (m && m.o.k === "id") out.push([m.o.name, m.p]);
  for (const x of subExprs(e)) methodCalls(x, out);
}
function readsOutsidePeek(e: Expr, out: Set<string>): void {
  if (e.k === "peek") return;
  if (e.k === "fn") return;                                             // a closure literal reads nothing now
  const tmp = new Set<string>();
  switch (e.k) {
    case "id": out.add(e.name); return;
    case "pre": out.add(e.name); return;
    default: {
      for (const v of Object.values(e as object)) {
        if (Array.isArray(v)) v.forEach(x => { if (x && typeof x === "object") { if ("k" in x) readsOutsidePeek(x as Expr, out); else if ("v" in x) readsOutsidePeek((x as { v: Expr }).v, out); else if ("spread" in x) readsOutsidePeek((x as { spread: Expr }).spread, out); } });
        else if (v && typeof v === "object" && "k" in (v as object)) readsOutsidePeek(v as Expr, out);
      }
      void tmp;
    }
  }
}
/** The expressions directly under `e` (a record's field values and spreads included). */
export function subExprs(e: Expr): Expr[] {
  const out: Expr[] = [];
  for (const v of Object.values(e as object)) {
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x === "object") { if ("k" in x) out.push(x as Expr); else if ("v" in x) out.push((x as { v: Expr }).v); else if ("spread" in x) out.push((x as { spread: Expr }).spread); } }
    else if (v && typeof v === "object" && "k" in (v as object)) out.push(v as Expr);
  }
  return out;
}
/** E-5a: the outermost `peek`s of an expression, outside closures (a closure's body is read when it is called). */
/** MO-11q, 07 §4: `<wardic.div>`, where wardic is a name of the module — a tag that begins with a small letter is an
 *  element's, and a member component is applied through a name with a capital. */
export function memberTagLowercase(tag: string): string {
  const head = tag.slice(0, tag.indexOf(".")); const cap = head[0].toUpperCase() + head.slice(1); const rest = tag.slice(head.length);
  return `<${tag}> is not ${head}'s member ${rest.slice(1)}: a tag is a component's by its capital (07 §4), so this is an element named "${tag}", which no element is — import ${head} under a capital, \`import { ${head} as ${cap} }\`, and apply the member, <${cap}${rest}> (declared \`export component ${tag}(…)\`, MO-11q)`;
}
/** MO-11a, MO-8k: what UNKNOWN_COMPONENT says for a JS import — where its declaration goes, and for a package how to draft one. */
export function unknownJsComponent(tag: string, from?: string): string {
  const pkg = from !== undefined && !from.startsWith(".") && !from.startsWith("/");
  return pkg
    ? `<${tag}> is imported from ${from}, which has no declaration: write rx-types/${from}.d.rx with \`export component ${tag}(props: { … })\`, or draft it from the package's types: \`npx rx-declare ${from} --out rx-types/${from}.d.rx\` (MO-8k, MO-11a)`
    : `<${tag}> is imported from JS, which declares no component ${tag}: declare it beside the module, \`export component ${tag}(props: { … })\` (MO-11a)`;
}

function peeksIn(e: Expr, out: Extract<Expr, { k: "peek" }>[] = []): Extract<Expr, { k: "peek" }>[] {
  if (e.k === "peek") { out.push(e); return out; }
  if (e.k === "fn" || e.k === "serverfn") return out;
  for (const x of subExprs(e)) peeksIn(x, out);
  return out;
}
/** E-5a: whether a value can change: by what this module sees (`yes`), or only if one of `deps` does — a prop of a component
 *  (`prop|file#Comp|field`, `*` for all of them), a context's provisions (`ctx|key`), an .rx module's export (`exp|file#name`). */
type Ch = { yes: boolean; deps: Set<string> };
const noCh = (): Ch => ({ yes: false, deps: new Set() });
/** E-5a: what a module tells the whole-program pass — the arguments its applications give each prop, its provisions, its
 *  exports, the components it passes as values (their props come from JS), and the kept peeks that wait on the rest. */
export type PeekFacts = { apps: { key: string; field: string; ch: Ch }[]; provs: { key: string; ch: Ch }[]; exports: { key: string; ch: Ch }[];
  escapes: string[]; exported: string[]; aliases: [string, string][]; deferred: { line: number; peek: Expr; p: Ch; o: Ch }[] };
const keptMsg = (p: Extract<Expr, { k: "peek" }>, why: string) => `\`${show(p)}\` is kept where it is read, but ${why} — it would keep its first value: drop peek to read it live, or name the snapshot, \`source saved := ${show(p)}\``;
/** E-5a: why a kept peek's value can change, when this module alone cannot tell that it does not. */
function whyOf(p: Extract<Expr, { k: "peek" }>, c: Ch): string {
  const what = show(p.e); const d = [...c.deps];
  return c.yes ? `${what} changes` : d.some(x => x.startsWith("prop|")) ? `${what} ${d.some(x => x.startsWith("prop|") && what.includes(".") && x.split("|").pop() === what.slice(what.indexOf(".") + 1)) ? "is a prop" : "comes from a prop"}: the parent can change it` :   // `props.value` is the prop; `r.x`, a row of `props.rows`, comes from one
     d.some(x => x.startsWith("ctx|")) ? `${what} reads a provision, which can change` : `${what} is imported and can change`;
}
/** E-5a, the whole-program pass: each prop, provision and export changes when what can reach it does (a least fixpoint);
 *  then each kept peek that waited on them is decided. A component the entry exports, or one passed as a value, is applied by
 *  JS: its props can change. A module known only by its signature (MO-9) is not seen: what comes from it can change. */
function resolvePeeks(all: [string, PeekFacts][], set: ModuleSet, hosts: string[] = []): Diagnostic[] {   // hosts: modules a JS host imports with ?rx-lib (CP-4d): their exported components are applied by JS
  const alias = new Map<string, string>(); for (const [, f] of all) for (const [a, b] of f.aliases) alias.set(a, b);
  const K = (k: string) => alias.get(k) ?? k;
  const seen = (k: string) => set.programs.has(k.split("#")[0]);
  const escapes = new Set<string>(); for (const [path, f] of all) { for (const k of f.escapes) escapes.add(K(k)); if (path === set.entry || hosts.includes(path)) for (const k of f.exported) escapes.add(K(k)); }
  const apps = all.flatMap(([, f]) => f.apps); const provs = all.flatMap(([, f]) => f.provs); const exps = new Map(all.flatMap(([, f]) => f.exports.map(x => [x.key, x.ch] as [string, Ch])));
  const truth = new Set<string>();
  const val = (c: Ch) => c.yes || [...c.deps].some(d => truth.has(d));
  const nodes = new Set<string>();
  for (const c of [...apps.map(a => a.ch), ...provs.map(p => p.ch), ...exps.values(), ...all.flatMap(([, f]) => f.deferred.flatMap(x => [x.p, x.o]))]) for (const d of c.deps) nodes.add(d);
  const holds = (n: string): boolean => {
    const [kind, key0, field] = n.split("|"); const key = K(key0);
    if (!seen(key)) return true;
    if (kind === "prop") return escapes.has(key) || apps.some(a => K(a.key) === key && (field === "*" || a.field === field || a.field === "*") && val(a.ch));
    if (kind === "ctx") return provs.some(p => p.key === key && val(p.ch));
    const x = exps.get(key); return !x || val(x);
  };
  for (let grew = true; grew;) { grew = false; for (const n of nodes) if (!truth.has(n) && holds(n)) { truth.add(n); grew = true; } }
  const out: Diagnostic[] = [];
  for (const [path, f] of all) for (const x of f.deferred) {
    if (!val(x.p) || val(x.o)) continue;
    const d: Diagnostic = { code: "SNAPSHOT_KEPT", rule: "E-5a", line: x.line, msg: keptMsg(x.peek as Extract<Expr, { k: "peek" }>, `${show((x.peek as Extract<Expr, { k: "peek" }>).e)} changes`), file: path };
    if (!out.some(y => y.file === d.file && y.line === d.line && y.msg === d.msg)) out.push(d);
  }
  return out;
}
const mapsIntoRecords = (e: Expr): boolean => {                         // `map(xs, x => ({…}))` / `xs.map(x => ({…}))`
  if (e.k !== "call") return false;
  const fnArg = e.f.k === "id" && e.f.name === "map" ? e.args[1] : e.f.k === "member" && e.f.p === "map" ? e.args[0] : undefined;
  return !!fnArg && fnArg.k === "fn" && !fnArg.stmts && fnArg.body.k === "rec";
};
/** SV-7b: the provision a `loading` region makes for its content — what a reader of a client question needs above it. */
const HOLD = "$hold";
/** 12 SF-1d: the server fn a declaration's value is — itself, or wrapped by calls (\`GET(server fn …)\`, \`live(GET(…))\`). */
export function unwrapServer(e: Expr): Extract<Expr, { k: "serverfn" }> | null {
  if (e.k === "serverfn") return e;
  if (e.k === "call") { const inner = e.args.map(unwrapServer).filter(Boolean); return inner.length === 1 ? inner[0] : null; }
  return null;
}
const ROW_WORDS = /^((?:io|pending|lane|fails\([^)]*\))\s+)+/;

// ---------------------------------------------------------------- the checker
/** MO-13i: a value that asks, or keeps what it was, is one equation's: its parts are read off that equation. */
function asksOrKeeps(x: unknown): boolean {
  if (!x || typeof x !== "object") return false;
  if (Array.isArray(x)) return x.some(asksOrKeeps);
  const k = (x as { k?: string }).k;
  return k !== "fn" && (k === "await" || k === "pre" || k === "draft" || k === "omit" || Object.values(x).some(asksOrKeeps));
}
/** MO-13i: what a fn's result is made of. An action; one value, read (`reader`: it changes, with the rows it is read with) or
 *  plain (made once), and the parts of it that are actions; a record or a tuple of such. */
export type Result =
  | { k: "io" }
  | { k: "leaf"; reader: boolean; rows: string[]; fails: string[]; actions: string[] }
  | { k: "rec"; fields: [string, Result][] }
  | { k: "arr"; items: Result[] };
/** MO-3: what an importer sees of each export — rows, parameters, and for a component its summary. Never its body. */
export type ExportSig =
  | { kind: "source"; question: boolean; rows: string[]; fails: string[] }
  | { kind: "eq"; rows: string[]; fails: string[]; io: boolean; actions?: string[] }
  | { kind: "fn"; /** 07 §2: `<T>`, as text */ tparams?: string; params: { name: string; ref: boolean }[]; instantiating: boolean; rows: string[]; fails: string[]; rejects: string[]; /** MO-13i: the parts of its result, where they are known */ result?: Result; /** R-io-3: the parts of its result that are actions, as paths ("": the result) */ actions?: string[]; /** RG-7b: the contexts a call of it reads above the place it is written (keys) */ uses?: string[]; /** MO-9b, W2: the paths of its parameters it calls while it runs, `p` or `p.path` (`calls(f, xs.*)`) */ calls?: string[] }
  | { kind: "action" }
  | { kind: "server"; io: boolean; params: string[]; rejects: string[] }   // 12 SF-1c
  | { kind: "errclass"; params: string[] }
  | { kind: "comp"; sig: CompSig }
  | { kind: "context"; key: string; source: boolean; dflt: boolean; rows: string[]; fails: string[]; type?: string }
  | { kind: "type"; /** what it stands for (RG-4c), where a signature can hold it */ text?: string; /** 07 §2: `<T>`, as text */ tparams?: string };                                                                   // `export type T`: importable, binds no value (MO-6c)   // an exported context: its written type is the contract (RG-7e)
export type ModSig = { file: string; exports: Map<string, ExportSig>; hosted?: Hosted[]; hosts?: Record<string, HostSite[]> };   // MO-11u: hosted, the calls of `renders(H)` fns that were given components; hosts, the applications of such an H the module itself roots (its mounted view, a root of a library's own)
type Opts = { sigs?: Map<string, ModSig>; file?: string; declarations?: Map<string, JsDecl[]>; spa?: boolean; whole?: boolean; hosted?: boolean; dependency?: boolean; through?: Set<string>; placed?: Set<string>; under?: Set<string>; conformance?: boolean; /** what the module's types stand for, its own and what it imports from `.rx` */ types?: Types };   // placed, under: MO-14h — the components a host's view places (`module#Name`), and the JS components its declaration says the host renders through: a component given to a fn that `renders(H)`, H among them, is checked where the view places it   // through: MO-14f, in a host's view — the JS components the host renders through (`declaration#Name`)   // dependency: MO-1c, the module is not the program's entry: its default component is a component like any other, mounted by no one   // hosted: MO-14d, a JS host renders the module's components: its default component is no mounted view   // whole: E-5a, the modules checked are the whole program   // spa: 08 CN-3d, a client-only build

export function check(p: Program, opts: Opts = {}): Diagnostic[] { const c = new Checker(opts); c.run(p); return [...c.diags, ...judgeHosted([c.signature(p)], [], !!opts.spa)]; }
export function checkWithSignature(p: Program, opts: Opts = {}): { diags: Diagnostic[]; advice: Diagnostic[]; sig: ModSig; model: Model; peeks: PeekFacts } { const c = new Checker(opts); c.run(p); return { diags: c.diags, advice: c.advice, sig: c.signature(p), model: c.model.build(opts.file ?? "main.rx"), peeks: c.peekFacts(p) }; }
/** CN-4b / MO-3: check every module of a program, dependencies first, each against its imports' signatures only. */
export function checkModules(set: ModuleSet, spa = false, whole = false, hosts: string[] = [], judge = true): { diags: Diagnostic[]; advice: Diagnostic[]; sigs: Map<string, ModSig>; models: Map<string, Model> } {   // whole: E-5a, the modules are the whole program   // judge: MO-11u, this set is the program (a host's view is judged with the program it is the view of)
  const sigs = new Map<string, ModSig>(set.signatures ?? []); const diags: Diagnostic[] = [...set.diags];   // MO-9: a module known by its .d.rx
  const models = new Map<string, Model>();                              // CP-6: each module's resolved model
  const hostSigs: ModSig[] = [];   // MO-11u: the modules of a host's view (MO-14), judged with this program
  const facts: [string, PeekFacts][] = []; const advice: Diagnostic[] = [];   // advice: 99, the advisory rows — about a correct program, never an error
  for (const path of set.order) { const r = checkWithSignature(set.programs.get(path)!, { sigs, file: path, declarations: set.declarations, spa, whole, hosted: !!set.hosted?.has(path), dependency: path !== set.entry, through: set.through, placed: set.placed, under: set.under, conformance: set.conformance, types: typesOf(set, path) }); diags.push(...r.diags); advice.push(...r.advice); sigs.set(path, r.sig); models.set(path, r.model); facts.push([path, r.peeks]); }
  // MO-14d: a module the host's declaration imports is one a JS host renders (CP-4d), whatever the build found
  if (whole) { const all = [...new Set([...hosts, ...(set.hosted ?? [])])]; diags.push(...resolvePeeks(facts, set, all)); diags.push(...hostExports(sigs, all, spa, set.placed)); }
  if (set.host) {   // MO-14c: the host's view, checked as a program of its own; what it says is the declaration's
    const h = checkModules(set.host.set, spa, whole, hosts, false); for (const [p, x] of h.sigs) if (!sigs.has(p)) hostSigs.push(x); const at = (d: Diagnostic): Diagnostic => (d.file ?? set.host!.entry) === set.host!.entry ? { ...d, file: set.host!.file } : d;
    const key = (d: Diagnostic) => `${d.file ?? set.entry}\0${d.line}\0${d.code}\0${d.msg}`; const have = new Set(diags.map(key)); const said = new Set(advice.map(key));
    for (const d of h.diags.map(at)) if (!have.has(key(d))) { have.add(key(d)); diags.push(d); }
    for (const d of h.advice.map(at)) if (!said.has(key(d))) { said.add(key(d)); advice.push(d); }
  }
  // MO-11u: what the components given to a fn declared `renders(H)` need is judged at the program, at every application
  // of H in it — in whichever module the call and the application are (a component's `uses` is judged at its application)
  if (judge) {
    const hostedBy = [...new Set([...hosts, ...(set.hosted ?? [])])].flatMap(h => [...(sigs.get(h)?.exports ?? [])].flatMap(([n, x]) => x.kind === "comp" && !set.placed?.has(`${h}#${n}`) && x.sig.hosts ? [x.sig.hosts] : []));   // CP-4d: a component a JS host applies, with nothing above it
    const have = new Set(diags.map(d => `${d.file ?? set.entry}\0${d.line}\0${d.code}\0${d.msg}`));
    for (const d of judgeHosted([...sigs.values(), ...hostSigs], hostedBy, spa)) { const k = `${d.file ?? set.entry}\0${d.line}\0${d.code}\0${d.msg}`; if (!have.has(k)) { have.add(k); diags.push(d); } }
  }
  return { diags, advice, sigs, models };
}

/** MO-11u: a fn declared `renders(H)` hands the components it is given to H, which renders them later, any number of times,
 *  among its children. So each is checked as applied there, with no arguments, at every application of H in the program:
 *  what it lets out of H's children (its failures, the contexts it uses, a first load it waits on) must be discharged
 *  above one of them: which application a call is for is the library's to say (an id, the nearest), so a need that one
 *  application meets is let be (revised 2026-11-24). With no application of H anywhere, nothing renders them yet, and they are held to the least H could
 *  have above it: what H itself uses and provides (already taken off), under a root of its own (MO-11s). */
export function judgeHosted(sigs: ModSig[], extra: Record<string, HostSite[]>[], spa: boolean): Diagnostic[] {
  const sites = new Map<string, HostSite[]>(); const seen = new Set<string>();
  const add = (r?: Record<string, HostSite[]>) => { for (const [k, xs] of Object.entries(r ?? {})) sites.set(k, [...(sites.get(k) ?? []), ...xs]); };
  for (const s of sigs) { if (seen.has(s.file)) continue; seen.add(s.file); add(s.hosts); }
  for (const r of extra) add(r);
  // a component given to such a fn may itself apply a host (a routed layout with the app's `<Toaster />` in it): that
  // place is wherever its own host renders it — what is above it there, and what is above the host — to a fixed point
  const calls: Hosted[] = []; seen.clear();
  for (const s of sigs) { if (seen.has(s.file)) continue; seen.add(s.file); calls.push(...(s.hosted ?? [])); }
  for (let changed = true; changed;) {
    changed = false;
    for (const h of calls) for (const [k, xs] of Object.entries(h.inner ?? {})) for (const b of [...(sites.get(h.host) ?? [])]) for (const x of xs) {
      const y: HostSite = { f: joinCatch(x.f, b.f), p: joinCatch(x.p, b.p) }; const cur = sites.get(k) ?? [];
      if (!cur.some(z => siteKeyOf(z) === siteKeyOf(y))) { cur.push(y); sites.set(k, cur); changed = true; }
    }
  }
  const out: Diagnostic[] = []; seen.clear();
  for (const s of sigs) {
    if (seen.has(s.file)) continue; seen.add(s.file);
    for (const h of s.hosted ?? []) {
      const at = sites.get(h.host) ?? []; const none = !at.length; const xs = none ? [{ f: new Set<string>(), p: new Set<string>() } as HostSite] : at;
      const where = none
        ? `${h.fn}() is declared \`renders(${h.name})\`, and the program applies <${h.name}> nowhere: what it is given is checked under a root of its own, with what <${h.name}> itself uses and provides (MO-11u, MO-11s)`
        : `${h.fn}() is declared \`renders(${h.name})\`: what it is given is rendered beneath <${h.name}>, and no place the program applies it has that above it (MO-11u)`;
      const file = s.file ? { file: s.file } : {};
      for (const cls of h.fails) if (xs.every(x => !caught(x.f, cls))) out.push({ code: "UNHANDLED_FAILURE", rule: "R-f-5", line: h.line, msg: `a component given to ${h.fn}() can fail with ${cls} where it renders, and no errored boundary above ${none ? "it" : `any application of <${h.name}>`} discharges ${cls} — ${where}: put <${h.name}> under \`errored fallback(e${cls === "Error" ? "" : `: ${cls}`}) { … } { … }\`, or catch it inside the component`, ...file });
      for (const k of h.requires) {
        if (xs.some(x => x.p === "all" || x.p.has(k))) continue;
        if (k === HOLD) out.push({ code: spa ? "ASYNC_OUTSIDE_LOADING_BOUNDARY" : "CLIENT_QUESTION_UNHELD", rule: spa ? "CN-3d" : "SV-7b", line: h.line, msg: `a reader in a component given to ${h.fn}() can have no value yet, and no \`loading\` region above ${none ? "it" : `any application of <${h.name}>`} holds it — ${where}: put <${h.name}> under \`loading fallback { … } { … }\`, or the reader under one inside the component`, ...file });
        else out.push({ code: "CONTEXT_NOT_FOUND", rule: "RG-7b", line: h.line, msg: `a component given to ${h.fn}() uses ${keyName(k)} (declared in ${k.split("#")[0].split("/").pop()}), and no provision of it is above ${none ? "it" : `any application of <${h.name}>`} — ${where}: provide it above <${h.name}>, or give the component the value as a prop`, ...file });
      }
    }
  }
  return out;
}

/** 11 CP-4d: a component a JS host renders (`pages.rx?rx-lib`) is applied where the checker cannot see, so nothing above
 *  it is credited to it — the cautious placement (09 MO-11s), a root of its own. What its summary lets out of its root is
 *  therefore unhandled: a failure no boundary of its own discharges, a context nothing in it provides, a first load
 *  nothing in it holds. */
function hostExports(sigs: Map<string, ModSig>, hosts: string[], spa: boolean, placed?: Set<string>): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const h of hosts) for (const [name, x] of sigs.get(h)?.exports ?? []) {
    if (x.kind !== "comp") continue;
    if (placed?.has(`${h}#${name}`)) continue;   // MO-14d: the host's declaration says where it renders this one
    const why = `${name} is exported from a module a JS host renders (\`?rx-lib\`): JS applies it where the checker cannot see, so no boundary or provision above it is credited (CP-4d)`;
    for (const o of x.sig.own) { const n = Number(o.at?.split(":").pop()); out.push({ code: "UNHANDLED_FAILURE", rule: "R-f-5", line: Number.isInteger(n) ? n : 1, msg: `a reader of ${o.what} (in <${name}>) can fail with ${o.cls} and no catch or errored boundary inside ${name} discharges it — ${why}: show it where it is read, \`errored fallback(e) { … } { … }\` inside the component`, file: h }); }
    for (const k of x.sig.requires) {
      if (k === HOLD) out.push({ code: spa ? "ASYNC_OUTSIDE_LOADING_BOUNDARY" : "CLIENT_QUESTION_UNHELD", rule: spa ? "CN-3d" : "SV-7b", line: 1, msg: `a reader in <${name}> can have no value yet, and no \`loading\` region inside ${name} holds it — ${why}: put the reader under \`loading fallback { … } { … }\` inside the component`, file: h });
      else out.push({ code: "CONTEXT_NOT_FOUND", rule: "RG-7b", line: 1, msg: `use ${keyName(k)} (in <${name}>): no provision of it inside ${name} — ${why}: provide it inside the component, or take the value as a prop`, file: h });
    }
  }
  return out;
}

class Checker {
  diags: Diagnostic[] = [];
  advice: Diagnostic[] = [];                                             // 99, the advisory rows: what the checker says about a correct program
  model = new ModelBuilder();                                           // CP-6: the resolved facts, recorded as the walk resolves them
  private opts: Opts;
  private rootEnv: Env | null = null;
  constructor(opts: Opts = {}) { this.opts = opts; }
  private line = 1;
  private seq = 0;
  private hookCalls: { region: Region; fn: Sym; line: number; display: string }[] = [];   // the calls of fns that instantiate, each in its region (RG-6a)
  private uses: Use[] = [];   // name: the context's key
  // R-f: recorded during the walk, resolved after it (every symbol's thunks exist by then)
  private readers: { region: Region; e: Expr; env: Env; line: number }[] = [];
  // CN-3e: `loading on(…)` regions (the region made, its `on`) and effect inputs, by where they are
  private loadOns: { region: Region; e: Expr; env: Env; line: number }[] = [];
  private effectIns: { region: Region; e: Expr; env: Env; line: number }[] = [];
  private apps: { comp: Region; site: Region; line: number; tag: string; args: { field: string; e: Expr; env: Env }[]; passed: { field: string; e: Expr; env: Env }[] }[] = [];   // passed: every attribute, handlers too (O-3)
  private actions: { name: string; body: Stmt[]; env: Env; line: number }[] = [];
  private scalarAliases = new Set<string>();
  private handlers: { attrs: { name: string; e: Expr }[]; kids: Markup[]; h: Expr; env: Env; region: Region; line: number; what: string }[] = [];   // AC-3a: element handlers, by where they are
  private ownCtx: string[] = [];   // RG-7b: the contexts whose provision's expression is being read: a `use` of one there is what is above it
  private provisions: { key: string; e: Expr; env: Env; block?: Region }[] = [];   // block: of a context that holds a view, the region of its `provide`
  private textGiven = new Set<string>();                                                   // RG-4c: the contexts that hold a view and are given a value somewhere: text
  private carriedFns: { key: string; comp: Sym; view: string; block: Region }[] = [];       // RG-4c: `provide item = props.f` of a view with a parameter: the component, its prop, the block
  private shownUse: Expr | null = null;                                                    // RG-4c: the `use` of a context that holds a view that a reader shows
  private importSyms = new Set<Sym>();                                                     // MO-1d: what imports bound; a nested block may not shadow it
  private later: (() => void)[] = [];
  private compSyms = new Map<Region, Sym>();
  private rowsBusy = new Set<string>();
  private retains = new Map<Region, Map<string, Set<string>>>();   // O-3: per component, the props it stores where they outlive it — "d:<depth>" (a source), "p:<key>" (a provision above)
  private nss: string[] = [];   // MO-6d: the module's namespaces; a member is `Select$Item` to the checker and `Select.Item` to its reader
  private err(code: string, rule: string, msg: string) { for (const n of this.nss) { if (code === "UNBOUND" && msg.startsWith(`${n} is not declared here`)) msg = `${n} is a namespace (\`import * as ${n}\`): it is named as the first part of a tag or of a type, \`<${n}.Item>\`, and is no value (MO-6d)`; msg = msg.replaceAll(`${n}$`, `${n}.`); } if (!this.diags.some(d => d.code === code && d.line === this.line && d.msg === msg)) this.diags.push({ code, rule, line: this.line, msg, ...(this.opts.file ? { file: this.opts.file } : {}) }); }
  /** 99, the advisory rows: about a program that is accepted. */
  private advise(code: string, rule: string, msg: string) { if (!this.advice.some(d => d.code === code && d.line === this.line && d.msg === msg)) this.advice.push({ code, rule, line: this.line, msg, ...(this.opts.file ? { file: this.opts.file } : {}) }); }
  private region(parent: Region | null, kind: RegionKind, opts: { component?: boolean; provParent?: Region | null; name?: string } = {}): Region {
    const r: Region = { id: this.seq++, depth: parent ? parent.depth + 1 : 0, parent, component: null, isComponentRoot: !!opts.component, provParent: opts.provParent === undefined ? parent : opts.provParent, appSites: [], provides: new Set() };
    r.component = opts.component ? r : parent?.component ?? null;
    this.model.region(r.id, kind, parent, opts.name);
    return r;
  }
  /** CP-6: a computation the walk enters — its reads, writes and calls are recorded on it. */
  private comp(kind: CompKind, env: Env, info: { name?: string; at?: string }, f: () => void) { this.model.within(kind, env.region, this.line, info, f); }
  /** CP-6: a symbol bound in `env`, recorded for the model. */
  private bind(env: Env, name: string, sym: Sym) { env.vars.set(name, sym); this.model.sym(sym); }

  private program?: Program;
  run(p: Program) {
    this.nss = p.decls.flatMap(d => d.k === "import" && d.ns ? [d.ns] : []);
    this.program = p;
    { const f = scopeFacts(p); this.argCalls = f.argCalls; this.idCounts = f.mentions; } this.throughPre(p);
    const root = new Env(null, this.region(null, "program"), !!this.opts.conformance); this.rootEnv = root;
    if (p.legacyView) { this.line = p.view[0]?.line ?? 1; this.err("TOP_LEVEL_MARKUP", "MO-1c", "markup at a module's top level: a module is declarations; the app's view is a component — `export default component App() { … }`"); }
    // MO-1c: the runtime mounts the entry's default component, and no other module's — a dependency's is applied where an
    // importer applies it. MO-14d: a hosted module's is rendered by the host, where its declaration says
    const view = this.opts.hosted || this.opts.dependency ? [] : p.view;
    providesIn(p.decls, view, this.provided, this.actionNames);
    this.block(p.decls, view, root, { scope: "reactive" });
    this.later.push(() => this.contentCheck(view, root, []));
    for (const f of this.later) f();
    this.retained(); this.viewsStored();
    this.resolveTree();
    this.loadingOnOutside();
    this.guessWhileLoading();
    this.keptPeekCheck();
    this.litCheck();
  }

  // ---- AC-3a: a guess a click can make while its value loads a new question ----
  /** A guess composes on the value as it stands. If a click can run `guess x := …` while `x` is loading a new question that
   *  the click itself started (its question reads what the click reads), the guess sits on the previous answer and the new
   *  answer replaces it, so the change disappears while it is out (D-34; Solid's OPTIMISTIC_WRITE_WHILE_LOADING, at run time).
   *  Covered when the element is inside a `loading` region whose content reads `x`, or is disabled on `x` (a form: all its
   *  submit buttons are). Mirrors compiler/src/check.rs `guess_while_loading`. */
  private guessWhileLoading() {
    type N = Expr | Stmt;
    const kidsOf = (n: N): N[] => {
      const out: N[] = [];
      for (const v of Object.values(n as object)) {
        if (Array.isArray(v)) { for (const x of v) if (x && typeof x === "object") { if ("k" in x) out.push(x as N); else if ("v" in x) out.push((x as { v: Expr }).v); else if ("spread" in x) out.push((x as { spread: Expr }).spread); } }
        else if (v && typeof v === "object" && "k" in (v as object)) out.push(v as N);
      }
      return out;
    };
    const depends = (e: Expr, env: Env, t: Sym, busy: Set<Sym>): boolean => {
      const go = (x: Expr): boolean => {
        if (x.k === "fn" || x.k === "serverfn") return false;
        if (x.k === "id") { const u = env.lookup(x.name); if (!u) return false; if (u === t) return true; return !!(u.expr && u.env && !busy.has(u) && (busy.add(u), depends(u.expr, u.env, t, busy))); }
        return subExprs(x).some(go);
      };
      return go(e);
    };
    const awaits = (t: Sym, busy: Set<Sym>): boolean => {
      if (!t.expr || !t.env || busy.has(t)) return false;
      busy.add(t);
      const env = t.env;
      const go = (x: Expr): boolean => {
        if (x.k === "fn" || x.k === "serverfn" || x.k === "peek") return false;
        if (x.k === "await") return true;
        if (x.k === "id") { const u = env.lookup(x.name); return !!u && u !== t && (u.kind === "eq" || u.kind === "source") && awaits(u, busy); }
        return subExprs(x).some(go);
      };
      return go(t.expr);
    };
    const asksAbout = (t: Sym, inputs: Sym[]) => !!t.expr && !!t.env && inputs.some(i => i !== t && !(i.expr && i.env && depends(i.expr, i.env, t, new Set())) && depends(t.expr!, t.env!, i, new Set()));
    const inside = (r: Region | null, anc: Region) => { for (let c = r; c; c = c.parent) if (c === anc) return true; return false; };
    const heldBy = (r: Region, t: Sym) => {
      for (let c: Region | null = r; c; c = c.parent) {
        if (c.provides.has(HOLD) && this.readers.some(rd => inside(rd.region, c!) && depends(rd.e, rd.env, t, new Set()))) return true;
        if (c.isComponentRoot) break;
      }
      return false;
    };
    const disabledOn = (attrs: { name: string; e: Expr }[], env: Env, t: Sym) => attrs.some(a => a.name === "disabled" && depends(a.e, env, t, new Set()));
    const submitButtons = (ms: Markup[], out: { name: string; e: Expr }[][]) => {
      for (const m of ms) {
        if (m.k === "el") { if (m.tag === "button" && !m.attrs.some(a => a.name === "type" && !(a.e.k === "lit" && a.e.v === "submit"))) out.push(m.attrs); submitButtons(m.children, out); }
        else if (m.k === "mif") { submitButtons(m.t, out); submitButtons(m.f, out); }
        else if (m.k === "mfor" || m.k === "mview" || m.k === "loading" || m.k === "errored" || m.k === "portal") submitButtons(m.body, out);
      }
    };
    const done = new Set<Expr>();
    for (const hr of this.handlers) {
      if (done.has(hr.h)) continue;
      done.add(hr.h);
      const submits: { name: string; e: Expr }[][] = [];
      if (hr.what === "<form> onSubmit") submitButtons(hr.kids, submits);
      // the bodies the click runs: the handler, and the actions it calls by name
      const bodies: { root: N; env: Env; via?: string }[] = [{ root: hr.h, env: hr.env }];
      const stack: N[] = [hr.h];
      while (stack.length) {
        const n = stack.pop()!;
        if (n.k === "call" && (n as Extract<Expr, { k: "call" }>).f.k === "id") {
          const name = ((n as Extract<Expr, { k: "call" }>).f as Extract<Expr, { k: "id" }>).name;
          const a = hr.env.lookup(name);
          if (a?.kind === "action") for (const act of this.actions) if (act.name === name && act.line === a.line) bodies.push(...act.body.map(st => ({ root: st as N, env: act.env, via: name })));
        }
        stack.push(...kidsOf(n));
      }
      // what the click is about: the names those bodies read, outside their own writes and guesses
      const inputs: Sym[] = [];
      for (const b of bodies) {
        const st: N[] = [b.root];
        while (st.length) {
          const n = st.pop()!;
          if (n.k === "optimistic" || n.k === "write") continue;
          if (n.k === "id") { const v = b.env.lookup((n as Extract<Expr, { k: "id" }>).name); if (v && (v.kind === "source" || v.kind === "eq" || v.kind === "value" || v.kind === "props") && !inputs.includes(v)) inputs.push(v); }
          st.push(...kidsOf(n));
        }
      }
      const seen = new Set<Sym>();
      for (const b of bodies) {
        const st: N[] = [b.root];
        while (st.length) {
          const n = st.pop()!;
          if (n.k === "optimistic") {
            const tn = (n as Extract<Stmt, { k: "optimistic" }>).target.name;
            const t = b.env.lookup(tn);
            if (t && !seen.has(t) && (seen.add(t), true)
              && awaits(t, new Set()) && asksAbout(t, inputs)
              && !disabledOn(hr.attrs, hr.env, t)
              && !(submits.length > 0 && submits.every(at => disabledOn(at, hr.env, t)))
              && !heldBy(hr.region, t)) {
              this.line = hr.line;
              this.err("GUESS_WHILE_LOADING", "AC-3a", `${hr.what} ${b.via ? `starts \`${b.via}\`, which can run` : "can run"} \`guess ${tn}\` while ${tn} is loading a new question (its question reads what the click reads): the guess composes on the previous answer, and the new answer replaces it, so the change disappears while it is out (D-34) — put the element inside the \`loading\` region whose content reads ${tn}, or give it \`disabled={pending? ${tn}}\`, or keep the pending change in a source of its own until it lands`);
            }
          }
          st.push(...kidsOf(n));
        }
      }
    }
  }

  // ---- CN-3e: an outside read holds a `loading on(…)` region's change ----
  /** A `loading on(k)` region re-arms when `k` changes, to show its fallback while what it waits on loads again. A reader
   *  outside the region of an equation that region waits on, and that `k` re-asks, holds the same change (nothing above it
   *  shows a fallback), so the region's fallback can never show: the change waits silently. Solid's dev build warns this at
   *  run time (LOADING_ON_OUTSIDE_HOLD); the checker sees it when both reads are in one component. A reader inside another
   *  region that re-arms on the same change shows that region's fallback and holds nothing. `latest`, `pending?` and
   *  `peek` reads hold nothing. */
  private loadingOnOutside() {
    const inside = (r: Region | null, anc: Region) => { for (let c = r; c; c = c.parent) if (c === anc) return true; return false; };
    type Key = { s: Sym; f?: string };
    const keysOf = (lo: { e: Expr; env: Env }): Key[] => {
      const out: Key[] = [];
      const go = (x: Expr): void => {
        if (x.k === "member" && x.o.k === "id") { const t = lo.env.lookup(x.o.name); if (t?.kind === "props") { out.push({ s: t, f: x.p }); return; } }
        if (x.k === "id") { const t = lo.env.lookup(x.name); if (t) out.push({ s: t }); return; }
        if (x.k === "fn") return;
        subExprs(x).forEach(go);
      };
      go(lo.e);
      return out;
    };
    const sameKey = (a: Key, b: Key) => a.s === b.s && a.f === b.f;
    const readsKey = (e: Expr, env: Env, k: Key, busy: Set<Sym>): boolean => {
      const go = (x: Expr): boolean => {
        if (x.k === "fn") return false;
        if (k.f !== undefined && x.k === "member" && x.p === k.f && x.o.k === "id" && env.lookup(x.o.name) === k.s) return true;
        if (x.k === "id") {
          const t = env.lookup(x.name); if (!t) return false;
          if (k.f === undefined && t === k.s) return true;
          return !!(t.expr && t.env && !busy.has(t) && (busy.add(t), readsKey(t.expr, t.env, k, busy)));
        }
        return subExprs(x).some(go);
      };
      return go(e);
    };
    const absentMemo = new Map<Sym, boolean>();
    const absent = (t: Sym, busy: Set<Sym>): boolean => {
      if (absentMemo.has(t)) return absentMemo.get(t)!;
      if (t.reader) return true; if (t.foreign === "fn" || t.foreign === "value") return false;   // MO-10: a reader may hold; a primitive's other parts are bound as they are
      if (!t.expr || !t.env || busy.has(t)) return false;
      busy.add(t);
      const env = t.env;
      const go = (x: Expr): boolean => {
        if (x.k === "fn" || x.k === "peek") return false;
        if (x.k === "await") return !x.init;
        if ((x.k === "member" || x.k === "index" || x.k === "call") && this.heldField(x, env)?.[1]) return true;   // MO-10l, MO-10f: a part that holds
        if (x.k === "id") { const u = env.lookup(x.name); return !!u && u !== t && (u.kind === "eq" || u.kind === "source") && (!!u.reader || absent(u, busy)); }   // MO-10d: a foreign reader may hold
        return subExprs(x).some(go);
      };
      const out = go(t.expr);
      busy.delete(t); absentMemo.set(t, out);
      return out;
    };
    const heldReads = (e0: Expr, env0: Env): Sym[] => {
      const out: Sym[] = []; const busy = new Set<Sym>(); const stack: [Expr, Env][] = [[e0, env0]];
      while (stack.length) {
        const [e, env] = stack.pop()!;
        const go = (x: Expr): void => {
          if (x.k === "fn" || x.k === "peek" || x.k === "latest" || x.k === "pending") return;
          if (x.k === "id") {
            const t = env.lookup(x.name);
            if (t && (t.kind === "eq" || t.kind === "source") && !busy.has(t)) { busy.add(t); if (absent(t, new Set())) out.push(t); if (t.expr && t.env) stack.push([t.expr, t.env]); }
            return;
          }
          subExprs(x).forEach(go);
        };
        go(e);
      }
      return out;
    };
    const allKeys = this.loadOns.map(keysOf);
    const found: { line: number; name: string; on: string }[] = [];
    this.loadOns.forEach((lo, li) => {
      const keys = allKeys[li];
      const rearmed = (r: Region) => this.loadOns.some((o, oi) => oi !== li && inside(r, o.region) && allKeys[oi].some(k => keys.some(q => sameKey(k, q))));
      const waits: Sym[] = [];
      for (const rd of this.readers) {
        if (!inside(rd.region, lo.region)) continue;
        for (const t of heldReads(rd.e, rd.env)) if (!waits.includes(t) && keys.some(k => (k.f === undefined && t === k.s) || (!!t.expr && !!t.env && readsKey(t.expr, t.env, k, new Set())))) waits.push(t);
      }
      for (const rd of [...this.readers, ...this.effectIns]) {
        if (inside(rd.region, lo.region) || rd.e === lo.e || rd.region.component !== lo.region.component || rearmed(rd.region)) continue;
        const held = heldReads(rd.e, rd.env);
        const t = waits.find(w => held.includes(w));
        if (t) found.push({ line: rd.line, name: t.name, on: show(lo.e) });
      }
    });
    for (const f of found) {
      this.line = f.line;
      this.err("LOADING_ON_OUTSIDE_HOLD", "CN-3e", `\`${f.name}\` is read here, outside the \`loading on(${f.on})\` region that waits on it: when \`${f.on}\` changes this read holds the change, so the region's fallback never shows and the old content stays up with no sign of the wait — move the read under the region, or read \`latest ${f.name}\` here`);
    }
  }

  // ---- blocks: declarations, then a view (02 §1, 03) ----
  private block(decls: Decl[], view: Markup[], env: Env, ctx: Ctx) {
    // 1. names (E-7: one declaration per name in a block)
    for (const d of decls) {
      this.line = d.line;
      if (d.k === "import") {
        for (const { alias } of d.names) if (env.vars.has(alias)) this.err("DUPLICATE_DECLARATION", "E-7", `${alias} is imported twice in one module: one name, one import (\`import { … as other }\`)`);   // 2026-11-26: the second was taken in silence
        if (d.resolved) this.importRx(d, env);                                                                    // MO-1/MO-3: an .rx module's signature
        else if (d.declared) this.importDeclared(d, env);                                                         // MO-8: a JS module's declaration file
        else for (const { alias } of d.names) this.bind(env, alias, { kind: "import", name: alias, region: env.region, line: d.line, io: !d.pure, ...(d.pure ? { pureFn: true } : {}), rejects: new Set(d.fails ?? ["Error"]), side: d.side, undeclared: d.from });   // R-io-4, R-f-8, SF-5
        for (const { alias } of d.names) { const s = env.vars.get(alias); if (s) this.importSyms.add(s); }
        continue;
      }
      if (d.k === "typedecl") { const m = /^type\s+\w+\s*=\s*([\s\S]*)$/.exec(d.text ?? ""); if (m && scalarType(m[1].trim())) this.scalarAliases.add(d.name); continue; }   // AC-1g: a local alias of a plain value
      if (d.k === "effect" || d.k === "provide") continue;
      if (d.k === "context") {                                                             // RG-7: a declared context — its identity is the declaration, not its spelling
        if (env.vars.has(d.name)) this.err("DUPLICATE_DECLARATION", "E-7", `${d.name} is declared twice in one block`);
        const contract = (d.type && ROW_WORDS.test(d.type)) || d.exported ? this.contractOf(d.type) : null;   // RG-7e: written rows, or exported (its type is then the contract: no row words, no rows)
        if (genericCtx(d.type?.replace(ROW_WORDS, ""), this.types)) this.err("GENERIC_CONTEXT", "RG-7a", `context ${d.name} is declared a generic function type: a context is declared once, at module level, and has no type parameter — every provision and \`use\` of it is of one type. Write the parameter's place \`any\` or \`unknown\` (\`context ${d.name}: (p: { item: any }) => View\`); a generic root's props type the caller's view`);
        if (d.source) this.err("SOURCE_CONTEXT", "O-4", `context ${d.name}: source … is withdrawn (RG-7c, 2026-10-31): what is provided is read beneath it — provide the writes you allow, as actions (\`context ${d.name}: { current: T; set: (v: T) => void }\`)`);
        this.bind(env, d.name, { kind: "context", name: d.name, region: env.region, line: d.line, ctx: { key: `${this.opts.file ?? "main.rx"}#${d.name}${env.region.parent ? `@${this.seq++}` : ""}`, source: d.source, dflt: !!d.dflt, contract, ...(d.type !== undefined ? { ty: fieldRows(d.type.replace(ROW_WORDS, "")).text } : {}) } });
        { const view = viewCtx(d.type?.replace(ROW_WORDS, ""), this.types);                  // RG-4c: a context that holds a view
          if (view) { env.vars.get(d.name)!.ctx!.view = view;
            if (d.exported) this.err("VIEW_NOT_SHOWN", "RG-4c", `context ${d.name} holds a view, and is exported: a view carried by a context is provided and shown in the module that declares it, where every place that shows it is checked — export the components that provide and show it`);
            else if (d.type && ROW_WORDS.test(d.type)) this.err("VIEW_NOT_SHOWN", "RG-4c", `context ${d.name} holds a view: it has no rows of its own (what the view waits on and fails with is checked at each place that shows it)`); } }
        if (d.dflt) this.provisions.push({ key: env.vars.get(d.name)!.ctx!.key, e: d.dflt, env });
        continue;
      }
      if (env.vars.has(d.name) && env.vars.get(d.name)!.kind !== "import") this.err("DUPLICATE_DECLARATION", "E-7", `${d.name} is declared twice in one block`);
      const shadowed = env.parent?.lookup(d.name);
      if (shadowed && this.importSyms.has(shadowed)) this.err("SHADOWED_IMPORT", "MO-1d", `${d.name} shadows the imported ${d.name}: rename one (\`import { ${d.name} as … }\`)`);
      const sym: Sym = { kind: d.k === "fn" ? "fn" : d.k === "component" ? "comp" : d.k === "action" ? "action" : d.k === "server" ? "server" : d.k === "source" ? "source" : d.k === "error" ? "errclass" : "eq", name: d.name, region: env.region, line: d.line };
      if (d.k === "server") sym.params = d.params.map(name => ({ name, ref: false }));
      if (d.k === "source") sym.question = !!d.question;
      if ((d.k === "source" || d.k === "eq") && d.key !== undefined) sym.rowKey = d.key;   // ST-4d: what its rows are keyed by
      if (d.k === "action") { sym.io = true; sym.arity = d.params.length; if (d.required !== undefined) sym.arityMin = d.required; sym.outlasts = actionWaits(d.body); }                 // R-io-2: an action is io; AC-1f: its parameters
      if (d.k === "fn") { sym.params = d.params; sym.instantiating = instantiates(d); sym.fnDecl = d; sym.declEnv = env; }
      if (d.k === "component") { sym.comp = d; sym.compRegion = this.region(env.region, "component", { component: true, name: d.name }); this.compSyms.set(sym.compRegion, sym); sym.compRegion.key = `${this.opts.file ?? "main.rx"}#${d.name}${env.region.parent ? `@${sym.compRegion.id}` : ""}`; }   // E-5a
      if (d.k === "eq") sym.eqDecl = d;
      if (d.k === "source" || d.k === "eq") sym.made = { e: d.k === "source" ? d.init : d.e, env, ty: d.type };
      if (d.k === "eq") { sym.mapsRecords = !d.key && mapsIntoRecords(d.e); if (d.e.k === "id") { const t = env.lookup(d.e.name); if (t?.io) sym.io = true; } this.foreignPart(sym, d.e, env); sym.eqExpr = { e: d.e, env }; sym.val = { e: d.e, env }; }   // MO-10k
      if (d.k === "eq") { const sf = unwrapServer(d.e); if (sf) { sym.kind = "server"; sym.params = sf.params.map(name => ({ name, ref: false })); this.serverExprs.set(sf, sym); } }   // SF-1d: a wrapped server fn is one, its rows the function's
      this.bind(env, d.name, sym);
    }
    this.serverIo(decls, env);
    this.propInterfaces(decls, env);
    // MO-10k: what a fn or an action of this module may give back, by mention (every name of the block is bound now)
    for (const d of decls) {
      if (d.k !== "fn" && d.k !== "action") continue;
      const names = new Set<string>(); const look: Look = { builtin: (n: string) => !env.lookup(n), prim: x => this.declPrim(x, env) };
      if (d.k === "fn") flowsFn(d.params, d.decls, d.tail, look, names); else flowsReturns(d.body, new Set(d.params), new Map(), look, names);
      env.vars.get(d.name)!.retFlows = { names, env };
    }
    for (const d of decls) if (d.k === "source" && !d.question) env.vars.get(d.name)!.failsT = this.failsThunk(d.init, env);   // R-f-2: a source holds what its initializer gave it — an error, if that failed (found by S-ai2-settings)
    for (const d of decls) if ((d.k === "eq" || (d.k === "source" && d.question))) { const e = d.k === "eq" ? d.e : d.init; const sym = env.vars.get(d.name)!; sym.rows = this.rowsThunk(e, env); sym.expr = e; sym.env = env; sym.failsT = this.failsThunk(e, env); }
    // 2. C-1 over this block's equations (the static graph, CN-3a): only an equation's own `pre` breaks a cycle
    this.cycles(decls, env);
    // 3. each declaration
    for (const d of decls) { this.line = d.line; this.decl(d, env, ctx); }
    // 4. the view
    this.markup(view, env, env.region.isComponentRoot || !env.region.parent);   // CSS-1: a component's view, or the program's, may hold its <style>
  }

  /** 12 SF-1: a server fn is io when its body calls io — JS declared io, `log`, or another server fn that is (to a fixpoint).
   *  Called in reactive scope it is a question, which may be asked again, so io there is IO_IN_REACTIVE at the call. */
  private serverIo(decls: Decl[], env: Env) {
    const servers = decls.flatMap(d => d.k === "server" ? [d] : d.k === "eq" && unwrapServer(d.e) ? [{ name: d.name, params: unwrapServer(d.e)!.params, body: unwrapServer(d.e)!.body }] : []);
    const freeCalls = (d: { params: string[]; body: Stmt[] }): string[] => { const out: string[] = []; scoped({ k: "server", params: d.params, body: d.body }, (o, bound) => { const f = o.f as { k?: string; name: string } | undefined; if (o.k === "call" && f?.k === "id" && !bound.some(b => b.name === f.name)) out.push(f.name); }); return out; };   // what nothing in the body binds
    for (let changed = true; changed;) {
      changed = false;
      for (const d of servers) {
        const sym = env.vars.get(d.name)!; if (sym.io) continue;
        const hit = freeCalls(d).find(n => (env.lookup(n)?.io ?? lang(env, n) === "log"));
        if (hit) { sym.io = true; sym.ioVia = `${hit}(…)`; changed = true; }
      }
    }
  }
  /** MO-3/MO-4: bind an `.rx` import's names from its module's signature. Its rows are the signature's: `pure` must agree and
   *  `fails` is refused. An imported source is read-only here (MO-2). */
  private importRx(d: Extract<Decl, { k: "import" }>, env: Env) {
    const sig = this.opts.sigs?.get(d.resolved!);
    if (d.fails) this.err("IMPORT_ROW_MISMATCH", "MO-4", `\`fails\` asserts rows at the JS boundary; ${d.from} is .rx and its rows are its signature's`);
    for (const { name, alias } of d.names) {
      const base: Sym = { kind: "import", name: alias, region: env.region, line: d.line };
      const x = sig?.exports.get(name);
      if (!sig) { this.bind(env, alias, base); continue; }                                      // the module was not found or not checked (reported there)
      if (!x) { this.err("NOT_EXPORTED", "MO-6", `${d.from} does not export ${name === "default" ? "a default" : name}`); this.bind(env, alias, base); continue; }
      if (x.kind === "type") continue;                                                      // a type name: text to the checker (07 §2), nothing to bind
      const rowsOf = (r: string[]) => () => new Set(r);
      const failsOf = (f: string[]) => () => ({ cls: new Set(f), props: [] as PropRef[] });
      let sym: Sym;
      switch (x.kind) {
        case "source": sym = { kind: "source", name: alias, region: env.region, line: d.line, question: x.question, imported: d.from, rows: rowsOf(x.rows), failsT: failsOf(x.fails) }; break;
        case "eq": sym = { kind: "eq", name: alias, region: env.region, line: d.line, io: x.io, ...(x.actions ? { actionParts: x.actions } : {}), rows: rowsOf(x.rows), failsT: failsOf(x.fails) }; break;
        case "fn": sym = { ...(x.actions ? { actionParts: x.actions } : {}), ...(x.result ? { result: x.result } : {}), kind: "fn", name: alias, region: env.region, line: d.line, params: x.params, instantiating: x.instantiating, ...(x.uses ? { needs: x.uses } : {}), ...(x.calls?.length ? { calls: x.params.map(q => x.calls!.flatMap(c => c === q.name ? [""] : c.startsWith(`${q.name}.`) ? [c.slice(q.name.length + 1)] : [])) } : {}), rows: rowsOf(x.rows), failsT: failsOf(x.fails), rejects: new Set(x.rejects) }; break;
        case "action": sym = { kind: "action", name: alias, region: env.region, line: d.line, io: true }; break;
        case "server": { const rj = new Set(x.rejects); sym = { kind: "server", name: alias, region: env.region, line: d.line, io: x.io, params: x.params.map(n => ({ name: n, ref: false })), serverRejects: () => rj }; break; }
        case "errclass": sym = { kind: "errclass", name: alias, region: env.region, line: d.line }; break;
        case "comp": { const r = this.region(null, "imported", { component: true, name: alias }); r.sig = x.sig; r.key = `${d.resolved}#${name}`; sym = { kind: "comp", name: alias, region: env.region, line: d.line, compRegion: r, ...(x.sig.through && this.opts.through?.size ? { through: true } : {}) }; { const ph = Object.entries(x.sig.props).flatMap(([k, v]) => (v.takes ?? []).map(([p, h, c]) => [`${k}.${p}`, h, c] as [string, boolean, string[]])); if (ph.length) this.propHeld.set(r, ph); } break; }   // E-5a
        case "context": sym = { kind: "context", name: alias, region: env.region, line: d.line, ctx: { key: x.key, source: x.source, dflt: x.dflt, contract: { rows: new Set(x.rows), fails: new Set(x.fails) }, ...(x.type !== undefined ? { ty: fieldRows(x.type).text } : {}) } }; break;
      }
      if (sym.kind === "source" || sym.kind === "eq" || sym.kind === "fn") sym.exportKey = `${d.resolved}#${name}`;   // E-5a
      if (d.pure && sym.io) this.err("IMPORT_ROW_MISMATCH", "MO-4", `${name} is io in ${d.from}'s signature; \`pure\` cannot lower an .rx row`);
      this.bind(env, alias, sym);
    }
  }
  /** RG-7: the context a `provide`/`use` names — lexically, like any name. */
  private ctxOf(name: string, env: Env): Sym | undefined {
    const s = env.lookup(name);
    if (!s) { this.err("UNBOUND", "RG-7", `${name} is not declared here: declare the context (\`context ${name}: T\`) or import it`); return undefined; }
    if (s.kind !== "context") { this.err("NOT_A_CONTEXT", "RG-7", `${name} is ${s.kind === "source" ? "a source" : s.kind === "eq" ? "an equation" : `a ${s.kind}`}, not a context: \`provide\` and \`use\` name a \`context\` declaration`); return undefined; }
    return s;
  }
  /** RG-7e: a context's written rows — the row words before its type (`context user: pending fails(Error) User`). */
  private contractOf(type?: string): { rows: Set<string>; fails: Set<string> } {
    const m = type ? ROW_WORDS.exec(type) : null; const rows = new Set<string>(); const fails = new Set<string>();
    if (m) for (const w of m[0].trim().split(/\s+(?![^(]*\))/)) { if (w.startsWith("fails(")) w.slice(6, -1).split("|").map(x => x.trim()).filter(Boolean).forEach(x => fails.add(x)); else rows.add(w); }
    return { rows, fails };
  }
  /** MO-8: bind a JS import's names from its declaration file. The file is the row: `pure` on the import must agree with it,
   *  `fails` is refused, and a name it does not declare is not exported. */
  private importDeclared(d: Extract<Decl, { k: "import" }>, env: Env) {
    const decls = this.opts.declarations?.get(d.declared!) ?? []; const file = d.declared!.split("/").pop();
    const generated = isGenerated(d.declared!) ? d.from : undefined;   // MO-8l
    const jsKeys = (names?: string[]) => (names ?? []).map(n => {                          // MO-12a: a JS context's key is its declaration file's
      const c = decls.find(y => y.kind === "context" && y.name === n);
      if (!c || c.kind !== "context") { this.err("NOT_EXPORTED", "MO-12", `${file} names context ${n} in uses(…) or provides(…) but declares none: add \`export context ${n}\``); return `${d.declared}#${n}`; }
      if (c.from === undefined) return `${d.declared}#${n}`;
      if (c.resolved !== undefined) return `${c.resolved}#${n}`;                             // MO-12e: the context another module's declaration declares, under that declaration's key
      this.err("NOT_EXPORTED", "MO-12", `${file} takes context ${n} from "${c.from}", whose declaration declares none: it is declared there as \`export context ${n}\`, in the \`.d.rx\` an import of "${c.from}" finds (MO-12e)`);
      return `${d.declared}#${n}`;
    });
    // MO-8l: what a draft does not say is not known, so what the import says of it stands, as with no declaration
    const stated = generated !== undefined && !!d.pure;
    const unsaid = (alias: string): Sym => ({ kind: "import", name: alias, region: env.region, line: d.line, undeclared: d.from, io: !d.pure, ...(d.pure ? { pureFn: true } : {}), rejects: new Set(d.fails ?? ["Error"]), side: d.side });
    if (d.fails && !generated) this.err("IMPORT_ROW_MISMATCH", "MO-8", `${d.from}'s rows are declared in ${file}: \`fails\` on the import cannot restate them`);
    const undoes = (ret: string) => tyUndoes(ret, n => { const y = decls.find(y => y.kind === "type" && y.name === n); return y?.kind === "type" && y.text !== undefined ? aliasText(y.text) : undefined; });   // EF-5a
    const bindComp = (x: Extract<JsDecl, { kind: "comp" }>, alias: string) => {   // MO-11a: a Solid component — its declaration is its summary
        const gives = jsKeys(x.provides);   // MO-12c: provided to everything it renders
        const sig: CompSig = { js: true, own: x.fails.map(cls => ({ cls, what: `${alias}'s root`, at: file })), requires: jsKeys(x.uses), props: { "*": { f: new Set(), p: new Set(gives), rendered: true } }, shape: x.content };   // MO-11b: an undeclared prop is read too; MO-12b: what it uses itself
        for (const p of x.props) sig.props[p.name] = { f: p.catches === "*" ? "all" : new Set(p.catches ?? []), p: new Set(gives), rendered: true, ...(p.component ? { component: true } : {}), ...(p.components ? { components: true } : {}), ...(p.render ? { render: true, ...(p.optional ? { renderOptional: true } : {}) } : {}), ...(p.callback ? { callback: true } : {}), ...(p.pure ? { pure: true } : {}) };
        const r = this.region(null, "imported", { component: true, name: alias }); r.sig = sig; r.js = true;
        if (decls.some(y => y.kind === "fn" && y.renders === x.name)) r.hostKey = `${d.declared}#${x.name}`;   // MO-11u: its applications are where a fn's components render
        { const vp = x.props.filter(p => p.view).map(p => p.name); if (vp.length) this.viewProps.set(r, new Set(vp)); }   // MO-11t: the props that take a view
        this.bind(env, alias, { kind: "comp", name: alias, region: env.region, line: d.line, compRegion: r, ...(this.opts.through?.has(`${d.declared}#${x.name}`) ? { through: true } : {}) });
    };
    const bindFn = (x: Extract<JsDecl, { kind: "fn" }>, alias: string, name: string, base: boolean) => {
      // MO-11u: `renders(H)` — H is a component of the same declaration; what H itself uses and provides is above everything it renders
      const rendersIn = (): Pick<Sym, "rendersIn"> => { if (x.kind !== "fn" || x.renders === undefined) return {}; const h = decls.find(y => y.kind === "comp" && y.name === x.renders); return { rendersIn: { key: `${d.declared}#${x.renders}`, name: x.renders, credit: h?.kind === "comp" ? [...new Set([...jsKeys(h.uses), ...jsKeys(h.provides)])] : [] } }; };
      const pure = x.pure || stated;
      if (base && d.pure && !pure) this.err("IMPORT_ROW_MISMATCH", "MO-8", `${name} is declared io in ${file} (\`export fn\`, not \`export pure fn\`); \`pure\` on the import cannot lower it`);
      if (base && d.side && !generated && x.side !== d.side) this.err("IMPORT_ROW_MISMATCH", "SF-5", `${name} is declared ${x.side ? `\`${x.side}\`` : "for both sides"} in ${file}; \`${d.side}\` on the import cannot restate it`);
      if (instance(x, d.declared!, !!d.pure)) { this.bind(env, alias, { kind: "fn", name: alias, region: env.region, line: d.line, params: x.params.map((n, i) => ({ name: n, ref: !!x.refs?.[i] })), instantiating: true, ...(generated ? { generated } : {}), ...(x.makes ? { makes: true } : {}), foreign: x.shape, rows: () => new Set(), failsT: () => ({ cls: new Set(), props: [] }), rejects: new Set(), ...(x.uses ? { needs: jsKeys(x.uses) } : {}), ...(x.provides ? { gives: jsKeys(x.provides) } : {}), ...(x.nests ? { nests: x.nests } : {}), ...(x.held ? { held: x.held } : {}), ...(x.waits ? { waits: x.waits } : {}), ...(x.cbs ? { cbs: x.cbs } : {}), ...(x.drafts ? { drafts: x.drafts } : {}), ...(x.partDrafts ? { partDrafts: x.partDrafts } : {}), ...(x.ret ? { retTy: x.retIo ?? x.ret } : {}), ...rendersIn() }); return; }   // MO-10a: a primitive is an instantiation (RG-6)
      this.bind(env, alias, { kind: "import", name: alias, region: env.region, line: d.line, io: !pure, ...(x.kind === "fn" && pure ? { pureFn: true } : {}), ...(x.kind === "fn" && !generated && x.ret !== undefined && undoes(x.ret) !== undefined ? { disposer: undoes(x.ret) } : {}), rejects: new Set(d.fails ?? x.rejects ?? ["Error"]), side: x.side ?? (generated && (base || d.side === "server") ? d.side : undefined), ...(x.kind === "fn" && x.cbs ? { cbs: x.cbs } : {}), ...(x.kind === "fn" && x.drafts ? { drafts: x.drafts } : {}), ...(x.kind === "fn" && x.draftArgs ? { draftArgs: x.draftArgs } : {}), ...(x.kind === "fn" && x.partDrafts ? { partDrafts: x.partDrafts } : {}), ...rendersIn(),  ...(x.makes ? { makes: true } : {}), ...(x.kind === "fn" && (x.retIo ?? (generated ? undefined : x.ret)) !== undefined ? { retIo: x.retIo ?? x.ret } : {}), ...(generated ? { generated } : {}) });   // (MO-8l: a draft's types are no claim — of a draft only a part it marks `io` is read)
    };
    for (const { name, alias } of d.names) {
      const x = decls.find(y => y.name === name);
      // MO-11q: `export component Dialog.Root(…)`: the import's members, each a component named as it is written (`<Dialog.Root>`)
      const members = decls.filter((y): y is Extract<JsDecl, { kind: "comp" }> => y.kind === "comp" && y.name.startsWith(name + "."));
      for (const m of members) bindComp(m, alias + m.name.slice(name.length));
      if (!x && members.length) { this.bind(env, alias, { kind: "import", name: alias, region: env.region, line: d.line, io: false, rejects: new Set(["Error"]) }); continue; }   // the object itself: a value
      if (generated && (!x || x.kind === "context")) { this.bind(env, alias, unsaid(alias)); continue; }   // MO-8l: a name the draft has no row for
      if (!x) { this.err("NOT_EXPORTED", "MO-8", `${file} declares no export ${name} (declare it, or it is not ${d.from}'s)`); this.bind(env, alias, { kind: "import", name: alias, region: env.region, line: d.line, io: true }); continue; }
      if (x.kind === "type" || x.kind === "context") continue;   // MO-12a: a JS context is named only by its declaration file's rows
      if (x.kind === "value") { this.bind(env, alias, { kind: "import", name: alias, region: env.region, line: d.line, io: false, rejects: new Set(["Error"]), ...(generated && d.side ? { side: d.side } : {}), ...(stated ? { pureFn: true } : x.type !== undefined ? { constTy: x.type } : {}) });   // MO-8g: a value, read as any import, never io
        for (const m of decls) if (m.kind === "fn" && m.name.startsWith(name + ".")) bindFn(m, alias + m.name.slice(name.length), m.name, false);   // MO-8t: `export fn toaster.show(…)`, a method of the value, a fn named as it is written
        continue; }
      if (x.kind === "error") { this.bind(env, alias, { kind: "errclass", name: alias, region: env.region, line: d.line }); continue; }
      if (x.kind === "comp") { bindComp(x, alias); continue; }   // MO-11a
      bindFn(x, alias, name, true);
      // MO-8t: `export fn toast.success(…)` — the fn's own methods, each a fn named as it is written
      for (const m of decls) if (m.kind === "fn" && m.name.startsWith(name + ".")) bindFn(m, alias + m.name.slice(name.length), m.name, false);
    }
  }
  /** CN-3d: `e` can have no value on the first load: it awaits without a first paint, here or in an equation it reads,
   *  counting only what the first load surely asks (a question behind a condition, `c ? null : await f()`, `c && await
   *  f()`, a `catch`'s alternative, waits only if `c` lets it). The crate's `expr_absent` with `first`, step for step. */
  private firstAbsent(e0: Expr, env: Env, own: Sym | undefined, memo: Map<Sym, boolean>, busy: Set<Sym>): boolean {
    const stack: Expr[] = [e0];
    while (stack.length) {
      const x = stack.pop()!;
      switch (x.k) {
        case "fn": case "serverfn": continue;
        case "await": if (!x.init) return true; continue;
        case "if": stack.push(x.c); continue;
        case "bin": if (x.op === "&&" || x.op === "||" || x.op === "??") { stack.push(x.l); continue; } break;
        case "catch": stack.push(x.e); continue;
        case "member": case "index": case "call": if (this.heldField(x, env)?.[1]) return true; break;   // MO-10l, MO-10f: a part that holds
        case "id": { const t = env.lookup(x.name); if (t && t !== own && (t.kind === "eq" || t.kind === "source") && this.symFirstAbsent(t, memo, busy)) return true; continue; }
      }
      stack.push(...subExprs(x));
    }
    return false;
  }
  private symFirstAbsent(s: Sym, memo: Map<Sym, boolean>, busy: Set<Sym>): boolean {
    if (memo.has(s)) return memo.get(s)!;
    if (!s.expr || !s.env || busy.has(s)) return false;
    busy.add(s); const out = this.firstAbsent(s.expr, s.env, s, memo, busy); busy.delete(s); memo.set(s, out); return out;
  }
  /** MO-10g: closures passed where a declared JS fn takes a callback — their bodies are imperative scope, as a handler's. */
  private callbackFns = new WeakSet<Expr>();
  /** MO-11k: view lambdas in a render-prop position (the only child of a JS component whose `children` gives a View). */
  private viewFns = new WeakSet<Markup>();
  /** RG-4c: the views an `.rx` component takes and shows as `<props.f … />`, by field, and what it shows them with. */
  private shownMemo = new Map<Sym, Map<string, Shown>>();
  private shownBy(s: Sym): Map<string, Shown> | undefined {
    if (s.compRegion?.sig) { const ps = Object.entries(s.compRegion.sig.props).flatMap(([f, p]) => p.view ? [[f, { optional: p.view.optional, mixed: p.view.mixed, ...(p.view.type !== undefined ? { param: p.view.type } : {}) }] as [string, Shown]] : []); return ps.length ? new Map(ps) : undefined; }
    if (!s.comp) return undefined;
    let r = this.shownMemo.get(s); if (!r) this.shownMemo.set(s, r = shown(s.comp, this.types));
    return r.size ? r : undefined;
  }
  private get types(): Types { return this.opts.types ?? new Map(); }
  private viewFor = new WeakMap<Markup, { comp: Sym; view: string }>();                     // what a view lambda is given to
  private placed = new Map<string, { e: Expr; field: string; env: Env }[][]>();            // by component and view, each place it shows it: what with
  private shownAt: { region: Region; comp: Region; view: string; from?: Region }[] = [];                   // … and where: what is read there goes up from there
  private viewStores: { comp: Sym; view: string; field: string; line: number }[] = [];      // O-3: what a view stores where it outlives it
  private asked = new Map<Region, string>();                                                // the branch of `if props.f` where it is
  /** The component a tag shows a view of, `<props.f … />` in its own view, and which. */
  private shows(tag: string, env: Env): { comp: Sym; view: string } | undefined {
    const n = shownIn(tag); const p = n && env.lookup(n[0]); const c = p?.kind === "props" && !p.viewOf ? this.compSyms.get(p.region) : undefined;
    return c && this.shownBy(c)?.has(n![1]) ? { comp: c, view: n![1] } : undefined;
  }
  /** O-3: whether a field a component shows its view with holds no closure of the component's, in every place it does. */
  private viewValue(c: Sym, view: string, field: string, seen = new Set<string>()): boolean {
    if (c.compRegion!.sig) { const vs = c.compRegion!.sig.props[view]?.view?.values ?? []; return vs.includes(field) || vs.includes("*"); }
    const key = `${c.compRegion!.id}:${view}:${field}`; if (seen.has(key)) return true; seen.add(key);
    const given = (this.placed.get(`${c.compRegion!.id}:${view}`) ?? []).flatMap(xs => xs.filter(x => x.field === field || x.field === "*"));
    return given.length > 0 && given.every(x => this.stored(x.e, x.env).every(k => {
      if (!k.propOf) return k.region.depth === 0;
      if (k.propOf.field === "*") return false;
      if (k.viewOf) return this.viewValue(k.viewOf.comp, k.viewOf.view, k.propOf.field, seen);
      const t = this.propsTy.get(k.propOf.comp); const ft = t === undefined ? undefined : tyStep(t, { field: k.propOf.field });
      return ft !== undefined && tyScalar(ft);
    }));
  }
  private markCallbacks(args: Expr[], cbs?: ([boolean, string[]] | null)[]) {
    if (cbs) args.forEach((a, i) => {
      const c = cbs[i]; if (!c) return;
      if (c[0]) { if (a.k === "fn") this.callbackFns.add(a); }
      else if (a.k === "rec") for (const f of a.fields) if (!("spread" in f) && c[1].includes(f.key) && f.v.k === "fn") this.callbackFns.add(f.v);
    });
  }
  /** MO-10f: the declared rows of a field read, `x.data` where `x` was bound from a JS fn's result. */
  private heldField(e: Expr, env: Env): [string, boolean, string[]] | undefined {
    if (e.k === "call") { const w = e.f.k === "id" ? env.lookup(e.f.name)?.waits : undefined; return w && ["", w[0], w[1]]; }   // MO-10l: the call that makes an accessor that waits or fails — its reader's rows are read off it, as a question's off its `await`
    const fp = fieldPath(e); if (!fp) return undefined;                                // `q.result.data`: the path from the bound name; `q["data"]` is `q.data`, `q[k]` any field there
    return heldMatch(env.lookup(fp.root)?.held ?? [], fp.path);
  }
  /** MO-10f: a field that fails, at any depth, read by `.` or `[…]` */
  private heldFails(e: Expr, env: Env, bound: Map<string, Set<string>>, out: Fails) {
    if (e.k === "call") { if (e.f.k === "id" && !bound.has(e.f.name)) for (const c of this.heldField(e, env)?.[2] ?? []) out.cls.add(c); return; }   // MO-10l
    const fp = fieldPath(e); if (!fp || bound.has(fp.root)) return;
    const h = this.heldField(e, env); if (h) for (const c of h[2]) out.cls.add(c);
  }
  /** MO-10b: an equation bound from a primitive's result, or from a part of it (`[a, b] = f(…)`, `x.k`): a `ref` part is a
   *  reader (it may hold, MO-10d), a function part is io (R-io-3), anything else is a value. */
  private foreignPart(sym: Sym, e: Expr, env: Env) {
    if (e.k === "id") {                                                                    // MO-10b, MO-10f: an alias of a result is the result — its shape, its fields' rows and draft parts
      const t = env.lookup(e.name);
      if (t && !t.foreign && t.kind === "props" && t.held?.length) { sym.held = t.held; if (t.retTy !== undefined) sym.retTy = t.retTy; return; }   // MO-10f: another name for props whose fields hold or fail is those props
      if (!t?.foreign || t.kind === "comp") return;
      sym.foreign = t.foreign; if (t.held) sym.held = t.held; if (t.partDrafts) sym.partDrafts = t.partDrafts; if (t.retTy) sym.retTy = t.retTy;
      if (t.viaField) sym.viaField = true; if (t.reader) sym.reader = true; if (t.foreign === "fn") sym.io = true;
      return;
    }
    let shape: Shape | undefined;
    if (e.k === "call" && e.f.k === "id") { const f = env.lookup(e.f.name); if (f?.kind === "fn" && f.foreign) shape = f.foreign; }
    else if (e.k === "index" || e.k === "member") {
      const t = e.o.k === "id" ? env.lookup(e.o.name) : undefined; const s = t?.foreign;
      // `x["k"]` is `x.k`; `x[k]` may be any part, so it is the most changing of them (a reader, else io, else a value)
      const strongest = (ps: ("ref" | "fn" | "value")[]) => ps.find(p => p === "ref") ?? ps.find(p => p === "fn") ?? ps[0];
      if (s && typeof s === "object") {
        if (e.k === "member") shape = "fields" in s ? s.fields.find(f => f[0] === e.p)?.[1] : undefined;
        else { const key = litKey(e.i);
          if ("items" in s) shape = key === undefined ? strongest(s.items) : e.i.k === "lit" && typeof e.i.v === "number" ? s.items[e.i.v] : undefined;
          else shape = key === undefined ? strongest(s.fields.map(f => f[1])) : s.fields.find(f => f[0] === key)?.[1]; }
      }
    }
    // MO-10i: a result's function parts that take drafts, and a part bound from them
    if (e.k === "call" && e.f.k === "id") { const f = env.lookup(e.f.name); if (f?.partDrafts) sym.partDrafts = f.partDrafts; }
    else if ((e.k === "index" || e.k === "member") && e.o.k === "id") { const key = e.k === "member" ? e.p : litKey(e.i) ?? ""; const pd = env.lookup(e.o.name)?.partDrafts?.[key]; if (pd) sym.drafts = pd; }
    if (!shape) {                                                                         // MO-10f: a part of props whose fields hold or fail (`q = props.query`) keeps its fields' rows and its type
      const fp = e.k === "member" || e.k === "index" ? fieldPath(e) : undefined;
      const t = fp ? env.lookup(fp.root) : undefined;
      if (fp && t && !t.foreign && t.held?.length && fp.path.every(p => p !== undefined)) {
        const pre = `${fp.path.join(".")}.`;
        const sub = t.held.flatMap(h => h[0].startsWith(pre) ? [[h[0].slice(pre.length), h[1], h[2]] as [string, boolean, string[]]] : []);
        if (sub.length) { sym.held = sub; let ty: string | undefined = t.retTy; for (const seg of fp.path) ty = ty === undefined ? undefined : tyStep(ty, { field: seg! }); if (ty !== undefined) sym.retTy = ty; else delete sym.retTy; }
        if (heldMatch(t.held, fp.path)?.[1]) sym.reader = true;
      }
      return;
    }
    sym.foreign = shape;
    if (e.k === "member" || (e.k === "index" && e.o.k === "id" && (() => { const f = env.lookup((e.o as { name: string }).name)?.foreign; return !!f && typeof f === "object" && "fields" in f; })())) sym.viaField = true;
    if (e.k === "call" && e.f.k === "id") { const f = env.lookup(e.f.name); if (f?.held) sym.held = f.held; if (f?.retTy) sym.retTy = f.retTy; }   // MO-10f: its fields' rows come with it; E-10: its declared methods; MO-10k: its declared type
    if ((e.k === "member" || e.k === "index") && this.heldField(e, env)?.[1]) sym.reader = true;   // MO-10f: a part bound from a field that holds reads as a reader (MO-10d)
    if ((e.k === "member" || e.k === "index") && e.o.k === "id") {                          // a record part keeps its fields' rows; `x[k]`: whichever part it is, each suffix's combined
      const key = e.k === "member" ? e.p : litKey(e.i); const sub: [string, boolean, string[]][] = [];
      { const ty = env.lookup(e.o.name)?.retTy; const part = key !== undefined && ty !== undefined ? tyStep(ty, { field: key }) : undefined; if (part !== undefined) sym.retTy = part; }   // MO-10k: a named part's declared type
      for (const h of env.lookup(e.o.name)?.held ?? []) {
        const dot = h[0].indexOf("."); if (dot < 0) continue;
        const first = h[0].slice(0, dot), rest = h[0].slice(dot + 1); if (key !== undefined && key !== first) continue;
        const x = sub.find(y => y[0] === rest);
        if (x) { x[1] ||= h[1]; for (const c of h[2]) if (!x[2].includes(c)) x[2].push(c); } else sub.push([rest, h[1], [...h[2]]]);
      }
      if (sub.length) sym.held = sub;
    }
    if (shape === "comp" && e.k === "call") {                                              // MO-11f: the bound name is a component
      const gives = e.f.k === "id" ? env.lookup(e.f.name)?.gives ?? [] : [];                 // MO-12c: what it provides to what it renders
      const r = this.region(null, "imported", { component: true, name: sym.name }); r.sig = { own: [], requires: [], props: { "*": { f: new Set(), p: new Set(gives), rendered: true } }, shape: { roots: [], closesP: false, a: false, form: false, childrenAt: [[]] } };   // it renders what it was given where it is applied
      sym.kind = "comp"; sym.compRegion = r; sym.factory = { args: e.args, env, nests: e.f.k === "id" ? env.lookup(e.f.name)?.nests : undefined };
    }
    if (shape === "fn") sym.io = true;
    if (shape === "ref") sym.reader = true;
  }
  /** MO-3: this module's signature — every export as an importer sees it. */
  signature(p: Program): ModSig {
    const exports = new Map<string, ExportSig>(); const env = this.rootEnv!;
    const arr = (x?: Set<string>) => [...(x ?? [])];
    const actions = (e?: Expr, en?: Env) => { const ps = e && en ? [...this.actionParts(e, en)].sort() : []; return ps.length ? { actions: ps } : {}; };
    for (const d of p.decls) {
      if (!(d as { exported?: boolean }).exported || !("name" in d)) continue;
      if (d.k === "typedecl") { const t = this.types.get(d.name), text = t === undefined ? undefined : printedType(oneLine(t)).type; exports.set(d.name, { kind: "type", ...(text !== undefined ? { text, ...(this.types.has(`${d.name}<`) ? { tparams: oneLine(this.types.get(`${d.name}<`)!) } : {}) } : {}) }); continue; }
      const s = env.vars.get(d.name); if (!s) continue;
      switch (s.kind) {
        case "source": exports.set(d.name, { kind: "source", question: !!s.question, rows: arr(s.rows?.()), fails: arr(s.failsT?.().cls) }); break;
        case "eq": exports.set(d.name, { kind: "eq", rows: arr(s.rows?.()), fails: arr(s.failsT?.().cls), io: !!s.io, ...actions(s.val?.e, s.val?.env) }); break;
        case "fn": exports.set(d.name, { kind: "fn", ...(d.k === "fn" && d.tparams ? { tparams: oneLine(d.tparams) } : {}), params: (s.params ?? []).map(q => "type" in q && typeof q.type === "string" ? { ...q, type: oneLine(q.type) } : q), instantiating: !!s.instantiating, rows: arr(s.rows?.()), fails: arr(s.failsT?.().cls), rejects: arr(s.fnTail && s.fnEnv ? this.rejects(s.fnTail, s.fnEnv, new Set()) : s.rejects), ...actions(s.fnTail, s.fnEnv), ...(() => { const r = this.fnResult(s); return r && r.k === "leaf" && r.reader ? {} : r ? { result: r } : {}; })(), ...(s.needs?.length ? { uses: s.needs } : {}), ...(() => { const cs = (s.params ?? []).flatMap((q, i) => [...this.calledOf(s, i)].sort().map(p => joinPath(q.name, p))); return cs.length ? { calls: cs } : {}; })() }); break;
        case "action": exports.set(d.name, { kind: "action" }); break;
        case "server": exports.set(d.name, { kind: "server", io: !!s.io, params: (s.params ?? []).map(p => p.name), rejects: arr(s.serverRejects?.()) }); break;
        case "errclass": exports.set(d.name, { kind: "errclass", params: d.k === "error" ? d.params : [] }); break;
        case "comp": exports.set(d.name, { kind: "comp", sig: s.factory?.exported ? { ...this.compSig!(s.factory.exported.compRegion!), made: true } : { ...this.compSig!(s.compRegion!), ...(d.k === "component" && d.tparams ? { tparams: oneLine(d.tparams) } : {}), ...(this.throughNames.has(d.name) ? { through: true } : {}) } }); break;   // MO-11j: a made component's summary is its wrapper's, and it is a JS component
        case "context": { const c = s.ctx!; exports.set(d.name, { kind: "context", key: c.key, source: c.source, dflt: c.dflt, rows: arr(c.contract?.rows), fails: arr(c.contract?.fails), type: d.k === "context" ? d.type?.replace(ROW_WORDS, "") : undefined }); break; }
      }
    }
    return { file: this.opts.file ?? "", exports, ...(this.hosted.length ? { hosted: this.hosted } : {}), ...(Object.keys(this.hosts).length ? { hosts: this.hosts } : {}) };
  }

  private cycles(decls: Decl[], env: Env) {
    const eqs = new Map<string, { e: Expr; line: number }>();
    for (const d of decls) { if (d.k === "eq") eqs.set(d.name, { e: d.e, line: d.line }); if (d.k === "source" && d.question) eqs.set(d.name, { e: d.init, line: d.line }); }
    // RG-7b: a block's provision is the block's own too — what uses the context beside it, where it stands, reads that
    // provision. Only a `use` written in what the provision is given is what is above it. (`provide c`: a name no
    // equation has.)
    const provs = new Map<string, Set<object>>();
    for (const d of decls) if (d.k === "provide" && !eqs.has(`provide ${d.name}`)) { eqs.set(`provide ${d.name}`, { e: d.e, line: d.line }); provs.set(d.name, ownUses(d.name, d.e)); }
    // … and a context's default is computed where the context is declared: a `use` there of a context this block
    // declares and does not provide is that default (`default c`)
    for (const d of decls) if (d.k === "context" && d.dflt) eqs.set(`default ${d.name}`, { e: d.dflt, line: d.line });
    const color = new Map<string, 1 | 2>(); const reported = new Set<string>();
    const visit = (n: string, stack: string[]) => {
      if (color.get(n) === 2) return;
      if (color.get(n) === 1) {
        const cyc = [...stack.slice(stack.indexOf(n)), n]; const key = [...cyc].sort().join(); if (reported.has(key)) return; reported.add(key);
        const p = cyc.find(x => x.startsWith("provide ")), df = cyc.find(x => x.startsWith("default ")); this.line = eqs.get(p ?? df ?? n)!.line;
        if (!p && df) this.err("CYCLE", "C-1", `instantaneous cycle: ${cyc.join(" → ")} — the default of context ${df.slice(8)} is computed where the context is declared, and nothing provides it there: a \`use\` of it there is that default`);
        else if (!p) this.err("CYCLE", "C-1", `instantaneous cycle: ${cyc.join(" → ")} (break it with \`pre\`, C-2)`);
        else { const c = p.slice(8); this.err("CYCLE", "C-1", `instantaneous cycle: ${cyc.join(" → ")} — \`use ${c}\` beside \`provide ${c}\` is that provision (it is the block's, wherever it is written); what is above it is read in the provision itself: \`provide ${c} = … (use ${c}) …\``); }
        return;
      }
      color.set(n, 1);
      const names = new Set<string>(); freeNames(eqs.get(n)!.e, new Set(), names);
      for (const m0 of names) { const own = m0 === `pre:${n}`; const m = m0.startsWith("pre:") ? m0.slice(4) : m0; if (own) continue; if (eqs.has(m) && env.vars.get(m) && env.vars.get(m)!.region === env.region) visit(m, [...stack, n]); }
      for (const c of usesNow(eqs.get(n)!.e)) {
        if (provs.has(c)) { if (`provide ${c}` !== n) visit(`provide ${c}`, [...stack, n]); else if (eqs.has(`default ${c}`)) visit(`default ${c}`, [...stack, n]); }   // (its own: what is above it — here, the default)
        else if (eqs.has(`default ${c}`)) visit(`default ${c}`, [...stack, n]);
      }
      color.set(n, 2);
    };
    for (const n of eqs.keys()) visit(n, []);
  }

  private rowsThunk(e: Expr, env: Env): () => Set<string> {
    const busyKeys = this.rowsBusy;
    let cache: Set<string> | null = null; let busy = false;
    return () => {
      if (cache) return cache; if (busy) return new Set(); busy = true;
      const rows = new Set<string>();
      const walk = (x: Expr): void => {
        switch (x.k) {
          case "await": rows.add("pending"); if (!x.init && this.clientCall(x.e, env)) rows.add("client"); break;   // SV-7b: a client question (no first paint)
          case "latest": case "pending": rows.add("lane"); break;
          case "member": case "index": case "call": if (this.heldField(x, env)?.[1]) rows.add("pending"); break;   // MO-10l, MO-10f: a part that holds
          case "fn": case "serverfn": return;                                               // a closure's body is not this value's
          case "use": {                                                                     // RG-7e
            const c = env.lookup(x.name)?.ctx; if (!c) return;
            if (c.contract) { for (const r of c.contract.rows) rows.add(r); return; }
            for (const p of this.provisions) if (p.key === c.key && !busyKeys.has(c.key)) { busyKeys.add(c.key); for (const r of this.rowsThunk(p.e, p.env)()) rows.add(r); busyKeys.delete(c.key); }
            return;
          }
          case "id": { const s = env.lookup(x.name); if (s?.rows) for (const r of s.rows()) rows.add(r); return; }
        }
        for (const v of Object.values(x as object)) {
          if (Array.isArray(v)) v.forEach(y => { if (y && typeof y === "object") { if ("k" in y) walk(y as Expr); else if ("v" in y) walk((y as { v: Expr }).v); else if ("spread" in y) walk((y as { spread: Expr }).spread); } });
          else if (v && typeof v === "object" && "k" in (v as object)) walk(v as Expr);
        }
      };
      walk(e); busy = false; cache = rows; return rows;
    };
  }

  /** SF-5b: a call into `client` JS. */
  private clientCall(e: Expr, env: Env): boolean { const f = e.k === "catch" ? e.e : e; return f.k === "call" && f.f.k === "id" && env.lookup(f.f.name)?.side === "client"; }
  private awaitedCalls = new WeakSet<Expr>();
  private serverExprs = new WeakMap<Expr, Sym>();
  private decl(d: Decl, env: Env, ctx: Ctx) {
    const reactive: Ctx = { scope: "reactive", inFn: ctx.inFn };
    // ST-4d (2026-11-22): the rows of a keyed list written out with two alike keys
    if ((d.k === "source" || d.k === "eq") && d.key !== undefined) {
      const v = duplicateKey(d.k === "source" ? d.init : d.e, d.key);
      if (v !== undefined) this.err("DUPLICATE_KEY", "ST-4d", `${d.name} is keyed by ${d.key}, and two of the rows written here have ${d.key}: ${v} — a key names one row: rows with one key share one identity, so one's state shows for both, or one is dropped. Give each row its own ${d.key}`);
    }
    switch (d.k) {
      case "import": if (d.fails) for (const n of d.fails) this.errClass(n, env); return;
      case "typedecl": return;
      case "error": if (d.msg) { const inner = new Env(env, env.region); for (const p of d.params) inner.vars.set(p, { kind: "value", name: p, region: env.region, line: d.line }); this.expr(d.msg, inner, { scope: "reactive", inFn: true }); } return;
      case "source": {
        if (d.question) { this.comp("question", env, { name: d.name }, () => this.expr(d.init, env, reactive)); this.rowCheck(d.name, d.type, env); return; }
        const reads = new Set<string>(); readsOutsidePeek(d.init, reads);
        const hit = [...reads].find(n => { const s = env.lookup(n); return s && reactiveKinds.has(s.kind); });
        if (hit) this.err("SNAPSHOT_INITIALIZER", "E-4", `source ${d.name} := … reads ${hit} outside peek(…): write the snapshot as one (DV-6)`);
        this.comp("seed", env, { name: d.name }, () => { this.model.snap++; const was = this.seed; this.seed = { name: d.name, depth: this.fnStack.length }; this.expr(d.init, env, { scope: "reactive", inFn: ctx.inFn }); this.seed = was; });   // E-4: a seed is a snapshot
        return;
      }
      case "eq": {
        const kind = d.deferred ? "deferred" : d.key ? "keyed" : "memo";
        const made = env.vars.get(d.name);
        if (made?.factory) { this.factoryValues(made); this.readers.push({ region: env.region, e: d.e, env, line: this.line });   /* the call runs once, here: its failures and holds are a reader's */ if (d.exported) this.exportMade(made, d.name, d.line); }
        if (d.exported) {
          // MO-10f: a signature carries an equation's rows, not its fields': an importer's `x.data` would be unseen
          const h = made?.held?.[0];
          if (h) this.err("RESULT_AS_VALUE", "MO-10f", `${d.name} is a JS result whose fields hold or fail where each is read (${d.name}.${h[0]}), and a module's signature says nothing of a value's fields: export the field, \`export ${h[0].split(".").pop()} = ${d.name}.${h[0]}\`, which carries its rows`);
          this.closureGiven(d.e, env, () => false, `as ${d.name}, an export of the module, which what imports it (JavaScript too, a router's \`route\`) may call while it computes — export an action`);   // B3
        }
        if (made && !made.factory && (d.e.k === "rec" || d.e.k === "arr")) this.litBinding(made, d, env);   // MO-11c: a literal of components bound to a name
        if (d.e.k === "id" || d.e.k === "member" || d.e.k === "index") this.wholeOk.add(d.e);   // MO-10f, MO-10i: an equation may give a result another name (`q = orig`, `r = q.result`)
        { const ps = this.updaterPositions(d.name, d.line, d.e, env);                               // MO-10i (2026-11-22): a closure bound here and given only to what hands it a draft is that callback
          if (ps) { if (made) made.updater = ps; if (d.exported) this.err("DRAFT_ESCAPES", "MO-10i", `${d.name} is a draft callback: it is used only where it is given to the function that hands it a draft, in this module — an importer would call it with something that is no draft; export an action that calls the setter`); } }
        if (d.e.k === "call" && d.e.f.k === "id") { const f = env.lookup(d.e.f.name); if (f?.kind === "fn" && f.instantiating) { const call = d.e; this.callMarks(call.f, call.args, env); this.ioGiven(call, env, false); this.jsGiven(call, f, env);   /* W2: an instantiation runs where it is written, in reactive scope */ this.markCallbacks(call.args, f.cbs); if (f.foreign !== undefined && f.foreign !== "comp") this.unplaced(call.args, env, f);   /* MO-11s, MO-11u */ this.snapshotArgs(call, f, env); this.hookCalls.push({ region: env.region, fn: f, line: this.line, display: `${d.e.f.name}()` });   /* RG-7b, MO-12b: a hook reads its context where it is called */ call.args.forEach((a, i) => { if (f.params![i]?.ref) this.keep(a, env); });   /* E-5a: a ref argument is kept */ this.comp(kind, env, { name: d.name }, () => { this.model.call(f); call.args.forEach((a, i) => { const value = !!f.params![i] && !f.params![i].ref; if (value) this.model.snap++; this.expr(a, env, reactive); if (value) this.model.snap--; }); }); this.rowCheck(d.name, d.type, env); return; } }   // E-10: a value parameter's argument is a snapshot
        if (ctx.lifted) { this.expr(d.e, env, { ...reactive, lifted: true }); this.rowCheck(d.name, d.type, env); return; }   // E-9b: a part of the fn's result, no equation of its own
        this.comp(kind, env, { name: d.name }, () => this.expr(d.e, env, reactive)); this.keep(d.e, env); this.rowCheck(d.name, d.type, env); return;
      }
      case "provide": {
        this.comp("provide", env, { name: d.name }, () => { this.ownCtx.push(d.name); try { this.expr(d.e, env, reactive); } finally { this.ownCtx.pop(); } }); this.keep(d.e, env);
        const c = this.ctxOf(d.name, env); if (!c) return;
        env.region.provides.add(c.ctx!.key); this.provisions.push({ key: c.ctx!.key, e: d.e, env, ...(c.ctx!.view && env.region.component ? { block: env.region } : {}) });
        if (c.ctx!.view && !c.ctx!.view.fn) {                                              // RG-4c: given what is no view of the component alone (a value, a choice with one), it may hold text
          const comp = env.region.component ? this.compSyms.get(env.region.component) : undefined;
          if (!(comp && this.usesOf(comp)?.only.has(d))) this.textGiven.add(c.ctx!.key);
        }
        if (c.ctx!.view?.fn) {                                                             // RG-4c: a context that holds a view with a parameter is given one the component was given, as it is
          const p = d.e.k === "member" && d.e.o.k === "id" ? env.lookup(d.e.o.name) : undefined; const cs = p?.kind === "props" && !p.viewOf ? this.compSyms.get(p.region) : undefined; const how = cs && this.shownBy(cs)?.get((d.e as { p: string }).p);
          if (!cs || !how) this.err("VIEW_NOT_SHOWN", "RG-4c", `context ${d.name} holds a view with a parameter: it is provided one this component was given, \`provide ${d.name} = props.item\`, of a prop declared with the context's type`);
          else if (how.mixed || (how.param === undefined) !== (c.ctx!.view.param === undefined)) /* whether the two types are one is the type pass's to say (13: it reads a recursive type, fields in another order, `Array<T>`); here, that both are a view with a parameter */ this.err("VIEW_NOT_SHOWN", "RG-4c", `context ${d.name} is declared ${c.ctx!.ty}, and ${show(d.e)} is another type: what shows it, \`<use.${d.name} … />\`, gives it what the context says`);
          else this.carriedFns.push({ key: c.ctx!.key, comp: cs, view: (d.e as { p: string }).p, block: env.region });
        }
        const contract = c.ctx!.contract; const line = this.line;
        if (contract) this.later.push(() => {                                              // RG-7e: a provision is checked against the declared rows
          const rows = this.rowsThunk(d.e, env)(); const f = this.failsOf(d.e, env, false, new Map());
          this.line = line;
          for (const r of rows) if (!contract.rows.has(r)) this.err("ROW_NARROWER_THAN_INFERRED", "RG-7e", `context ${d.name} is declared without \`${r}\`, but this provision is ${r}`);
          for (const x of f.cls) if (!contract.fails.has("Error") && !contract.fails.has(x)) this.err("ROW_NARROWER_THAN_INFERRED", "RG-7e", `context ${d.name} is declared without fails(${x}), but this provision can fail with ${x}`);
        });
        return;
      }
      case "context": if (d.dflt) { const dflt = d.dflt; this.comp("default", env, { name: d.name }, () => this.expr(dflt, env, reactive)); this.keep(dflt, env); } return;
      case "effect": {
        for (const i of d.inputs) this.effectIns.push({ region: env.region, e: i, env, line: d.line });
        this.comp("effect", env, {}, () => {
          for (const i of d.inputs) this.expr(i, env, reactive);                             // EF-1: the compute half is reactive scope
          this.comp("apply", env, {}, () => {
            const inner = new Env(env, env.region);
            d.inputs.forEach((i, n) => inner.vars.set(`$${n}`, { kind: "value", name: `$${n}`, region: env.region, line: this.line, srcs: [{ e: i, env }] }));   // MO-10k: `$n` is the value of the n-th input
            this.stmts(d.body, inner, { scope: "imperative" });
          });
          this.runChecks(d.body, env, false, []);
        });
        this.relayWrites(d, env, this.ownSourceWrites(d, env));
        return;
      }
      case "action": {
        const inner = new Env(env, env.region); const me = env.lookup(d.name);
        for (const p of d.params) inner.vars.set(p, { kind: "value", name: p, region: env.region, line: d.line });
        this.comp("action", env, { name: d.name }, () => this.stmts(d.body, inner, { scope: "imperative", inAction: true }));
        this.actions.push({ name: d.name, body: d.body, env: inner, line: d.line });
        this.runChecks(d.body, inner, true, d.params, false, { ptypes: (d.ptypes ?? d.params.map(() => undefined)).map(t => t && this.scalarAliases.has(t.trim()) ? "string" : t), answered: n => { const t = inner.lookup(n); return !!t && t.kind === "source" && !!t.question; }, stateful: n => { const t = inner.lookup(n); return !!t && (t.kind === "source" || t.kind === "eq"); } });
        return;
      }
      case "server": {                                                                       // 12 SF-1/SF-3/SF-4: a statement block that runs on the server
        const inner = new Env(env, env.region);
        for (const p of d.params) inner.vars.set(p, { kind: "value", name: p, region: env.region, line: d.line });
        this.comp("server", env, { name: d.name }, () => this.stmts(d.body, inner, { scope: "imperative", server: true }));
        let cache: Set<string> | null = null;
        env.lookup(d.name)!.serverRejects = () => cache ??= new Set([...this.stmtsFails(d.body, inner, new Map()).cls, "Error"]);   // SF-6b: every call can also fail in transit
        return;
      }
      case "fn": {
        const r = hasRegion(d) ? this.region(env.region, "fn", { name: d.name }) : env.region; if (r !== env.region) r.fn = env.lookup(d.name)!;                     // RG-6: an instantiating fn is a region
        const inner = new Env(env, r);
        const me = env.lookup(d.name);
        for (const p of d.params) this.bind(inner, p.name, { kind: p.ref ? "eq" : "value", name: p.name, region: r, line: d.line, param: true });
        this.comp("fn", env, { name: d.name }, () => { this.block(d.decls, [], inner, { scope: "reactive", inFn: true, lifted: !!d.named }); this.expr(d.tail, inner, { scope: "reactive", inFn: true, lifted: !instantiates(d) }); });
        { const sym = env.lookup(d.name)!; sym.fnTail = d.tail; sym.fnEnv = inner; if (instantiates(d)) sym.fnDecls = new Set(d.decls.flatMap(x => x.k === "eq" && !x.deferred && x.key === undefined && !asksOrKeeps(x.e) ? [x.name] : [])); sym.failsT = this.failsThunk(d.tail, inner); sym.rows = this.rowsThunk(d.tail, inner); }
        return;
      }
      case "component": {
        const sym = env.lookup(d.name)!; const r = sym.compRegion!;
        const inner = new Env(env, r);
        // MO-10f (2026-11-22): a prop whose type is a record with field rows (`query: { data: pending fails(Error) T }`) is
        // read as a JS result with those fields is: a field at a time, each held field's read checked
        const ph = this.propHeld.get(r);
        if (d.propsType !== undefined) this.propsTy.set(r, fieldRows(d.propsType).text);
        this.bind(inner, d.props, { kind: "props", name: d.props, region: r, line: d.line, ...(d.noProps ? { noProps: d.name } : {}), ...(ph ? { held: ph, ...(d.propsType !== undefined ? { retTy: fieldRows(d.propsType).text } : {}) } : {}) });
        sym.compEnv = inner;
        { const fs = this.shownBy(sym); const o = fs && otherMention(d, fs, n => !!inner.lookup(n)?.ctx?.view?.fn); if (o) { const at = this.line; this.line = o.line || d.line; const p = `${d.props}.${o.field}`; this.err("VIEW_FN_MISPLACED", "RG-4c", `${d.name} shows ${p} as a view, \`<${p} … />\`: it is named nowhere else (not read, called, stored, passed or spread; \`if ${p}\` asks for an optional one that takes no plain content, and \`{ ${o.field}: none, ...rest } = ${d.props}\` leaves it out of a rest)`); this.line = at; } }
        { const t = childrenParam(d.propsType, this.types, d.tparams); if (t) this.err("VIEW_NOT_SHOWN", "RG-4c", `${d.name}'s children are declared a type parameter, ${t}: children are content, a view, and a type parameter stands for a value — declare them \`View\`, or a view with a parameter, \`(r: { item: ${t} }) => View\``); }   // 07 §2
        { const o = process.env.RX_VIEW_WIDE ? undefined : viewUses(d, this.types, new Set(this.shownBy(sym)?.keys() ?? []), (tag, attr) => { const s = inner.lookup(tag); return s?.comp ? takesView(s.comp.propsType, this.types, attr, s.comp.tparams) : undefined; }, n => !!inner.lookup(n)?.ctx?.view).bad[0]; if (o) { const at = this.line; this.line = o.line || d.line; this.err("VIEW_NOT_SHOWN", "RG-4c", viewNotShown(d.name, d.props, o.field, o.how, o.of)); this.line = at; } }
        this.block(d.decls, d.view, inner, { scope: "reactive" });
        this.later.push(() => this.contentCheck(d.view, inner, []));
        return;
      }
    }
  }

  /** C-3 (ruled 2026-10-23): an apply block's own statements may not write a source its compute half reads, directly or
   *  through the equations it reads — a loop across instants. Writes inside closures the apply creates (timers,
   *  listeners, its cleanup) are later events and stay legal; writes through a provision are not visible here. */
  private ownSourceWrites(d: Extract<Decl, { k: "effect" }>, env: Env) {
    const read = new Map<Sym, string>();                                                   // source → the path that reaches it
    const seen = new Set<Sym>();
    const visit = (e: Expr, scope: Env, via: string) => {
      const names = new Set<string>(); freeNames(e, new Set(), names);
      for (const n0 of names) {
        const s = scope.lookup(n0.startsWith("pre:") ? n0.slice(4) : n0); if (!s || seen.has(s)) continue; seen.add(s);
        if (s.kind === "source" && !read.has(s)) read.set(s, via ? `${via} → ${s.name}` : s.name);
        if (s.expr && s.env) visit(s.expr, s.env, via ? `${via} → ${s.name}` : s.name);
      }
    };
    for (const i of d.inputs) visit(i, env, "");
    const direct = (ss: Stmt[]): void => {
      for (const st of ss) {
        if ((st.k === "write" || st.k === "optimistic") && !st.target.ctx) {
          const t = env.lookup(st.target.name);
          if (t && read.has(t)) this.err("EFFECT_WRITES_OWN_SOURCE", "C-3", `the apply block writes ${t.name}, which its compute half reads (${read.get(t)}): a loop across instants — derive it as an equation, or as \`source ${t.name} = …\` (ST-5), or write it from the event that changes the inputs`);
        }
        if (st.k === "sif") { direct(st.t); direct(st.f); }
        if (st.k === "for") direct(st.body);
        if (st.k === "try") { direct(st.body); if (st.handler) direct(st.handler); if (st.fin) direct(st.fin); }
        if (st.k === "action") direct(st.body);
      }
    };
    direct(d.body);
    return new Set(read.keys());
  }

  /** E-10: a reactive argument for a value parameter of an instantiating fn is snapshotted. */
  /** C-3a (2026-11-22): state derived through an effect. An apply block's own write of a source declared beside the
   *  effect (in its block), with a value or a path computed from reactive values — the effect's inputs (`$n`, or an input read by its name), another source, an
   *  equation, a prop — is `EFFECT_RELAY_TEAR`, advice: it is an equation written the long way, a frame late where the effect
   *  names what it reads, and never again where it does not. What is not derived stays an apply's to write: a constant,
   *  the target's own value, what an io call answers (a measurement, a JS module's state), a reading under `peek(…)`,
   *  and every write of a closure the apply creates (a later event). The same walk gives the advice
   *  `SNAPSHOT_IN_EFFECT` (99): an apply's own statement reads a changing value its effect does not take as an input. */
  private relayWrites(d: Extract<Decl, { k: "effect" }>, env: Env, own: Set<Sym>) {
    const inputs = new Set<string>(); for (const i of d.inputs) freeNames(i, new Set(), inputs);
    const reactive = (s: Sym | undefined) => !!s && (s.kind === "source" || s.kind === "eq" || s.kind === "props") && !this.constantEq(s);
    let advised = false;
    const walk = (ss: Stmt[], locals0: Set<string>, derived0: Set<string>) => {
      const locals = new Set(locals0), derived = new Set(derived0);
      /** The reactive values `e` is computed from; none when it is not derived (or what it reads came from io). */
      const from = (e: Expr, target?: Sym): string[] => {
        const names = new Set<string>(), callees = new Set<string>(); writeReads(e, new Set(), names, callees);
        for (const c of callees) { const f = locals.has(c) ? undefined : env.lookup(c); if (f && ((f.kind === "import" && f.io) || f.kind === "action" || f.kind === "server")) return []; }
        const out: string[] = [];
        for (const n of names) {
          if (/^\$\d+$/.test(n)) { out.push(n); continue; }
          if (locals.has(n)) { if (derived.has(n)) out.push(n); continue; }
          const r = env.lookup(n); if (r !== target && reactive(r)) out.push(n);
        }
        return out;
      };
      /** 99, advice: a changing value read by the apply's own statement, which the effect does not take as an input. */
      const snapshot = (e: Expr) => {
        if (advised) return;
        const names = new Set<string>(); writeReads(e, new Set(), names, new Set());
        const n = [...names].find(x => !locals.has(x) && !inputs.has(x) && reactive(env.lookup(x)));
        if (n === undefined) return;
        advised = true;
        this.advice.push({ code: "SNAPSHOT_IN_EFFECT", rule: "EF-1", line: this.line, msg: `the apply block reads ${n}, which is not one of the effect's inputs: the block runs ${d.inputs.length ? "when its inputs change" : "once, when the effect is declared (it has no inputs)"}, and sees ${n} as it was then — it is not run again when ${n} changes. Name it as an input (\`effect (${[...d.inputs.map(show), n].join(", ")}) { … }\`, read as \`$${d.inputs.length}\`) to run when it changes; where a reading taken once is meant, say so: \`peek(${n})\``, ...(this.opts.file ? { file: this.opts.file } : {}) });
      };
      for (const st of ss) {
        if (st.line !== undefined) this.line = st.line;
        switch (st.k) {
          case "let": locals.add(st.name); if (from(st.e).length) derived.add(st.name); else { derived.delete(st.name); snapshot(st.e); } break;
          case "write": {
            const t = st.target.ctx || locals.has(st.target.name) ? undefined : env.lookup(st.target.name);
            // the state and the effect side by side: a source of an outer block has other writers (each instance of a
            // component registers with it, or reports to it), and no equation written here could stand for it
            if (t?.kind !== "source" || t.region !== env.region || own.has(t)) break;   // own: C-3 has refused it already
            const names = [...new Set([...st.target.path.flatMap(p => typeof p === "string" ? [] : from(p, t)), ...from(st.e, t)])];
            if (!names.length) break;
            const stale = names.find(n => !/^\$\d+$/.test(n) && !locals.has(n) && !inputs.has(n));
            const fix = `write the equation, \`${t.name} = …\` (or \`source ${t.name} = …\`, ST-5, if it is also written by hand; \`pre ${t.name}\` for a value built on its last one), or write ${t.name} from the event that changes what it is computed from; a reading taken once on purpose — a measurement of the page as it is now — says so: \`peek(…)\``;
            this.advise("EFFECT_RELAY_TEAR", "C-3a", stale !== undefined
              ? `the apply block writes ${t.name} from ${stale}, which is not one of the effect's inputs: the block runs ${d.inputs.length ? "when its inputs change" : "once, when the effect is declared (it has no inputs)"}, so ${t.name} is computed from ${stale} as it was then and never follows it — ${fix}`
              : `the apply block writes ${t.name} from what the effect fired for (${names.join(", ")}): state derived through an effect is one instant late — the frame in between shows the new value beside the old ${t.name}, and the server, which runs no apply block, never computes it — ${fix}`);
            break;
          }
          case "expr": case "throw": snapshot(st.e); break;
          case "return": if (st.e) snapshot(st.e); break;
          case "sif": snapshot(st.c); walk(st.t, locals, derived); walk(st.f, locals, derived); break;
          case "for": { const l = new Set(locals).add(st.name), dv = new Set(derived); if (from(st.e).length) dv.add(st.name); else { dv.delete(st.name); snapshot(st.e); } walk(st.body, l, dv); break; }
          case "try": { walk(st.body, locals, derived); if (st.handler) walk(st.handler, new Set(st.catchName ? [...locals, st.catchName] : locals), derived); if (st.fin) walk(st.fin, locals, derived); break; }
          case "action": walk(st.body, locals, derived); break;
        }
      }
    };
    const line0 = this.line;
    walk(d.body, new Set(), new Set());
    this.line = line0;
  }

  /** E-10: an equation that never changes — it awaits nothing, reads no context, and every name it reads is a pure import,
   *  a component, an error class or such an equation (`schema = object({ email: string() })`). */
  private constEqs = new Map<Sym, boolean | null>();
  /** MO-10i: closures passed where a JS fn's declaration makes their parameters drafts, with those positions. */
  private draftFns = new Map<Expr, number[]>();
  private constantEq(s: Sym): boolean {
    if (s.kind !== "eq" || !s.eqExpr) return false;
    const memo = this.constEqs.get(s); if (memo !== undefined) return memo === true;   // null: being decided (a cycle is not constant)
    this.constEqs.set(s, null);
    const { e, env } = s.eqExpr;
    let ok = !/"k":"(await|latest|use|pre)"/.test(JSON.stringify(e));
    // RFC 14: a field read of an instance tracks (MO-10b), so an equation that reads one, or is bound to one, changes
    if (ok && s.viaField) ok = false;
    if (ok) { const rooted = new Set<string>(); rootedReads(e, rooted); ok = ![...rooted].some(n => !!env.lookup(n)?.foreign); }
    if (ok) {
      const reads = new Set<string>(); readsOutsidePeek(e, reads);
      const ts: Sym[] = []; for (const n of reads) { const t = env.lookup(n); if (t) ts.push(t); }
      for (const [, t] of this.calledReads(e, env)) ts.push(t);                            // a closure the equation calls reads what its body reads
      ok = ts.every(t => (t.kind === "import" && !t.io) || t.kind === "comp" || t.kind === "errclass" || this.constantEq(t));   // an .rx fn may read a source: not constant
    }
    if (ok && this.instanceRead(e, env, false) !== undefined) ok = false;                  // E-10 (ruled 2026-11-22): a read through a value that may be an instance
    this.constEqs.set(s, ok); return ok;
  }
  /** E-10, E-5a (ruled 2026-11-22; a closure held in a value, 2026-11-22): the closures a call may call, where the checker
   *  can see them. One written at the call, or the one its callee's name is bound to, is that closure. A callee read out
   *  of a value — `box.read()`, `fs[0]()`, `mk()()` — is the closure in that slot when the value is a literal the checker
   *  can read the slot of (`staticPart`: a record's field, an array's index, through the equations and locals that name
   *  it); otherwise it may be any closure the value holds, by mention (`heldClosures`). Calling one reads what its body
   *  reads. */
  private calledClosures(call: Expr, env: Env): { f: Extract<Expr, { k: "fn" }>; env: Env }[] {
    if (call.k !== "call") return [];
    if (call.f.k === "fn") return [{ f: call.f, env }];
    let from: { e: Expr; env: Env };
    if (call.f.k === "id") { const v = env.lookup(call.f.name)?.val; if (!v) return []; if (v.e.k === "fn") return [{ f: v.e, env: v.env }]; from = v; }
    else from = { e: call.f, env };
    // a method of a JS value — an import, the instance a declared primitive made — is JS's: what it calls is its
    // declaration's to say (CN-3b), and what it answers is the instance rule's (E-10)
    { const n = pathRoot(from.e); const t = n === undefined ? undefined : from.env.lookup(n); if (t && (t.kind === "import" || t.kind === "errclass" || t.foreign !== undefined)) return []; }
    const x = this.staticPart(from.e, from.env, 0);
    if (x.e.k === "fn") return [{ f: x.e, env: x.env }];
    const out: { f: Extract<Expr, { k: "fn" }>; env: Env }[] = [];
    this.heldClosures(from.e, from.env, new Set(), out);
    return out;
  }
  /** E-10, E-5a (2026-11-22, a closure given to a closure): a closure the checker can see, called with arguments, may
   *  call what they hold: `pick = (o) => o.total(); pick(fmt)` calls the closure in `fmt.total`, `apply = (g) => g();
   *  apply(total)` calls `total`. For each parameter the closure's body calls through (`paramUses`): the closure in that
   *  slot of the argument where what is written says which (`staticPart`), else any closure the argument holds, by
   *  mention; and any closure the argument holds when the parameter is handed on or kept. What such a call is given
   *  (`g(fmt)`, in the callee's scope) may be called in turn by the closure it reaches. */
  private argClosures(call: Expr, env: Env): { f: Extract<Expr, { k: "fn" }>; env: Env }[] {
    if (call.k !== "call") return [];
    const out: { f: Extract<Expr, { k: "fn" }>; env: Env }[] = [];
    const spread = call.args.some(a => a.k === "spread");
    for (const c of this.calledClosures(call, env)) {
      c.f.params.forEach((p, i) => {
        const u: ParamUses = { any: false, callees: [], passed: [] };
        if (c.f.stmts) for (const st of c.f.stmts) paramUses(st, p, false, false, u); else paramUses(c.f.body, p, true, false, u);   // an expression body is what the closure answers
        if (!u.any && !u.callees.length) return;
        // the argument the parameter is: its position's, or any of them behind a spread
        for (const a of spread ? call.args : call.args.slice(i, i + 1)) {
          let whole = u.any || spread;
          if (!whole) for (const path of u.callees) {
            let x = this.staticPart(a, env, 0); let read = true;
            for (const k of path) {
              let v: Expr | undefined;
              if (x.e.k === "rec") v = recField(x.e.fields, k);
              else if (x.e.k === "arr" && /^\d+$/.test(k)) { const n = Number(k); if (!x.e.items.slice(0, n + 1).some(y => y.k === "spread")) v = x.e.items[n]; }
              if (!v) { read = false; break; }
              x = this.staticPart(v, x.env, 0);
            }
            if (!read) { whole = true; break; }
            if (x.e.k === "fn") { const f = x.e; if (!out.some(o => o.f === f)) out.push({ f, env: x.env }); }
            else this.heldClosures(x.e, x.env, new Set(), out);
          }
          if (whole) this.heldClosures(a, env, new Set(), out);
        }
        // what the body gives the closure it calls, the closure may call
        for (const x of u.passed) this.heldClosures(x, c.env, new Set(), out);
      });
    }
    return out;
  }
  /** The expression a path denotes, where what is written says so: a name bound by an equation or a local is its value
   *  (neither is ever written), a field of a record literal is that field, an index of an array literal that item.
   *  Anything else is itself. */
  private staticPart(e: Expr, env: Env, depth: number): { e: Expr; env: Env } {
    if (depth > 32) return { e, env };
    if (e.k === "id") { const s = env.lookup(e.name); const v = s && (s.kind === "eq" || s.kind === "value") ? s.val : undefined; return v ? this.staticPart(v.e, v.env, depth + 1) : { e, env }; }
    if (e.k === "member") { const r = this.staticPart(e.o, env, depth + 1); const v = r.e.k === "rec" ? recField(r.e.fields, e.p) : undefined; return v ? this.staticPart(v, r.env, depth + 1) : { e, env }; }
    if (e.k === "index") {
      const r = this.staticPart(e.o, env, depth + 1); const k = litKey(e.i); let v: Expr | undefined;
      if (r.e.k === "rec" && k !== undefined) v = recField(r.e.fields, k);
      else if (r.e.k === "arr" && k !== undefined && e.i.k === "lit" && typeof e.i.v === "number") { const n = Number(k); if (!r.e.items.slice(0, n + 1).some(x => x.k === "spread")) v = r.e.items[n]; }
      return v ? this.staticPart(v, r.env, depth + 1) : { e, env };
    }
    return { e, env };
  }
  /** Every closure a value may hold, by mention: the closures written in its expression (and in the closures those
   *  return), and those of the values its names are bound to. */
  private heldClosures(e: Expr, env: Env, seen: Set<Sym>, out: { f: Extract<Expr, { k: "fn" }>; env: Env }[]) {
    const walk = (x: Expr, env: Env) => {
      if (x.k === "fn") { if (!out.some(o => o.f === x)) out.push({ f: x, env }); }
      else if (x.k === "id") { const s = env.lookup(x.name); if (s && !seen.has(s)) { seen.add(s); if (s.val) walk(s.val.e, s.val.env); } }
      for (const k of subExprs(x)) walk(k, env);
    };
    walk(e, env);
  }
  /** The names read by the closures an expression calls (outside `peek`), each with the symbol it names there. */
  private calledReads(e: Expr, env: Env): [string, Sym][] {
    const out: [string, Sym][] = []; const seen = new Set<Expr>();
    const walk = (x: Expr, env: Env) => {
      if (x.k === "peek" || x.k === "fn" || x.k === "serverfn") return;
      if (x.k === "call") {
        for (const c of [...this.calledClosures(x, env), ...this.argClosures(x, env)]) if (!seen.has(c.f)) {
          seen.add(c.f);
          const ns = new Set<string>(); freeNames(c.f, new Set(), ns);
          for (const name of ns) { const n = name.replace(/^pre:/, ""); const t = c.env.lookup(n); if (t) out.push([n, t]); }
          for (const k of subExprs(c.f)) walk(k, c.env);
        }
      }
      for (const k of subExprs(x)) walk(k, env);
    };
    walk(e, env);
    return out;
  }
  /** E-10, E-5a (ruled 2026-11-22): the first read, in `e`, through a value that may be the instance a primitive made
   *  (MO-10k, by mention) — as written. An instance never changes, so naming it and passing it whole
   *  read nothing that does; a field of it tracks (MO-10b), and what
   *  a method of it answers the declaration does not say. So a field read, an index or a method call on anything that
   *  may be the instance — an alias's record, an array holding it, what a call given it returns, a parameter of a closure
   *  handed it — is a read of what may change, and so is handing it to a function of `.rx` that the checker cannot see
   *  into. A JS fn takes it whole (the exemption). A closure reads when it is called: one written among a call's
   *  arguments, or called by the name it is bound to, is read here. `peeks`: look inside `peek`. */
  /** MO-11s: a root of a library's own — nothing above reaches what is checked under it */
  private rootOf(): Region { return this.region(null, "root"); }
  private instanceRead(e: Expr, env: Env, peeks: boolean): string | undefined { return this.instRead(e, env, peeks, new Set(), new Set()); }
  private mayBeInstance(e: Expr, env: Env, tp: Set<string>): boolean {
    for (const n of this.flowNames(e, env)) { if (tp.has(n)) return true; const t = env.lookup(n); if (t && this.tainted(t, "instance")) return true; }
    return false;
  }
  private instRead(e: Expr, env: Env, peeks: boolean, tp: Set<string>, seen: Set<Expr>): string | undefined {
    const kids = (x: Expr, env: Env, tp: Set<string>): string | undefined => { for (const c of subExprs(x)) { const r = this.instRead(c, env, peeks, tp, seen); if (r !== undefined) return r; } return undefined; };
    switch (e.k) {
      case "peek": if (!peeks) return undefined; break;
      case "fn": case "serverfn": return undefined;
      case "member": case "index": if (!literalPart(e) && this.mayBeInstance(e.o, env, tp)) return show(e); break;   // a slot of a literal written here is that slot (`[clock, 5][1]`): no read through the instance
      case "call": {
        const mc = methodCallee(e.f);
        const recv = e.f.k === "member" || e.f.k === "index" ? e.f.o : undefined;
        { const r = this.instRead(e.f, env, peeks, tp, seen); if (r !== undefined) return mc ? `${r}(…)` : r; }
        // what the call is given
        const given = e.args.map(a => this.mayBeInstance(a, env, tp));
        const recvGiven = !!recv && this.mayBeInstance(recv, env, tp);
        // a JS fn takes an instance whole (E-10); its closures are callbacks, called later
        const fs = e.f.k === "id" ? env.lookup(e.f.name) : undefined;
        const isJs = (t?: Sym) => !!t && (t.kind === "import" || (t.kind === "fn" && t.foreign !== undefined) || t.kind === "errclass");
        let root: Expr = e.f; while (root.k === "member" || root.k === "index") root = root.o;                 // a method of a JS import is JS too
        const js = e.f.k === "id" ? isJs(fs) : (e.f.k === "member" || e.f.k === "index") && root.k === "id" && isJs(env.lookup(root.name));
        const builtin = e.f.k === "id" && !fs;
        if (!js) {
          // a closure written among the arguments is called with the others, or with what it is called on
          for (let i = 0; i < e.args.length; i++) {
            const a = e.args[i]; if (a.k !== "fn") continue;
            const handed = recvGiven || given.some((g, j) => j !== i && g);
            const tp2 = new Set(tp); for (const p of a.params) { if (handed) tp2.add(p); else tp2.delete(p); }
            const r = kids(a, env, tp2); if (r !== undefined) return r;
          }
          // a closure the checker can see is called: its body is read, its parameters what it is given
          const called = this.calledClosures(e, env);
          for (const c of called) if (!seen.has(c.f)) {
            seen.add(c.f);
            const tp2 = new Set<string>(); c.f.params.forEach((p, i) => { if (given[i]) tp2.add(p); });
            const r = kids(c.f, c.env, tp2); if (r !== undefined) return r;
          }
          // and what it calls through a parameter, of what it is given (a closure given to a closure): called with
          // what the callee has — its other arguments among them
          for (const c of this.argClosures(e, env)) if (!seen.has(c.f)) {
            seen.add(c.f);
            const tp2 = new Set<string>(recvGiven || given.some(g => g) ? c.f.params : []);
            const r = kids(c.f, c.env, tp2); if (r !== undefined) return r;
          }
          if (!called.length && !builtin) {
            // a function of `.rx` the checker cannot see into (an .rx fn, a prop, a parameter, a closure held in a record:
            // a method of anything that is not the instance or JS), given it
            const i = given.indexOf(true);
            if (i >= 0) return `${show(e.f)}(…), which is given ${show(e.args[i])} and may read through it`;
          }
        }
        for (const a of e.args) { const r = this.instRead(a, env, peeks, tp, seen); if (r !== undefined) return r; }
        return undefined;
      }
    }
    return kids(e, env, tp);
  }
  private snapshotArgs(call: Extract<Expr, { k: "call" }>, f: Sym, env: Env) {
    f.params!.forEach((p, i) => {
      const a = call.args[i]; if (!a || p.ref) return;
      const reads = new Set<string>(); readsOutsidePeek(a, reads);
      const rooted = new Set<string>(); rootedReads(a, rooted);   // RFC 14: the instance passed whole is exempt; a field read through it is not
      // a method called on it is a call whose answer may change: what a method gives back may track (E-10)
      const methods: [string, string][] = []; methodCalls(a, methods);
      const instance = (s: Sym) => s.foreign === "value" || s.foreign === "comp" || (typeof s.foreign === "object" && "fields" in s.foreign);
      const undeclared = (s: Sym, n: string) => methods.find(([r]) => r === n)?.[1];
      const exempt = (s: Sym, n: string) => instance(s) && !s.viaField && !rooted.has(n);
      let hit = [...reads].find(n => { const s = env.lookup(n); return s && reactiveKinds.has(s.kind) && !(exempt(s, n) && undeclared(s, n) === undefined) && !this.constantEq(s); });   // E-10: an instance a primitive made (its value result) is made once and never changes; so does an equation that reads nothing that changes
      if (hit) { const s = env.lookup(hit)!; const m = exempt(s, hit) ? undeclared(s, hit) : undefined; if (m !== undefined) hit = `${hit}.${m}(…), a method of the instance ${hit}: what a method answers may change (where it is made once, say so: \`peek ${hit}.${m}(…)\`)`; }
      // E-10: a field read through a `for` row (`counter(r.x)`): the row is a constant (RG-2b), but its fields are written
      // by path or reconciled by key while it lives (ST-4a). The row passed whole reads no field; `peek r.x` is meant
      if (!hit) { const row = [...rooted].find(n => !!env.lookup(n)?.rowOf); if (row) hit = `a field of the row ${row}`; }
      // E-10 (ruled 2026-11-22): a closure the argument calls reads what its body reads
      if (!hit) for (const [n, s] of this.calledReads(a, env)) if (reactiveKinds.has(s.kind) && !this.constantEq(s)) { hit = `${n}, in a closure it calls`; break; }
      // and a read through anything that may be an instance is a read of what may change
      if (!hit) { const r = this.instanceRead(a, env, false); if (r !== undefined) hit = `${r}, through a value that may be the instance a primitive made: a field of it tracks, and what a method answers may change (read it where it is used, or say it is read once: \`peek\`)`; }
      if (hit) this.err("SNAPSHOT_ARGUMENT", "E-10", `${f.name}(…): the argument for value parameter ${p.name} reads ${hit} and would be snapshotted — declare the parameter \`ref\`, or pass peek(…)`);
    });
  }

  // ---- E-5a: a peek kept where it is read, of a value that changes ----
  /** Expressions whose value is kept and re-read — an equation, a provision, a context's default, what a view reads, a
   *  component's argument, a `ref` argument — that contain a `peek`. A source's seed and a value argument are snapshots by
   *  rule (E-4, E-10), an effect's compute half runs its apply, and a closure reads when it is called: none is kept. */
  private keptPeeks: { e: Expr; env: Env; line: number }[] = [];
  private changed = new Set<Sym>();                                      // written, guessed, refreshed or affected here
  private escapes = new Set<string>();                                   // components passed as values: JS applies them
  private chMemo = new Map<Sym, Ch>();
  private deferred: PeekFacts["deferred"] = [];
  private keep(e: Expr, env: Env) { if (peeksIn(e).length) this.keptPeeks.push({ e, env, line: this.line }); }
  /** Whether `e` can change — counting what it reads outside `peek` (`out`), inside it (`in`), or both (`all`). */
  private chOf(e: Expr, env: Env, mode: "all" | "out" | "in"): Ch {
    const acc = this.chWalk(e, env, mode, noCh(), false);
    // E-5a (ruled 2026-11-22): a read through a value that may be an instance is a read of what may change
    if (!acc.yes && this.instanceRead(e, env, mode !== "out") !== undefined) acc.yes = true;
    return acc;
  }
  private chWalk(e: Expr, env: Env, mode: "all" | "out" | "in", acc: Ch, inPeek: boolean): Ch {
    const counting = mode === "all" || (mode === "in") === inPeek;
    // a closure the checker can see is called (one written at the call, or the one its name is bound to): the call reads
    // what its body reads (ruled 2026-11-22)
    for (const c of [...this.calledClosures(e, env), ...this.argClosures(e, env)]) if (!this.chFns.has(c.f)) { this.chFns.add(c.f); for (const k of subExprs(c.f)) this.chWalk(k, c.env, mode, acc, inPeek); this.chFns.delete(c.f); }
    switch (e.k) {
      case "peek": if (mode !== "out") this.chWalk(e.e, env, mode, acc, true); return acc;
      case "fn": case "serverfn": return acc;                                              // a closure reads when it is called
      case "id": if (counting) this.addCh(acc, this.symCh(env.lookup(e.name))); return acc;
      case "pre": if (counting) this.addCh(acc, this.symCh(env.lookup(e.name))); if (e.init) this.chWalk(e.init, env, mode, acc, inPeek); return acc;
      case "use": { const c = env.lookup(e.name); if (counting && c?.kind === "context") { if (/\.d\.rx#/.test(c.ctx!.key)) acc.yes = true; else acc.deps.add(`ctx|${c.ctx!.key}`); } return acc; }   // a JS context's provider is JS
      case "call":                                                                         // a method called on a name reads no field of it (E-10's exemption): the name, and the arguments
        { const mc = methodCallee(e.f); if (mc && mc.o.k === "id" && env.lookup(mc.o.name)?.kind !== "props") { const on = mc.o.name; if (counting) { const r = env.lookup(on); if (r?.kind === "eq" && r.foreign !== undefined) acc.yes = true;   /* E-10 (bounded): a method of a primitive's instance may answer something that changes */ this.addCh(acc, this.symCh(r)); } for (const a of e.args) this.chWalk(a, env, mode, acc, inPeek); return acc; } }
        break;
      case "member": case "index": {
        const o = e.k === "member" && e.o.k === "id" ? env.lookup(e.o.name) : undefined;
        if (o?.viewOf) { if (counting) acc.yes = true; return acc; }   // RG-4c: what the component shows its view with, it can change
        if (o?.kind === "props") { if (counting) acc.deps.add(`prop|${o.region.key ?? ""}|${(e as Extract<Expr, { k: "member" }>).p}`); return acc; }
        // a field read through a primitive's instance tracks (MO-10b); one through a row changes when its list does: the
        // row is constant (RG-2b), its fields are written by path or reconciled by key (ST-4a)
        let x: Expr = e; while (x.k === "member" || x.k === "index") x = x.o;
        const root = counting && x.k === "id" ? env.lookup(x.name) : undefined;
        if (root?.kind === "eq" && root.foreign) acc.yes = true;
        else if (root?.rowOf) this.addCh(acc, this.rowCh(root));
        break;
      }
      case "await": if (counting) acc.yes = true; break;                                   // it loads: pending, then a value
    }
    for (const x of subExprs(e)) this.chWalk(x, env, mode, acc, inPeek);
    return acc;
  }
  /** E-5a: whether a row's fields can change: whether the list it is a row of does. */
  private rowCh(row: Sym): Ch {
    const m = this.chMemo.get(row); if (m) return m;
    this.chMemo.set(row, noCh());
    const r = this.chOf(row.rowOf!.e, row.rowOf!.env, "out"); this.chMemo.set(row, r); return r;
  }
  private addCh(acc: Ch, c: Ch) { if (c.yes) acc.yes = true; for (const d of c.deps) acc.deps.add(d); }
  private symCh(s: Sym | undefined): Ch {
    if (!s) return noCh();
    const m = this.chMemo.get(s); if (m) return m;
    this.chMemo.set(s, noCh());                                                            // a cycle adds nothing
    const r = this.symChOf(s); this.chMemo.set(s, r); return r;
  }
  private symChOf(s: Sym): Ch {
    const ch = (yes: boolean, dep?: string): Ch => ({ yes, deps: new Set(dep ? [dep] : []) });
    if (s.exportKey) return ch(false, `exp|${s.exportKey}`);                              // an .rx import: its module knows
    switch (s.kind) {
      case "props": return s.viewOf ? ch(true) : ch(false, `prop|${s.region.key ?? ""}|*`);
      case "import": return ch(!!s.reader);
      case "source": return this.changed.has(s) ? ch(true) : s.question && s.expr && s.env ? this.chOf(s.expr, s.env, "out") : ch(false);
      case "eq": {
        if (s.param || s.reader || this.changed.has(s)) return ch(true);                  // a ref parameter: the caller's, reactive
        if (s.foreign) return ch(!!s.viaField || s.foreign === "ref" || !!s.held?.length || (typeof s.foreign === "object" && ("items" in s.foreign ? s.foreign.items : s.foreign.fields.map(f => f[1])).includes("ref")));   // MO-10b: a value result is made once; a reader, or a field that holds, changes
        return s.eqExpr ? this.chOf(s.eqExpr.e, s.eqExpr.env, "out") : ch(true);
      }
      case "fn": return s.fnTail && s.fnEnv ? this.chOf(s.fnTail, s.fnEnv, "out") : ch(false);   // a JS fn is pure (R-io)
      default: return ch(false);
    }
  }
  /** At the end of the module: a kept peek of what can change. Not when the rest of the expression changes — then the peek is
   *  a sample, read again each time (`a + peek b`). With the whole program (`whole`), what only another module can tell waits. */
  private keptPeekCheck() {
    for (const k of this.keptPeeks) {
      const o = this.chOf(k.e, k.env, "out");
      if (o.yes) continue;
      for (const p of peeksIn(k.e)) {
        const pc = this.chOf(p.e, k.env, "all");
        if (!pc.yes && !pc.deps.size) continue;
        this.line = k.line;
        // E-9b: a call of a fn that only names values is a part of the equation, so what it is given is kept with it
        const lifted = k.e.k === "call" && k.e.f.k === "id" && k.env.lookup(k.e.f.name)?.fnDecl?.named ? ` (an argument of ${k.e.f.name}(…), a lifted call: a fn that only names values is a part of the equation that calls it, E-9b)` : "";
        if (!this.opts.whole) this.err("SNAPSHOT_KEPT", "E-5a", keptMsg(p, whyOf(p, pc)) + lifted);
        else if (pc.yes && !o.deps.size) this.err("SNAPSHOT_KEPT", "E-5a", keptMsg(p, whyOf(p, pc)) + lifted);
        else this.deferred.push({ line: k.line, peek: p, p: pc, o });
      }
    }
  }
  /** E-5a: what the whole-program pass needs from this module. */
  peekFacts(p: Program): PeekFacts {
    const file = this.opts.file ?? "main.rx";
    const apps = this.apps.filter(a => a.comp.key).flatMap(a => a.args.map(x => ({ key: a.comp.key!, field: x.field, ch: this.chOf(x.e, x.env, "out") })));
    const provs = this.provisions.map(x => ({ key: x.key, ch: this.chOf(x.e, x.env, "out") }));
    const exports: PeekFacts["exports"] = []; const exported: string[] = []; const aliases: [string, string][] = [];
    for (const d of p.decls) {
      if (!(d as { exported?: boolean }).exported || !("name" in d)) continue;
      const s = this.rootEnv?.vars.get(d.name); if (!s) continue;
      if (s.kind === "comp") { const k = s.compRegion?.key; if (k) { exported.push(k); if (d.k === "component" && d.isDefault) aliases.push([`${file}#default`, k]); } }
      else if (s.kind === "source" || s.kind === "eq" || s.kind === "fn") exports.push({ key: `${file}#${d.name}`, ch: this.symCh(s) });
    }
    return { apps, provs, exports, escapes: [...this.escapes], exported, aliases, deferred: this.deferred };
  }

  /** CN-4a: a written row narrower than the inferred one. Rows are checked only when written (`x: pending T`). */
  private rowCheck(name: string, type: string | undefined, env: Env) {
    if (!type) return; const m = ROW_WORDS.exec(type); if (!m) return;
    const words = m[0].trim().split(/\s+(?![^(]*\))/);
    const written = new Set(words.map(w => w.replace(/\(.*$/, "")));
    const inferred = env.vars.get(name)?.rows?.() ?? new Set();
    for (const r of inferred) if (!written.has(r)) this.err("ROW_NARROWER_THAN_INFERRED", "CN-4a", `${name} is declared \`${m[0].trim()}\` but its value is also \`${r}\``);
    const fw = words.find(w => w.startsWith("fails("));                                    // R-f-9: a written failure row bounds the inferred one
    const line = this.line;
    this.later.push(() => {
      const f = env.vars.get(name)?.failsT?.(); if (!f) return;
      const allowed = fw ? fw.slice(6, -1).split("|").map(x => x.trim()).filter(Boolean) : null;
      const all = !allowed || allowed.includes("Error");
      if (fw === undefined) { if (!f.cls.size) return; }
      for (const c of f.cls) if (fw === undefined || (!all && !allowed!.includes(c))) { this.line = line; this.err("ROW_NARROWER_THAN_INFERRED", "CN-4a", `${name} is declared \`${m[0].trim()}\` but its value also fails with ${c}`); }
    });
  }
  /** R-f-1: a name in a catch, a boundary or an import's `fails` must be an error class (declared, or a JS class imported). */
  private errClass(n: string, env: Env) {
    if (n === "Error" || n === "Panic") return;                                           // the top class; R-f-10's panics-only
    const s = env.lookup(n);
    if (!s || (s.kind !== "errclass" && s.kind !== "import")) this.err("NOT_AN_ERROR_CLASS", "R-f-1", `${n} is not an error class (declare it: \`error ${n}(…)\`)`);
  }

  // ---- expressions ----
  private resolve(name: string, env: Env, ctx: Ctx): Sym | undefined {
    const s = env.lookup(name);
    if (s?.noProps) this.err("UNBOUND", "RG-4b", `${name} is not declared here: component ${s.noProps} declares no props — declare what it takes, \`component ${s.noProps}(props: { … })\`, and pass it where it is applied`);
    if (s) { this.sided(s, ctx); return s; }
    const l = lang(env, name);
    if (l === "fn") return undefined;
    if (ctx.scope === "imperative" && (l === "log" || /^\$\d+$/.test(name))) return undefined;   // the apply block's parameters; `log` is io and only in imperative scope
    this.err("UNBOUND", "SCOPE", HARNESS.has(name) ? `${name} is not declared here${HARNESS.get(name)}` : JS_GLOBALS.has(name) ? `${name} is not declared here: JavaScript's globals are not in scope — export what you use of it from a \`.js\` module, and import that` : `${name} is not declared here (a component sees its declaration site, not its caller — RG-7a)`);
    return undefined;
  }
  /** 12 SF-3/SF-5: what a name may be on this side. In a server body: nothing reactive (captured by kind, not position), and
   *  no `client` JS; elsewhere: no `server` JS. */
  private sided(s: Sym, ctx: Ctx) {
    if (!ctx.server) { if (s.side === "server") this.err("SERVER_ONLY", "SF-5a", `${s.name} is \`server\` JS: it is not in the client bundle — call it in a \`server fn\` body`); return; }
    if (s.side === "client") { this.err("CLIENT_IN_SERVER", "SF-5c", `${s.name} is \`client\` JS and this is a server function's body`); return; }
    const what = reactiveKinds.has(s.kind) ? (s.kind === "source" ? "a source" : s.kind === "eq" ? "an equation" : "the component's props") : s.kind === "context" ? "a context" : s.kind === "comp" ? "a component" : s.kind === "action" ? "a client action" : null;
    const via = what ? null : s.kind === "fn" ? this.reach(s, new Set()) : null;
    if (what || via) this.err("SERVER_CAPTURE", "SF-3", `a server function's body names ${s.name}, ${what ?? `a fn that reads ${via}`}: it runs in its own request on the server, where that is not the client's — pass what it needs as an argument`);
  }
  /** SF-3: the reactive state a value fn reads, through the fns it calls; null if none. */
  private reach(f: Sym, seen: Set<Sym>): string | null {
    if (seen.has(f) || !f.fnDecl || !f.declEnv) return null; seen.add(f);
    const d = f.fnDecl; const names = new Set<string>(); const bound = new Set([...d.params.map(p => p.name), ...d.decls.flatMap(x => "name" in x ? [x.name] : [])]);
    for (const x of d.decls) if (x.k === "eq") freeNames(x.e, bound, names); else if (x.k === "source") freeNames(x.init, bound, names);
    freeNames(d.tail, bound, names);
    const u = /"k":"use","name":"([^"]+)"/.exec(JSON.stringify([d.decls, d.tail])); if (u) return `use ${u[1]}`;
    for (const n0 of names) {
      const n = n0.startsWith("pre:") ? n0.slice(4) : n0; const s = f.declEnv.lookup(n); if (!s) continue;
      if (reactiveKinds.has(s.kind) || s.kind === "context") return n;
      if (s.kind === "fn") { const r = this.reach(s, seen); if (r) return `${n} → ${r}`; }
    }
    return null;
  }
  // ---- MO-10k: values the checker confines, by mention ----
  /** The names `e`'s value may come from (`flows`), read in `env`. */
  private flowNames(e: Expr, env: Env): Set<string> { const out = new Set<string>(); flows(e, new Set(), new Map(), { builtin: n => !env.lookup(n), prim: x => this.declPrim(x, env) }, out); return out; }
  /** MO-10k: the declared type of a path over a declared JS result — the bound name, a field of it, what a method of it
   *  answers, an element (a `for` row, an index) — where the declaration's text says it (`tyStep`). */
  private declTy(e: Expr, env: Env, depth = 0): string | undefined {
    if (depth > 32) return undefined;
    const step = (t: string | undefined, s: TStep) => t === undefined ? undefined : tyStep(t, s);
    switch (e.k) {
      case "id": {
        const sy = env.lookup(e.name);
        if (sy?.kind === "props") return this.propsTy.get(sy.region);                          // a component's props are what its props type says (2026-11-22)
        if (sy?.kind === "import" && sy.constTy !== undefined) return sy.constTy;                // MO-8t: a declared value's type says what its function fields answer, as a declared result's does
        if (!sy || (sy.kind !== "eq" && sy.kind !== "value")) return undefined;
        if (sy.retTy !== undefined) return sy.retTy;
        if (sy.rowOf) return step(this.declTy(sy.rowOf.e, sy.rowOf.env, depth + 1), "elem");
        const v = sy.val; if (!v) return undefined;
        return v.e.k === "id" || v.e.k === "member" || v.e.k === "index" || v.e.k === "call" || v.e.k === "use" ? this.declTy(v.e, v.env, depth + 1) : undefined;
      }
      case "use": return env.lookup(e.name)?.ctx?.ty;                                          // what a context provides is what its declaration types it (2026-11-22)
      case "member": return step(this.declTy(e.o, env, depth + 1), { field: e.p });
      case "index": { const t = this.declTy(e.o, env, depth + 1); const k = litKey(e.i); const item = t !== undefined && e.i.k === "lit" && typeof e.i.v === "number" ? tyItem(t, e.i.v) : undefined; return item ?? ((e.i.k === "lit" && typeof e.i.v === "number") || k === undefined ? step(t, "elem") : step(t, { field: k })); }
      case "call": return e.f.k === "member" || e.f.k === "index" ? step(this.declTy(e.f, env, depth + 1), "call") : e.f.k === "id" ? env.lookup(e.f.name)?.retIo : undefined;   // MO-10b: what a declared fn answers, where its row marks a part `io`
      default: return undefined;
    }
  }
  /** MO-10k: a value its declaration says is a primitive (a declared scalar field, what a declared method answers) holds
   *  no part of the value it was read from. */
  private declPrim(e: Expr, env: Env): boolean { const t = this.declTy(e, env); return t !== undefined && tyScalar(t); }
  /** MO-10k: whether `e`'s value may be, or hold, a value of kind `k`: the first name it mentions that may, and the binding
   *  that value was made at. */
  private gives(e: Expr, env: Env, k: Taint): { n: string; root: Sym } | undefined {
    for (const n of this.flowNames(e, env)) {
      const s = env.lookup(n); if (!s) continue;
      const root = this.tainted(s, k); if (root) return { n, root };
    }
    return undefined;
  }
  private propsTy = new Map<Region, string>();            // a component's props type, as written (its row words taken out)
  private taintMemo: Record<Taint, Map<Sym, Sym | null>> = { instance: new Map() };
  private taintBusy: Record<Taint, Set<Sym>> = { instance: new Set() };
  private taintCut = 0;
  /** MO-10k: a name may be, or hold, a value of kind `k` when it is bound to one (`taintRoot`), or to an expression that
   *  mentions a name that may (`flows`): an equation's or a local's value, the list a row or a loop variable goes through,
   *  the arguments a parameter may be given, what an `.rx` fn or an action of this module returns. A name whose value comes
   *  from where the checker cannot look — a prop, a parameter of a function passed as a value, a source, an import — is not
   *  one. A least fixpoint: a name being decided adds
   *  nothing, and an answer found short of one is not kept. */
  private tainted(s: Sym, k: Taint): Sym | undefined {
    const memo = this.taintMemo[k]; if (memo.has(s)) return memo.get(s) ?? undefined;
    const busy = this.taintBusy[k]; if (busy.has(s)) { this.taintCut++; return undefined; }
    busy.add(s); const cut = this.taintCut;
    const r = this.taintedOf(s, k);
    busy.delete(s);
    if (r || this.taintCut === cut) memo.set(s, r ?? null);
    return r;
  }
  private taintRoot(s: Sym, k: Taint): boolean {
    return s.kind === "eq" && !s.viaField && (s.foreign === "value" || (typeof s.foreign === "object" && "fields" in s.foreign));
  }
  private taintedOf(s: Sym, k: Taint): Sym | undefined {
    if (this.taintRoot(s, k)) return s;
    const from: { e: Expr; env: Env }[] = [];
    if (s.val) from.push(s.val);
    if (s.rowOf) from.push(s.rowOf);
    if (s.srcs) from.push(...s.srcs);
    for (const x of from) { const g = this.gives(x.e, x.env, k); if (g) return g.root; }
    if (s.retFlows) for (const n of s.retFlows.names) { const t = s.retFlows.env.lookup(n); if (!t) continue; const r = this.tainted(t, k); if (r) return r; }
    return undefined;
  }
  /** What every call does for the values the checker confines (MO-10i, MO-10k), whether it is written in an
   *  expression or is the instantiation an equation binds. */
  private callMarks(f: Expr, args: Expr[], env: Env) {
    this.calleeIds.add(f);
    // MO-10i: the callbacks this call hands a library's draft — by the callee's own name, or a part read off a result
    // (`st[1](…)`). Each is a closure written here, so its parameter is known to be the draft
    const drafts = f.k === "id" ? env.lookup(f.name)?.drafts ?? [] : this.partDraftsOf(f, env) ?? [];
    for (const [i, ps] of drafts) {
      const a = args[i];
      if (a?.k === "fn") this.draftFns.set(a, ps);
      else if (a?.k === "id" && (() => { const u = env.lookup(a.name)?.updater; return !!u && JSON.stringify(u) === JSON.stringify(ps); })()) this.updaterOk.add(a);   // …or the name of a closure used for nothing else (`updaterPositions`): its parameter is known as well
      else if (a) this.err("DRAFT_ESCAPES", "MO-10i", `${show(f)}(…) hands this callback a library's draft: write the callback here, as a closure (\`(d) => { … }\`) — a function made elsewhere would be given the draft where the checker cannot see what it does with it`);
    }
    // MO-10i (closed 2026-11-22): a method called on a draft, or on what such a method answers, is one of plain data's, by
    // name. One that calls a function it is given takes it as a closure written here: the closure is called now, with
    // places of the draft, so its parameters are the draft's as a loop's variable is
    if ((f.k === "member" || f.k === "index") && this.draftChain(f.o, env)) {
      const m = f.k === "member" ? f.p : litKey(f.i);
      if (m !== undefined && DRAFT_CALLBACKS.has(m)) args.forEach((a, i) => {
        if (a.k === "fn") { if (!this.draftFns.has(a)) this.draftFns.set(a, a.params.map((_, j) => j)); }
        else if (i === 0) this.err("DRAFT_ESCAPES", "MO-10i", `${show(f)}(…) calls the function it is given with parts of a library's draft: write it here, as a closure (\`(x) => …\`), whose parameters are then places of the draft — a function made elsewhere would be handed them where the checker cannot see what it does with them`);
      });
      else if (m === undefined || !DRAFT_METHODS.has(m)) this.err("DRAFT_ESCAPES", "MO-10i", `${show(f)}(…) is called on a library's draft, and it is not a method of plain data the checker knows (an Array's, a Map's, a Set's, a string's): what it does with the draft, and with what it is given, cannot be seen — read the value first (\`let v = ${show(f.o)}\`, a copy) and call it on that`);
    }
    // MO-10k: a closure written among a call's arguments may be handed any of the others, or what it is called on; one
    // called where it is written, its arguments
    const recv = f.k === "member" || f.k === "index" ? [f.o] : [];
    args.forEach((a, i) => { if (a.k === "fn") this.fnSrcs.set(a, [...recv, ...args.filter((_, j) => j !== i)].map(x => ({ e: x, env }))); });
    if (f.k === "fn") this.fnSrcs.set(f, args.map(x => ({ e: x, env })));
    // W2 (2026-11-26): a closure given to one of the language's methods that call now is handed an item of what the
    // method runs over (the second parameter of `reduce`'s): its parameter holds what an item holds
    const method = f.k === "member" ? f.p : f.k === "id" && lang(env, f.name) === "fn" ? f.name : undefined;
    if (method !== undefined && CALLS_NOW.has(method) && method !== "replace") {
      const over = f.k === "member" ? f.o : args[0];
      if (over) for (const a of f.k === "member" ? args : args.slice(1)) if (a.k === "fn") this.itemOf.set(a, { k: method === "reduce" ? 1 : 0, e: over, env });
    }
  }
  /** W2: a closure's parameter that a calling method hands an item of a list (`callMarks`) */
  private itemOf = new Map<Expr, { k: number; e: Expr; env: Env }>();
  /** MO-10i: the closures being walked (ids, innermost last) — a library's draft is its callback's alone */
  private fnStack: number[] = []; private fnSeq = 0;
  private seed?: { name: string; depth: number };                         // ST-5a (bug 42): the plain source whose seed is being walked, and the fnStack's depth there
  private updaters = new Set<Expr>();                                    // MO-10i: a draft path's updater (`d.n := v => v + 1`): applied where it is written, not a closure that runs later
  private draftCbs: number[] = [];                                       // MO-10i: the draft callbacks being walked, innermost last (their fnStack ids)
  private wholeOk = new Set<Expr>();                                     // MO-10f, MO-10i: expressions written where a result with held fields, or one with draft parts, may stand whole
  private refCalls = new Set<Expr>();                                    // MO-8l: what a `ref` attribute is, or lists: a call there runs as the element is made, under the region's owner
  private calleeIds = new Set<Expr>();                                   // MO-10i: expressions written as what a call calls
  private fnSrcs = new Map<Expr, { e: Expr; env: Env }[]>();             // MO-10k: a closure literal's other arguments in the call it is given to
  private chFns = new Set<Expr>();                                       // E-5a: the closures chOf is reading through a call of them
  /** MO-10i (ruled 2026-11-22): a library's draft is a place, not a value. Its name stands only in the callback it is the
   *  parameter of: a closure made inside may run after the library has taken the draft back, so it may not name it —
   *  except a draft path's updater, which is applied where it is written. */
  private draftHere(s: Sym, name: string) {
    if (s.draftFn !== undefined && this.fnStack[this.fnStack.length - 1] !== s.draftFn) this.err("DRAFT_ESCAPES", "MO-10i", `${name} is a library's draft, its callback's only while that call runs: a closure made inside the callback may run after the library has taken it back — use ${name} in the callback itself (a loop is \`for (const x of xs) { … }\`), or read what the closure needs into a local first (a read of a draft is a copy)`);
  }
  /** MO-10f (closed 2026-11-22): the operations of a result with held fields are its declared fields. `e` reads a member
   *  of one, or of a record of held fields below it: what is read is a field the declaration names. Anything else — a
   *  method every object inherits (`valueOf`, `toJSON`), a field the declaration does not have — is not an operation of
   *  the result: what it answers may be the result itself. A key the checker cannot name reads some field, and is not
   *  called. */
  private heldMember(e: Expr, env: Env) {
    const fp = fieldPath(e); if (!fp) return;
    const t = env.lookup(fp.root); if (!t?.held?.length) return;
    const path = fp.path; const obj = path.slice(0, -1);
    const below = (key: string) => { const segs = key.split("."); return segs.length > obj.length && obj.every((b, i) => b === undefined || b === segs[i]); };
    if (!obj.every(x => x !== undefined) || !t.held.some(h => below(h[0]))) return;
    let ty: string | undefined = t.retTy;
    for (const seg of obj) ty = ty === undefined ? undefined : tyStep(ty, { field: seg! });
    const fields = ty === undefined ? undefined : tyFields(ty);
    const whole = e.k === "member" || e.k === "index" ? show(e.o) : fp.root;
    const k = path[path.length - 1];
    if (k !== undefined && fields && !fields.some(f => f[0] === k)) this.err("RESULT_AS_VALUE", "MO-10f", `${whole}.${k} is not a field ${whole}'s declaration names (${fields.map(f => f[0]).join(", ")}): ${whole} is a JS result whose fields hold or fail where each is read, so what is read from it is one of those fields — a method every object has (\`valueOf\`, \`toJSON\`, \`toString\`) may answer the result itself, and a field the declaration leaves out has no rows; declare the field in the \`.d.rx\``);
    else if (k === undefined && this.calleeIds.has(e)) this.err("RESULT_AS_VALUE", "MO-10f", `${show(e)} is called, and its key is not one the checker can name: ${whole} is a JS result whose fields hold or fail where each is read, and a method every object has (\`valueOf\`) may answer the result itself — call a field its declaration names, \`${whole}.refetch()\``);
  }
  /** MO-10f, MO-10i (ruled 2026-11-22): a JS result whose fields hold or fail, or whose parts take drafts, is read a part
   *  at a time: its name, and a path to a record of such fields, stand only where a part is read from them (the object of
   *  `.` or `[…]`), where an equation gives them another name, or where they are compared or tested. So every read of a
   *  held field is a path the checker sees, and every draft callback is written at its setter's call. */
  private wholeUse(e: Expr, env: Env) {
    if (this.wholeOk.has(e)) return;
    let root: string; let path: (string | undefined)[];
    if (e.k === "id") { root = e.name; path = []; } else { const fp = fieldPath(e); if (!fp) return; root = fp.root; path = fp.path; }
    const t = env.lookup(root); if (!t) return;
    const under = (key: string) => { const segs = key.split("."); return segs.length > path.length && path.every((b, i) => b === undefined || b === segs[i]); };
    const h = t.held?.find(h => under(h[0]));
    if (h) {
      const field = h[0].split(".")[path.length] ?? ""; const what = show(e);
      this.err("RESULT_AS_VALUE", "MO-10f", `${what} is a JS result whose fields hold or fail where each is read (${what}.${field}), so it is read a field at a time: it is not passed, stored, returned, spread or shown whole — read the field here (\`${what}.${field}\`) and pass that, which carries its rows; another name for it is an equation, \`q = ${what}\``);
    } else if (!path.length && t.kind !== "fn" && t.kind !== "import" && t.partDrafts && Object.keys(t.partDrafts).length) {
      const k = Object.keys(t.partDrafts)[0]; const part = /^\d+$/.test(k) ? `${root}[${k}]` : `${root}.${k}`;
      this.err("DRAFT_ESCAPES", "MO-10i", `${root} holds a function that hands its callback a library's draft (${part}): it is called where it is bound from, \`${part}((d) => { … })\`, and not passed or stored whole — a function that travels would be given a callback the checker cannot see; share the change as an action`);
    }
  }
  /** MO-10i: the draft callbacks of a function part read off a result, `st[1]` or `st.set`. */
  private partDraftsOf(f: Expr, env: Env): [number, number[]][] | undefined {
    if (f.k !== "member" && f.k !== "index") return undefined;
    const key = f.k === "member" ? f.p : litKey(f.i);
    if (f.o.k !== "id" || key === undefined) return undefined;
    const pd = env.lookup(f.o.name)?.partDrafts;
    return pd && Object.prototype.hasOwnProperty.call(pd, key) ? pd[key] : undefined;
  }
  /** MO-10i: such a part is called where it is read, or given a name by an equation; it is not a value that travels. */
  private partUse(e: Expr, env: Env) {
    if (this.partDraftsOf(e, env) && !this.calleeIds.has(e) && !this.wholeOk.has(e)) {
      const what = show(e);
      this.err("DRAFT_ESCAPES", "MO-10i", `${what} hands its callback a library's draft: it is called here, with the callback written in the call (\`${what}((d) => { … })\`), and not passed or stored — a function that travels would be given a callback the checker cannot see; share the change as an action`);
    }
  }
  /** MO-10i (2026-11-22): where a binding is written as a call's whole argument, in this module: `name@line` → (callee's
   *  name, argument index); and the arguments so written that a draft-handing call took as its callback. */
  private argCalls = new Map<string, [string, number][]>();
  private updaterOk = new Set<Expr>();
  /** MO-10i (2026-11-22): a closure bound to `name` — an equation's or a local's — is a draft callback when the name is
   *  written, somewhere in its scope, as the argument of a call that hands that position a draft (`setTodos(up)`): its
   *  body is then checked as that callback's, its parameters at those positions the draft's. Read from what is written
   *  (`argCalls`), before the body is walked; the walk holds the name to it — `callMarks` takes the name at such a
   *  position, and any other use of it is refused where it is written. */
  private updaterPositions(name: string, line: number, e: Expr, env: Env): number[] | undefined {
    if (e.k !== "fn" || !e.params.length) return undefined;
    let found: number[] | undefined;
    for (const [callee, i] of this.argCalls.get(`${name}@${line}`) ?? []) {
      const ps = env.lookup(callee)?.drafts?.find(([j]) => j === i)?.[1]; if (!ps) continue;
      if (!found) found = ps; else if (JSON.stringify(found) !== JSON.stringify(ps)) return undefined;   // two kinds of callback: neither is assumed
    }
    if (!found) return undefined;
    this.draftFns.set(e, found); this.callbackFns.add(e);
    return found;
  }
  /** W-1a: the functions of functional writes of a source (`x := xs => …`): their parameter is the slot's value. */
  private writeFns = new Map<Expr, { name: string; env: Env }>();   // a functional write's function, and the source it writes
  /** W-1a: what `e` reads its value from, when that is reactive state of `.rx` — a source, an equation, a prop, a
   *  provision, a row of one, the value a functional write is given, or a local that names a path of one. A JS instance
   *  (a declared result) is the library's; what a call answers, a literal, and a local bound to either are the program's
   *  own to change. */
  /** MO-10i: `e` reads a JS result one of whose function parts hands out drafts — a store, read beside its setter
   *  (`[board, setBoard] = createStore(…)`, then `board.columns`): what a change in place would change outside it. */
  private storeOfDrafts(e: Expr, env: Env): string | undefined {
    let r = e; while (r.k === "member" || r.k === "index") r = r.o;
    if (r.k !== "id") return undefined;
    const s = env.lookup(r.name); if (!s || s.kind === "fn" || s.kind === "import") return undefined;
    if (s.partDrafts && Object.keys(s.partDrafts).length) return `the store ${r.name}`;
    const x = s.expr;
    if (x && (x.k === "member" || x.k === "index") && x.o.k === "id") { const o = (s.env ?? env).lookup(x.o.name); if (o && o.kind !== "fn" && o.kind !== "import" && o.partDrafts && Object.keys(o.partDrafts).length) return `the store ${r.name}`; }
    return undefined;
  }
  /** W-1a: whether `e`, read down `steps`, is an array by what the program writes: a type (`string[]`), a list, or a call
   *  that answers one. A record's own `push` (`router.push("/a")`) is a method of its own, and what nothing says is an
   *  array is let be. */
  private isList(e: Expr, env: Env, steps: TStep[] = [], depth = 0): boolean {
    if (depth > 32) return false;
    const go = (x: Expr, en = env, ss = steps) => this.isList(x, en, ss, depth + 1);
    const typed = (t: string | undefined) => { for (const s of steps) t = t === undefined ? undefined : tyStep(t, s); return t !== undefined && tyList(t); };
    if (typed(this.declTy(e, env))) return true;
    switch (e.k) {
      case "arr": return !steps.length || (steps[0] === "elem" && e.items.length > 0 && e.items.every(x => x.k === "spread" ? go(x.e) : go(x, env, steps.slice(1))));
      case "rec": { const s = steps[0]; const f = s !== undefined && typeof s === "object" ? e.fields.findLast(f => !("spread" in f) && f.key === s.field) : undefined; return !!f && !("spread" in f) && go(f.v, env, steps.slice(1)); }
      case "member": return go(e.o, env, [{ field: e.p }, ...steps]);
      case "index": { const k = litKey(e.i); return go(e.o, env, [k === undefined || (e.i.k === "lit" && typeof e.i.v === "number") ? "elem" : { field: k }, ...steps]); }
      case "if": return go(e.t) && go(e.f);
      case "bin": return (e.op === "??" || e.op === "||") && go(e.l) && go(e.r);
      case "peek": case "latest": return go(e.e);
      case "pre": return go({ k: "id", name: e.name });
      case "call":
        { const l = e.f.k === "id" ? listOf(e.f.name, env.lookup(e.f.name)) : undefined; if (l) return !steps.length || (l === "argument" && !!e.args[0] && go(e.args[0])); }
        if (e.f.k !== "member" || !["filter", "slice", "concat", "toSorted", "toReversed", "toSpliced", "map", "flatMap"].includes(e.f.p)) return false;
        return e.f.p === "map" || e.f.p === "flatMap" ? !steps.length && go(e.f.o, env, []) : go(e.f.o);
      case "id": {
        const sy = env.lookup(e.name); if (!sy) return false;
        if (sy.rowOf) return go(sy.rowOf.e, sy.rowOf.env, ["elem", ...steps]);
        const w = sy.ofFn && this.writeFns.get(sy.ofFn); if (w) return go({ k: "id", name: w.name }, w.env);
        if (sy.made) return typed(sy.made.ty) || go(sy.made.e, sy.made.env);
        return !!sy.val && go(sy.val.e, sy.val.env);
      }
      default: return false;
    }
  }
  private reactivePlace(e: Expr, env: Env, depth = 0): string | undefined {
    if (depth > 32) return undefined;
    if (e.k === "member" || e.k === "index") return this.reactivePlace(e.o, env, depth + 1);
    if (e.k === "use") return `the provision ${e.name}`;
    if (e.k !== "id") return undefined;
    const sy = env.lookup(e.name); if (!sy || sy.foreign !== undefined || sy.retTy !== undefined || sy.jsDraft) return undefined;
    if (sy.kind === "source") return `the source ${e.name}`;
    if (sy.kind === "props") return `a prop of ${e.name}`;
    if (sy.kind !== "eq" && sy.kind !== "value") return undefined;
    if (sy.rowOf) { const w = this.reactivePlace(sy.rowOf.e, sy.rowOf.env, depth + 1); return w === undefined ? undefined : `a row of ${w.replace(/^(a row of )+/, "")}`; }
    if (sy.ofFn && this.writeFns.has(sy.ofFn)) return `the value the write is given (${e.name})`;
    if (sy.handed) return `what the component hands its view (${e.name})`;
    const v = sy.val; if (!v) return undefined;
    if (v.e.k === "fn") return undefined;
    if (sy.kind === "value") return v.e.k === "id" || v.e.k === "member" || v.e.k === "index" || v.e.k === "use" ? this.reactivePlace(v.e, v.env, depth + 1) : undefined;   // a local that names a path of reactive state is that state
    return `the equation ${e.name}`;
  }
  /** MO-10b: a function field whose declared type answers nothing — `() => void`, or a promise of nothing — read off a
   *  declared JS result, a component's props or what a context provides: it is called for what it does. */
  /** MO-8t (2026-11-25): a method, one step from an import that is io — an undeclared one (R-io-4), or a declared `fn` —
   *  with no row of its own: it is io as its object is. (A declared value's method is read by its type; a `pure` import's
   *  is pure; one with a row is that row's fn, by the name the loader gave it.) Through another name of the import it is
   *  the same method, and its row is read (2026-11-24): `t = toast`, `{ success } = t`, a field of a record written here. */
  private ioMember(f: Expr, env: Env, depth = 0): string | undefined {
    if (depth > 32) return undefined;
    if (f.k === "id") { const s = env.lookup(f.name); return s && (s.kind === "eq" || s.kind === "value") && !s.io && s.val && !s.rowOf ? this.ioMember(s.val.e, s.val.env, depth + 1) : undefined; }
    if (f.k !== "member") return undefined;
    const r = this.importOf(f.o, env); if (!r) return undefined;
    const row = r.env.lookup(`${r.s.name}.${f.p}`);
    return (row ? row.io : r.s.io) ? r.s.name : undefined;
  }
  /** The import `e` is, as far as the names and the records written here say. */
  private importOf(e: Expr, env: Env, depth = 0): { s: Sym; env: Env } | undefined {
    if (depth > 32) return undefined;
    if (e.k === "peek") return this.importOf(e.e, env, depth + 1);
    if (e.k === "id") { const s = env.lookup(e.name); return s?.kind === "import" ? { s, env } : s && (s.kind === "eq" || s.kind === "value") && s.val && !s.rowOf ? this.importOf(s.val.e, s.val.env, depth + 1) : undefined; }
    if (e.k !== "member" || e.o.k !== "id") return undefined;
    const s = env.lookup(e.o.name); if (!s || (s.kind !== "eq" && s.kind !== "value") || s.val?.e.k !== "rec") return undefined;
    const f = s.val.e.fields.findLast(f => "spread" in f || f.key === e.p);
    return f && !("spread" in f) ? this.importOf(f.v, s.val.env, depth + 1) : undefined;
  }
  /** MO-10b (2026-11-26): what is called is a field or an item — or a name bound to one (`{ write } = makeClipboard()`),
   *  not one that is io by its own binding already. */
  private declaredCallee(f: Expr, env: Env): boolean {
    if (f.k === "member" || f.k === "index") return true; if (f.k !== "id") return false;
    const s = env.lookup(f.name); return !!s && !s.io && (s.kind === "eq" || s.kind === "value");
  }
  private voidMethod(f: Expr, env: Env): boolean {
    if (!this.declaredCallee(f, env)) return false;
    const t = this.declTy(f, env); if (t !== undefined && tyIo(t)) return true;
    const r = t === undefined ? undefined : tyStep(t, "call");
    return r !== undefined && (tyClean(r) === "void" || tyClean(r) === "Promise<void>");
  }
  /** MO-10b (2026-11-22): a function field whose declared type answers a promise (`mutate: (v) => Promise<T>`, `refetch`):
   *  calling it starts work. Not awaited in reactive scope, nothing waits for that work and the view is handed a promise. */
  private awaited = new WeakSet<Expr>();
  private promiseMethod(f: Expr, env: Env): boolean {
    if (!this.declaredCallee(f, env)) return false;
    const t = this.declTy(f, env); const r = t === undefined ? undefined : tyStep(t, "call");
    return r !== undefined && tyClean(r).startsWith("Promise<");
  }
  /** R-io-3, CN-1b: whether what a void function field names is an action, as far as this module says: the field of a
   *  context every provision of which, in this module, gives it a name declared by `action`. Solid's runtime names that
   *  call `ACTION_CALLED_IN_OWNED_SCOPE`; any other io is `IO_IN_REACTIVE`. */
  private provided = new Map<string, Expr[]>();
  private actionNames = new Set<string>();
  private providedAction(f: Expr, env: Env): boolean {
    if (f.k !== "member" && f.k !== "index") return false;
    const field = f.k === "member" ? f.p : litKey(f.i); if (field === undefined) return false;
    let x: { e: Expr; env: Env } = { e: f.o, env };                                          // a name's expression, through the equations and locals that name it (`c = use cart`)
    for (let i = 0; i < 32 && x.e.k === "id"; i++) { const sy = x.env.lookup(x.e.name); const v = sy && (sy.kind === "eq" || sy.kind === "value") ? sy.val : undefined; if (!v) break; x = v; }
    if (x.e.k !== "use") return false;
    const ps = this.provided.get(x.e.name);
    return !!ps?.length && ps.every(e => { const v = e.k === "rec" ? recField(e.fields, field) : undefined; return v?.k === "id" && this.actionNames.has(v.name); });
  }
  /** R-io-3 (2026-11-24): the parts of a value that are actions, as paths ("": the value itself) — carrying an action is not
   *  a call, and the value's type carries the row: through the names and the fns it goes by, as far as their literals say. */
  private partsMemo = new Map<Sym, Set<string>>(); private closureMemo = new Map<Sym, Set<string>>();
  /** SC-4b (2026-11-26): a handler the component is given — `props.onPick`, `props.ref`, the same read off a rest or a copy
   *  of its props. Its closure was written in imperative scope where the component is applied (SC-4), so inside the
   *  component it is io: given on to what takes a handler, or called from imperative scope. */
  private handlerProp(e: Expr, env: Env): boolean {
    const k = e.k === "member" ? e.p : e.k === "index" ? litKey(e.i) : undefined; if (k === undefined || !isHandler(k)) return false;
    if (tyAnswersValue(this.declTy(e, env))) return false;                                    // typed as a function called for what it answers: pure, no handler
    const of = (o: Expr, en: Env, depth: number): boolean => {
      if (depth > 16) return false;
      switch (o.k) {
        case "id": { const s = en.lookup(o.name); return !!s && (s.kind === "props" || ((s.kind === "eq" || s.kind === "value") && !!s.val && !s.rowOf && of(s.val.e, s.val.env, depth + 1))); }
        case "omit": return !o.keys.includes(k) && of(o.e, en, depth + 1);
        case "peek": return of(o.e, en, depth + 1);
        case "if": return of(o.t, en, depth + 1) || of(o.f, en, depth + 1);
        case "bin": return (o.op === "??" || o.op === "||" || o.op === "&&") && ((o.op !== "&&" && of(o.l, en, depth + 1)) || of(o.r, en, depth + 1));
        case "rec": { const f = o.fields.findLast(f => "spread" in f || f.key === k); return !!f && "spread" in f && of(f.spread, en, depth + 1); }
        default: return false;
      }
    };
    return of((e as { o: Expr }).o, env, 0);
  }
  /** …`cl`: the parts that are a statement closure written as an item or a field (B3), and nothing else (step 4). */
  private actionParts(e: Expr, env: Env, cl = false): Set<string> {
    const out = new Set<string>();
    const go = (x: Expr) => this.actionParts(x, env, cl); const memo = cl ? this.closureMemo : this.partsMemo;
    const named = (s: Sym, v: { e?: Expr; env?: Env }): Set<string> => { const m = memo.get(s); if (m) return new Set(m); memo.set(s, out); if (!v.e || !v.env) return out; const r = this.actionParts(v.e, v.env, cl); memo.set(s, r); return new Set(r); };   // one being read by itself adds nothing
    const at = (o: Set<string>, k: string | undefined) => { if (k !== undefined) for (const p of o) if (p === k) out.add(""); else if (p.startsWith(`${k}.`)) out.add(p.slice(k.length + 1)); return out; };
    const put = (k: string, v: Expr) => { for (const p of [...out]) if (p === k || p.startsWith(`${k}.`)) out.delete(p); if (!k.includes(".")) for (const p of go(v)) out.add(p === "" ? k : `${k}.${p}`); };
    switch (e.k) {
      case "id": { const s = env.lookup(e.name); if (!s) return out; if (!cl && s.kind === "action") return out.add(""); if (!cl && s.actionParts) return new Set(s.actionParts); return (s.kind === "eq" || s.kind === "value") && s.val ? named(s, s.val) : out; }
      case "member": return !cl && this.handlerProp(e, env) ? out.add("") : at(go(e.o), e.p);   // SC-4b: a handler the component is given is io, as an action is
      case "index": return !cl && this.handlerProp(e, env) ? out.add("") : at(go(e.o), litKey(e.i));
      case "rec": for (const f of e.fields) if ("spread" in f) { out.clear(); for (const p of go(f.spread)) out.add(p); } else put(f.key, f.v); return out;
      case "arr": for (const [i, x] of e.items.entries()) { if (x.k === "spread") break; put(String(i), x); } return out;
      case "if": for (const x of [e.t, e.f]) for (const p of go(x)) out.add(p); return out;
      case "bin": if (e.op === "??" || e.op === "||" || e.op === "&&") for (const x of e.op === "&&" ? [e.r] : [e.l, e.r]) for (const p of go(x)) out.add(p); return out;   // `h = props.onPick ?? other`
      case "peek": return go(e.e);
      case "fn": return e.stmts ? out.add("") : out;   // B3: a statement closure is io, as an action is
      case "call": { const f = e.f.k === "id" ? env.lookup(e.f.name) : undefined; return f?.kind !== "fn" ? out : f.actionParts && !cl ? new Set(f.actionParts) : named(f, { e: f.fnTail, env: f.fnEnv }); }
      default: return out;
    }
  }
  /** W2 (2026-11-26): the io parts of an item of a list — what a closure given to one of `CALLS_NOW` over it, or a `for`'s
   *  row, is handed: the parts of each item of a literal (after a spread too), through the names and the choices it goes
   *  by, and a list a method only narrows (`filter`, `toSorted`, `slice`, …) holds the same items. */
  private itemParts(e: Expr, env: Env, depth = 0): Set<string> {
    const out = new Set<string>(); if (depth > 16) return out;
    const go = (x: Expr, en = env) => this.itemParts(x, en, depth + 1);
    for (const p of this.actionParts(e, env)) { const [h, ...rest] = p.split("."); if (/^\d+$/.test(h)) out.add(rest.join(".")); }
    switch (e.k) {
      case "arr": for (const x of e.items) for (const p of x.k === "spread" ? go(x.e) : this.actionParts(x, env)) out.add(p); break;
      case "id": { const s = env.lookup(e.name); if (s && (s.kind === "eq" || s.kind === "value") && s.val && !s.rowOf) for (const p of go(s.val.e, s.val.env)) out.add(p); break; }
      case "if": for (const x of [e.t, e.f]) for (const p of go(x)) out.add(p); break;
      case "bin": if (e.op === "??" || e.op === "||" || e.op === "&&") for (const x of e.op === "&&" ? [e.r] : [e.l, e.r]) for (const p of go(x)) out.add(p); break;
      case "peek": for (const p of go(e.e)) out.add(p); break;
      case "call": if (e.f.k === "member" && SAME_ITEMS.has(e.f.p)) { for (const p of go(e.f.o)) out.add(p); if (e.f.p === "concat") for (const a of e.args) for (const p of go(a)) out.add(p); } break;
    }
    return out;
  }
  /** MO-8j, W2: the paths of a fn's i-th parameter it calls while it runs (`calledPaths`): of a fn of the module from its
   *  body, through the fns it calls (the cycle cut where it closes); of one imported, from its row's `calls(…)`. */
  private calledStack = new Set<Sym>(); private calledMemo = new Map<Sym, Map<number, Set<string>>>();
  private calledOf(f: Sym | undefined, i: number): Set<string> {
    if (!f || f.kind !== "fn") return new Set();
    if (!f.fnDecl) return new Set(f.calls?.[i] ?? []);
    const m = this.calledMemo.get(f)?.get(i); if (m) return m;
    if (this.calledStack.has(f)) return new Set();
    const env = f.declEnv; if (!env) return new Set(); this.calledStack.add(f);
    const r = calledPaths(f.fnDecl, i, n => env.lookup(n)?.kind === "fn", (n, j) => this.calledOf(env.lookup(n), j));
    this.calledStack.delete(f);
    if (!this.calledStack.size) { let mm = this.calledMemo.get(f); if (!mm) this.calledMemo.set(f, (mm = new Map())); mm.set(i, r); }
    return r;
  }
  /** MO-13i: the parts of what an instantiating fn answers, as far as the names its own body declares and the fns it calls
   *  say: a literal's fields and items, an action, a value made once, and for everything else one reader. */
  private results = new Map<Sym, Result | undefined>();
  private fnResult(f: Sym): Result | undefined {
    if (f.kind !== "fn") return undefined;
    if (!f.fnTail || !f.fnEnv) return f.result;
    if (!f.fnDecls) return undefined;
    if (this.results.has(f)) return this.results.get(f);
    this.results.set(f, undefined);   // a fn that answers its own result is one reader
    const r = this.result(f.fnTail, f.fnEnv, f.fnDecls, new Set(), asksOrKeeps(f.fnTail)); this.results.set(f, r); return r;
  }
  private result(e: Expr, env: Env, own: Set<string>, seen: Set<string>, one = false): Result {
    const leaf = (): Result => { const reader = one || !this.plain(e, env); return { k: "leaf", reader, rows: reader ? [...this.rowsThunk(e, env)()] : [], fails: reader ? [...this.failsThunk(e, env)().cls] : [], actions: [...this.actionParts(e, env)].sort() }; };
    if (one) return leaf();
    const at = (o: Expr, key: string | undefined): Result => { const r = key === undefined ? undefined : this.result(o, env, own, seen); return (r?.k === "rec" ? r.fields.find(f => f[0] === key)?.[1] : r?.k === "arr" ? r.items[Number(key)] : undefined) ?? leaf(); };
    switch (e.k) {
      case "id": {
        const s = env.lookup(e.name); if (s?.kind === "action") return { k: "io" };
        const v = own.has(e.name) && !seen.has(e.name) ? s?.val : undefined; if (!v) return leaf();
        const f = v.e.k === "call" && v.e.f.k === "id" ? env.lookup(v.e.f.name) : undefined;
        let r: Result | undefined;
        if (f?.kind === "fn" && f.instantiating) { r = this.fnResult(f); if (r && v.e.k === "call") r = this.readWith(r, v.e.args.filter((_, i) => f.params?.[i]?.ref), env); }
        else r = this.result(v.e, env, own, new Set([...seen, e.name]));
        return !r || r.k === "leaf" && r.reader ? leaf() : r;
      }
      case "member": return e.opt ? leaf() : at(e.o, e.p);
      case "index": return e.opt ? leaf() : at(e.o, litKey(e.i));
      case "rec": { const keys = e.fields.map(f => "spread" in f ? "" : f.key); if (!keys.length || keys.some(k => !/^[\w$-]+$/.test(k) || k === "__proto__") || new Set(keys).size < keys.length) return leaf(); return { k: "rec", fields: e.fields.map(f => [(f as { key: string }).key, this.result((f as { v: Expr }).v, env, own, seen)]) }; }
      case "arr": if (!e.items.length || e.items.some(x => x.k === "spread")) return leaf(); return { k: "arr", items: e.items.map(x => this.result(x, env, own, seen)) };
      default: return leaf();
    }
  }
  /** A fn's result where it is called: what its `ref` arguments wait for and fail with, its readers may. */
  private readWith(r: Result, args: Expr[], env: Env): Result {
    const rows = new Set(args.flatMap(a => [...this.rowsThunk(a, env)()])), fails = new Set(args.flatMap(a => [...this.failsThunk(a, env)().cls]));
    if (!rows.size && !fails.size) return r;
    const go = (x: Result): Result => x.k === "leaf" ? x.reader ? { ...x, rows: [...new Set([...x.rows, ...rows])], fails: [...new Set([...x.fails, ...fails])] } : x : x.k === "rec" ? { k: "rec", fields: x.fields.map(([k, v]) => [k, go(v)]) } : x.k === "arr" ? { k: "arr", items: x.items.map(go) } : x;
    return go(r);
  }
  /** MO-13i: a value made once: a literal, a closure, a value parameter, a JS name, and what operators make of them. */
  private plain(e: Expr, env: Env): boolean {
    switch (e.k) {
      case "lit": case "fn": return true;
      case "id": { const s = env.lookup(e.name); if (!s) return false;
        if (s.kind === "eq") return (s.foreign === "value" || s.foreign === "fn") && !s.viaField || s.val?.e.k === "fn" || this.constantEq(s);
        return s.kind === "value" && !!s.param || s.kind === "import" || s.kind === "errclass" || s.kind === "fn" && !s.instantiating; }
      case "bin": return this.plain(e.l, env) && this.plain(e.r, env);
      case "un": return this.plain(e.e, env);
      case "if": return this.plain(e.c, env) && this.plain(e.t, env) && this.plain(e.f, env);
      case "tpl": return e.parts.every(p => typeof p === "string" || this.plain(p, env));
      case "arr": return e.items.every(x => x.k !== "spread" && this.plain(x, env));
      case "rec": return e.fields.every(f => !("spread" in f) && this.plain(f.v, env));
      default: return false;
    }
  }
  /** R-io-3: a call of an action that a value carries, in reactive scope — judged once every fn's result is known. */
  /** MO-8j, W2: a call in reactive scope, of what calls an argument (or a path of it) while it runs, given one that holds io
   *  there — from the expression walk and from an instantiating fn's call bound to a name. */
  private ioGiven(e: Extract<Expr, { k: "call" }>, env: Env, inFn: boolean) {
    e.args.forEach((a, i) => {
      const s = a.k === "id" ? env.lookup(a.name) : undefined; const named = !!s?.io || s?.kind === "action" || this.voidMethod(a, env);   // …a part of a declared result that is io (MO-10b)
      const f = e.f.k === "id" ? env.lookup(e.f.name) : undefined;
      const method = e.f.k === "member" ? (CALLS_NOW.has(e.f.p) ? e.f.p : undefined) : e.f.k === "id" && !f && lang(env, e.f.name) === "fn" && CALLS_NOW.has(e.f.name) ? e.f.name : undefined;
      const over = method === undefined ? undefined : e.f.k === "member" ? e.f.o : i > 0 ? e.args[0] : undefined;
      const g = method !== undefined && a.k === "id" ? env.lookup(a.name) : undefined;
      const byName = !!over && g?.kind === "fn" && !named;   // `[inc].forEach(run)`: each item is given to run
      let called: Set<string>; let held: () => Iterable<string>;
      if (byName) { called = this.calledOf(g, method === "reduce" ? 1 : 0); held = () => this.itemParts(over!, env); }
      else if (method !== undefined) { if (!named && a.k !== "id" && a.k !== "member" && a.k !== "index") return; called = new Set([""]); held = () => this.actionParts(a, env); }   // …or carried: a part of a record, a handler the component is given (SC-4b)
      else if (f?.kind === "fn") { called = this.calledOf(f, i); held = () => { const ps = new Set(this.actionParts(a, env)); for (const q of this.itemParts(a, env)) ps.add(joinPath("*", q)); if (named) ps.add(""); return ps; }; }
      else return;
      if (!called.size) return;
      const n = byName ? show(over!) : show(a);
      const say = (at: string) => { const what = at === "" ? `${n} is io` : `${n} holds io at \`${at}\``;
        if (inFn) this.err("IO_IN_FN", "R-io-2", `${what}, and ${show(e.f)}(…) calls it; a fn is pure by definition`);
        else this.err(named && at === "" && s?.kind !== "action" ? "IO_IN_REACTIVE" : "ACTION_CALLED_IN_OWNED_SCOPE", "IO-2", `${what}, and ${show(e.f)}(…) calls it while the call runs: it is called in reactive scope (R-io-3)${at === "" ? `, as \`(x) => ${n}(x)\` would be` : ""} — call it from a handler or an action`); };
      if (named && !byName && called.has("")) say(""); else { const line = this.line; this.later.push(() => { const at = callsHeld(held(), called); if (at !== undefined) { const was = this.line; this.line = line; say(at); this.line = was; } }); }
    });
  }
  /** B3 (2026-11-26): a statement closure written as an item or a field is carried freely, and ends only where a handler
   *  goes. Given anywhere else — a plain attribute or prop, a spread's field that is none, a JavaScript argument its
   *  declaration does not mark `handler` — it is the closure of reactive scope SC-3 refuses, as one written there is. `ok`:
   *  the paths of the value that may hold one. A closure written there itself is SC-3's own. */
  private closureGiven(e: Expr, env: Env, ok: (path: string) => boolean, where: string) {
    if (e.k === "fn") return;
    const p = [...this.actionParts(e, env, true)].find(p => !ok(p)); if (p === undefined) return;
    this.err("REACTIVE_WRITE_IN_OWNED_SCOPE", "W-2", `${show(e)} holds a statement closure${p === "" ? "" : ` (\`${p}\`)`}, given ${where}: a closure made in reactive scope is a pure function (SC-3) unless it goes where a handler is taken — an \`on…\` attribute or prop, \`ref\`, a parameter declared \`handler\``);
  }
  /** B3: a call of JavaScript in reactive scope, given a statement closure where its declaration does not say `handler`. */
  private jsGiven(e: Extract<Expr, { k: "call" }>, s: Sym | undefined, env: Env) {
    if (!s || e.f.k !== "id" || !(s.kind === "import" || (s.kind === "fn" && s.foreign !== undefined))) return;
    const name = e.f.name;
    e.args.forEach((a, i) => { const c = s.cbs?.[i]; if (!c?.[0]) this.closureGiven(a, env, p => p !== "" && !!c?.[1].includes(p.split(".")[0]), `to ${name}(…), JavaScript that may call it while it computes`); });
  }
  private carriedAction(e: Extract<Expr, { k: "call" }>, env: Env, say: () => void) {
    if (e.f.k === "id" ? env.lookup(e.f.name)?.kind === "action" || env.lookup(e.f.name)?.io : e.f.k !== "member" && e.f.k !== "index") return;
    const line = this.line; this.later.push(() => { if (this.actionParts(e.f, env).has("")) { this.line = line; say(); } });
  }
  /** SC-4 (2026-11-22): a handler is a function, called when its event happens. An attribute that takes one, given a call
   *  of something that is io — an action, an io import, a setter, a method declared to answer nothing — would make that
   *  call while the view computes, and hand the handler its result: `onClick={save()}` for `onClick={() => { save() }}`.
   *  The arms of a condition are read the same way. */
  private handlerCalled(e: Expr, env: Env, attr: string) {
    if (e.k === "call") {
      let code: string | undefined;
      if (e.f.k === "id") { const s = env.lookup(e.f.name); code = s?.kind === "action" ? "ACTION_CALLED_IN_OWNED_SCOPE" : s?.io || this.ioMember(e.f, env) !== undefined || this.voidMethod(e.f, env) || this.promiseMethod(e.f, env) ? "IO_IN_REACTIVE" : lang(env, e.f.name) === "log" ? "IO_IN_REACTIVE" : undefined; }
      else if (this.voidMethod(e.f, env)) code = this.providedAction(e.f, env) ? "ACTION_CALLED_IN_OWNED_SCOPE" : "IO_IN_REACTIVE";
      else if (this.promiseMethod(e.f, env)) code = "IO_IN_REACTIVE";
      else if (this.ioMember(e.f, env) !== undefined) code = "IO_IN_REACTIVE";
      const say = (code: string) => this.err(code, "SC-4", `${attr}={${show(e)}} calls ${show(e.f)}(…) while the view computes, and gives the handler what it answers: a handler is a function, called when its event happens — \`${attr}={() => { ${show(e)} }}\``);
      if (code) say(code); else this.carriedAction(e, env, () => say("ACTION_CALLED_IN_OWNED_SCOPE"));
    } else if (e.k === "if") { this.handlerCalled(e.t, env, attr); this.handlerCalled(e.f, env, attr); }
    else if (e.k === "bin" && (e.op === "&&" || e.op === "||" || e.op === "??")) { if (e.op !== "&&") this.handlerCalled(e.l, env, attr); this.handlerCalled(e.r, env, attr); }
  }
  /** MO-10i: a read through a draft: its name, a path below it, or what a method called on one answers. */
  private draftChain(e: Expr, env: Env): boolean {
    if (e.k === "id") return !!env.lookup(e.name)?.jsDraft;
    if (e.k === "member" || e.k === "index") return this.draftChain(e.o, env);
    if (e.k === "call") return (e.f.k === "member" || e.f.k === "index") && this.draftChain(e.f.o, env);
    return false;
  }
  /** MO-10i: the draft a place belongs to: the draft's name, or a path below it. */
  private draftPlace(e: Expr, env: Env): Sym | undefined {
    if (e.k === "id") { const t = env.lookup(e.name); return t?.jsDraft ? t : undefined; }
    if (e.k === "member" || e.k === "index") return this.draftPlace(e.o, env);
    return undefined;
  }
  /** `field`: the member read of an identifier (`props.title`), for the model (CP-6). */
  private expr(e: Expr, env: Env, ctx: Ctx, field?: string): void {
    if (e.k === "fn") {
      if (this.updaters.has(e)) { this.exprK(e, env, ctx, field); return; }                // a draft path's updater is applied where it is written: part of the callback, not a closure of its own
      const id = ++this.fnSeq; this.fnStack.push(id); const draftCb = this.draftFns.has(e); if (draftCb) this.draftCbs.push(id);
      try { this.exprK(e, env, ctx, field); } finally { if (draftCb) this.draftCbs.pop(); this.fnStack.pop(); }
      return;
    }
    this.exprK(e, env, ctx, field);
  }
  private exprK(e: Expr, env: Env, ctx: Ctx, field?: string): void {
    const go = (x: Expr) => this.expr(x, env, ctx);
    switch (e.k) {
      case "lit": return;
      case "id": { { const c = env.lookup(e.name); if (c?.kind === "comp" && c.compRegion?.key) this.escapes.add(c.compRegion.key); }   /* E-5a: a component as a value is applied by JS */ if (this.valueIds.has(e)) return; const s = this.resolve(e.name, env, ctx); if (s) this.draftHere(s, e.name); if (s?.updater && !this.updaterOk.has(e)) this.err("DRAFT_ESCAPES", "MO-10i", `${e.name} is a draft callback (it is given to a function that hands its parameter a library's draft, and writes it): it is used only there, \`setStore(${e.name})\` — called by hand, passed elsewhere or stored, it would be given something that is no draft, or keep one`);   /* MO-10i: a named draft callback is given to what hands it a draft, and used for nothing else */ if (s?.drafts?.length && !this.calleeIds.has(e)) this.err("DRAFT_ESCAPES", "MO-10i", `${e.name} hands its callback a library's draft: it is called by this name, with the callback written in the call (\`${e.name}((d) => { … })\`), and not passed, stored or given another name — a function that travels would be given a callback the checker cannot see; share the change as an action`);   /* MO-10i: such a function is called by its own name, where the callback is written */ if (s) this.wholeUse(e, env); if (s) this.model.read(s, ctx.scope === "imperative", false, field); if (s?.kind === "comp" && !(field !== undefined && s.factory)) this.err("COMPONENT_AS_VALUE", "RG-4a", `component ${e.name} used as a value: apply it in a view, or pass it where JS takes one: a JS component's prop typed \`Component\` or \`View\` (or, where its type holds components, the record or the array written there), or a JS fn's arguments (MO-11c, MO-11t, MO-11f, MO-11s)`);   /* MO-11m: a made component's properties (`Router.paths`) are values */ if (s?.kind === "context") this.err("CONTEXT_AS_VALUE", "RG-7", `context ${e.name} used as a value: read the nearest provision with \`use ${e.name}\``); return; }
      case "pre": { const s = this.resolve(e.name, env, ctx); if (s) this.model.read(s, ctx.scope === "imperative", true); if (s && (!reactiveKinds.has(s.kind) || s.kind === "props")) this.err("PRE_OF_NON_REACTIVE", "C-2", s.kind === "props" ? `pre of ${e.name}: props are not a value of their own — name the field, \`x = ${e.name}.x\`, and read \`pre x\`` : `pre of ${e.name}, which is not reactive`); if (e.init) go(e.init); return; }
      case "use": { if (ctx.server) this.err("SERVER_CAPTURE", "SF-3", `a server function's body reads \`use ${e.name}\`: a provision is the client's — pass it as an argument`); const c = this.ctxOf(e.name, env); if (c?.ctx!.view && (c.ctx!.view.fn || e !== this.shownUse)) this.err("VIEW_NOT_SHOWN", "RG-4c", `context ${e.name} holds a view, and a view is only shown: ${c.ctx!.view.fn ? `\`<use.${e.name} … />\`` : `\`{use ${e.name}}\``} in a view, where it is made and owned — it is not read as a value, asked, kept, given on or provided again`); if (c) { this.model.read(c, ctx.scope === "imperative"); } if (c && !c.ctx!.dflt) this.uses.push({ region: env.region, name: c.ctx!.key, line: this.line, display: e.name, ...(this.ownCtx.includes(e.name) ? { above: true } : {}) }); return; }
      case "peek": this.model.snap++; go(e.e); this.model.snap--; return;                  // E-5: a snapshot
      case "latest": case "pending": { const save = this.model.probe; this.model.probe = e.k; go(e.e); this.model.probe = save; return; }   // R-9, R-12: probes
      case "un": this.wholeOk.add(e.e); go(e.e); return;                                  // `!q`, `typeof q`: no field of it is read
      case "spread": go(e.e); return;
      case "omit": {                                                                       // MO-10f: the rest of a result is a value: every field that holds or fails is named beside it
        const x = e.e; const t = x.k === "id" ? env.lookup(x.name) : undefined;
        if (t && (t.held ?? []).every(h => e.keys.some(k => h[0] === k || h[0].startsWith(`${k}.`)))) this.wholeOk.add(x);
        go(x); return;
      }
      case "await":
        this.awaited.add(e.e);                                                               // MO-10b: a promise that is awaited is asked for
        if (ctx.scope === "imperative" && !this.stmtAwaits.has(e)) this.err("AWAIT_IN_EXPRESSION", "AC-1", `\`${show(e)}\` inside an expression of imperative scope: a run suspends only at a statement — bind it first, \`let v = ${show(e)}\` (a \`catch (e) => alt\` may follow it)`);
        // ST-5a (bug 42): a seed is taken once, and a source written `:=` has no question to wait on
        else if (ctx.scope === "reactive" && this.seed && this.fnStack.length === this.seed.depth) this.err("AWAIT_IN_EXPRESSION", "ST-5a", `\`${show(e)}\` in the seed of \`source ${this.seed.name} := …\`: a seed is a snapshot, taken once, with nothing to wait on — write \`source ${this.seed.name} = …\`, a source whose question waits and is asked again when what it reads changes, and which a write overrides`);
        // R-1, 07 §3: an `await` is a flight of the expression it is written in; a closure's and a lifted fn's (E-9) body is computed wherever it is called
        else if (ctx.scope === "reactive" && (ctx.lifted || this.fnStack.length)) this.err("AWAIT_IN_EXPRESSION", "R-1", ctx.lifted && !this.fnStack.length ? `\`${show(e)}\` in a fn that declares nothing: its call is a part of the expression that calls it (E-9), and has no flight of its own — answer the promise and await it at the call (\`fn f(…) => ${show(e.e)}\`, \`x = await f(…)\`), or name the answer in the block, \`r = ${show(e)}\` then \`r\`, with each parameter it follows declared \`ref\`` : `\`${show(e)}\` in a closure of reactive scope: a closure is called where it is called, and has no flight of its own — await in an equation, and use its name`);
        // MO-10i: the draft is the callback's only while the library's call of it runs
        if (this.draftCbs.length && this.draftCbs[this.draftCbs.length - 1] === this.fnStack[this.fnStack.length - 1]) this.err("DRAFT_ESCAPES", "MO-10i", "an `await` in a callback that is handed a library's draft: the callback ends when the library's call of it does, and what runs after the `await` would write a draft the library has taken back — await first, then call the setter with what was answered");
        this.awaitedCalls.add(e.e); go(e.e); if (e.init) go(e.init); return;
      case "serverfn": {                                                                   // SF-1d: as \`server fn\`, wherever it is written
        const inner = new Env(env, env.region);
        for (const p of e.params) inner.vars.set(p, { kind: "value", name: p, region: env.region, line: this.line });
        this.comp("server", env, {}, () => this.stmts(e.body, inner, { scope: "imperative", server: true }));
        const sym = this.serverExprs.get(e); let cache: Set<string> | null = null;
        if (sym) sym.serverRejects = () => cache ??= new Set([...this.stmtsFails(e.body, inner, new Map()).cls, "Error"]);
        return;
      }
      case "throw": go(e.e); return;
      case "catch": {
        if (e.e.k !== "await") this.err("CATCH_NOT_ON_AWAIT", "R-f-4", `\`${show(e.e)} catch …\`: a catch follows an \`await\` — its rejection becomes an answer. A failure read from a value belongs to its own section: show it under \`errored fallback(e) { … } { … }\` where it is read`);
        go(e.e); if (e.classes) for (const n of e.classes) this.errClass(n, env);
        const inner = new Env(env, env.region); if (e.name) inner.vars.set(e.name, { kind: "value", name: e.name, region: env.region, line: this.line });
        this.expr(e.alt, inner, ctx); return;
      }
      case "bin":                                                                         // MO-10f: comparing a result, or testing it, reads no field of it
        if (e.op === "==" || e.op === "!=" || e.op === "===" || e.op === "!==") { this.wholeOk.add(e.l); this.wholeOk.add(e.r); } else if (e.op === "&&") this.wholeOk.add(e.l);
        go(e.l); go(e.r); return;
      case "if": this.wholeOk.add(e.c); go(e.c); go(e.t); go(e.f); return;
      case "tpl": for (const p of e.parts) if (typeof p !== "string") go(p); return;
      case "member":
        this.wholeOk.add(e.o); this.heldMember(e, env); this.wholeUse(e, env); this.partUse(e, env); if (e.o.k === "id") this.expr(e.o, env, ctx, e.p); else go(e.o); return;
      case "index": this.wholeOk.add(e.o); this.heldMember(e, env); this.wholeUse(e, env); this.partUse(e, env); go(e.o); go(e.i); return;
      // B3 (2026-11-26): a statement closure written as an item of a list or a field of a record is an io value, as an action
      // named there is: carried freely, its body an io scope, and refused where it is called while the view computes (R-io-3)
      case "arr": for (const x of e.items) if (x.k === "fn" && x.stmts) this.callbackFns.add(x); e.items.forEach(go); return;
      case "rec": for (const f of e.fields) if (!("spread" in f) && f.v.k === "fn" && f.v.stmts) this.callbackFns.add(f.v); for (const f of e.fields) go("spread" in f ? f.spread : f.v); return;
      case "call": {
        this.callMarks(e.f, e.args, env);
        // MO-8j (2026-11-26): an action or an io value given by name to what calls it while the call runs is called here,
        // as its closure `(x) => name(x)` is: the language's own methods and functions that call what they are given, and a
        // fn of the module whose body calls that parameter. What may keep it (a JavaScript import, a prop) is as it was.
        // W2 (2026-11-26): what holds io, at the paths the callee calls — a fn of the module or one imported calls the
        // paths of its parameter `calledOf` says (through a list, a record, a second fn); a calling method of the language
        // calls the function it is given, and a fn of the module given to it is handed each item of what it runs over
        if (ctx.scope === "reactive") this.ioGiven(e, env, !!ctx.inFn);
        // W-1a (2026-11-22): the value of a source, an equation or a prop is changed by a write, never in place:
        // `rows.push(x)` changes the array every reader holds and tells none of them
        if (e.f.k === "member" && ARRAY_MUTATORS.has(e.f.p) && !this.draftChain(e.f.o, env)) {
          const what = this.isList(e.f.o, env) ? this.reactivePlace(e.f.o, env) : undefined;
          if (what !== undefined) {
            const o = show(e.f.o);
            const fix = e.f.p === "sort" ? `\`${o}.toSorted(…)\` gives a sorted copy` : e.f.p === "reverse" ? `\`${o}.toReversed()\` gives a reversed copy` : e.f.p === "splice" ? `\`${o}.toSpliced(…)\` gives a changed copy` : "write the new value, `xs := v => [...v, x]`, in the block that declares the source (or through an action it exports)";
            this.err("MUTATION_IN_PLACE", "W-1a", `${show(e.f)}(…) changes ${what} in place: the value of a source, an equation or a prop is changed by a write (\`:=\`), which tells its readers — a change in place tells none, and changes what every other reader of it holds; ${fix}`);
          }
        }
        // MO-10i (2026-11-22): a JS fn whose declaration says it changes a parameter in place (`draft list`) is given a
        // draft as it is; anything else it would change behind its writes — the value of a source, an equation or a
        // prop, a store outside its setter — is refused, as a mutating method called on it is
        if (e.f.k === "id") for (const i of env.lookup(e.f.name)?.draftArgs ?? []) {
          const a = e.args[i]; if (!a || this.draftChain(a, env)) continue;
          const what = this.reactivePlace(a, env) ?? this.storeOfDrafts(a, env);
          if (what !== undefined) this.err("MUTATION_IN_PLACE", "W-1a", `${e.f.name}(…) changes ${what} in place (its declaration marks that parameter \`draft\`): a store is changed inside its setter, on the draft the library hands it — \`set((d) => { ${e.f.name}(d.…) })\` — and the value of a source, an equation or a prop by a write (\`:=\`), which tells its readers; a change in place tells none`);
        }
        // MO-10b (2026-11-22): a function part of a declared result that answers nothing (`nextPage: () => void`) is called
        // for what it does: it is io, called from imperative scope
        if (ctx.scope !== "imperative" && this.voidMethod(e.f, env)) {
          if (ctx.inFn) this.err("IO_IN_FN", "R-io-2", `${show(e.f)}(…) is io (its declaration says it answers nothing: it is called for what it does); a fn is pure by definition`);
          else if (this.providedAction(e.f, env)) this.err("ACTION_CALLED_IN_OWNED_SCOPE", "IO-2", `${show(e.f)}(…) is an action (what the context provides there), called in reactive scope (R-io-3): it would run, and write, while the view computes — call it from a handler or an action`);
          else this.err("IO_IN_REACTIVE", "IO-2", `${show(e.f)}(…) is io and is called in reactive scope (R-io-3): its declaration says it answers nothing (\`() => void\`, or marks it \`io\`), so it is called for what it does — from a handler or an action`);
        }
        // …and one that answers a promise starts work: not awaited, nothing waits for it and the view reads a promise
        if (ctx.scope !== "imperative" && !this.awaited.has(e) && !this.voidMethod(e.f, env) && this.promiseMethod(e.f, env)) {
          if (ctx.inFn) this.err("IO_IN_FN", "R-io-2", `${show(e.f)}(…) is io (its declaration says it answers a promise: calling it starts work); a fn is pure by definition`);
          else this.err("IO_IN_REACTIVE", "IO-2", `${show(e.f)}(…) is io and is called in reactive scope (R-io-3): its declaration says it answers a promise, so calling it starts work, here on every computation, with nothing waiting for it — call it from a handler or an action; if it only asks, \`await\` it`);
        }
        // R-io-3: …and an action that a value carries (a fn's result, a record of this module's) is one wherever it is called
        // SC-4b: a handler the component is given (`props.onPick`, `props.ref`) is called when its event happens
        const given = ctx.scope !== "imperative" && !this.voidMethod(e.f, env) && this.handlerProp(e.f, env);
        if (given) this.err(ctx.inFn ? "IO_IN_FN" : "IO_IN_REACTIVE", ctx.inFn ? "R-io-2" : "IO-2", `${show(e.f)}(…) is a handler the component is given (SC-4b), called in reactive scope (R-io-3): where the component is applied its closure may write, so it would write while the view computes — call it from a handler or an action, or give it on to an element (\`onClick={${show(e.f)}}\`)`);
        if (ctx.scope !== "imperative" && !given && !this.voidMethod(e.f, env)) this.carriedAction(e, env, () => ctx.inFn ? this.err("IO_IN_FN", "R-io-2", `${show(e.f)}(…) is io (an action); a fn is pure by definition`) : this.err("ACTION_CALLED_IN_OWNED_SCOPE", "IO-2", `${show(e.f)}(…) is an action, called in reactive scope (R-io-3): it would run, and write, while the view computes — call it from a handler or an action`));
        // MO-8t: a method of an io import, with no row of its own, is io as its object is
        { const of = ctx.scope !== "imperative" && !this.voidMethod(e.f, env) && !this.promiseMethod(e.f, env) ? this.ioMember(e.f, env) : undefined;
          if (of !== undefined) {
            if (ctx.inFn) this.err("IO_IN_FN", "R-io-2", `${show(e.f)}(…) is io (a method of ${of}, which no row says is \`pure\`); a fn is pure by definition`);
            else this.err("IO_IN_REACTIVE", "IO-2", `${show(e.f)}(…) is io and is called in reactive scope (R-io-3): it is a method of ${of}, which is io (an import with no declaration, or a declared \`fn\`), and no row says it is \`pure\` — call it from a handler or an action; if it only reads, its declaration says so, \`export pure fn ${of}.<method>(…)\` (MO-8t)`);
          } }
        if (e.f.k === "id" && lang(env, e.f.name) === "until") {                  // AC-6: `until(() => p)`, a function of the language (Solid's until)
          if (ctx.scope === "reactive") this.err("IO_IN_REACTIVE", "AC-6", "until(…) waits for the world to confirm a condition: it is called from imperative scope (an action or a handler), and awaited");
          const p = e.args[0];
          if (e.args.length !== 1 || !p || p.k !== "fn" || p.params.length) { this.err("UNTIL_PREDICATE", "AC-6", "until takes a predicate, `until(() => e)`: a value would be read once and never change"); e.args.forEach(go); return; }
          this.expr(p, env, { scope: "reactive", server: ctx.server });                         // the predicate is reactive scope: it reads, tracked; it does not write
          return;
        }
        if (e.f.k === "id" && ["onSettled", "onFlush"].includes(lang(env, e.f.name)!)) {   // EF-7, EF-8: Solid's onSettled / onFlush, functions of the language
          const name = e.f.name;
          if (ctx.scope === "reactive") this.err("IO_IN_REACTIVE", name === "onSettled" ? "EF-7" : "EF-8", name === "onSettled" ? "onSettled(…) schedules work from imperative scope (a handler, an apply block, an action); in a component body the mount hook is `effect () { … }` (EF-4)" : "onFlush(…) is called from imperative scope (a handler, an apply block, an action): it starts a run of its own after this flush");
          const p = e.args[0];
          if (e.args.length !== 1 || !p || p.k !== "fn" || p.params.length) { this.err("HOOK_CALLBACK", name === "onSettled" ? "EF-7" : "EF-8", `${name} takes a closure, \`${name}(() => { … })\`: its body is the run it schedules`); e.args.forEach(go); return; }
          if (name === "onSettled" && returnsClosure(p)) this.err("SETTLED_CLEANUP_UNOWNED", "EF-7", "an onSettled callback returns a cleanup, but it has no region to bind it to: setup with teardown is `effect () { … }` (EF-4, EF-5)");
          this.expr(p, env, { scope: "imperative", server: ctx.server });                       // the callback is imperative scope
          return;
        }
        if (e.f.k === "id") {
          const s = env.lookup(e.f.name);
          if (ctx.scope === "reactive" && (s?.io || lang(env, e.f.name) === "log")) {
            if (ctx.inFn) this.err("IO_IN_FN", "R-io-2", `${e.f.name}(…) is io; a fn is pure by definition`);
            else this.err(s?.kind === "action" ? "ACTION_CALLED_IN_OWNED_SCOPE" : "IO_IN_REACTIVE", "IO-2", `${e.f.name}(…) is io and is called in reactive scope (R-io-3)${s?.ioVia ? ` — its server body calls ${s.ioVia}` : ""}${s?.generated ? ` — its declaration is a draft generated from ${s.generated}'s types, which never guesses \`pure\`: if calling it writes nothing, say so at the import, \`import pure { … }\`, or declare it \`pure fn\` in rx-types/${s.generated}.d.rx (MO-8l)` : ""}`);
          }
          if (s?.side === "client" && ctx.scope === "reactive" && !ctx.server && !this.awaitedCalls.has(e)) this.err("CLIENT_NOT_AWAITED", "SF-5b", `${e.f.name}(…) is \`client\` JS: in reactive scope it is awaited — a client question, asked once the browser has the page (SV-7b) — never called for its value now`);
          if (s?.generated && ctx.scope === "imperative" ? s.makes && !this.refCalls.has(e) : s?.kind === "fn" && s.instantiating) this.err("INSTANTIATION_NOT_BOUND", "E-9", `${e.f.name}(…) ${s?.kind === "fn" && s.fnDecl ? instantiatesWhy(s.fnDecl) : "declares state or reads a context"}: bind it, \`x = ${e.f.name}(…)\` (RG-6)`);
          if (s?.kind === "comp") this.err("COMPONENT_AS_VALUE", "RG-4a", `component ${e.f.name} called as a function: apply it in a view`);
          this.markCallbacks(e.args, s?.cbs);
          if (ctx.scope === "reactive") this.jsGiven(e, s, env);   // B3
          if (s?.kind === "action" && s.arity !== undefined && (e.args.length > s.arity || e.args.length < (s.arityMin ?? s.arity))) this.err("ARGUMENT_COUNT", "AC-1f", `${e.f.name} takes ${s.arityMin !== undefined ? `${s.arityMin} to ${s.arity} arguments` : s.arity === 0 ? "no arguments" : s.arity === 1 ? "1 argument" : `${s.arity} arguments`} and is called with ${e.args.length}: an action's parameters are its whole input — pass each one, and nothing it does not declare`);
          this.model.call(s);
          if (s && (s.kind === "import" || (s.kind === "fn" && s.foreign !== undefined)) && s.foreign !== "comp") this.unplaced(e.args, env, s);   // MO-11s, MO-11u
        }
        go(e.f); e.args.forEach(go); return;
      }
      case "fn": {
        const inner = new Env(env, env.region); const drafts = this.draftFns.get(e); const srcs = this.fnSrcs.get(e) ?? [];
        e.params.forEach((p, j) => inner.vars.set(p, { kind: "value", name: p, region: env.region, line: this.line, srcs: [...srcs], ofFn: e, ...(drafts?.includes(j) ? { jsDraft: true, draftFn: this.fnStack[this.fnStack.length - 1] } : {}) }));   // MO-10k: what the parameter may be given; MO-10i
        { const it = this.itemOf.get(e); const p = it && e.params[it.k]; if (it && p !== undefined) { const ps = this.itemParts(it.e, it.env); if (ps.size) inner.vars.get(p)!.actionParts = [...ps]; } }   // W2: an item of what a calling method runs over
        if (e.stmts) {
          if (ctx.scope === "reactive" && !this.callbackFns.has(e)) { this.err("REACTIVE_WRITE_IN_OWNED_SCOPE", "W-2", "a statement-bodied closure in reactive scope (SC-3: a closure created here is a pure function)"); return; }
          const why = ctx.server ? null : inferredAction(e.stmts);                          // AC-1b: an arrow that guesses, or writes and awaits, is an action
          this.stmts(e.stmts, inner, { scope: "imperative", server: ctx.server, inAction: !!why });
          if (why) this.actions.push({ name: `inferred here (AC-1b: ${triggerText(why)})`, body: e.stmts, env: inner, line: this.line });
          if (!ctx.server) this.runChecks(e.stmts, inner, !!why, e.params, !!why, { isAction: n => { const t = inner.lookup(n); return t?.kind === "action" && t.outlasts !== false; } });
          return;
        }
        this.expr(e.body, inner, { scope: ctx.scope, inFn: ctx.inFn, server: ctx.server }); return;
      }
      case "draft": {
        go(e.seed);
        const inner = new Env(env, env.region); inner.vars.set("d", { kind: "value", name: "d", region: env.region, line: this.line });
        for (const s of e.body) {
          if (s.k === "let") { this.expr(s.e, inner, ctx); inner.vars.set(s.name, { kind: "value", name: s.name, region: env.region, line: this.line }); }
          else if (s.k === "expr") this.expr(s.e, inner, ctx);
          else if (s.k === "write") { if (s.target.name !== "d" || s.target.ctx) this.err("DRAFT_WRITE_OUTSIDE_DRAFT", "ST-3a", `a draft block writes only its draft, not ${s.target.ctx ? "use " : ""}${s.target.name}`); s.target.path.forEach(p => typeof p !== "string" && this.expr(p, inner, ctx)); this.expr(s.e, inner, ctx); }
          else this.err("ASYNC_STORE_SETTER", "ST-3b", `${s.k} in a draft block: it is reactive scope (only let, expressions and writes to d)`);
        }
        return;
      }
    }
  }

  /** AC-1c, AC-1d, AC-1e over one imperative run (ref/src/infer.ts). */
  private runChecks(stmts: Stmt[], env: Env, action: boolean, bound: string[], inferred = false, opts: RunOpts = {}) {
    for (const f of runFindings(stmts, action, bound, inferred, opts)) {
      if (f.code === "STALE_CAPTURE") { this.err("STALE_CAPTURE", "AC-1g", `${f.name} := … after an \`await\` writes ${f.via}, which is not the server's: ${f.name} is the server's answer, and after the \`await\` it takes only what the server answered, plain arguments (an id, a title, an index) and its own value at the write (\`${f.name} := rs => …\`, finding rows there by id). A row passed in, or read from a source before the \`await\` or after it, is what the screen showed, and may be stale by now (a rename accepted, a reload, an earlier write declined, a write another action holds) — when the answer alone doesn't say where a row is now, re-ask the answers it left and joined (\`refresh\`)`); continue; }
      if (f.code === "HELD_WRITE") this.err("HELD_WRITE", "AC-1c", `${f.name} := … comes before an \`await\` in a body that is an action because it writes and awaits (AC-1b), so it is held until the body ends (AC-1): for state that shows while the work runs, \`guess ${f.name} := …\` (a source with a question, ST-5c); for a reset that lands now, \`onFlush(() => { ${f.name} := … })\` (EF-8); to hold it on purpose, declare the action (\`action name() { … }\`); or write it after the \`await\``);
      else if (f.code === "STALE_NEXT_READ") this.err("STALE_NEXT_READ", "AC-1h", `${f.name} := … is computed from ${f.name}, and it is held: ${f.via ? `this run calls ${f.via}, so its writes join that action's change` : "an action holds its writes"} until the change settles (AC-1). Until then the next run reads the committed ${f.name}, not this write, and computes the same value again (a counter mints one id twice). For the next run to build on the held value while the screen waits, read it with \`latest ${f.name}\` (R-9), or write functionally (\`${f.name} := v => …\`, W-6) when this run doesn't need the value; for the write to show now, give it its own instant, \`onFlush(() => { ${f.name} := … })\` (EF-8)`);
      else if (f.code === "STALE_WRITE_BACK") this.err("STALE_WRITE_BACK", "AC-1e", `${f.name} := … after an \`await\` is computed from ${f.name} as it was read before that \`await\`: whatever changed ${f.name} in between (another action, a reload) is overwritten — write functionally (\`${f.name} := v => …\`, W-6), which applies to ${f.name} as it stands at the write, or guess it (\`guess\`, AC-3) and let the answer replace the guess`);
      else this.err("STALE_OWN_READ", "AC-1d", `${f.name} is read after this change wrote it: the read sees the committed value, not the write (W-4) — keep the value you wrote in a local (\`let v = …; ${f.name} := v\`) and read that, or write functionally (\`${f.name} := v => …\`, W-6)`);
    }
    // AC-3 (2026-11-22): a guess lives over the hold of what its action waits for
    if (action) {
      const g = guessFacts(stmts, n => ["log", "onSettled", "onFlush"].includes(lang(env, n)!)); const line0 = this.line;
      if (g.holdless) { const n = g.holdless.name; this.line = g.holdless.line ?? line0; this.err("GUESS_OUTSIDE_HOLD", "AC-3", `guess ${n} := … in a run that starts nothing to wait for (no \`await\`, no \`refresh\` or \`affects\`, no write, no call that could): the hold it would live over ends with the run, so the guess is taken back in the instant it is made and nothing shows — a guess is for what the run is about to await (\`guess ${n} := …; await save(…)\`); if this is ${n}'s new value, write it (\`${n} := …\`)`); }
      if (g.late) this.advice.push({ code: "GUESS_AFTER_AWAIT", rule: "AC-3", line: g.late.line ?? line0, msg: `guess ${g.late.name} := … is written after \`await ${g.late.awaited}\`: nothing shows until that answers — a guess is what the run shows while it waits, so write it before the \`await\` it is a guess about`, ...(this.opts.file ? { file: this.opts.file } : {}) });
      this.line = line0;
    }
  }

  // ---- imperative scope (SC-2) ----
  /** AC-1: the awaits a run suspends at — a statement's whole expression (`await e`, `let v = await e`), with its catch. */
  private stmtAwaits = new WeakSet<Expr>();
  private stmts(ss: Stmt[], env0: Env, ctx: Ctx) {
    const env = new Env(env0, env0.region);
    const asked: { first: string; bound: Set<string>; io: boolean }[] = [];   // 99, advice (ASYNC_WATERFALL): the questions this run awaited and was not advised to move, each with the locals bound since and whether its fn is io
    const line0 = this.line;                                             // a statement's diagnostics are placed on its own line; what follows the block, where it was
    for (const [at, s] of ss.entries()) {
      if (s.line !== undefined) this.line = s.line;
      if (s.k === "let" || s.k === "expr") {
        const t = s.e.k === "catch" ? s.e.e : s.e;
        if (t.k === "await") {
          // a question: a declared JS fn awaited for what it answers — a `pure` one, or an io one whose answer the
          // statement binds. An io call awaited for nothing (`await save(a)`) is a command, and so is anything else
          // awaited: what follows may need what it did, and the order is the run's
          const q = t.e; const f = q.k === "call" && q.f.k === "id" ? env.lookup(q.f.name) : undefined;
          const io = f?.kind === "import" ? !!f.io : undefined;
          if (io !== undefined && (!io || s.k === "let")) {
            const names = new Set<string>(); freeNames(q, new Set(), names);
            // once for a question: the first one before it whose answer it does not read; told to move, it holds up
            // none of those after it
            const first = asked.find(a => ![...names].some(n => a.bound.has(n.replace(/^pre:/, ""))));
            if (first) {
              const unless = io || first.io ? " (they are declared io: unless one needs what the other did, which only a `pure` declaration rules out)" : "";
              this.advice.push({ code: "ASYNC_WATERFALL", rule: "R-pending", line: this.line, msg: `\`await ${show(q)}\` reads nothing that \`await ${first.first}\` answered: asked one after the other, the second waits for the first for nothing${unless} — ask both first and await them together (a JS helper over \`Promise.all\`: \`let [a, b] = await all([f(…), g(…)])\`), or make each an equation (\`a = await f(…)\`), which Solid asks side by side`, ...(this.opts.file ? { file: this.opts.file } : {}) });
            } else asked.push({ first: show(q), bound: new Set(), io });
          } else asked.length = 0;
        }
      }
      if (s.k === "let") for (const a of asked) a.bound.add(s.name);
      // EF-5a (2026-11-22): a call that answers what undoes it (`onShortcut(…): () => void`), with that dropped — the
      // statement's value, or a local that some path through the rest of the block never names
      if ((s.k === "let" || s.k === "expr") && s.e.k === "call" && s.e.f.k === "id" && env.lookup(s.e.f.name)?.disposer !== undefined) {
        let why: string | undefined = "the call is a statement, and what it answers is dropped";
        if (s.k === "let") {
          const used = new Set<string>(); freeNamesStmts(ss.slice(at + 1), new Set(), used);
          const paths = disposerPaths(ss.slice(at + 1), s.name, false);
          why = !used.has(s.name) ? `\`${s.name}\` is never used after it is bound`
            : paths.left || (paths.ends && !paths.named) ? `\`${s.name}\` is not used on every path after it is bound (a branch that is not taken, an early \`return\`, another name for it that is never used: the run ends there without it)`
            : undefined;
        }
        if (why !== undefined) { const n = s.e.f.name; this.advise("DISPOSER_DROPPED", "EF-5a", `${n}(…) answers what undoes it (its declaration: \`${env.lookup(n)!.disposer}\`), and ${why}: what it set up — a listener, a subscription, a timer — then outlives the component — keep it and call it when the region ends: in \`effect () { let stop = ${n}(…); return () => { stop() } }\`, or from the handler that ends it`); }
      }
      if (s.k === "let" || s.k === "expr") { const t = s.e.k === "catch" ? s.e.e : s.e; if (t.k === "await") this.stmtAwaits.add(t); }
      switch (s.k) {
        case "let": {
          const updater = this.updaterPositions(s.name, s.line ?? -1, s.e, env);                           // MO-10i: a named draft callback
          this.expr(s.e, env, ctx);
          const sym: Sym = { kind: "value", name: s.name, region: env.region, line: this.line, captures: this.stored(s.e, env), retCaptures: this.stored(s.e, env, new Set(), true), val: { e: s.e, env }, ...(updater ? { updater } : {}) };   // MO-10k
          env.vars.set(s.name, sym);
          break;
        }
        case "expr": this.expr(s.e, env, ctx); break;
        case "throw": this.expr(s.e, env, ctx); break;
        case "return": if (s.e) this.expr(s.e, env, ctx); break;
        case "for": {                                                                        // 07 §5: a loop over what `e` holds now; its variable is a constant of each turn
          this.expr(s.e, env, ctx);
          const lenv = new Env(env, env.region); const d = this.draftPlace(s.e, env);       // MO-10i: a turn of a loop over a path of a draft is a place of that draft
          lenv.vars.set(s.name, { kind: "value", name: s.name, region: env.region, line: this.line, srcs: [{ e: s.e, env }], ...(d ? { jsDraft: true, draftFn: d.draftFn } : {}) });   // MO-10k
          this.stmts(s.body, lenv, ctx);
          break;
        }
        case "write": case "optimistic": {
          // ST-4d (2026-11-22): rows written out with two alike keys, where a keyed list is written or guessed — the new
          // value, or what an updater answers (`rows := rs => [{ id: 9 }, { id: 9 }, ...rs]`)
          if (!s.target.path.length && !s.target.ctx) {
            const t = env.lookup(s.target.name);
            if (t?.rowKey !== undefined) {
              const v = duplicateKey(s.e.k === "fn" && !s.e.stmts ? s.e.body : s.e, t.rowKey);
              if (v !== undefined) this.err("DUPLICATE_KEY", "ST-4d", `${t.name} is keyed by ${t.rowKey}, and two of the rows written here have ${t.rowKey}: ${v} — a key names one row: rows with one key share one identity, so one's state shows for both, or one is dropped. Give each row its own ${t.rowKey}`);
            }
          }
          if (s.e.k === "fn" && !s.target.path.length && env.lookup(s.target.name)?.kind === "source") this.writeFns.set(s.e, { name: s.target.name, env });   // W-1a: a functional write's function is given the slot's value: it answers the next one, and does not change the one it is given
          if (ctx.server) {                                                                  // SF-4: return the value; the action that awaited the call writes it
            this.err("SERVER_WRITE", "SF-4", `a server function writes ${s.target.ctx ? "use " : ""}${s.target.name}: return the value, and write it in the action that awaited the call (\`let r = await f(…); ${s.target.name} := r\`)`);
            s.target.path.forEach(p => typeof p !== "string" && this.expr(p, env, ctx)); this.expr(s.e, env, ctx); break;
          }
          let target: Sym | undefined;
          if (s.target.ctx) {
            const c = this.ctxOf(s.target.name, env);
            if (c) { this.model.write(c, s.k, s.target.path.length > 0); this.uses.push({ region: env.region, name: c.ctx!.key, line: this.line, display: s.target.name }); if (!c.ctx!.source) this.err("WRITE_TO_NON_SOURCE", "O-4", `context ${s.target.name} is read beneath its provision: call an action it provides that writes it`); }
          }
          else {
            target = this.resolve(s.target.name, env, ctx);
            if (target?.jsDraft && s.k === "write" && s.target.path.length) {                  // MO-10i: a path of a library's draft: the library's write, not a source's
              this.draftHere(target, s.target.name);
              if (s.e.k === "fn" && !s.e.stmts && s.e.params.length === 1) this.updaters.add(s.e);   // W-6: an updater is applied in place, as this statement
              s.target.path.forEach(p => typeof p !== "string" && this.expr(p, env, ctx)); this.expr(s.e, env, ctx); break;
            }
            this.model.write(target, s.k, s.target.path.length > 0); if (target) this.changed.add(target);   // E-5a
            const guessable = s.k === "optimistic" && target?.kind === "eq" && !!target.eqDecl && !target.param && !target.imported;   // AC-3: a guess may sit over an equation (Solid's createOptimistic(fn)); it is not a write of the truth
            if (guessable && target!.eqDecl!.deferred) this.err("GUESS_ON_DEFERRED", "AC-3", `${s.target.name} is deferred: its value is a lagging copy (V-16), so nothing would confirm a guess on it — guess the equation it lags`);
            else if (guessable) {}
            else if (target && target.kind !== "source") this.err("WRITE_TO_NON_SOURCE", "W-1", `${s.target.name} is ${target.kind === "eq" ? "an equation" : target.kind === "props" ? "props" : `a ${target.kind}`}: only sources are written${target.jsDraft ? " — a library's draft is written along its paths (`" + s.target.name + ".field := …`), or the callback returns the new value (MO-10i)" : target.kind === "value" && target.val && this.draftChain(target.val.e, target.val.env) ? ` — ${s.target.name} is a copy of what \`${show(target.val.e)}\` read from the draft (a read of a draft that is kept is a copy, MO-10i), so a write to it would change nothing: write the place — \`let i = ….findIndex(…); ….[i].field := …\` — or the row in a loop, \`for (const row of …) { if (…) { row.field := … } }\`` : target.kind === "value" && s.target.path.length ? " — a field of a callback's parameter is written only when the library declares it a draft, `(draft state: T) => void` (MO-10i)" : target.kind === "props" || target.kind === "value" || target.param ? " — a source is written only in the region that declares it: have its owner pass an action that writes it (O-4)" : ""}`);
            else if (target?.imported) this.err("WRITE_TO_NON_SOURCE", "MO-2", `${s.target.name} is a source of ${target.imported}: a module boundary is a value boundary — write it through an action ${target.imported} exports`);
          }
          if (s.k === "optimistic") {
            if (!ctx.inAction) this.err("GUESS_OUTSIDE_HOLD", "AC-3", "a guess outside an action: it needs a hold to live in — an apply block is never an action (its return is the cleanup, EF-5): declare one, `action save(v) { guess … }`, and call it from the block");
          }
          s.target.path.forEach(p => typeof p !== "string" && this.expr(p, env, ctx));
          this.expr(s.e, env, ctx);
          { const line = this.line; this.later.push(() => { this.line = line; this.escape(s, target, env); }); }   // O-3: after every fn's result is known
          break;
        }
        case "refresh": case "affects": case "action": if (ctx.server) { this.err("SERVER_CAPTURE", "SF-3", `\`${s.k}${s.k === "action" ? " { … }" : ` ${(s as { name: string }).name}`}\` in a server function's body: it is the client's (do it in the action that awaited the call)`); break; }
          if (s.k === "action") { this.comp("action", env, { name: "(inline)" }, () => this.stmts(s.body, env, { scope: "imperative", inAction: true })); this.actions.push({ name: "(inline)", body: s.body, env, line: this.line }); this.runChecks(s.body, env, true, []); break; }
          if (s.k === "affects") { const t = this.resolve(s.name, env, ctx); this.model.write(t, "affects"); if (t) this.changed.add(t); if (t && !reactiveKinds.has(t.kind)) this.err("INVALID_AFFECTS_TARGET", "AC-5", `${s.name} is not reactive`); break; }
          { const t = this.resolve(s.name, env, ctx); this.model.write(t, "refresh"); if (t) this.changed.add(t); if (t && !(t.kind === "eq" || (t.kind === "source" && t.question))) this.err("INVALID_REFRESH_TARGET", "AC-4", `${s.name} has no question to re-ask`); break; }
        case "sif": this.wholeOk.add(s.c); this.expr(s.c, env, ctx); this.stmts(s.t, env, ctx); this.stmts(s.f, env, ctx); break;   // MO-10f: a condition reads no field
        case "try": {
          this.stmts(s.body, env, ctx);
          if (s.catchClasses) for (const n of s.catchClasses) this.errClass(n, env);
          if (s.handler) { const h = new Env(env, env.region); if (s.catchName) h.vars.set(s.catchName, { kind: "value", name: s.catchName, region: env.region, line: this.line }); this.stmts(s.handler, h, ctx); }
          if (s.fin) this.stmts(s.fin, env, ctx);
          break;
        }
      }
    }
    this.line = line0;
  }

  /** The reactive names captured by closures that a value stores (O-3). A functional write's own function is applied, not stored,
   *  and so is a closure handed to a prelude function (`map(xs, x => …)`). Through a name: a `let`'s captures, an equation's
   *  expression; through a call: what the fn's result captures — for an instantiation (RG-6), a name of the instance stands for
   *  the instance, which lives as long as the region of the call. A prop is marked (`propOf`): what it captures is the caller's. */
  private stored(e: Expr, env: Env, seen = new Set<Sym>(), result = false): Sym[] {
    const out: Sym[] = [];
    // `res`: the value is called, and only what the call returns is stored — a closure stores nothing then unless its body makes one
    const walk = (x: Expr, res: boolean): void => {
      if (x.k === "fn") {
        if (res && !containsFn(x)) return;
        const names = new Set<string>(); freeNames(x, new Set(), names);
        for (const n of names) { const s = env.lookup(n.startsWith("pre:") ? n.slice(4) : n); if (s && reactiveKinds.has(s.kind)) out.push(s); if (s?.captures) out.push(...s.captures); }
        return;
      }
      if (x.k === "id") {
        const s = env.lookup(x.name); if (!s) return;
        const caps = res ? s.retCaptures ?? s.captures : s.captures; if (caps) out.push(...caps);
        if (s.kind === "props") out.push({ kind: "props", name: s.name, region: s.region, line: s.line, propOf: { comp: s.region, field: "*" }, ...(s.viewOf ? { viewOf: s.viewOf } : {}) });
        if (s.kind === "eq" && s.expr && s.env && !seen.has(s)) { seen.add(s); out.push(...this.stored(s.expr, s.env, seen, res)); }
        return;
      }
      if (x.k === "member" && x.o.k === "id") { const s = env.lookup(x.o.name); if (s?.kind === "props") { out.push({ kind: "props", name: `${s.name}.${x.p}`, region: s.region, line: s.line, propOf: { comp: s.region, field: x.p }, ...(s.viewOf ? { viewOf: s.viewOf } : {}) }); return; } }
      if (x.k === "call") {
        const f = x.f.k === "id" ? env.lookup(x.f.name) : undefined;
        if (x.f.k === "id" && lang(env, x.f.name) === "fn") { x.args.forEach(a => walk(a, res || a.k === "fn")); return; }   // a prelude function applies the closures it is given
        if (f?.kind === "fn" && f.fnTail && f.fnEnv && !seen.has(f)) {
          seen.add(f); const R = f.fnEnv.region; let inst: Sym | null = null;
          for (const c of this.stored(f.fnTail, f.fnEnv, seen, res)) {
            let r: Region | null = c.region; while (r && r !== R) r = r.parent;
            if (f.instantiating && r && !c.propOf) out.push(inst ??= { kind: "eq", name: `an instance of ${f.name}`, region: env.region, line: this.line });
            else out.push(c);
          }
          seen.delete(f);
        }
        walk(x.f, true); x.args.forEach(a => walk(a, false));                                // the callee is applied; what it returns may be an argument
        return;
      }
      for (const v of Object.values(x as object)) {
        if (Array.isArray(v)) v.forEach(y => { if (y && typeof y === "object") { if ("k" in y) walk(y as Expr, res); else if ("v" in y) walk((y as { v: Expr }).v, res); else if ("spread" in y) walk((y as { spread: Expr }).spread, res); } });
        else if (v && typeof v === "object" && "k" in (v as object)) walk(v as Expr, res);
      }
    };
    walk(e, result); return out;
  }
  private escape(s: Extract<Stmt, { k: "write" | "optimistic" }>, target: Sym | undefined, env: Env) {
    const value = s.e.k === "fn" && !s.e.stmts ? s.e.body : s.e;                          // W-6: `x := f` applies f; f's result is what is stored
    const captured = this.stored(value, env); if (!captured.length) return;
    let tDepth: number; let prov: string | null = null;
    if (target) tDepth = target.region.depth;
    else {                                                                                   // `use p := …`: the provision is in this component, or above it
      let r: Region | null = env.region; let found: Region | null = null;
      const key = env.lookup(s.target.name)?.ctx?.key ?? s.target.name;
      while (r) { if (r.provides.has(key)) { found = r; break; } if (r.isComponentRoot) break; r = r.parent; }
      tDepth = found ? found.depth : env.region.component ? env.region.component.depth - 1 : 0;
      if (!found) prov = key;
    }
    const leak = captured.find(c => !c.propOf && c.region.depth > tDepth);
    if (leak) this.err("REGION_ESCAPE", "O-3", `a closure capturing ${leak.name} (declared in a region that ends sooner) is stored into ${s.target.ctx ? "use " : ""}${s.target.name}, which outlives it`);
    for (const c of captured) if (c.propOf && tDepth < c.propOf.comp.depth) if (c.viewOf) this.viewStores.push({ ...c.viewOf, field: c.propOf.field, line: this.line }); else this.retain(c.propOf.comp, c.propOf.field, prov !== null ? `p:${prov}` : `d:${tDepth}`);   // checked where the component is applied
  }
  private retain(comp: Region, field: string, t: string): boolean {
    let m = this.retains.get(comp); if (!m) this.retains.set(comp, m = new Map());
    let ts = m.get(field); if (!ts) m.set(field, ts = new Set());
    if (ts.has(t)) return false; ts.add(t); return true;
  }
  /** O-3 at an application: a closure passed for a prop the component stores must not capture a name that ends before where it is
   *  stored. A provision's place is found from the site; a prop passed on (`x={props.y}`) is stored by this component too. */
  private retained() {
    const targets = (C: Region, field: string): string[] => {
      if (C.sig) return (field === "*" ? Object.values(C.sig.stored ?? {}).flat() : [...(C.sig.stored?.[field] ?? []), ...(C.sig.stored?.["*"] ?? [])]).map(t => t === "module" ? "d:0" : `p:${t}`);   // a spread ("*") goes wherever any field goes
      const m = this.retains.get(C); return m ? (field === "*" ? [...m.values()].flat() : [...(m.get(field) ?? []), ...(m.get("*") ?? [])]) : [];
    };
    for (let changed = true; changed;) {
      changed = false;
      for (const a of this.apps) for (const x of a.passed) {
        const ts = targets(a.comp, x.field); if (!ts.length) continue;
        const cap = this.stored(x.e, x.env);
        for (const t of ts) {
          const limit = t.startsWith("d:") ? +t.slice(2) : this.provAnchor(a.site, t.slice(2));
          const leak = cap.find(c => !c.propOf && c.region.depth > limit);
          if (leak) { this.line = a.line; this.err("REGION_ESCAPE", "O-3", `<${a.tag} ${x.field === "*" ? "{...…}" : `${x.field}={…}`}>: the closure passed captures ${leak.name} (declared in a region that ends sooner), and ${a.tag} stores ${x.field === "*" ? "a field of it" : x.field} (itself, or through a component it passes it to) where it outlives it`); }
          for (const c of cap) if (c.propOf && limit < c.propOf.comp.depth) { if (c.viewOf) { const at = { ...c.viewOf, field: c.propOf.field, line: a.line }; if (!this.viewStores.some(v => v.comp === at.comp && v.view === at.view && v.field === at.field && v.line === at.line)) this.viewStores.push(at); } else if (this.retain(c.propOf.comp, c.propOf.field, t)) changed = true; }
        }
      }
    }
  }
  /** O-3: what a view stores of what it is shown with. A closure there is the component's, which ends before where it is stored. */
  private viewsStored() {
    for (const v of this.viewStores) if (v.field === "*" || !this.viewValue(v.comp, v.view, v.field)) { this.line = v.line; this.err("REGION_ESCAPE", "O-3", `what ${v.comp.name} shows its view with${v.field === "*" ? "" : ` (${v.field})`} may hold a closure of ${v.comp.name}'s, and is stored where it outlives it: store a value made of it, or let ${v.comp.name} store it`); }
  }
  /** The depth, in the site's lexical tree, of the region a provision written from beneath `site` lives as long as. */
  private provAnchor(site: Region, key: string): number {
    let r: Region | null = site;
    while (r) {
      if (r.provides.has(key)) return r.depth;
      if (r.kids) { if (r.kids.comp.provides.has(key)) return r.kids.site.depth; r = r.kids.site; continue; }   // RG-4c: children see the component's provisions, then the site's
      if (r.isComponentRoot) return r.depth - 1;                                           // above the component: it outlives every name in it
      r = r.parent;
    }
    return 0;
  }

  // ---- views ----
  /** RG-4c: `<props.f a={e} />`, the component's view shown there. The arguments are read there, as far as what they wait on
   *  and fail with goes (nothing of it is in a signature); the view's own readers go up from there, as `{props.children}`'s. */
  private showView(m: Extract<Markup, { k: "el" }>, c: Sym, view: string, env: Env) {
    const R = c.compRegion!, how = this.shownBy(c)!.get(view)!; const bad = (msg: string) => this.err("VIEW_FN_MISPLACED", "RG-4c", msg);
    if (env.region.component !== R) bad(`<${m.tag}> is shown in ${c.name}'s own view, not in a component declared inside it: give that one a view of its own, \`{view (s) { <${m.tag} … /> }}\``);
    if (m.children.some(x => x.k !== "text" || x.s.trim())) bad(`<${m.tag}> is given nothing between its tags: what the view shows is what it was written with`);
    if (how.optional && !how.mixed) { let r: Region | null = env.region; while (r && this.asked.get(r) !== view) r = r === R ? null : r.parent; if (!r) bad(`${c.name}'s ${view} is optional: show it where it is there, \`{if ${m.tag} { <${m.tag} … /> }}\``); }
    const handles = (n: string) => n !== "ref" && isHandler(n);
    this.componentValues(m, env);
    for (const a of m.attrs) {
      if (a.name === "children") { bad(`<${m.tag} children={…}>: a view is shown with fields of another name`); continue; }
      if (handles(a.name)) this.handlerCalled(a.e, env, a.name);
      this.comp(handles(a.name) ? "handler" : "prop", env, { at: `${m.tag} ${a.name}` }, () => this.expr(a.e, env, { scope: handles(a.name) ? "imperative" : "reactive" }));
      if (!handles(a.name)) { this.keep(a.e, env); this.readers.push({ region: env.region, e: a.e, env, line: this.line }); }
    }
    this.shownAt.push({ region: env.region, comp: R, view });
    const key = `${R.id}:${view}`; let at = this.placed.get(key); if (!at) this.placed.set(key, at = []);
    at.push(m.attrs.map(a => ({ field: a.name === "..." ? "*" : a.name, e: a.e, env })));
  }
  /** RG-4c: `<use.item a={e} />`, the view a context holds, shown there with what the context's type says. Its
   *  arguments are read there; the view's own readers go up from there, then from the block that provides it. */
  private showCarried(m: Extract<Markup, { k: "el" }>, name: string, env: Env) {
    const c = this.ctxOf(name, env); const bad = (msg: string) => this.err("VIEW_FN_MISPLACED", "RG-4c", msg);
    if (!c?.ctx!.view?.fn) { bad(`<${m.tag} … /> shows the view a context holds: ${name} is ${c ? `declared ${c.ctx!.ty ?? "with no type"}` : "no context"} — a context that holds a view with a parameter is \`context ${name}: (row: T) => View\` (one of no parameter is shown \`{use ${name}}\`)`); return; }
    if (m.children.some(x => x.k !== "text" || x.s.trim())) bad(`<${m.tag}> is given nothing between its tags: what the view shows is what it was written with`);
    this.model.read(c, false); if (!c.ctx!.dflt) this.uses.push({ region: env.region, name: c.ctx!.key, line: this.line, display: name });
    const handles = (n: string) => n !== "ref" && isHandler(n);
    for (const a of m.attrs) {
      if (a.name === "children") { bad(`<${m.tag} children={…}>: a view is shown with fields of another name`); continue; }
      if (handles(a.name)) this.handlerCalled(a.e, env, a.name);
      this.comp(handles(a.name) ? "handler" : "prop", env, { at: `${m.tag} ${a.name}` }, () => this.expr(a.e, env, { scope: handles(a.name) ? "imperative" : "reactive" }));
      if (!handles(a.name)) { this.keep(a.e, env); this.readers.push({ region: env.region, e: a.e, env, line: this.line }); }
    }
    const key = c.ctx!.key, attrs = m.attrs.map(a => ({ field: a.name === "..." ? "*" : a.name, e: a.e, env }));
    this.later.push(() => { for (const p of this.carriedFns) if (p.key === key) {         // every provision of it in the module: each view may be the one shown here
      this.shownAt.push({ region: env.region, comp: p.comp.compRegion!, view: p.view, from: p.block });
      const k = `${p.comp.compRegion!.id}:${p.view}`; let at = this.placed.get(k); if (!at) this.placed.set(k, at = []); at.push(attrs);
    } });
  }
  private markup(ms: Markup[], env: Env, viewRoot = false) {
    let styles = 0;
    for (const m of ms) {
      if (m.line) this.line = m.line;
      switch (m.k) {
        case "text": break;
        case "style":                                                                         // 07 §6b CSS-1
          if (!viewRoot) this.err("STYLE_PLACEMENT", "CSS-1", "a <style> is written at the top level of a component's view (or the program's): it scopes that whole view, branches and loops included — move it there");
          else if (++styles > 1) this.err("STYLE_PLACEMENT", "CSS-1", "a second <style> in one view: a view has one stylesheet");
          break;
        case "read": this.readEnv.set(m, env); if (this.throughReads.has(m)) { this.readers.push({ region: env.region, e: m.e, env, line: this.line }); break; }   // MO-14f: no expression of the program's
          this.comp("reader", env, { at: "{…}" }, () => { const was = this.shownUse; this.shownUse = m.e.k === "use" ? m.e : null; try { this.expr(m.e, env, { scope: "reactive" }); } finally { this.shownUse = was; } }); this.keep(m.e, env); this.readers.push({ region: env.region, e: m.e, env, line: this.line }); break;
        case "el": {
          for (const a of m.attrs) if (a.name === "ref") for (const x of a.e.k === "arr" ? a.e.items : [a.e]) this.refCalls.add(x);
          if (/^[A-Z]/.test(m.tag)) {
            const s = env.lookup(m.tag);
            if (!s || s.kind !== "comp") { this.err("UNKNOWN_COMPONENT", "RG-4a", s?.kind === "import" ? unknownJsComponent(m.tag, s.undeclared) : `<${m.tag}> is not a component declared here`); }
            // MO-10f (2026-11-22): a result with held fields, or a record of them, is given whole to a prop whose type says
            // those fields hold or fail (at least as the result's do): the component reads them as such, each read checked
            { const ph = s?.compRegion ? this.propHeld.get(s.compRegion) : undefined;
              if (ph) for (const a of m.attrs) {
                const given = this.heldUnder(a.e, env); if (!given.length) continue;
                if (given.every(([p, holds, fails]) => ph.some(([q, qh, qf]) => q === `${a.name}.${p}` && (qh || !holds) && fails.every(c => qf.includes(c) || qf.includes("Error"))))) this.wholeOk.add(a.e);
              } }
            const values = this.componentValues(m, env);
            const args = m.attrs.filter(a => !values.has(a));
            const handles = (n: string) => { const d = s?.compRegion?.sig?.props[n]; const own = s?.compRegion && !s.compRegion.sig && s.comp?.propsType !== undefined ? tyStep(fieldRows(s.comp.propsType).text, { field: n }) : undefined;
              return !!d?.callback || (!d?.pure && !tyAnswersValue(own) && isHandler(n) && (n !== "ref" || (!!s?.compRegion && !s.compRegion.sig?.js))); };   // SC-4b: `ref`, on a component written in .rx; a prop typed to answer a value is no handler   // MO-10g: a JS component's prop typed as a function is what its declaration says (`handler`, or pure), whatever its name; an untyped `on…` prop keeps SC-4. `ref` is a handler on an element only (07 §4): on a component, a handler only when declared one
            for (const a of args) { if (!handles(a.name)) this.closureGiven(a.e, env, a.name === "..." ? (p => p !== "" && handles(p.split(".")[0])) : (p => p !== ""), a.name === "..." ? `in a spread on <${m.tag}>` : `to <${m.tag} ${a.name}>`);   /* B3 */ if (handles(a.name)) this.handlerCalled(a.e, env, a.name); this.comp(handles(a.name) ? "handler" : "prop", env, { at: `${m.tag} ${a.name}` }, () => this.expr(a.e, env, { scope: handles(a.name) ? "imperative" : "reactive" })); if (!handles(a.name)) this.keep(a.e, env); }   // R-2: an argument is read where the component reads it
            if (s?.kind === "comp") {
              s.compRegion!.appSites.push(env.region);
              this.apps.push({ comp: s.compRegion!, site: env.region, line: this.line, tag: m.tag, args: args.filter(a => !handles(a.name)).map(a => ({ field: a.name === "..." ? "*" : a.name, e: a.e, env })), passed: args.map(a => ({ field: a.name === "..." ? "*" : a.name, e: a.e, env })) });   // a spread is every field: "*"   // R-2: passing is not reading — checked where the component reads it
              const kids = this.region(env.region, "children", { provParent: s.compRegion!, name: m.tag });              // RG-4c: children are named by the caller, owned where the component reads them
              kids.kids = { comp: s.compRegion!, site: env.region };
              if (s.compRegion!.hostKey) this.hostSites.push({ key: s.compRegion!.hostKey, comp: s.compRegion!, region: kids });   // MO-11u
              const sigProps = s.compRegion!.sig?.props;
              for (const x of m.children) if (x.k === "mview" && x.prop) {                     // MO-11k: a named render prop
                if (!sigProps?.[x.prop]?.render && !this.shownBy(s)?.has(x.prop) && !(s?.comp && declaresViewFn(s.comp.propsType, this.types, x.prop, s.comp.tparams))) this.err("VIEW_FN_MISPLACED", "MO-11k", `<${m.tag}> declares no render prop ${x.prop} (a prop typed as a function giving a View)`);
                this.viewFns.add(x);                                                           // reported once; its body is still checked
              }
              if (sigProps?.children?.render) {                                               // MO-11k: children are one view lambda
                const real = m.children.filter(x => !(x.k === "text" && !x.s.trim()) && !(x.k === "mview" && x.prop));
                const leftOut = !real.length && !!sigProps.children.renderOptional;             // an optional render prop left out is the component's own rendering (`<Select.Listbox />`)
                if (!leftOut && (real.length !== 1 || real[0].k !== "mview")) this.err("VIEW_FN_EXPECTED", "MO-11k", `<${m.tag}>'s children are a function of what it renders: write them as \`{view (item) { … }}\``);
                for (const x of real) if (x.k === "mview") this.viewFns.add(x);
              }
              const takes = this.shownBy(s); const apart = new Set<Markup>();                  // RG-4c: an .rx component that shows views it is given
              if (takes) {
                const real = m.children.filter(x => !(x.k === "text" && !x.s.trim()) && !(x.k === "mview" && x.prop));
                const many = (v: Extract<Markup, { k: "mview" }>) => { if (v.params.length > 1) this.expectsView(m.tag, v.prop); };
                const ch = takes.get("children");
                if (ch) {
                  const one = real.length === 1 && real[0].k === "mview" ? real[0] : undefined;
                  if (m.attrs.some(a => a.name === "children") || (!ch.mixed && !one && (real.length || !ch.optional))) this.expectsView(m.tag);
                  if (one) { this.viewFns.add(one); this.viewFor.set(one, { comp: s, view: "children" }); many(one); }
                }
                for (const x of m.children) if (x.k === "mview" && x.prop && takes.has(x.prop)) {
                  if (x.prop === "children") { apart.add(x); this.expectsView(m.tag); continue; }
                  many(x); this.viewFor.set(x, { comp: s, view: x.prop }); apart.add(x);
                  const at = this.region(env.region, "children", { provParent: s.compRegion!, name: m.tag }); at.kids = { comp: s.compRegion!, site: env.region, view: x.prop };
                  this.markup([x], new Env(env, at));
                }
                for (const [f, v] of takes) if (f !== "children" && !v.mixed) {
                  const a = m.attrs.find(a => a.name === f), n = m.children.filter(x => x.k === "mview" && x.prop === f).length;
                  if (a || n > 1 || (!n && (!v.optional || m.attrs.some(x => x.name === "..." && this.mayGive(x.e, f, env))))) this.expectsView(m.tag, f);
                }
              }
              this.markup([...m.children.filter(x => !apart.has(x)), ...this.throughChildren(m, s, env), ...values.values()], new Env(env, kids));
              if (s.factory && !this.expanding.markup.has(s)) { this.expanding.markup.add(s); this.markup(this.factoryTree(s, m.line), new Env(s.factory.env, kids)); this.expanding.markup.delete(s); }   // MO-11f: named where the factory was called
            } else this.markup(m.children, env);
            break;
          }
          { const c = this.shows(m.tag, env); if (c) { this.showView(m, c.comp, c.view, env); break; } }
          { const u = usedIn(m.tag); if (u !== undefined) { this.showCarried(m, u, env); break; } }
          { const dot = m.tag.indexOf("."); if (dot > 0) { const head = m.tag.slice(0, dot); const bound = !!env.lookup(head); if (bound) this.err("UNKNOWN_COMPONENT", "MO-11q", memberTagLowercase(m.tag)); } }
          for (const a of m.attrs) { if (!isHandler(a.name)) this.closureGiven(a.e, env, a.name === "..." ? (p => p !== "" && isHandler(p.split(".")[0])) : (p => p !== ""), a.name === "..." ? `in a spread on <${m.tag}>` : `to <${m.tag} ${a.name}>`);   /* B3 */ if (isHandler(a.name) && a.name !== "ref") this.handlerCalled(a.e, env, a.name); this.comp(isHandler(a.name) ? "handler" : "reader", env, { at: `${m.tag} ${a.name}` }, () => this.expr(a.e, env, { scope: isHandler(a.name) ? "imperative" : "reactive" })); if (!isHandler(a.name)) this.keep(a.e, env); if (!isHandler(a.name)) this.readers.push({ region: env.region, e: a.e, env, line: this.line }); else this.handlers.push({ attrs: m.attrs, kids: m.children, h: a.e, env, region: env.region, line: this.line, what: `<${m.tag}> ${a.name}` }); }
          this.markup(m.children, env);
          break;
        }
        case "mif": {
          this.wholeOk.add(m.c);                                                             // MO-10f: a condition reads no field
          this.comp("reader", env, { at: "if" }, () => this.expr(m.c, env, { scope: "reactive" })); this.keep(m.c, env); this.readers.push({ region: env.region, e: m.c, env, line: this.line });
          { const then = this.region(env.region, "then"); if (m.c.k === "member" && m.c.o.k === "id" && this.shows(`${m.c.o.name}.${m.c.p}`, env)) this.asked.set(then, m.c.p); this.block(m.tDecls, m.t, new Env(env, then), { scope: "reactive" }); }
          this.block(m.fDecls, m.f, new Env(env, this.region(env.region, "else")), { scope: "reactive" });
          break;
        }
        case "mview": {                                                                     // MO-11k: a render prop's body, owned where the component calls it
          if (!this.viewFns.has(m)) { this.err("VIEW_FN_MISPLACED", "MO-11k", "a `view (…) { … }` is the only child of a component that takes one: a JS component whose declaration types `children` as a function giving a View, or an .rx component that shows its `children`, typed so, as `<props.children … />` (a named one, `view cell (s) { … }`, its `cell`)"); break; }
          const r = this.region(env.region, "for"); const inner = new Env(env, r);
          const host = this.viewFor.get(m); const type = host && this.shownBy(host.comp)?.get(host.view)?.param; if (type !== undefined) this.propsTy.set(r, fieldRows(type).text);
          for (const p of m.params) inner.vars.set(p, host ? { kind: "props", name: p, region: r, line: this.line, viewOf: host } : { kind: "value", name: p, region: r, line: this.line, handed: true });   // what the component passes: a value per call
          this.block(m.decls, m.body, inner, { scope: "reactive" });
          break;
        }
        case "mfor": {
          this.comp("reader", env, { at: "for" }, () => this.expr(m.xs, env, { scope: "reactive" })); this.keep(m.xs, env); this.readers.push({ region: env.region, e: m.xs, env, line: this.line });
          const src = m.xs.k === "id" ? env.lookup(m.xs.name) : undefined;
          if ((src?.mapsRecords && src.eqExpr && ownMap(src.eqExpr.e, src.eqExpr.env)) || (mapsIntoRecords(m.xs) && ownMap(m.xs, env))) this.err("UNSTABLE_LIST_IDENTITY", "ST-4b", `for ${m.name} in …: the rows are rebuilt as fresh records on every change — declare a key (\`x key id = …\`)`);
          const r = this.region(env.region, "for"); const inner = new Env(env, r);
          inner.vars.set(m.name, { kind: "value", name: m.name, region: r, line: this.line, rowOf: { e: m.xs, env } });   // RG-2b: the row binding is a constant
          { const ps = this.itemParts(m.xs, env); if (ps.size) inner.vars.get(m.name)!.actionParts = [...ps]; }   // W2: a row holds what an item of the list holds
          this.block(m.decls, m.body, inner, { scope: "reactive" });
          break;
        }
        case "loading": {
          if (m.on) { const on = m.on; this.comp("reader", env, { at: "loading on" }, () => this.expr(on, env, { scope: "reactive" })); this.readers.push({ region: env.region, e: m.on, env, line: this.line }); }
          this.markup(m.fallback, env);
          const body = this.region(env.region, "loading"); body.provides.add(HOLD);                       // SV-7b: what holds a client question on the server
          if (m.on) this.loadOns.push({ region: body, e: m.on, env, line: this.line });
          this.block(m.decls, m.body, new Env(env, body), { scope: "reactive" });
          break;
        }
        case "portal": {                                                                      // RG-8: a region owned here, rendered elsewhere
          if (m.to) { const to = m.to; this.comp("reader", env, { at: "portal to" }, () => this.expr(to, env, { scope: "reactive" })); this.readers.push({ region: env.region, e: m.to, env, line: this.line }); }
          const body = this.region(env.region, "portal"); body.provides.add(HOLD);                       // PT-3: the server renders nothing for it — a client question inside is held by it
          this.block(m.decls, m.body, new Env(env, body), { scope: "reactive" });
          this.later.push(() => this.contentCheck(m.body, env, ["body"]));                     // its place is the end of the document
          break;
        }
        case "errored": {
          const f = new Env(env, env.region); if (m.errName) f.vars.set(m.errName, { kind: "value", name: m.errName, region: env.region, line: this.line });
          this.markup(m.fallback, f);
          if (m.classes) for (const n of m.classes) this.errClass(n, env);
          const body = this.region(env.region, "errored"); body.catches = catchOf(m.classes);                 // R-f-4: the boundary discharges its classes for its content
          this.block(m.decls, m.body, new Env(env, body), { scope: "reactive" });
          break;
        }
      }
    }
  }

  /** MO-11c: a component passed to a JS component's `Component` prop — checked as applied, with no arguments, among the
   *  application's children (DV-24). */
  private componentValues(m: Extract<Markup, { k: "el" }>, env: Env): Map<unknown, Markup> {
    const out = new Map<unknown, Markup>();
    const sig = env.lookup(m.tag)?.compRegion?.sig;
    const views = env.lookup(m.tag)?.compRegion ? this.viewProps.get(env.lookup(m.tag)!.compRegion!) : undefined;   // MO-11t: and the components given by name to its props typed `View`, each applied there with no arguments
    const isComp = (e: Expr): e is Extract<Expr, { k: "id" }> => e.k === "id" && /^[A-Z]/.test(e.name) && env.lookup(e.name)?.kind === "comp";
    const escapes = (name: string) => { const k = env.lookup(name)!.compRegion?.key; if (k) this.escapes.add(k); };   // E-5a: a JS component applies it
    for (const a of m.attrs) {
      if ((sig?.props[a.name]?.component || views?.has(a.name)) && isComp(a.e)) { out.set(a, this.applied([a.e.name], m.line)[0]); escapes(a.e.name); continue; }
      // MO-11c (2026-11-24): a prop whose type holds a `Component` in a record or an array (`builtins={{ Heading }}`,
      // `tabs={[First, Second]}`) — each component in the literal is a value there, applied as a direct one is
      if (!sig?.props[a.name]?.components) continue;
      // MO-11c (2026-11-25): … or the name of an equation bound to such a literal, read as the literal
      if (a.e.k === "id") { const t = env.lookup(a.e.name)?.lit; if (t && t.ids.every(x => env.lookup(x.name) === t.env.lookup(x.name))) { t.sites.add(a.e); for (const x of t.ids) { out.set(x, this.applied([x.name], m.line)[0]); escapes(x.name); } } continue; }
      const walk = (e: Expr) => {
        if (isComp(e)) { this.valueIds.add(e); out.set(e, this.applied([e.name], m.line)[0]); escapes(e.name); }
        else if (e.k === "rec") { for (const x of e.fields) if (!("spread" in x)) walk(x.v); }
        else if (e.k === "arr") { for (const x of e.items) if (x.k !== "spread") walk(x); }
      };
      if (a.e.k === "rec" || a.e.k === "arr") walk(a.e);
    }
    return out;
  }
  /** MO-11c (2026-11-25): an equation whose right side is a record or array literal with components in it
   *  (`builtins = { Heading }`) is read as that literal where it is given, by name, to a JS component's prop whose type
   *  holds components. The components in it are values on that condition, held at the end of the module (litCheck). */
  private idCounts = new Map<string, number>();
  private lits: Sym[] = [];
  private litBinding(made: Sym, d: Extract<Decl, { k: "eq" }>, env: Env) {
    const ids: Extract<Expr, { k: "id" }>[] = [];
    const walk = (e: Expr) => {
      if (e.k === "id") { if (/^[A-Z]/.test(e.name) && env.lookup(e.name)?.kind === "comp" && !this.valueIds.has(e)) ids.push(e); }
      else if (e.k === "rec") { for (const x of e.fields) if (!("spread" in x)) walk(x.v); }
      else if (e.k === "arr") { for (const x of e.items) if (x.k !== "spread") walk(x); }
    };
    walk(d.e); if (!ids.length) return;
    for (const x of ids) this.valueIds.add(x);
    made.lit = { ids, env, line: d.line, sites: new Set(), exported: !!d.exported };
    this.lits.push(made);
  }
  /** Every mention of the name is such a prop, it is given to one, and it is not exported. A mention is the name's by its
   *  scope (`scopeFacts`: counted over the module's tree, so one the walk does not resolve — a callee, a path — counts
   *  against it; a sibling component's local of the same name is another binding, and does not). */
  private litCheck() {
    for (const s of this.lits) {
      const t = s.lit!; const n = this.idCounts.get(`${s.name}@${t.line}`) ?? 0;
      if (!t.exported && t.sites.size > 0 && n === t.sites.size) continue;
      this.line = t.line;
      const why = t.exported ? "it is exported, and a signature says nothing of the components a value holds" : t.sites.size === 0 ? "it is given to no such prop" : "it is also read elsewhere";
      for (const x of t.ids) this.err("COMPONENT_AS_VALUE", "RG-4a", `component ${x.name} used as a value: ${s.name} holds it, and a name bound to a record or an array of components is read as that literal only where every mention of the name is the whole value of a JS component's prop whose type holds components (\`<Markdown builtins={${s.name}} />\`) — ${why} (MO-11c)`);
    }
  }
  private viewProps = new Map<Region, Set<string>>();   // MO-11t: a JS component's props that take a view (typed `View`, not `children`)
  /** MO-10f: each component's prop interfaces, found before any view is walked. */
  private propInterfaces(decls: Decl[], env: Env) {
    const comps = decls.flatMap(d => d.k === "component" ? [d] : []);
    for (const d of comps) {
      const R = env.lookup(d.name)?.compRegion; if (!R || d.propsType === undefined) continue;
      const held = (fieldRows(d.propsType).held ?? []).filter(h => h[0].includes("."));
      if (held.length) this.propHeld.set(R, held);
    }
  }
  /** MO-10f (2026-11-22): per component, the fields of its props that its type says hold or fail where they are read
   *  (`query.data`, holds, classes): the interface a JS result with held fields may be given whole through. */
  private propHeld = new Map<Region, [string, boolean, string[]][]>();
  /** MO-10f: the held fields at or below what `e` names — a result with held fields, or a path to a record of them — by
   *  their paths from it. Empty when `e` is neither. */
  private heldUnder(e: Expr, env: Env): [string, boolean, string[]][] {
    let root: string; let path: (string | undefined)[];
    if (e.k === "id") { root = e.name; path = []; } else { const fp = fieldPath(e); if (!fp) return []; root = fp.root; path = fp.path; }
    if (!path.every(p => p !== undefined)) return [];
    const pre = path.map(p => `${p}.`).join("");
    return (env.lookup(root)?.held ?? []).flatMap(h => h[0].startsWith(pre) ? [[h[0].slice(pre.length), h[1], h[2]] as [string, boolean, string[]]] : []);
  }
  /** MO-11c: `<C />` for each component value, as the checks see it. */
  private applied(tags: string[], line?: number): Markup[] { return tags.map(tag => ({ k: "el", tag, attrs: [], children: [], line }) as Markup); }
  /** MO-11f: the factories being expanded, per walk (a factory may be given itself; C-1 reports that cycle). */
  private expanding = { markup: new Set<Sym>(), content: new Set<Sym>(), shape: new Set<Sym>() };

  /** MO-11f: the components in a factory call's arguments — anywhere inside its record and array literals, and the arguments of
   *  JS calls among them (MO-11g). */
  private valueIds = new Set<Expr>();
  private factoryValues(s: Sym): string[] {
    const f = s.factory!; if (f.values) return f.values;
    return f.values = this.given(f.args, f.env, handsOn);
  }

  /** MO-11r: the components among a call's arguments, each a value there — anywhere inside their record and array
   *  literals, and the arguments of the JS calls among them: for a factory (MO-11f) those that hand on what they are
   *  given (MO-11g); for a fn that renders them itself (MO-11s, MO-11u) any, but a component a call inside has taken. */
  private given(args: Expr[], env: Env, on: (g: Sym) => boolean, free = false): string[] {
    const out: string[] = [];
    const walk = (e: Expr) => {
      if (e.k === "id" && /^[A-Z]/.test(e.name) && env.lookup(e.name)?.kind === "comp" && !(free && this.valueIds.has(e))) { this.valueIds.add(e); out.push(e.name); }   // a value is applied by its tag, so it is capitalised as one
      else if (e.k === "rec") { for (const x of e.fields) if (!("spread" in x)) walk(x.v); }
      else if (e.k === "arr") { for (const x of e.items) if (x.k !== "spread") walk(x); }
      else if (e.k === "call" && e.f.k === "id") { const g = env.lookup(e.f.name); if (g && on(g)) e.args.forEach(walk); }
    };
    args.forEach(walk);
    return out;
  }
  /** MO-11s: components given to a JS fn that says nothing of where it renders them (no factory, or no declaration
   *  at all) — as values in its arguments, their record and array literals and the
   *  JS calls among them — are checked as the most cautious placement allows: applied under a root of their own, at any
   *  time, so nothing above the call (errored, loading, provide) is credited to them. */
  private unplaced(args: Expr[], env: Env, f?: Sym) {
    const out = this.given(args, env, g => g.kind === "import" || (g.kind === "fn" && g.foreign !== undefined), true);
    const h = f?.rendersIn;
    // MO-14h: a component the host's view places is rendered where the view says (MO-14d). The fn's row says beneath an
    // application of H; where the declaration says the host renders through H, the view says where beneath it — the
    // component is checked there, in the host's view, and not side by side with the others here
    if (h && this.opts.under?.has(h.key) && this.opts.placed) { const placed = this.opts.placed; const keyOf = (n: string) => env.lookup(n)?.compRegion?.key; for (let i = out.length - 1; i >= 0; i--) { const k = keyOf(out[i]); if (k !== undefined && placed.has(k)) out.splice(i, 1); } }
    if (!out.length) return;
    if (!h) { this.markup(this.applied(out, this.line), new Env(env, this.rootOf())); return; }
    // MO-11u: `renders(H)` — the components are rendered later, beneath an application of H. They are applied under a root
    // that stands for H's children; what they let out of it is judged at every application of H in the program
    const root = this.region(null, "root", { component: true, name: h.name });
    this.markup(this.applied(out, this.line), new Env(env, root));
    this.hostedCalls.push({ host: h.key, name: h.name, fn: f!.name, root, line: this.line, credit: h.credit });
  }
  private hostedCalls: { host: string; name: string; fn: string; root: Region; line: number; credit: string[] }[] = [];   // MO-11u
  private hostSites: { key: string; comp: Region; region: Region }[] = [];   // MO-11u: each application of a component a fn `renders(…)` beneath — its children's region
  hosted: Hosted[] = []; hosts: Record<string, HostSite[]> = {};   // MO-11u: what the walk found of them, resolved (the module's signature)
  /** MO-11j: an exported factory's component, summarised as a component whose view applies it — what its values let out
   *  and need from above, and its content shape, are what an importer's `<Router />` gets (MO-3). */
  private exportMade(made: Sym, name: string, line: number) {
    const w = this.region(made.region, "component", { component: true, name });
    const view: Markup[] = [{ k: "el", tag: name, attrs: [], children: [], line } as Markup];
    const wenv = new Env(this.rootEnv!, w);
    const wrap: Sym = { kind: "comp", name, region: made.region, line, compRegion: w, comp: { k: "component", name, props: "props", decls: [], view, line } as unknown as Sym["comp"], compEnv: wenv };
    this.compSyms.set(w, wrap); made.factory!.exported = wrap;
    this.markup(view, wenv);
  }
  /** MO-11f, MO-11i: what a factory was given, as the markup the checks walk: each component applied with no arguments; with
   *  `nests(kids in inside)`, a record's `kids` entries are applied among its `inside` component's children. */
  private nested = new Map<string, { name: string; env: Env; line: number; kids: string; at: Expr[] }>();   // MO-11i: the components a factory's records nest others in
  private factoryTree(s: Sym, line?: number): Markup[] {
    const f = s.factory!; this.factoryValues(s); const n = f.nests;
    const isValue = (e: Expr): e is Extract<Expr, { k: "id" }> => e.k === "id" && this.valueIds.has(e);
    const walk = (e: Expr): Markup[] => {
      if (isValue(e)) return this.applied([e.name], line);
      if (e.k === "arr") return e.items.flatMap(x => x.k === "spread" ? [] : walk(x));
      if (e.k === "call") return e.f.k === "id" && (() => { const g = f.env.lookup(e.f.name); return !!g && handsOn(g); })() ? e.args.flatMap(walk) : [];
      if (e.k !== "rec") return [];
      const kv = (name: string) => e.fields.find(x => !("spread" in x) && x.key === name) as { key: string; v: Expr } | undefined;
      const host = n ? kv(n.inside) : undefined; const kids = n ? kv(n.kids) : undefined;
      if (!host || !isValue(host.v)) return e.fields.flatMap(x => "spread" in x ? [] : walk(x.v));
      const el = this.applied([host.v.name], line)[0] as Extract<Markup, { k: "el" }>;
      el.children = kids ? walk(kids.v) : [];
      if (el.children.length) { const key = `${host.v.name}@${line ?? 0}`; this.nested.set(key, { name: host.v.name, env: f.env, line: line ?? this.line, kids: this.nested.get(key)?.kids ?? n!.kids, at: [...(this.nested.get(key)?.at ?? []), host.v] }); }
      return [el, ...e.fields.flatMap(x => "spread" in x || x === host || x === kids ? [] : walk(x.v))];
    };
    return f.args.flatMap(walk);
  }

  // ---- SV-7d: the content model across templates ----
  private viewUsesMemo = new Map<Sym, ViewUses>();
  /** RG-4c: where a component shows each view it is given, and gives it on. */
  private usesOf(c: Sym): ViewUses | undefined { if (!c.comp) return undefined; let u = this.viewUsesMemo.get(c); if (!u) this.viewUsesMemo.set(c, u = viewUses(c.comp, this.types, new Set(this.shownBy(c)?.keys() ?? []), undefined, n => !!c.compEnv?.lookup(n)?.ctx?.view)); return u; }
  /** RG-4c: `use item` of a context that holds a view, shown. */
  private viewShown(e: Expr, env: Env): { key: string; dflt: boolean } | undefined { const c = e.k === "use" ? env.lookup(e.name)?.ctx : undefined; return c?.view ? { key: c.key, dflt: c.dflt || this.textGiven.has(c.key) } : undefined; }   // dflt: it may hold text (its default, or a value it is given)
  /** RG-4c: what an application gives to the props its component provides to a context that holds a view (the
   *  component's shape says `f-at … use:<key>`): each is shown wherever that context is shown beneath. `own`: a view of
   *  the component being walked, given on (`places`); `content`: markup written here; `text`: a value. */
  private carriersOf(m: Extract<Markup, { k: "el" }>, s: Sym, S: Shape, env: Env, places?: Map<unknown, string[]>): Carrier[] {
    const out: Carrier[] = [];
    const add = (f: string, key: string) => {
      const given = (fs: string[] | undefined) => { for (const g of fs ?? []) out.push({ key, own: g }); return !!fs?.length; };
      if (f === "children") {
        const content = m.children.filter(x => !this.viewElsewhere(s, x) && (x.k !== "text" || !!x.s.trim()));
        if (content.length) { if (!given(places?.get(m))) out.push({ key, content, env }); return; }
      } else {
        const x = m.children.find(x => this.viewElsewhere(s, x) === f); if (x) { out.push({ key, content: [x], env }); return; }
        const a = [...m.attrs].reverse().find(a => a.name === f || a.name === "...");
        if (a && a.name === f) { if (!given(places?.get(a))) out.push({ key, text: true }); return; }
      }
      for (const a of m.attrs) if (a.name === "..." && places?.get(a)?.includes(f)) out.push({ key, own: f });   // a spread gives it on under its own name
    };
    for (const ch of S.childrenAt) { const k = carriedBy(ch); if (k !== undefined) add("children", k); }
    for (const [f, chains] of Object.entries(S.viewsAt ?? {}).sort(([a], [b]) => a < b ? -1 : 1)) if (!f.startsWith(USE)) for (const ch of chains) { const k = carriedBy(ch); if (k !== undefined) add(f, k); }
    return out;
  }
  private ccCarried: Carrier[] = []; private ccDepth = new Map<Markup[], number>(); private ccQuiet = 0;
  private ccIds = new Map<Markup, number>(); private ccSeen = new Set<string>();
  /** What a carrier holds, by a name: the markup (by its first node), text, or a view of the component given on. */
  private ccId(x: Carrier): string { return x.content ? `c${x.content.length ? this.ccIds.get(x.content[0]) ?? (this.ccIds.set(x.content[0], this.ccIds.size), this.ccIds.size - 1) : ""}` : x.text ? "t" : `o${x.own}`; }
  /** … and, where a view is checked: markup given to a provider around this place is placed here. */
  private shownCheck(key: string, anc: string[]) {
    const quiet = this.ccQuiet; this.ccQuiet = 0;
    try { for (const c of this.ccCarried) if (c.key === key) {
      if (c.text) { const why = misnested(anc, "#text"); if (why) this.err("CONTENT_MODEL", "SV-7d", `the text a context is given inside <${anc[anc.length - 1]}>: the browser's HTML parser ${why}, so the served page is not the tree the client builds`); }
      else if (c.content && (this.ccDepth.get(c.content) ?? 0) < 2) { const line = this.line;
        // what was placed here once, under these ancestors and these providers, is placed: nested providers of one
        // context, each of whose views shows the context again, were walked once for every path through them
        const id = (x: Carrier) => this.ccId(x);
        const seen = `${id(c)}|${anc.join(">")}|${this.ccCarried.map(x => `${x.key}=${id(x)}`).join(",")}|${quiet}`; if (this.ccSeen.has(seen)) continue; this.ccSeen.add(seen); this.ccDepth.set(c.content, (this.ccDepth.get(c.content) ?? 0) + 1); try { this.contentCheck(c.content, c.env!, anc); } finally { this.ccDepth.set(c.content, this.ccDepth.get(c.content)! - 1); this.line = line; } }
    } } finally { this.ccQuiet = quiet; }
  }
  private shapes = new Map<Sym, Shape | null>();   // null: being computed (a recursive component contributes nothing more)
  /** What a component contributes where it is applied (content.ts Shape): from its signature, or its body. */
  private shape(c: Sym): Shape {
    if (c.compRegion?.sig) return c.compRegion.sig.shape ?? EMPTY_SHAPE;
    if (this.shapes.has(c)) return this.shapes.get(c) ?? EMPTY_SHAPE;
    if (!c.comp || !c.compEnv) return EMPTY_SHAPE;
    this.shapes.set(c, null);
    const sh: Shape = { roots: [], closesP: false, a: false, form: false, childrenAt: [] }; const roots = new Set<string>();
    const places = this.usesOf(c)?.at;                                                    // RG-4c: a view is placed where it is shown, under whatever name, and where the component it is given on to shows it
    const put = (f: string, anc: string[]) => { if (f === "children") sh.childrenAt.push(anc); else ((sh.viewsAt ??= {})[f] ??= []).push(anc); };
    // RG-4c: a context that holds a view is shown here. Whatever provides it above this component shows its view at
    // this place (`use:<key>-at …`); what is given to a provider written around it in this view is shown here: a view
    // of this component given on is placed here, markup written here is part of this component's tree
    const carried: Carrier[] = []; const depth = new Map<Markup[], number>(); const walked = new Set<string>();
    const shownAt =(key: string, at: string[], scoped: boolean, dflt = false) => {
      ((sh.viewsAt ??= {})[USE + key] ??= []).push(at);
      if (dflt && !at.length) roots.add("#text");                                          // its default is a value: text
      for (const c of carried) if (c.key === key) {
        if (c.own !== undefined) put(c.own, at);
        else if (c.content && (depth.get(c.content) ?? 0) < 2) {
          // what was placed here once (these ancestors, these providers around) is placed: nested providers of one
          // context, each of whose views shows the context again, were walked once for every path through them. (A
          // view that shows itself through a context is followed twice, as before; which of its turns is the one
          // kept no longer depends on the path.)
          const state = `${this.ccId(c)}|${at.join(">")}|${scoped}|${carried.map(x => `${x.key}=${this.ccId(x)}`).join(",")}`;
          if (walked.has(state)) continue; walked.add(state);
          depth.set(c.content, (depth.get(c.content) ?? 0) + 1); try { if (at.includes("body")) links(c.content, at, c.env!); else walk(c.content, at, scoped || at.some(t => P_SCOPE.has(t)), c.env!); } finally { depth.set(c.content, depth.get(c.content)! - 1); } }
        else if (c.text && !at.length) roots.add("#text");
      }
    };
    // … in a portal: its body is not at this component's place (nothing of it is in the component's roots or flags), but
    // a context shown there is shown there: `<Portal><Listbox /></Portal>`
    const links = (ms: Markup[], anc: string[], env: Env) => {
      for (const m of ms) switch (m.k) {
        case "read": { const k = this.viewShown(m.e, env); if (k) shownAt(k.key, anc, true, k.dflt); break; }
        case "el": {
          if (m.tag === "") { links(m.children, anc, env); break; }
          if (/^[A-Z]/.test(m.tag)) {
            const s = env.lookup(m.tag); if (s?.kind !== "comp") break; const S = this.shape(s);
            const cs = this.carriersOf(m, s, S, env, places); carried.push(...cs);
            try { for (const [k, chains] of Object.entries(S.viewsAt ?? {}).sort(([a], [b]) => a < b ? -1 : 1)) if (k.startsWith(USE)) for (const at of chains) shownAt(k.slice(USE.length), [...anc, ...at], true);
              for (const ch of S.childrenAt) if (carriedBy(ch) === undefined) links(m.children.filter(x => !this.viewElsewhere(s, x)), [...anc, ...ch], env);
              for (const x of m.children) { const f = this.viewElsewhere(s, x); for (const at of f === undefined ? [] : S.viewsAt?.[f] ?? []) if (carriedBy(at) === undefined) links([x], [...anc, ...at], env); }
            } finally { carried.length -= cs.length; }
            break;
          }
          if (this.shows(m.tag, env)) break;
          { const u = usedIn(m.tag), k = u === undefined ? undefined : env.lookup(u)?.ctx; if (u !== undefined) { if (k?.view) shownAt(k.key, anc, true); break; } }
          links(m.children, [...anc, m.tag], env); break;
        }
        case "mif": links(m.t, anc, env); links(m.f, anc, env); break;
        case "mfor": case "mview": case "portal": links(m.body, m.k === "portal" ? ["body"] : anc, env); break;
        case "loading": case "errored": links(m.fallback, anc, env); links(m.body, anc, env); break;
      }
    };
    const walk = (ms: Markup[], anc: string[], scoped: boolean, env: Env) => {
      for (const m of ms) switch (m.k) {
        case "text": if (!anc.length) roots.add("#text"); break;
        case "read": { const fs = places?.get(m); if (fs) for (const f of fs) put(f, anc); else if (this.readsChildren(m.e, env)) sh.childrenAt.push(anc); else { const k = this.viewShown(m.e, env); if (k) shownAt(k.key, anc, scoped, k.dflt); else if (!anc.length && this.showsText(m, env)) roots.add("#text"); } break; }   // a value shown is its text
        case "el": {
          if (m.tag === "") { walk(m.children, anc, scoped, env); break; }
          if (/^[A-Z]/.test(m.tag)) {
            const s = env.lookup(m.tag); if (s?.kind !== "comp") break; const S = this.shape(s);
            if (this.isThrough(s) && this.propsNameOf(env) !== undefined) { if (s.compRegion?.js) sh.childrenAt.push(anc); else for (const at of S.childrenAt) sh.childrenAt.push([...anc, ...at]); }   // MO-14f: the component's children, rendered where it applies the host's own — or, through an `.rx` component that does, where that one places its own
            if (!anc.length) S.roots.forEach(r => roots.add(r));
            if (S.closesP && !scoped) sh.closesP = true; if (S.a) sh.a = true; if (S.form) sh.form = true;
            const cs = this.carriersOf(m, s, S, env, places); carried.push(...cs);        // RG-4c: what this application gives to a context that holds a view: shown wherever that context is, beneath it
            try { for (const [k, chains] of Object.entries(S.viewsAt ?? {}).sort(([a], [b]) => a < b ? -1 : 1)) if (k.startsWith(USE)) for (const at of chains) shownAt(k.slice(USE.length), [...anc, ...at], scoped || at.some(t => P_SCOPE.has(t)));
            for (const ch of S.childrenAt) {                                               // the caller's children, where that component puts them
              if (carriedBy(ch) !== undefined) continue;
              const sc = scoped || ch.some(t => P_SCOPE.has(t));
              walk([...m.children.filter(x => !this.viewElsewhere(s, x)), ...this.componentValues(m, env).values()], [...anc, ...ch], sc, env);
              if (s.factory && !this.expanding.shape.has(s)) { this.expanding.shape.add(s); walk(this.factoryTree(s, m.line), [...anc, ...ch], sc, s.factory.env); this.expanding.shape.delete(s); }
            }
            for (const x of m.children) { const f = this.viewElsewhere(s, x); for (const at of f === undefined ? [] : S.viewsAt?.[f] ?? []) if (carriedBy(at) === undefined) walk([x], [...anc, ...at], scoped || at.some(t => P_SCOPE.has(t)), env); }
            for (const a of m.attrs) { const fs = places?.get(a); if (fs) for (const f of fs) { const to = a.name === "..." ? f : a.name; if (to === "children" && m.children.some(x => x.k !== "text" || x.s.trim())) continue; for (const at of (to === "children" ? S.childrenAt : S.viewsAt?.[to]) ?? []) put(f, [...anc, ...at]); } }   // a view given on as an argument, or by a spread: where that component shows it
            { const fs = places?.get(m); if (fs) for (const f of fs) for (const at of S.childrenAt) if (carriedBy(at) !== undefined) put(f, [...anc, ...at]); }   // … or as content, to a component that provides it to a context
            } finally { carried.length -= cs.length; }
            break;
          }
          { const c = this.shows(m.tag, env); if (c) { if (c.view === "children") sh.childrenAt.push(anc); else ((sh.viewsAt ??= {})[c.view] ??= []).push(anc); break; } }
          { const u = usedIn(m.tag), k = u === undefined ? undefined : env.lookup(u)?.ctx; if (u !== undefined) { if (k?.view) shownAt(k.key, anc, scoped); break; } }
          if (!anc.length) roots.add(m.tag);
          if (P_CLOSERS.has(m.tag) && !scoped) sh.closesP = true; if (m.tag === "a") sh.a = true; if (m.tag === "form") sh.form = true;
          walk(m.children, [...anc, m.tag], scoped || P_SCOPE.has(m.tag), env); break;
        }
        case "mif": walk(m.t, anc, scoped, env); walk(m.f, anc, scoped, env); break;
        case "mfor": case "mview": walk(m.body, anc, scoped, env); break;
        case "loading": case "errored": walk(m.fallback, anc, scoped, env); walk(m.body, anc, scoped, env); break;
        case "portal": links(m.body, ["body"], env); break;
      }
    };
    if (places) for (const [k, fs] of places) if ((k as Decl).k === "provide") { const key = c.compEnv.lookup((k as { name: string }).name)?.ctx?.key; if (key !== undefined) for (const f of fs) { put(f, [USE + key]); carried.push({ key, own: f }); } }   // RG-4c: a view of this component provided to a context: shown wherever that context is, beneath
    for (const p of this.carriedFns) if (p.comp === c) { put(p.view, [USE + p.key]); carried.push({ key: p.key, own: p.view }); }   // … and one with a parameter
    walk(c.comp.view, [], false, c.compEnv);
    if (sh.viewsAt) sh.viewsAt = Object.fromEntries(Object.entries(sh.viewsAt).sort(([a], [b]) => a < b ? -1 : 1));   // in the order a signature prints them
    sh.roots = [...roots]; this.shapes.set(c, sh); return sh;
  }
  /** MO-14f: in a host's view, a JS component the host renders through (`<Outlet />`, the router's own component in the
   *  app's entry), applied in a component's view, renders that component's children there — the records the host's view
   *  nests in it — as `{props.children}` written among its own children would. One reader per application, made once. */
  private throughReads = new Map<Markup, Markup>();
  private propsNameOf(env: Env): string | undefined {
    const c = env.region.component; if (!c) return undefined;
    for (let e: Env | null = env; e; e = e.parent) for (const [n, v] of e.vars) if (v.kind === "props" && v.region === c) return n;
    return undefined;
  }
  /** MO-14f (2026-11-25): the components of this module, declared at its top, whose view applies a component the host
   *  renders through — the host's own, or an `.rx` component that applies one, at any depth. Such a component renders its
   *  applier's children where the host's component is: `Root` applies `<Frame />`, which applies `<Outlet />`. Read off
   *  the module's tree before it is walked (a component may be applied above its declaration); a tag that a component
   *  declared inside the view also names is left out. */
  private throughNames = new Set<string>();
  private throughPre(p: Program) {
    if (!this.opts.through?.size) return;
    const from = new Set<string>();
    for (const d of p.decls) if (d.k === "import") for (const { name, alias } of d.names) {
      if (d.resolved) { const x = this.opts.sigs?.get(d.resolved)?.exports.get(name); if (x?.kind === "comp" && x.sig.through) from.add(alias); }
      else if (d.declared && this.opts.through.has(`${d.declared}#${name}`)) from.add(alias);
    }
    const comps = p.decls.flatMap(d => d.k === "component" ? [d] : []);
    const tags = new Map<string, Set<string>>();
    for (const d of comps) {
      const applied = new Set<string>(); const inner = new Set<string>();
      const walk = (v: unknown) => {
        if (Array.isArray(v)) { v.forEach(walk); return; }
        if (!v || typeof v !== "object") return;
        const o = v as { k?: string; tag?: string; name?: string };
        if (o.k === "el" && typeof o.tag === "string" && /^[A-Z]/.test(o.tag)) applied.add(o.tag);
        if (o.k === "component" && typeof o.name === "string") inner.add(o.name);
        Object.values(v).forEach(walk);
      };
      walk(d.decls); walk(d.view);
      for (const n of inner) applied.delete(n);
      tags.set(d.name, applied);
    }
    for (let grew = true; grew;) { grew = false; for (const d of comps) if (!this.throughNames.has(d.name) && !from.has(d.name) && [...tags.get(d.name)!].some(t => from.has(t) || this.throughNames.has(t))) { this.throughNames.add(d.name); grew = true; } }
  }
  private isThrough(s: Sym): boolean { return !!s.through || (s.kind === "comp" && this.throughNames.has(s.name) && this.rootEnv?.vars.get(s.name) === s); }
  private throughChildren(m: Markup, s: Sym, env: Env): Markup[] {
    if (!this.isThrough(s)) return [];
    const name = this.propsNameOf(env); if (name === undefined) return [];
    let r = [...this.throughReads.entries()].find(([, at]) => at === m)?.[0];
    if (!r) { r = { k: "read", e: { k: "member", o: { k: "id", name }, p: "children" }, line: m.line } as Markup; this.throughReads.set(r, m); }
    return [r];
  }
  /** RG-4c: a view of another name, which a component shows where it says, not among its children. */
  private viewElsewhere(s: Sym, x: Markup): string | undefined { return x.k === "mview" && x.prop && this.shownBy(s)?.has(x.prop) ? x.prop : undefined; }
  /** Whether a spread may give that field: a value there is no view, and is shown as one. Where neither the record as it is
   *  written nor a type says it does not, it may. `path`: what of `e` is spread, the last step first. */
  private mayGive(e: Expr, f: string, env: Env, path: TStep[] = [], depth = 0): boolean {
    if (depth > 16) return true;
    const of = (x: Expr, p = path, en = env) => this.mayGive(x, f, en, p, depth + 1);
    const typed = (t: string | undefined) => { for (let i = path.length - 1; i >= 0 && t !== undefined; i--) t = tyStep(t, path[i]); const fs = t === undefined ? undefined : tyFields(t); return fs && fs.some(([k]) => k === f || k.startsWith("[")); };
    const last = path[path.length - 1], rest = path.slice(0, -1);
    switch (e.k) {
      case "rec":
        if (!last) return e.fields.some(x => "spread" in x ? of(x.spread) : x.key === f);
        if (typeof last === "object") { for (const x of [...e.fields].reverse()) { if ("spread" in x) return true; if (x.key === last.field) return of(x.v, rest); } return false; }
        break;
      case "arr": if (last === "elem") return e.items.some(x => x.k === "spread" || of(x, rest)); break;
      case "omit": if (!last) return !e.keys.includes(f) && of(e.e); break;
      case "if": return of(e.t) || of(e.f);
      case "bin": if (e.op === "??" || e.op === "||" || e.op === "&&") return of(e.l) || of(e.r); break;
      case "peek": case "latest": return of(e.e);
      case "lit": return false;
      case "member": return of(e.o, [...path, { field: e.p }]);
      case "index": return of(e.o, [...path, "elem"]);
      case "id": {
        const s = env.lookup(e.name); if (!s) return true;
        if (s.kind === "props") { const t = this.propsTy.get(s.region); return (t === undefined ? undefined : typed(expandType(t, this.types))) ?? true; }
        if (s.rowOf) return of(s.rowOf.e, [...path, "elem"], s.rowOf.env);
        if (s.made) return s.made.ty !== undefined ? typed(expandType(s.made.ty, this.types)) ?? true : of(s.made.e, path, s.made.env);
      }
    }
    return typed(this.declTy(e, env)) ?? true;
  }
  private expectsView(tag: string, view?: string) { this.err("VIEW_FN_EXPECTED", "RG-4c", `<${tag}> shows its ${view ?? "children"} with what it knows, as one view with one parameter: write ${view === undefined ? "them" : "it"} as \`{view ${view === undefined ? "" : `${view} `}(s) { … }}\`, \`s.x\` for what it passes as \`x\``); }
  /** The places of the views of the component a scope is in (`ViewUses.at`). */
  private placesOf(env: Env): Map<unknown, string[]> | undefined { const c = env.region.component && this.compSyms.get(env.region.component); return c ? this.usesOf(c)?.at : undefined; }
  /** SV-7d: a read that shows a value, which is its text: not a view the component was given (under whatever name), nor
   *  one a context holds, nor a field of the props or of a view's parameter that is declared a view or whose type is not read. */
  private readEnv = new Map<Markup, Env>();   // the scope a read is written in: a view's parameter, a loop's variable, a block's names
  private showsText(m: Extract<Markup, { k: "read" }>, env: Env): boolean {
    env = this.readEnv.get(m) ?? env;
    if (this.placesOf(env)?.get(m) || this.readsChildren(m.e, env) || this.viewShown(m.e, env)) return false;
    const e = m.e, p = e.k === "member" && e.o.k === "id" ? env.lookup(e.o.name) : e.k === "id" ? env.lookup(e.name) : undefined;
    // L7 (2026-11-26): a call of JavaScript its declaration says answers a view is no text, as a JS component is not
    if (e.k === "call" && e.f.k === "id") { const f = env.lookup(e.f.name); if (f?.kind === "import" && f.retIo !== undefined && isViewType(f.retIo.trim())) return false; }
    if (p?.kind !== "props") return true;
    if (e.k !== "member") return false;
    const c = p.viewOf ? undefined : this.compSyms.get(p.region)?.comp;
    return takesView(p.viewOf ? this.shownBy(p.viewOf.comp)?.get(p.viewOf.view)?.param : c?.propsType, this.types, e.p, c?.tparams) === false;
  }
  private readsChildren(e: Expr, env: Env) { return e.k === "member" && e.p === "children" && e.o.k === "id" && env.lookup(e.o.name)?.kind === "props"; }
  /** SV-7d: every element, text and component root of a view against the elements open above it (in this view; a view's
   *  root is an unknown place), and a component's caller's children where that component places them. */
  private contentCheck(ms: Markup[], env: Env, anc: string[]) {
    const report = (what: string, why: string | null) => { if (why && !this.ccQuiet) this.err("CONTENT_MODEL", "SV-7d", `${what} inside <${anc[anc.length - 1]}>: the browser's HTML parser ${why}, so the served page is not the tree the client builds`); };
    for (const m of ms) {
      if (m.line) this.line = m.line;
      switch (m.k) {
        case "text": if (m.s.trim()) report("text", misnested(anc, "#text")); break;
        case "read": { const k = this.viewShown(m.e, env); if (k) { if (k.dflt) report(`the text ${(m.e as { name: string }).name} may hold (its default, or a value it is given)`, misnested(anc, "#text")); this.shownCheck(k.key, anc); } else if (this.showsText(m, env)) report("the text of the value shown here, `{…}`,", misnested(anc, "#text")); break; }   // RG-4c: a context that holds a view, shown: what is given to a provider around this place
        case "el": {
          if (m.tag === "") { this.contentCheck(m.children, env, anc); break; }
          if (/^[A-Z]/.test(m.tag)) {
            const s = env.lookup(m.tag); if (s?.kind !== "comp") break; const S = this.shape(s);
            for (const r of S.roots) report(r === "#text" ? `<${m.tag}>'s text` : `<${r}>, the root of <${m.tag}>,`, misnested(anc, r));
            report(`<${m.tag}>`, misnestedInside(anc, S));
            const cs = this.carriersOf(m, s, S, env, this.placesOf(env)); this.ccCarried.push(...cs);
            try { for (const [k, chains] of Object.entries(S.viewsAt ?? {}).sort(([a], [b]) => a < b ? -1 : 1)) if (k.startsWith(USE)) for (const at of chains) this.shownCheck(k.slice(USE.length), [...anc, ...at]);
            for (const ch of S.childrenAt) {
              if (carriedBy(ch) !== undefined) continue;
              this.contentCheck([...m.children.filter(x => !this.viewElsewhere(s, x)), ...this.componentValues(m, env).values()], env, [...anc, ...ch]);
              if (s.factory && !this.expanding.content.has(s)) { this.expanding.content.add(s); this.contentCheck(this.factoryTree(s, m.line), s.factory.env, [...anc, ...ch]); this.expanding.content.delete(s); }
            }
            for (const x of m.children) { const f = this.viewElsewhere(s, x); for (const at of f === undefined ? [] : S.viewsAt?.[f] ?? []) if (carriedBy(at) === undefined) this.contentCheck([x], env, [...anc, ...at]); }
            } finally { this.ccCarried.length -= cs.length; }
            break;
          }
          if (this.shows(m.tag, env)) break;
          { const u = usedIn(m.tag), k = u === undefined ? undefined : env.lookup(u)?.ctx; if (u !== undefined) { if (k?.view) this.shownCheck(k.key, anc); break; } }
          report(`<${m.tag}>`, misnested(anc, m.tag));
          this.contentCheck(m.children, env, [...anc, m.tag]); break;
        }
        case "mif": this.contentCheck(m.t, env, anc); this.contentCheck(m.f, env, anc); break;
        case "portal": if (this.ccCarried.length) { this.ccQuiet++; try { this.contentCheck(m.body, env, ["body"]); } finally { this.ccQuiet--; } } break;   // RG-4c: its own check is made once, apart (RG-8); here, only what a context shows in it of what is given around this place
        case "mfor": case "mview": this.contentCheck(m.body, env, anc); break;
        case "loading": case "errored": this.contentCheck(m.fallback, env, anc); this.contentCheck(m.body, env, anc); break;
      }
    }
  }

  // ---- R-f: failures ----
  /** (a name's failures are read with no context under way: what is kept of a name is never cut short by who asked first) */
  private failsThunk(e: Expr, env: Env): () => Fails {
    let cache: Fails | null = null; let busy = false;
    return () => { if (cache) return cache; if (busy) return noFails(); busy = true; const from = this.useBusy; this.useBusy = new Set(); const f = this.failsOf(e, env, false, new Map()); this.useBusy = from; busy = false; cache = f; return f; };
  }
  /** R-f-2/3/4: the failures an expression's evaluation can produce. `imp`: imperative scope, where closures are not run now.
   *  `bound`: catch bindings in scope and what they caught (for a rethrow). */
  private useBusy = new Set<string>();
  private failsOf(e: Expr, env: Env, imp: boolean, bound: Map<string, Set<string>>): Fails {
    const out = noFails(); const go = (x: Expr) => addF(out, this.failsOf(x, env, imp, bound));
    switch (e.k) {
      case "lit": case "pending": case "pre": case "serverfn": return out;                // making a server fn fails nothing                                 // `pending? e` is a verdict, never e's error (R-f-4); `pre` is a value seen
      case "id": {
        if (bound.has(e.name)) return out;
        const s = env.lookup(e.name); if (!s) return out;
        if (s.kind === "props") { out.props.push({ comp: s.region, field: "*", pre: [] }); return out; }
        if (s.failsT && (s.kind === "eq" || s.kind === "source")) return addF(out, s.failsT());
        return out;
      }
      case "member": {
        if (e.o.k === "id" && !bound.has(e.o.name)) { const s = env.lookup(e.o.name); if (s?.kind === "props") { out.props.push({ comp: s.region, field: e.p, pre: [] }); return out; } }
        this.heldFails(e, env, bound, out);
        go(e.o); return out;
      }
      case "index": {
        if (e.o.k === "id" && !bound.has(e.o.name)) { const s = env.lookup(e.o.name); if (s?.kind === "props") { out.props.push({ comp: s.region, field: litKey(e.i) ?? "*", pre: [] }); go(e.i); return out; } }   // `props["x"]` is `props.x`; `props[k]` may be any
        this.heldFails(e, env, bound, out);
        go(e.o); go(e.i); return out;
      }
      case "use": {                                                                        // RG-7e: the declared rows, else what this module's provisions of it can fail with
        const c = env.lookup(e.name)?.ctx; if (!c) return out;
        if (c.contract) { for (const x of c.contract.fails) out.cls.add(x); return out; }
        if (this.useBusy.has(c.key)) return out;                                          // `provide c = use c`: a provision that reads its own context adds nothing to it
        this.useBusy.add(c.key); try { for (const p of this.provisions) if (p.key === c.key) { const f = this.failsOf(p.e, p.env, false, new Map()); addF(out, p.block ? { cls: f.cls, props: f.props.map(pr => pr.from ? pr : { ...pr, from: p.block }) } : f); } } finally { this.useBusy.delete(c.key); } return out;
      }
      case "await": go(e.e); if (e.init) go(e.init); for (const c of this.rejects(e.e, env, new Set())) out.cls.add(c); return out;
      case "throw": go(e.e); out.cls.add(this.classOf(e.e, env, bound)); return out;
      case "catch": {
        const inner = this.failsOf(e.e, env, imp, bound); const c = catchOf(e.classes);
        const got = new Set([...inner.cls].filter(x => caught(c, x)));
        for (const x of inner.cls) if (!caught(c, x)) out.cls.add(x);
        for (const pr of inner.props) out.props.push({ ...pr, pre: [...pr.pre, c] });
        const b2 = new Map(bound); if (e.name) b2.set(e.name, c === "all" ? new Set([...inner.cls]) : got);
        return addF(out, this.failsOf(e.alt, env, imp, b2));
      }
      case "fn": {
        if (imp || e.stmts) return out;                                                    // an imperative closure runs later, not now
        const b2 = new Map(bound); for (const p of e.params) b2.set(p, new Set());         // a parameter shadows: not a catch binding, not a symbol
        const inner = new Env(env, env.region); for (const p of e.params) inner.vars.set(p, { kind: "value", name: p, region: env.region, line: 0 });
        return addF(out, this.failsOf(e.body, inner, imp, b2));                             // a pure closure may be called during this evaluation (map, filter)
      }
      case "call": {
        this.heldFails(e, env, bound, out);   // MO-10l: the call that makes an accessor that fails
        if (e.f.k === "id" && !bound.has(e.f.name)) {
          const s = env.lookup(e.f.name);
          if (s?.kind === "fn" && s.failsT) addF(out, s.failsT());
          else if (s && s.kind !== "errclass" && s.kind !== "import" && s.kind !== "action" && s.kind !== "server") go(e.f);
        } else go(e.f);
        e.args.forEach(go); return out;
      }
      case "draft": { go(e.seed); for (const st of e.body) { if (st.k === "let" || st.k === "expr" || st.k === "write") go(st.e); } return out; }
      default: {
        for (const v of Object.values(e as object)) {
          if (Array.isArray(v)) v.forEach(y => { if (typeof y === "string") return; if (y && typeof y === "object") { if ("k" in y) go(y as Expr); else if ("v" in y) go((y as { v: Expr }).v); else if ("spread" in y) go((y as { spread: Expr }).spread); } });
          else if (v && typeof v === "object" && "k" in (v as object)) go(v as Expr);
        }
        return out;
      }
    }
  }
  /** R-f-8: what an awaited value's promise may reject with. A call into a JS import: its declared failure (Error unless narrowed). */
  private rejects(e: Expr, env: Env, seen: Set<Sym>): Set<string> {
    const root = (x: Expr): Expr => x.k === "member" || x.k === "index" ? root(x.o) : x;
    switch (e.k) {
      case "lit": case "tpl": case "arr": case "rec": case "bin": case "un": return new Set();   // values: `await` is the value (R-1)
      case "if": return new Set([...this.rejects(e.t, env, seen), ...this.rejects(e.f, env, seen)]);
      case "call": {
        const r = root(e.f);
        if (e.f.k === "id" && lang(env, e.f.name) === "until") { const p = e.args[0]; return p?.k === "fn" && !p.stmts ? new Set(this.failsOf(p.body, env, false, new Map()).cls) : new Set(); }   // AC-6: until rejects with what its predicate fails with
        if (r.k === "id") {
          const s = env.lookup(r.name);
          if (s?.kind === "import") return new Set(s.rejects ?? ["Error"]);
          if (s?.kind === "server") return s.serverRejects?.() ?? new Set(["Error"]);       // SF-6b
          if (s?.kind === "fn" && s.fnTail && s.fnEnv && e.f.k === "id" && !seen.has(s)) { seen.add(s); return this.rejects(s.fnTail, s.fnEnv, seen); }
          if (s?.kind === "fn" && s.rejects) return new Set(s.rejects);                     // an imported fn: its signature (MO-3)
          if (s?.kind === "action") return new Set();                                        // an action never fails (R-f-6)
        }
        return new Set(["Error"]);
      }
      case "id": {
        const s = env.lookup(e.name);
        if (s?.expr && s.env && !seen.has(s)) { seen.add(s); return this.rejects(s.expr, s.env, seen); }
        if (s && (s.kind === "source" || s.kind === "value")) return new Set(["Error"]);
        return new Set(["Error"]);
      }
      default: return new Set(["Error"]);
    }
  }
  /** R-f-3: the class a `throw` fails with — a declared class's construction, a rethrown catch binding, else Error. */
  private classOf(e: Expr, env: Env, bound: Map<string, Set<string>>): string {
    if (e.k === "call" && e.f.k === "id") { const s = env.lookup(e.f.name); if (s?.kind === "errclass" || s?.kind === "import") return e.f.name; }
    if (e.k === "id" && bound.has(e.name)) { const b = bound.get(e.name)!; return b.size === 1 ? [...b][0] : b.size ? `${[...b].join("|")}` : "Error"; }
    return "Error";
  }
  /** R-f-6: the failures an action body lets out. */
  private stmtsFails(ss: Stmt[], env0: Env, bound: Map<string, Set<string>>): Fails {
    const out = noFails(); const env = new Env(env0, env0.region);
    const ex = (x: Expr) => addF(out, this.failsOf(x, env, true, bound));
    for (const s of ss) {
      switch (s.k) {
        case "let": ex(s.e); env.vars.set(s.name, { kind: "value", name: s.name, region: env.region, line: 0 }); break;
        case "expr": ex(s.e); break;
        case "return": if (s.e) ex(s.e); break;
        case "write": case "optimistic": s.target.path.forEach(p => typeof p !== "string" && ex(p)); ex(s.e); break;
        case "throw": ex(s.e); for (const c of this.classOf(s.e, env, bound).split("|")) out.cls.add(c); break;
        case "sif": ex(s.c); addF(out, this.stmtsFails(s.t, env, bound)); addF(out, this.stmtsFails(s.f, env, bound)); break;
        case "for": { ex(s.e); const lenv = new Env(env, env.region); lenv.vars.set(s.name, { kind: "value", name: s.name, region: env.region, line: 0 }); addF(out, this.stmtsFails(s.body, lenv, bound)); break; }
        case "try": {
          const b = this.stmtsFails(s.body, env, bound);
          if (s.handler) {
            const c = catchOf(s.catchClasses);
            for (const x of b.cls) if (!caught(c, x)) out.cls.add(x);
            for (const pr of b.props) out.props.push({ ...pr, pre: [...pr.pre, c] });
            const b2 = new Map(bound); if (s.catchName) b2.set(s.catchName, new Set([...b.cls].filter(x => caught(c, x))));
            const h = new Env(env, env.region); if (s.catchName) h.vars.set(s.catchName, { kind: "value", name: s.catchName, region: env.region, line: 0 });
            addF(out, this.stmtsFails(s.handler, h, b2));
          } else addF(out, b);
          if (s.fin) addF(out, this.stmtsFails(s.fin, env, bound));
          break;
        }
        case "action": case "refresh": case "affects": break;                               // a nested action is its own (R-f-6)
      }
    }
    return out;
  }

  /** R-f-5/6 and RG-7b over the static application tree. Every reader's failures are discharged by a catch or a boundary
   *  above it, and every `use` finds a provision above it, through each place its component is applied (and, for an imported
   *  component, through its signature, MO-3); every action catches what its body can fail with. */
  private resolveTree() {
    type Item = { cls: string; line: number; what: string };
    type Req = { name: string; line: number; what: string };
    const readerF = this.readers.map(r => ({ ...r, f: this.failsOf(r.e, r.env, false, new Map()) }));
    const firstMemo = new Map<Sym, boolean>();
    const firstHeld = (e: Expr, env: Env) => !!this.opts.spa && this.firstAbsent(e, env, undefined, firstMemo, new Set());   // CN-3d: what the first load surely waits on
    for (const r of this.readers) if (this.rowsThunk(r.e, r.env)().has("client") || firstHeld(r.e, r.env)) this.uses.push({ region: r.region, name: HOLD, line: r.line, display: show(r.e) });   // SV-7b
    // RG-6a: a fn's `use` reads above the region of each call of it, so what it needs is a `use` there (MO-12b for a JS
    // hook) — in another fn, that fn's own need; in a component or a view, one like any
    { const own: Use[] = this.uses.splice(0);
      const fnAt = (R: Region): { fn: Sym; provides: Set<string> } | null => { const provides = new Set<string>(); for (let r: Region | null = R; r; r = r.parent) { for (const p of r.provides) provides.add(p); if (r.fn) return { fn: r.fn, provides }; if (r.isComponentRoot) return null; } return null; };
      const asked = new Map<Sym, Set<string>>();
      const ask = (u: Use): boolean => { const at = fnAt(u.region); if (!at) { if (!this.uses.some(x => x.region === u.region && x.name === u.name && x.line === u.line)) this.uses.push(u); return false; } if (at.provides.has(u.name)) return false; const s = asked.get(at.fn) ?? asked.set(at.fn, new Set()).get(at.fn)!; if (s.has(u.name)) return false; s.add(u.name); return true; };
      for (const u of own) ask(u);
      for (let more = true; more;) { more = false; for (const c of this.hookCalls) for (const k of [...(c.fn.needs ?? []), ...(asked.get(c.fn) ?? [])]) if (ask({ region: c.region, name: k, line: c.line, display: k === HOLD ? c.display : `${keyName(k)} (in ${c.display})` })) more = true; }
      for (const [f, ks] of asked) f.needs = [...ks].sort(); }
    const argR = this.apps.flatMap(a => a.args.filter(x => this.rowsThunk(x.e, x.env)().has("client") || firstHeld(x.e, x.env)).map(x => ({ app: a, field: x.field })));
    const argF = this.apps.flatMap(a => a.args.map(x => ({ app: a, field: x.field, f: this.failsOf(x.e, x.env, false, new Map()) })));
    const actF = this.actions.map(a => ({ ...a, f: this.stmtsFails(a.body, a.env, new Map()) }));
    const ck = (c?: Catch) => c === undefined ? "-" : c === "all" ? "*" : [...c].sort().join("|");
    const key = (c: Step[]) => c.map(x => `${ck(x.f)}~${ck(x.p)}`).join("/");
    const dedupe = <T extends PFEntry | Step[]>(xs: T[]): T[] => { const seen = new Set<string>(); return xs.filter(x => { const k = Array.isArray(x) ? key(x) : key(x.chain) + JSON.stringify(x.term); if (seen.has(k)) return false; seen.add(k); return true; }); };
    const pre = (cs: Catch[]): Step[] => cs.map(f => ({ f }));
    // routes: the steps from a region up to its component's root (or the program's), through children's reads
    const rMemo = new Map<Region, Step[][]>(); const rBusy = new Set<Region>();
    const routes = (R: Region): Step[][] => {
      if (rMemo.has(R)) return rMemo.get(R)!; if (rBusy.has(R)) return []; rBusy.add(R);
      const local: Step[] = []; let out: Step[][] = [];
      for (let r: Region | null = R; r; r = r.parent) {
        if (r.catches || r.provides.size) local.push({ f: r.catches, p: r.provides.size ? r.provides : undefined });
        if (r.kids) { for (const p of PF(r.kids.comp, r.kids.view ?? "children")) if (p.term === null) for (const q of routes(r.kids.site)) out.push([...local, ...p.chain, ...q]); break; }
        if (r.isComponentRoot || !r.parent) { out = [local]; break; }
      }
      out = dedupe(out); rBusy.delete(R); rMemo.set(R, out); return out;
    };
    // PF: where a component's prop field goes once read — up to its root, or out of an action
    // (`via(want)`: where the occurrence is the whole of the props spread on a component, `<Root {...props} />`, a field
    // of them goes where that component's field of the same name goes — its children are Root's children)
    const occ: { comp: Region; field: string; pre: Step[]; via: (want?: string) => PFEntry[]; into?: Region }[] = [];
    for (const r of readerF) for (const pr of r.f.props) occ.push({ comp: pr.comp, field: pr.field, pre: pre(pr.pre), via: () => routes(r.region).flatMap(q => pr.from ? routes(pr.from).map(q2 => ({ chain: [...q, ...q2], term: null })) : [{ chain: q, term: null }]) });   // RG-4c: a view shown through a context: up from where it is shown to that component's root, then from the block that provides it (which is above every such place)
    for (const x of this.shownAt) occ.push({ comp: x.comp, field: x.view, pre: [], via: () => routes(x.region).flatMap(q => x.from ? routes(x.from).map(q2 => ({ chain: [...q, ...q2], term: null })) : [{ chain: q, term: null }]) });   // RG-4c
    for (const a of argF) for (const pr of a.f.props) occ.push({ comp: pr.comp, field: pr.field, pre: pre(pr.pre), ...(pr.field === "*" && a.field === "*" ? { into: a.app.comp } : {}), via: want => PF(a.app.comp, pr.field === "*" && a.field === "*" && want !== undefined ? want : a.field).flatMap(p => p.term ? [p] : routes(a.app.site).map(q => ({ chain: [...p.chain, ...q], term: null }))) });
    for (const a of actF) for (const pr of a.f.props) occ.push({ comp: pr.comp, field: pr.field, pre: pre(pr.pre), via: () => [{ chain: [], term: { line: a.line, name: a.name } }] });
    const pfMemo = new Map<string, PFEntry[]>(); const pfBusy = new Set<string>();
    const PF = (G: Region, field: string): PFEntry[] => {
      if (G.sig) {                                                                           // MO-3: an imported component's summary
        const ss = field === "*" ? Object.values(G.sig.props) : [G.sig.props[field] ?? G.sig.props["*"]];   // a spread ("*") goes wherever any field goes
        const out: PFEntry[] = [];
        for (const s of ss) { if (!s) continue; out.push({ chain: [{ f: s.f, p: s.p }], term: null }); if (s.action) out.push({ chain: [{ f: s.action.f }], term: { line: -1, name: s.action.name } }); }
        return out;
      }
      const k = `${G.id}:${field}`; if (pfMemo.has(k)) return pfMemo.get(k)!; if (pfBusy.has(k)) return []; pfBusy.add(k);
      const out: PFEntry[] = [];
      for (const o of occ) if (o.comp === G && (o.field === field || o.field === "*" || field === "*")) for (const v of o.via(o.field === "*" ? field : undefined)) out.push({ chain: [...o.pre, ...v.chain], term: v.term });
      const res = dedupe(out); pfBusy.delete(k); pfMemo.set(k, res); return res;
    };
    // what escapes each component's root (and the program's): failures and provisions
    const escMemo = new Map<Region | null, { fails: Item[]; reqs: Req[] }>(); const escBusy = new Set<Region | null>();
    const compOf = (r: Region) => r.component;
    const esc = (C: Region | null): { fails: Item[]; reqs: Req[] } => {
      if (C?.sig) return { fails: C.sig.own.map(o => ({ cls: o.cls, line: -1, what: o.at ? `${o.what} at ${o.at}` : o.what })), reqs: C.sig.requires.map(n => ({ name: n, line: -1, what: n === HOLD ? "a reader of a client question" : `use ${keyName(n)}` })) };
      if (escMemo.has(C)) return escMemo.get(C)!; if (escBusy.has(C)) return { fails: [], reqs: [] }; escBusy.add(C);
      const fails: Item[] = []; const reqs: Req[] = []; const seen = new Set<string>();
      const pushF = (it: Item) => { const k = `F${it.cls}@${it.line}:${it.what}`; if (!seen.has(k)) { seen.add(k); fails.push(it); } };
      const pushR = (it: Req) => { const k = `R${it.name}@${it.line}:${it.what}`; if (!seen.has(k)) { seen.add(k); reqs.push(it); } };
      for (const r of readerF) if (compOf(r.region) === C) for (const cls of r.f.cls) if (routes(r.region).some(q => escF(q, cls))) pushF({ cls, line: r.line, what: show(r.e) });
      for (const u of this.uses) if (compOf(u.region) === C) if (routes(u.region).some(q => (u.above ? escAbove : escP)(q, u.name))) pushR({ name: u.name, line: u.line, what: u.name === HOLD ? `a reader of ${u.display}` : `use ${u.display}` });
      for (const a of argR) if (compOf(a.app.site) === C) for (const p of PF(a.app.comp, a.field)) if (!p.term && routes(a.app.site).some(q => escP([...p.chain, ...q], HOLD))) { pushR({ name: HOLD, line: a.app.line, what: `<${a.app.tag} ${a.field === "*" ? "{...…}" : `${a.field}={…}`}>, read in ${a.app.tag},` }); break; }   // SV-7b through a prop
      for (const a of this.apps) if (compOf(a.site) === C) {
        const e = esc(a.comp);
        for (const it of e.fails) if (routes(a.site).some(q => escF(q, it.cls))) pushF({ ...it, line: it.line < 0 ? a.line : it.line, what: `${it.what} (in <${a.tag}>)` });
        for (const it of e.reqs) if (routes(a.site).some(q => escP(q, it.name))) pushR({ ...it, line: it.line < 0 ? a.line : it.line, what: `${it.what} (in <${a.tag}>)` });
      }
      for (const a of argF) if (compOf(a.app.site) === C) for (const cls of a.f.cls) for (const p of PF(a.app.comp, a.field)) {
        if (p.term) { if (escF(p.chain, cls)) { this.line = a.app.line; this.err("UNCAUGHT_ACTION_FAILURE", "R-f-6", `action ${p.term.name} in <${a.app.tag}> reads props.${a.field}, which can fail with ${cls} here (line ${a.app.line}), and does not catch it`); } continue; }
        if (routes(a.app.site).some(q => escF([...p.chain, ...q], cls))) { pushF({ cls, line: a.app.line, what: `<${a.app.tag} ${a.field === "*" ? "{...…}" : `${a.field}={…}`}>` }); break; }
      }
      const res = { fails, reqs }; escBusy.delete(C); escMemo.set(C, res); return res;
    };
    const top = esc(null);
    // MO-11i: a record's children are nested in its component — which renders them among its own children, or nowhere (by line, then where it is written: a tree is met in whatever order it is asked for)
    const written = new Map<unknown, number>();
    if (this.nested.size) { const walk = (x: unknown): void => { if (!x || typeof x !== "object") return; if ((x as { k?: string }).k === "id" && !written.has(x)) written.set(x, written.size); for (const v of Object.values(x)) walk(v); }; walk([this.program?.decls, this.program?.view]); }
    const place = (n: { at: Expr[] }) => Math.min(...n.at.map(e => written.get(e) ?? Infinity));
    for (const n of [...this.nested.values()].sort((a, b) => a.line - b.line || place(a) - place(b) || 0)) { const c = n.env.lookup(n.name)?.compRegion; if (!c || PF(c, "children").some(p => p.term === null)) continue; this.line = n.line; this.err("NESTED_NOT_RENDERED", "MO-11i", `${n.name} is given the components under its record's \`${n.kids}\`, to render among its own children, and renders none: they would never show, and nothing above them is checked — render them where they go, \`{props.children}\` in ${n.name}'s view${(this.opts.file ?? "").endsWith(".host.rx") ? " (or, where the layout applies a component of the host's own that renders them — a router's outlet — import that component in the host's declaration, MO-14f)" : ""}`); }
    for (const it of top.fails) { this.line = it.line; this.err("UNHANDLED_FAILURE", "R-f-5", `a reader of ${it.what} can fail with ${it.cls} and no catch or errored boundary above it discharges ${it.cls} — show it where it is read: \`errored fallback(e${it.cls === "Error" ? "" : `: ${it.cls}`}) { … } { … }\` around the reader (or \`await … catch (e) => …\` at the await, to make the rejection an answer)`); }
    for (const it of top.reqs) { this.line = it.line; if (it.name === HOLD && this.opts.spa) { this.err("ASYNC_OUTSIDE_LOADING_BOUNDARY", "CN-3d", `${it.what} can have no value yet, and no \`loading\` region above it holds it on some path that renders it: in a client-only build the first load would show nothing until it answers — put it under \`loading fallback { … } { … }\`, or give the await a first paint (\`await f() -> v\`). Later answers are transitions and need no region`); continue; } if (it.name === HOLD) { this.err("CLIENT_QUESTION_UNHELD", "SV-7b", `${it.what} awaits \`client\` JS, and no \`loading\` region above it holds it on any path that renders it: the server never asks a client question, so it could never finish this page — put the reader under \`loading fallback { … } { … }\`, or give the await a first paint (\`await f() -> v\`)`); continue; } this.err("CONTEXT_NOT_FOUND", "RG-7b", `${it.what}: no provision of ${keyName(it.name)} (declared in ${it.name.split("#")[0].split("/").pop()}) above this region on any path that renders it`); }
    for (const a of actF) if (a.f.cls.size) { this.line = a.line; this.err("UNCAUGHT_ACTION_FAILURE", "R-f-6", `action ${a.name} can fail with ${[...a.f.cls].join(", ")} and does not catch it: a handler cannot (it does not await the action) — \`try { … } catch (e) { … }\` in the body`); }
    // MO-3: the summaries an importing module checks against
    const meet = (a: Catch, b: Catch): Catch => a === "all" ? b : b === "all" ? a : new Set([...a].filter(x => b.has(x)));
    const along = (chain: Step[], which: "f" | "p"): Catch => { const out = new Set<string>(); for (const st of chain) { const c = st[which]; if (c === "all") return "all"; if (c) for (const x of c) out.add(x); } return out; };
    // MO-11u: where the components a fn `renders(H)` is given are rendered — every application of H, as seen from the root
    // of the component it is written in (through the components that component is applied in, by their own lists)
    const siteKey = (x: HostSite) => `${ck(x.f)}~${ck(x.p)}`;
    const sMemo = new Map<Region | null, Map<string, HostSite[]>>(); const sBusy = new Set<Region | null>();
    const sitesOf = (C: Region | null): Map<string, HostSite[]> => {
      if (C?.sig) return new Map(Object.entries(C.sig.hosts ?? {}));
      if (sMemo.has(C)) return sMemo.get(C)!; if (sBusy.has(C)) return new Map(); sBusy.add(C);
      const out = new Map<string, HostSite[]>();
      const add = (k: string, chain: Step[]) => { const x = { f: along(chain, "f"), p: along(chain, "p") }; const xs = out.get(k) ?? []; if (!xs.some(y => siteKey(y) === siteKey(x))) xs.push(x); out.set(k, xs); };
      for (const h of this.hostSites) if (compOf(h.region) === C) for (const q of routes(h.region)) add(h.key, [{ p: new Set(h.comp.sig?.requires ?? []) }, ...q]);   // what H itself uses is above what it renders
      for (const a of this.apps) if (compOf(a.site) === C) for (const [k, xs] of sitesOf(a.comp)) for (const x of xs) for (const q of routes(a.site)) add(k, [{ f: x.f, p: x.p }, ...q]);
      sBusy.delete(C); sMemo.set(C, out); return out;
    };
    const record = (m: Map<string, HostSite[]>): Record<string, HostSite[]> => Object.fromEntries([...m].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, xs]) => [k, [...xs].sort((a, b) => siteKey(a) < siteKey(b) ? -1 : siteKey(a) > siteKey(b) ? 1 : 0)]));
    this.hosts = record(sitesOf(null));
    this.hosted = this.hostedCalls.map(c => {
      const e = esc(c.root);
      // the hosts those components apply themselves, seen from their root: what H itself uses and provides is above them too
      const inner = record(new Map([...sitesOf(c.root)].map(([k, xs]) => [k, xs.map(x => ({ f: x.f, p: x.p === "all" ? "all" as const : new Set([...x.p, ...c.credit]) }))])));
      return { host: c.host, name: c.name, fn: c.fn, line: c.line, fails: [...new Set(e.fails.map(i => i.cls))].sort(), requires: [...new Set(e.reqs.map(r => r.name))].filter(k => !c.credit.includes(k)).sort(), ...(Object.keys(inner).length ? { inner } : {}) };
    });
    // the fields a component's summary names: those it reads, and those of a component its whole props are spread on
    const fieldsOf = (G: Region, seen = new Set<Region>()): Set<string> => {
      if (G.sig) return new Set(Object.keys(G.sig.props)); if (seen.has(G)) return new Set(); seen.add(G);
      const out = new Set<string>();
      for (const o of occ) if (o.comp === G) { out.add(o.field); if (o.into) for (const f of fieldsOf(o.into, seen)) out.add(f); }
      return out;
    };
    this.compSig = (G: Region): CompSig => {
      const own = new Set(occ.filter(o => o.comp === G).map(o => o.field)), fields = fieldsOf(G);
      const props: CompSig["props"] = {};
      for (const f of fields) {
        const es = PF(G, f); let df: Catch = "all", dp: Catch = "all", da: Catch | null = null; let an = ""; let rendered = false;
        for (const e of es) { if (e.term) { da = da === null ? along(e.chain, "f") : meet(da, along(e.chain, "f")); an = e.term.name; } else { rendered = true; df = meet(df, along(e.chain, "f")); dp = meet(dp, along(e.chain, "p")); } }
        const pure = isHandler(f) && tyAnswersValue(((t?: string) => t === undefined ? undefined : tyStep(t, { field: f }))(this.propsTy.get(G)));   // SC-4b
        props[f] = { f: df, p: dp, rendered, ...(pure ? { pure: true } : {}), ...(da !== null ? { action: { f: da, name: an } } : {}), ...this.viewSig(G, f), ...((() => { const ts = (this.propHeld.get(G) ?? []).flatMap(([p, h, c]) => p.startsWith(`${f}.`) ? [[p.slice(f.length + 1), h, c] as [string, boolean, string[]]] : []); return ts.length ? { takes: ts } : {}; })()) };
      }
      // a field that came with a spread is named where it goes somewhere the spread as a whole does not
      { const k = (x: CompSig["props"][string]) => `${ck(x.f)}~${ck(x.p)}~${x.rendered}~${!!x.pure}~${x.action ? `${ck(x.action.f)}${x.action.name}` : ""}`; const all = props["*"];
        for (const f of fields) if (!own.has(f) && all && k(props[f]) === k(all) && !props[f].view && !props[f].takes) delete props[f]; }
      const e = esc(G);
      const file = (this.opts.file ?? "main.rx").split("/").pop();
      const cs = this.compSyms.get(G);
      const st = this.retains.get(G); const stored: Record<string, string[]> = {};
      if (st) for (const [f, ts] of st) stored[f] = [...new Set([...ts].map(t => t.startsWith("d:") ? "module" : t.slice(2)))].sort();   // an exported component's outside is its module
      const hosts = record(sitesOf(G));
      return { own: e.fails.map(i => ({ cls: i.cls, what: i.what, at: `${file}:${i.line}` })), requires: [...new Set(e.reqs.map(r => r.name))], props, shape: cs ? this.shape(cs) : EMPTY_SHAPE, ...(st ? { stored } : {}), ...(Object.keys(hosts).length ? { hosts } : {}) };
    };
  }
  private viewSig(G: Region, f: string): { view?: CompSig["props"][string]["view"] } {
    const c = this.compSyms.get(G), v = c && this.shownBy(c)?.get(f); if (!v) return {};
    const t = v.param === undefined ? undefined : oneLine(v.param);
    const given = [...new Set((this.placed.get(`${G.id}:${f}`) ?? []).flat().map(x => x.field))];
    return { view: { optional: v.optional, mixed: v.mixed, values: ((safe: string[]) => given.includes("*") ? safe.length === given.length ? ["*"] : safe.filter(x => x !== "*") : safe)(given.filter(x => this.viewValue(c, f, x)).sort()), ...(t !== undefined ? printedType(t) : {}) } };
  }
  compSig: ((G: Region) => CompSig) | null = null;
}

// ---- MO-10k: a declared result's type, read as the closed set of what its value answers ----
/** One step down a declared type: a field, what a call of it answers, an element of it. */
export type TStep = { field: string } | "call" | "elem";
/** The type text without what does not change what it answers: outer parentheses, `readonly`, the function words. */
/** MO-10b: a function type its row marks `io`. */
function tyIo(t: string): boolean { return /^io\s+\(/.test(t.trim()); }
function tyClean(t: string): string {
  t = t.trim();
  for (;;) {
    const before = t;
    for (const w of ["readonly ", "handler "]) if (t.startsWith(w)) t = t.slice(w.length).trim();
    if (tyIo(t)) t = t.slice(2).trim();
    if (t.startsWith("(") && t.endsWith(")") && closes(t, 0) === t.length) t = t.slice(1, -1).trim();
    if (t === before) return t;
  }
}
/** A union's members; `null` and `undefined` dropped when `present` (a read of a field that is there). */
function tyMembers(t: string, present: boolean): string[] { return splitTop(tyClean(t), "|").map(tyClean).filter(m => !(present && (m === "null" || m === "undefined"))); }
/** RG-4c: a type in a printed signature, a string's literal as `string`; none: not a record written out. */
function printedType(t: string): { type?: string } {
  const out = t.replace(/(["'`])(?:\\[^]|(?!\1)[^\\])*\1/g, "string");
  return ((out.startsWith("{") && closes(out, 0) === out.length) || (fnText(out) && /=>\s*View$/.test(out))) && !out.includes("/") ? { type: out } : {};   // a record; a view's type (RG-4c: `(r: T) => View`, which an importer's props may name)
}
/** A record type's fields, as written: `{ a: T; b?: (x: U) => V }`. */
export function tyFields(t: string): [string, string][] | undefined {
  const ms = tyMembers(t, true); if (ms.length !== 1) return undefined; t = ms[0];
  if (!(t.startsWith("{") && t.endsWith("}") && t.length >= 2)) return undefined;
  return splitTop(t.slice(1, -1), ",;").flatMap(f => { const m = tyMethod(f); if (m) return [m]; const i = f.indexOf(":"); if (i < 0) return []; const k = f.slice(0, i).trim().replace(/^readonly\s+/, "").replace(/\?$/, "").replace(/^["']|["']$/g, ""); return [[k, f.slice(i + 1).trim()] as [string, string]]; });
}
/** MO-8t (2026-11-25): a member of a record type written as a method, `navigate(to: string): Promise<void>` — the field it
 *  is, `navigate: (to: string) => Promise<void>`. It was read as a field named `navigate(to` and told nothing. */
function tyMethod(f: string): [string, string] | undefined {
  const m = /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*|"[^"]*"|'[^']*')\??\s*(?=[(<])/.exec(f); if (!m) return undefined;
  let at = m[0].length;
  if (f[at] === "<") { let depth = 0; for (; at < f.length; at++) { if (f[at] === "<") depth++; else if (f[at] === ">" && f[at - 1] !== "=") { if (--depth === 0) { at++; break; } } } while (f[at] === " ") at++; }
  if (f[at] !== "(") return undefined;
  const end = closes(f, at); if (end === undefined) return undefined;
  const rest = f.slice(end).trim(); if (!rest.startsWith(":")) return undefined;
  return [m[1].replace(/^["']|["']$/g, ""), `${f.slice(at, end)} => ${rest.slice(1).trim()}`];
}
/** The declared type one step down, where the text says it: a field of a record type, the result of a function type, the
 *  element of an array type. Undefined: the declaration does not say (`any`, a named type, a union of several). */
export function tyStep(t: string, s: TStep): string | undefined {
  const ms = tyMembers(t, true); if (ms.length !== 1) return undefined; t = ms[0];
  if (s === "call") { if (!t.startsWith("(")) return undefined; const end = closes(t, 0); if (end === undefined) return undefined; const rest = t.slice(end).trim(); return rest.startsWith("=>") ? rest.slice(2).trim() : undefined; }
  if (s === "elem") { if (t.endsWith("[]")) return t.slice(0, -2).trim(); for (const w of ["Array<", "ReadonlyArray<"]) if (t.startsWith(w)) return t.endsWith(">") ? t.slice(w.length, -1).trim() : undefined; return undefined; }
  return tyFields(t)?.find(f => f[0] === s.field)?.[1];
}
/** SC-4b: a function type that, as written, answers a value — one a component calls for what it answers. A prop of
 *  that type is no handler, whatever its name (`onSettled: (x: number) => string`): pure, as any closure made in reactive
 *  scope is. A type that does not say (`any`, a named type) leaves the name to say. */
export function tyAnswersValue(t: string | undefined): boolean {
  const r = t === undefined ? undefined : tyStep(t, "call"); if (r === undefined) return false;
  return !["void", "Promise<void>", "any", "unknown", "undefined", "never"].includes(tyClean(r));
}
/** MO-10b: an item of a tuple type, as written: `[A, b: B]` at 1 is `B`. */
function tyItem(t: string, k: number): string | undefined {
  const ms = tyMembers(t, true); if (ms.length !== 1) return undefined; let x = ms[0].replace(/^readonly\s+/, "");
  if (!(x.startsWith("[") && x.endsWith("]"))) return undefined;
  const it = splitTop(x.slice(1, -1), ",")[k]; return it === undefined || it.startsWith("...") ? undefined : it.replace(/^[A-Za-z_$][\w$]*\??\s*:\s*/, "").trim();
}
/** Whether a type, as written, is an array's: `T[]`, `Array<T>`, a tuple. */
function tyList(t: string): boolean { const ms = tyMembers(t, true); return ms.length === 1 && (ms[0].endsWith("[]") || /^(Readonly)?Array</.test(ms[0]) || (ms[0].startsWith("[") && ms[0].endsWith("]"))); }
/** Whether a declared type is a primitive's — `string`, `number`, `boolean`, `bigint`, `null`, `undefined`, `void`, a
 *  literal, or a union of those: a value of it holds nothing. */
export function tyScalar(t: string): boolean {
  const ms = tyMembers(t, false);
  return ms.length > 0 && ms.every(m => ["string", "number", "boolean", "bigint", "null", "undefined", "void", "never", "true", "false"].includes(m) || /^-*[\d.]*\d[\d.]*$/.test(m) || (m.length >= 2 && ((m.startsWith('"') && m.endsWith('"')) || (m.startsWith("'") && m.endsWith("'"))) && !/["']/.test(m.slice(1, -1))));
}
/** Whether a declared result is a function that takes nothing and answers nothing, `() => void`: what undoes a call. */
export function tyDisposer(t: string): boolean { const c = tyClean(t); const r = tyStep(c, "call"); return c.startsWith("()") && r !== undefined && tyClean(r) === "void"; }
/** The names under which a record result holds what ends it (`{ unsubscribe: () => void }`): an observable's
 *  subscription, a disposable, an observer, a timer. */
export const ENDINGS = ["unsubscribe", "dispose", "destroy", "disconnect", "stop", "cancel", "close"];
/** EF-5a: what a declared result says of undoing the call, as the type to quote: `() => void` — written out, behind a
 *  type alias its declaration file declares (`alias`: `export type Unsub = () => void`), or TypeScript's own
 *  `VoidFunction` — or a record with such a function under a name of an ending (`{ unsubscribe: () => void }`). */
export function tyUndoes(t: string, alias: (name: string) => string | undefined): string | undefined {
  const named = (t: string) => {
    let c = tyClean(t);
    for (let i = 0; i < 8 && /^[A-Za-z0-9_$]+$/.test(c); i++) { const x = c === "VoidFunction" ? "() => void" : alias(c); if (x === undefined) break; c = tyClean(x); }
    return c;
  };
  const c = named(t);
  if (tyDisposer(c)) return "() => void";
  const f = tyFields(c)?.find(([k, v]) => ENDINGS.includes(k) && tyDisposer(named(v)));
  return f ? `{ ${f[0]}: () => void }` : undefined;
}
/** What a declared alias stands for, from its text (`type Unsub = () => void`); undefined for an interface (a method
 *  signature is not a field's type) and for one that takes type parameters. */
export function aliasText(text: string): string | undefined {
  const m = /^\s*type\s+([A-Za-z0-9_$]+)\s*=([\s\S]*)$/.exec(text);
  return m ? m[2].trim() : undefined;
}
/** EF-5a: the paths through the rest of a block a disposer was bound in. `left`: a `return` reached without `name`
 *  having been named; `named`: it has been named on every path that reaches the end; `ends`: the end is reachable. A
 *  statement names it when one of its own expressions does (a closure that calls it later keeps it); another name for
 *  it (`let t = stop`) names it when that name is kept the same way; a failure's path is not one the block chose. */
function disposerPaths(ss: Stmt[], name: string, named: boolean): { left: boolean; named: boolean; ends: boolean } {
  const m = (e: Expr) => { const o = new Set<string>(); freeNames(e, new Set(), o); return o.has(name); };
  let left = false;
  for (let i = 0; i < ss.length; i++) {
    const s = ss[i];
    switch (s.k) {
      case "let":
        if (s.e.k === "id" && s.e.name === name) { const r = disposerPaths(ss.slice(i + 1), s.name, false); if (!r.left && (r.named || !r.ends)) named = true; }
        else if (m(s.e)) named = true;
        break;
      case "write": case "optimistic": if (m(s.e) || s.target.path.some(p => typeof p !== "string" && m(p))) named = true; break;
      case "expr": if (m(s.e)) named = true; break;
      case "throw": return { left, named: true, ends: false };
      case "return": if (s.e && m(s.e)) named = true; return { left: left || !named, named, ends: false };
      case "refresh": case "affects": break;
      case "action": { const r = disposerPaths(s.body, name, named); left ||= r.left; if (!r.ends) return { left, named: true, ends: false }; named = r.named; break; }
      case "sif": {
        if (m(s.c)) named = true;
        const a = disposerPaths(s.t, name, named), b = disposerPaths(s.f, name, named);
        left ||= a.left || b.left;
        if (!a.ends && !b.ends) return { left, named: true, ends: false };
        named = a.ends && b.ends ? a.named && b.named : a.ends ? a.named : b.named;
        break;
      }
      case "for": if (m(s.e)) named = true; left ||= disposerPaths(s.body, name, named).left; break;   // the body may not run
      case "try": {
        // a `finally` runs on every path; a failure may come before anything in the body
        let finNames = false; if (s.fin) { const o = new Set<string>(); freeNamesStmts(s.fin, new Set(), o); finNames = o.has(name); }
        const start = named || finNames;
        const a = disposerPaths(s.body, name, start); left ||= a.left;
        let ends = a.ends, n = a.named;
        if (s.handler) { const b = disposerPaths(s.handler, name, start); left ||= b.left; ends = a.ends || b.ends; n = a.ends && b.ends ? a.named && b.named : a.ends ? a.named : b.ends ? b.named : true; }
        if (!ends) return { left, named: true, ends: false };
        named = n || finNames;
        break;
      }
    }
  }
  return { left, named, ends: true };
}
/** Whether a declared type is a function's. */
export function tyFn(t: string): boolean { return tyStep(t, "call") !== undefined; }

/** MO-10f: the field path of a read from a bound name — `q.a`, `q["a"]`, `q[0]` name a field; `q[k]` is any field (undefined). */
export function fieldPath(e: Expr): { root: string; path: (string | undefined)[] } | undefined {
  const path: (string | undefined)[] = []; let x: Expr = e;
  for (;;) { if (x.k === "member") { path.unshift(x.p); x = x.o; } else if (x.k === "index") { path.unshift(litKey(x.i)); x = x.o; } else break; }
  if (!path.length || x.k !== "id") return undefined;
  return { root: x.name, path };
}
/** a key an index names for certain: a string, or a whole number */
export function litKey(i: Expr): string | undefined {
  if (i.k === "lit" && typeof i.v === "string") return i.v;
  if (i.k === "lit" && typeof i.v === "number" && i.v >= 0 && Number.isInteger(i.v)) return String(i.v);
  if (i.k === "tpl" && i.parts.length === 1 && typeof i.parts[0] === "string") return i.parts[0];
  return undefined;
}
/** the declared rows of every held field a path can name: a dynamic segment matches any field there */
function heldMatch(held: [string, boolean, string[]][], path: (string | undefined)[]): [string, boolean, string[]] | undefined {
  if (path.every(p => p !== undefined)) { const p = path.join("."); return held.find(h => h[0] === p); }
  let out: [string, boolean, string[]] | undefined;
  for (const h of held) {
    const segs = h[0].split("."); if (segs.length !== path.length || !segs.every((a, i) => path[i] === undefined || path[i] === a)) continue;
    out ??= [h[0], false, []]; out[1] ||= h[1]; for (const c of h[2]) if (!out[2].includes(c)) out[2].push(c);
  }
  return out;
}
