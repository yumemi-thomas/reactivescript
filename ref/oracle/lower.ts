// Lowering of the abstract syntax (spec/02-core §1, 03, 05, 06) onto the real runtime:
// solid-js 2.0 flow components over @solidjs/universal with a string-tree renderer.
// This is the compiler's back half, run as an interpreter: every form maps to the primitive
// its rule names (ST-1, ST-4c, ST-6c, AC-3 …). Unsupported shapes throw `Unsupported`.
import { inPrelude, language } from "../src/names.ts";
import { classMap } from "../src/style.ts";
import { inferredAction } from "../src/infer.ts";
import type { Decl, Expr, Markup, Program, Stmt } from "../src/ast.ts";
import { instantiates, keptParts, ownUses, usesNow } from "../src/ast.ts";
import { createRenderer } from "@solidjs/universal";
import { Show, For, Loading, Errored } from "solid-js";
import { getObserver, runRefCallback } from "@solidjs/signals";
import {
  createSignal, createMemo, createEffect, createOptimistic, createOptimisticStore, createStore, createProjection, createDeferred,
  createRoot, createRenderEffect, flush, untrack, latest, isPending, action, refresh, affects, until, onSettled, onFlush, NotReadyError, resetErrorHalt, createContext, getContext, setContext, getOwner, isDisposed, createOwner, runWithOwner, $TARGET, createErrorBoundary, omit, merge, reconcile
} from "@solidjs/signals";

const noFlight = (v: unknown) => { if (v instanceof Flight || v instanceof Promise) throw new Unsupported("`await` not in tail position (the oracle lowers a tail `await` to the memo's result)"); };
import { makeErrorClass, isA, PANIC, wireCopy, wireFailure } from "../src/failure.ts";
import { singleModule, given, defaulted, bindGiven, viewsAll, viewCtxAll, shownAll, shownIn, usedIn, type Given, type ModuleSet } from "../src/modules.ts";
import { nonTailAwaits, viewReaders } from "../src/awaits.ts";
import { unwrapServer } from "../src/check.ts";
import { primsSolid, isPrims } from "../src/prims.ts";
import { keyedWrite } from "../compile/keyed.ts";
import type { Shape } from "../src/parse.ts";
/** 12 SF-1d: Solid's server-function wrappers (\`GET\`, \`live\`, …) where there is no network: the function as it is (SF-7b). */
const LOCAL_WRAPPERS: Record<string, unknown> = { GET: (f: unknown) => f, live: (f: unknown) => f, broadcast: (f: unknown) => f, withMeta: (f: unknown) => f };

const hoistedOf = new WeakMap<object, Map<Expr, () => unknown>>();
const NO_PROVISION = { k: "const", value: undefined } as const;
class Returned { value: unknown; constructor(v: unknown) { this.value = v; } }
/** R-f-4: `e catch (x: C) => alt` as Solid code. A read of an errored node reaches the nearest boundary even inside a JS `try`
 *  (the status flows through the graph), so the catch is an error boundary around the read whose fallback is the value. */
function boundaryRead(f: () => unknown, match: (err: unknown) => boolean, alt: (err: unknown) => unknown): () => unknown {
  return untrack(() => createErrorBoundary(f, (err: () => unknown) => { const e0 = err(); if (!match(e0)) throw e0; return alt(e0); }));   // another class is thrown to the boundary above; a change of class re-decides
}
/** A keyed answer is returned from the derive, and Solid reconciles it by key at any depth (ST-4a): a row whose key is
 *  still there keeps its object and takes the new leaves, so an equal answer changes nothing (#51, #64). Any other
 *  answer is assigned to the draft. */
function landDraft(draft: any, v: unknown, key: string | undefined): unknown {
  if (key && v && typeof v === "object") return v;
  assignDraft(draft, v);
  return undefined;
}
/** A store draft becomes `v`: keys `v` lacks are removed, the rest assigned (an array's length follows). */
function assignDraft(draft: any, v: unknown) {
  if (!v || typeof v !== "object") return;
  if (Array.isArray(draft) && Array.isArray(v)) { draft.length = v.length; v.forEach((x, i) => { draft[i] = x; }); return; }
  for (const k of Object.keys(draft)) if (!(k in (v as object))) delete draft[k];
  Object.assign(draft, v);
}

const isPlain = (v: object) => { const p = Object.getPrototypeOf(v); return p === Object.prototype || p === Array.prototype || p === null; };
/** EF-2: what an effect's input is — a store whole, as a snapshot, wherever the input holds one (`{ tags: tags, n: n }`, a
 *  list of rows): its contents are what is compared. A getter (a JS result's parts, `lazy`) is not read. */
const inputWhole = (v: unknown, seen = new Set<unknown>()): unknown => {
  if (v === null || typeof v !== "object") return v;
  if ((v as any)[$TARGET] !== undefined) return readCopy(v);
  if (!isPlain(v) || seen.has(v)) return v;
  seen.add(v); let out: any = v;
  for (const k of Object.keys(v)) { const d = Object.getOwnPropertyDescriptor(v, k)!; if (d.get || d.value === null || typeof d.value !== "object") continue; const w = inputWhole(d.value, seen); if (w !== d.value) { if (out === v) out = Array.isArray(v) ? [...v] : { ...v }; out[k] = w; } }
  return out;
};
/** ST-2a, C-2: the whole of a source or a projection — one store, whose root a write or an answer replaces where it stands, and
 *  whose insides a path write changes. What an equation keeps of one (`[...(pre seen -> []), tags]`, a companion's last
 *  value) is a copy of it as it is now, read whole, so that a change inside is a change of it. */
const roots = new WeakSet<object>();
const byPosition = new WeakSet<object>();                                 // the roots a write replaces by position: a source with no key (ST-4a)
const unkeyed = (v: unknown): unknown => v !== null && typeof v === "object" && byPosition.has(v) ? whole(v) : v;
const rooted = <T extends object>(s: T): T => { roots.add(s); return s; };
const copiedFrom = new WeakMap<object, object>();                        // a copy, and the store's own value it was made of
const whole = (v: any, seen = new Map<object, unknown>()): unknown => {
  if (v === null || typeof v !== "object" || v[$TARGET] === undefined) return v;
  if (seen.has(v)) return seen.get(v);
  const out: any = Array.isArray(v) ? [] : {}; seen.set(v, out); copiedFrom.set(out, v);
  for (const k of Object.keys(v)) out[k] = whole(v[k], seen);
  return out;
};
const kept = (v: unknown): unknown => v !== null && typeof v === "object" && roots.has(v) ? whole(v) : v;
/** C-2: a kept copy, with what has not changed since as the store's own value (a row of `pre rows` is the row, while it is what it was). */
const asItWas = (c: any, at = new Map<object, unknown>()): unknown => {
  const live: any = c !== null && typeof c === "object" ? copiedFrom.get(c) : undefined; if (live === undefined) return c;
  if (at.has(c)) return at.get(c);
  at.set(c, live);
  const keys = Object.keys(c), now: any = {}; let same = !roots.has(live) && Object.keys(live).length === keys.length;
  for (const k of keys) { now[k] = asItWas(c[k], at); if (!Object.is(now[k], live[k])) same = false; }
  if (same) return live;
  const out: any = Array.isArray(c) ? Object.assign([], now) : now; at.set(c, out);
  return out;
};
/** EF-2: effect inputs compare as values: arrays and plain objects (a store's snapshot) by their contents. */
const sameInput = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  const pa = Object.getPrototypeOf(a), plain = (p: unknown) => p === Object.prototype || p === null || p === Array.prototype;
  if (pa !== Object.getPrototypeOf(b) || !plain(pa)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && sameInput((a as any)[k], (b as any)[k]));
};
/** A store's whole value, read through the store so a guess in flight shows (Solid's `deep` serves the landed frame). */
const readCopy = (v: unknown): unknown => v === null || typeof v !== "object" ? v : Array.isArray(v) ? v.map(readCopy) : Object.fromEntries(Object.keys(v).map(k => [k, readCopy((v as any)[k])]));

export class Unsupported extends Error { name = "Unsupported"; static last = ""; constructor(m: string) { super(m); Unsupported.last = m; } }

// ---------------------------------------------------------------- string-tree renderer
type N = { kind: "el"; tag: string; children: N[]; parent?: N; props: Record<string, unknown> } | { kind: "text"; text: string; parent?: N };
const R = createRenderer<N>({
  createElement: tag => ({ kind: "el", tag, children: [], props: {} }),
  createTextNode: text => ({ kind: "text", text }),
  replaceText: (n, v) => { (n as Extract<N, { kind: "text" }>).text = v; },
  isTextNode: n => n.kind === "text",
  setProperty: (n, k, v) => { if (n.kind === "el") n.props[k] = v; },
  insertNode: (p, n, anchor) => { if (p.kind !== "el") return; if (n.parent) { const q = n.parent as Extract<N, { kind: "el" }>; const j = q.children.indexOf(n); if (j >= 0) q.children.splice(j, 1); } const i = anchor ? p.children.indexOf(anchor) : -1; if (i < 0) p.children.push(n); else p.children.splice(i, 0, n); n.parent = p; },   // a DOM insert moves
  removeNode: (p, n) => { if (p.kind !== "el") return; const i = p.children.indexOf(n); if (i >= 0) p.children.splice(i, 1); n.parent = undefined; },
  getParentNode: n => n.parent,
  getFirstChild: n => (n.kind === "el" ? n.children[0] : undefined),
  getNextSibling: n => { const p = n.parent; if (!p || p.kind !== "el") return undefined; return p.children[p.children.indexOf(n) + 1]; },
});
/** RG-8: Solid's \`Portal\` over the test renderer — the same shape as \`@solidjs/web\`'s: its content a memo, placed at the end
 *  of the document (\`body\`) by a queued (\`schedule: true\`) render effect, so behind a fallback it waits for the reveal (D-19);
 *  owned where it is written (its context, its disposal). It renders nothing in place. */
function makePortal<N>(R: { createElement: (t: string) => N; insertNode: (p: N, n: N) => void; insert: (p: N, v: unknown) => void }, body: N) {
  return (props: { children: unknown }) => {
    const content = createMemo(() => props.children as unknown);
    createRenderEffect(() => [content(), getOwner()] as const, ([c, owner]) => {
      const box = R.createElement("portal"); R.insertNode(body, box);
      const dispose = runWithOwner(owner, () => createRoot(d => { R.insert(box, () => c); return d; }));
      return () => { dispose!(); const kids = (body as unknown as { children: N[] }).children; const i = kids.indexOf(box); if (i >= 0) kids.splice(i, 1); };
    }, { schedule: true } as never);
    return undefined;
  };
}
export const serialize = (n: N): string => n.kind === "text" ? n.text : n.children.map(serialize).join("");

/** A signal of `init`. `createSignal(f)` of a function is Solid's derived signal, so a source that begins as a function (a
 *  value like any other) is a signal of a box: a plain signal still, written and held as one is. */
const boxOf = new WeakMap<() => unknown, () => unknown>();
const signalOf = (init: unknown): [() => unknown, (v: unknown) => void] => {
  if (typeof init !== "function") return createSignal<unknown>(init) as never;
  const [box, set] = createSignal<{ v: unknown }>({ v: init }, { equals: (a, b) => a.v === b.v });
  const get = () => box().v; boxOf.set(get, box);
  return [get, v => { set(b => ({ v: typeof v === "function" ? v(b.v) : v })); }];
};
/** W-6 for a source whose first value was an array or a record (ST-1: a store behind a signal slot): an updater is given the
 *  slot as it stands, which is not the store once something else was written (`null`), and what it answers is stored,
 *  whatever it is. `replace` puts an object in the store; `edit` runs an updater on it. */
const rootSet = (store: unknown, set: (v: (at: unknown) => unknown) => void, replace: (v: object) => void, edit: (f: (d: unknown) => unknown) => void) => {
  const put = (v: unknown) => { if (typeof v === "object" && v !== null) { replace(v); set(() => store); } else set(() => v); };
  return (v: unknown) => {
    if (typeof v !== "function") return put(v);
    let at: unknown; set(p => (at = p));
    if (at !== store) return put(v(at));
    let other: { v: unknown } | undefined;
    edit(d => { const r = v(d); if (r === undefined || (typeof r === "object" && r !== null)) return r; other = { v: r }; });
    set(() => other ? other.v : store);
  };
};
const isView = (v: unknown): boolean => typeof v === "function" || (Array.isArray(v) && v.every(x => isView(x))) || (typeof v === "object" && v !== null && "kind" in (v as object) && ("tag" in (v as object) || "text" in (v as object)));
export const ERR = { toString: () => "#error" }; export const PENDING_MARK = { toString: () => "#pending" };
export const fmt = (v: unknown): string => v === ERR ? "#error" : v === PENDING_MARK ? "#pending" : v === undefined ? "undefined" : typeof v === "string" ? v : JSON.stringify(v);

// ---------------------------------------------------------------- scopes
type Binding =
  | { k: "sig"; get: () => unknown; set: (v: unknown) => void; question: boolean; optimistic: boolean; setGuess?: (v: unknown) => void; truth?: () => unknown }
  | { k: "store"; get: () => any; set: (v: unknown) => void; setPath: (f: (d: any) => any) => void; question: boolean; setGuess?: (f: (d: any) => any) => void; truth?: () => any }
  | { k: "memo"; get: () => unknown }
  | { k: "const"; value: unknown }
  | { k: "jfn"; f: (...a: unknown[]) => unknown; refs: boolean[]; shape: Shape }   // MO-10: a declared JS primitive
  | { k: "fn"; decl: Extract<Decl, { k: "fn" }>; home: Scope }        // home: the declaring scope — bodies are lexical (RG-7a, MO-6)
  | { k: "comp"; decl: Extract<Decl, { k: "component" }>; home: Scope }
  | { k: "action"; run: (...a: unknown[]) => unknown }
  | { k: "ctx"; ctx: ReturnType<typeof createContext<Binding | undefined>>; dflt: Expr | null; home: Scope; dv: Binding | null };   // RG-7: a declared context; its createContext is its identity
class Scope {
  static all: Scope[] = [];
  vars = new Map<string, Binding>(); givens = new Map<string, Given>();
  given = (n: string): Given | undefined => this.vars.has(n) || this.givens.has(n) ? this.givens.get(n) : this.parent?.given(n);
  parent: Scope | null; owner: ReturnType<typeof getOwner>;
  ups?: Map<object, unknown>;   // RG-7b: what was above this block for a context it provides from itself (`provide c = … use c …`), by provision
  constructor(parent: Scope | null) { this.parent = parent; this.owner = getOwner(); Scope.all.push(this); }   // the owner at declaration: provisions are read against it (RG-7)
  lookup(n: string): Binding | undefined { return this.vars.get(n) ?? this.parent?.lookup(n); }
}
/** Scenario handlers reach any live binding by name (ref/'s virtualScope). */
class VirtualScope extends Scope {
  lookup(n: string): Binding | undefined {
    let any: Binding | undefined;
    for (let i = Scope.all.length - 1; i >= 0; i--) { const b = Scope.all[i].vars.get(n); if (b && (b.k === "sig" || b.k === "store")) return b; any ??= b; }   // the source, not a narrowed copy of it
    return any;
  }
}

/** A controllable flight: an async iterable (a stream — ST-6, each `resolve` is one landing) that is also awaited by actions through `first`. */
class Flight {
  key: string; first: Promise<unknown>; private settleFirst!: (v: unknown) => void; private rejectFirst!: (e: unknown) => void;
  private queue: { v?: unknown; e?: unknown; done?: boolean }[] = []; private waiters: ((x: { v?: unknown; e?: unknown; done?: boolean }) => void)[] = []; private started = false;
  constructor(key: string) { this.key = key; this.first = new Promise((r, j) => { this.settleFirst = r; this.rejectFirst = j; }); this.first.catch(() => {}); }
  private push(x: { v?: unknown; e?: unknown; done?: boolean }) { const w = this.waiters.shift(); if (w) w(x); else this.queue.push(x); }
  resolve(v: unknown) { if (!this.started) { this.started = true; this.settleFirst(v); } this.push({ v }); }
  reject(e: unknown) { if (!this.started) { this.started = true; this.rejectFirst(e); } this.push({ e }); }
  [Symbol.asyncIterator]() {
    const next = (): Promise<IteratorResult<unknown>> => new Promise((res, rej) => { const take = (x: { v?: unknown; e?: unknown; done?: boolean }) => { if ("e" in x) rej(x.e); else res({ value: x.v, done: false }); }; const q = this.queue.shift(); if (q) take(q); else this.waiters.push(take); });
    return { next, return: async () => ({ value: undefined, done: true as const }) };
  }
}

/** E-9b: a name of a fn's body, in a call of it. */
class Local { read: () => unknown; constructor(read: () => unknown) { this.read = read; } }
export class Oracle {
  flights = new Map<string, Flight>();
  contexts = new Map<string, ReturnType<typeof createContext<Binding | undefined>>>();
  private ctxNamed(name: string, scope: Scope) { const c = scope.lookup(name); if (!c || c.k !== "ctx") throw new Error(`RG-7: ${name} is not a context`); return c; }
  /** RG-7b: the nearest provision of the context named `name` (lexically) above the scope's owner, else its default. */
  private above = new WeakMap<object, object>();   // RG-7b: a `use c` written in what `provide c` is given, and that provision
  provision(name: string, scope: Scope, own?: object): Binding {
    const c = this.ctxNamed(name, scope);
    let b = getContext(c.ctx, scope.owner ?? undefined);
    if (own) for (let s: Scope | null = scope; s; s = s.parent) if (s.ups?.has(own)) { b = s.ups.get(own) as Binding; break; }   // written in its own provision: what was above the block
    if (b && b !== NO_PROVISION) return b;
    if (c.dflt) { const de = c.dflt; return c.dv ??= { k: "memo", get: runWithOwner(c.home.owner ?? null, () => createMemo(() => this.ev(de, c.home)))! }; }
    throw new Error(`RG-7b: no provision for ${name}`);
  }
  lastKey = new Map<string, string>();                // equation name → the fetch key its last pass asked (for `resolve x v`)
  private currentEq: string | null = null;
  log: string[] = [];
  root!: N;
  dispose!: () => void;
  optimisticTargets = new Set<string>();
  plainTargets = new Set<string>();
  rootScope!: Scope;
  program: Program;
  scanHandlers: Stmt[][] | undefined;

  /** 09 MO-1: each imported module's scope, declared once, dependencies first. */
  moduleScopes = new Map<string, Scope>(); private typeDecls: Decl[] = []; private shown: ReturnType<typeof shownAll> = new Map(); private views: ReturnType<typeof viewsAll> = new Map(); private viewCtxs = new Set<unknown>(); private viewCtxNames = new WeakSet<object>();   // RG-4c
  declarations?: ModuleSet["declarations"];
  private instances = new WeakMap<Binding, { r: any; shape: Shape }>();   // MO-10: a primitive's raw result, under the binding of its instance
  constructor(input: Program | ModuleSet, handlers?: Stmt[][]) {
    const set = "programs" in input ? input : singleModule(input);
    this.declarations = set.declarations;
    this.shown = shownAll(set); this.views = viewsAll(set); this.viewCtxs = viewCtxAll(set);
    this.typeDecls = [...set.programs.values()].flatMap(p => p.decls.filter(d => d.k === "typedecl"));
    const program = set.programs.get(set.entry)!;
    this.program = program; this.scanHandlers = handlers;
    // usage over every module, deep (the compiler's usage(), ref/compile/emit.ts): guessed targets, path-written or path-probed sources
    const seen = new WeakSet<object>();
    const walk = (x: unknown): void => {
      if (!x || typeof x !== "object" || seen.has(x as object)) return; seen.add(x as object);
      if (Array.isArray(x)) { x.forEach(walk); return; }
      const o = x as Record<string, any>;
      if (o.k === "optimistic") this.optimisticTargets.add(o.target.name);
      if (o.k === "write" && !o.target.ctx) this.plainTargets.add(o.target.name);
      if ((o.k === "write" || o.k === "optimistic") && o.target.path.length) this.pathTargets.add(o.target.name);
      if (o.k === "pending" && (o.e.k === "member" || o.e.k === "index")) { let y = o.e; while (y.k === "member" || y.k === "index") y = y.o; if (y.k === "id") this.pathTargets.add(y.name); }
      for (const v of Object.values(o)) walk(v);
    };
    for (const p of set.programs.values()) walk(p);
    this.scanHandlers?.forEach(walk);
    this.root = { kind: "el", tag: "root", children: [], props: {} };
    // The renderer's `render`: one scheduled insert for the whole tree, so uncaught async at the mount holds the
    // first commit as one frame (the same as @solidjs/web's `render`; H-2 on instant 0).
    this.rootScope = new VirtualScope(null);
    this.dispose = R.render(() => {
      for (const path of set.order) { if (path === set.entry) continue; const ms = new Scope(null); this.moduleScopes.set(path, ms); this.declare(set.programs.get(path)!.decls, ms); }
      const scope = new Scope(null); return this.region(program.decls, program.view, scope) as any;
    }, this.root);
  }

  body: N = { kind: "el", tag: "body", children: [], props: {} };   // RG-8: where portals render
  private Portal = makePortal(R as never, this.body as never);
  /** The page's text, then what portals show at the end of the document (RG-8). */
  frame() { const b = serialize(this.body); return b.trim() ? `${serialize(this.root)} » ${b}` : serialize(this.root); }

  // ---- flights ----
  flight(key: string): Flight {
    let f = this.flights.get(key);
    if (!f) { f = new Flight(key); this.flights.set(key, f); }
    if (this.currentEq) this.lastKey.set(this.currentEq, key);
    return f;
  }
  /** 07 §3 / R-1: each `await` that is not the equation's result becomes its own async memo, asked only while the conditions
   *  that reach it hold (E-11); the equation reads it where the `await` was (ref/src/awaits.ts). */
  hoistedByName = new WeakMap<Scope, Map<string, (() => unknown)[]>>();
  /** R-f-4: `await e catch (x: C) => alt` — a rejection of `C` is the answer, as the compiled `settle`. */
  private settled(r: unknown, c: Extract<Expr, { k: "catch" }>, scope: Scope): unknown {
    if (!(r instanceof Promise)) return r;
    const classes = this.classValues(c.classes, scope);
    return r.then(v => v, err => { if (!isA(err, classes)) throw err; const en = new Map<string, unknown>(); if (c.name) en.set(c.name, err); return untrack(() => this.ev(c.alt, scope, en)); });
  }
  private hoistAwaits(name: string | null, e: Expr, scope: Scope, tail = true) {
    for (const h of nonTailAwaits(e, tail)) {
      const c = h.caught;
      const lv = h.node.init ? { loadingValue: untrack(() => this.ev(h.node.init!, scope)) } : undefined;
      const m = createMemo(() => {
        for (const g of h.guards) { const v = this.ev(g.e, scope); if (!(g.nullish ? v == null : g.neg ? !v : !!v)) return undefined; }
        const was = this.currentEq; this.currentEq = name;
        try { const v = this.ev(h.node.e, scope); const r = !h.node.stream && v instanceof Flight ? v.first : v; return c ? this.settled(r, c, scope) : r; } finally { this.currentEq = was; }   // a plain await: one answer; R-f-4: under a catch, a matching rejection is the answer where it is awaited (05 H-4)
      }, lv as any);
      let map = hoistedOf.get(scope); if (!map) hoistedOf.set(scope, (map = new Map())); map.set(h.node, m);
      if (name === null) continue;
      let byName = this.hoistedByName.get(scope); if (!byName) this.hoistedByName.set(scope, (byName = new Map())); let l = byName.get(name); if (!l) byName.set(name, (l = [])); l.push(m);   // per scope: a refresh never reaches a disposed mount's
    }
  }
  /** A region: its declarations, the awaits its own view reads (07 §3), then its view. */
  region(decls: Decl[], view: Markup[], scope: Scope): unknown[] {
    // RG-7a: what a region provides is for what is in it, so it has an owner of its own (a branch has its condition's)
    if (scope.parent && scope.owner === getOwner() && decls.some(d => d.k === "provide")) return runWithOwner(createOwner(), () => { scope.owner = getOwner(); return untrack(() => this.inside(decls, view, scope)); })!;
    return this.inside(decls, view, scope);
  }
  private inside(decls: Decl[], view: Markup[], scope: Scope): unknown[] {
    this.declare(decls, scope);
    for (const e of viewReaders(view, t => /^[A-Z]/.test(t))) this.hoistAwaits(null, e, scope, false);
    return this.fragment(view, scope);
  }
  /** R-f-4: error class names → their values; undefined: every failure. */
  classValues(names: string[] | undefined, scope: Scope): unknown[] | undefined {
    if (!names) return undefined;
    return names.map(n => { if (n === "Error") return Error; if (n === "Panic") return PANIC; const b = scope.lookup(n); if (!b || b.k !== "const") throw new Error(`${n} is not an error class`); return b.value; });
  }
  /** `refresh x` must re-ask: the key's old promise is forgotten so the next fetch makes a new one. */
  forget(key: string) { this.flights.delete(key); }

  private logFn = (...a: unknown[]) => { this.log.push(`log(${a.map(fmt).join(", ")})`); };
  private langFn(name: string): unknown { const l = language(name, false); return l === "fn" ? BUILTINS[name] : l === "log" ? this.logFn : undefined; }
  private lang(name: string, scope: Scope, env?: Map<string, unknown>) { return language(name, env?.has(name) || scope.lookup(name)); }
  /** RG-4c: a view the component was given, made where it is read (as the compiled module's). */
  /** RG-4c: whether a view was given, asked without making it: the argument is read as it was written, and while it
   *  is, content stands for itself (`slot`). A value in it answers as JavaScript has it. `some`: whether it is not `undefined`. */
  private asked(e: Expr, scope: Scope, not?: "undefined" | "null"): boolean | undefined {   // not: whether it is not that (`!= undefined`, `!= null`: the language's `!=` is JavaScript's `!==`)
    const g = given(e, scope.given); if (!g?.held || !g.view) return undefined;   // a prop declared `View`: of anything else, the question is its value's
    const was = ASK.on; ASK.on = { owner: getOwner() }; let v: unknown;
    try { v = this.ev(e, scope); } finally { ASK.on = was; }
    return not === "undefined" ? v !== undefined : not === "null" ? v !== null : !!v;
  }
  /** … and a condition that asks it. `bare`: the view itself is one. */
  private asks(c: Expr, scope: Scope, bare: boolean): boolean | undefined {
    if (bare) { const a = this.asked(c, scope); if (a !== undefined) return a; }
    if (c.k === "un" && c.op === "!") { const a = this.asks(c.e, scope, true); return a === undefined ? undefined : !a; }
    if (c.k === "bin" && (c.op === "==" || c.op === "!=") && c.r.k === "lit" && c.r.v == null) { const a = this.asked(c.l, scope, c.r.v === null ? "null" : "undefined"); return a === undefined ? undefined : c.op === "==" ? !a : a; }
    if (bare && c.k === "bin" && (c.op === "&&" || c.op === "||")) { const l = this.asks(c.l, scope, true), r = this.asks(c.r, scope, true); if (l === undefined && r === undefined) return undefined; const L = l ?? !!this.ev(c.l, scope); return c.op === "&&" ? L && (r ?? !!this.ev(c.r, scope)) : L || (r ?? !!this.ev(c.r, scope)); }
    return undefined;
  }
  private held(e: Expr, scope: Scope) { return () => { if (e.k !== "if" || !defaulted(e, scope.given)) return this.ev(e, scope); const v = this.ev(e.f, scope); return v === undefined ? this.ev(e.t, scope) : v; }; }
  /** RG-7b: a block's provision is the block's, wherever it is written in it: it is made before what uses it there (and
   *  what it is given from, by name, before it). The rest stays in the written order. */
  private provisionsFirst(decls: Decl[]): Decl[] {
    const ids = (e: unknown, out = new Set<string>()): Set<string> => { if (e && typeof e === "object") { if ((e as { k?: string }).k === "id") out.add((e as { name: string }).name); for (const v of Object.values(e)) ids(v, out); } return out; };
    // (and an equation that reads one written below it, `y = x + "!"` above `x = …`: E-1 has no order, the other runners read it)
    const later = decls.some((d, i) => (d.k === "eq" || d.k === "source") && [...ids(d.k === "source" ? d.init : d.e)].some(n => decls.slice(i + 1).some(x => (x.k === "eq" || x.k === "source") && x.name === n)));
    if (!later && !decls.some(d => d.k === "provide")) return decls;
    const out: Decl[] = [], seen = new Set<Decl>();
    const visit = (d: Decl) => {
      if (seen.has(d)) return; seen.add(d);
      if (d.k === "eq" || d.k === "source" || d.k === "provide") {
        const e = d.k === "source" ? d.init : d.e;
        for (const n of ids(e)) { const t = decls.find(x => (x.k === "eq" || x.k === "source") && x.name === n); if (t) visit(t); }
        for (const c of usesNow(e, d.k === "provide" ? ownUses(d.name, d.e) : undefined)) for (const t of decls) if (t.k === "provide" && t.name === c && t !== d) visit(t);
      }
      out.push(d);
    };
    decls.forEach(visit); return out;
  }
  // ---- declarations ----
  declare(decls: Decl[], scope: Scope) {
    for (const d of decls) if (d.k === "eq" || d.k === "source") scope.givens.set(d.name, {});
    bindGiven(decls.filter(d => d.k === "eq" && !this.optimisticTargets.has(d.name) && !unwrapServer(d.e)), scope.given, (n, g) => { scope.givens.set(n, g); });
    for (const d of decls) {
      if (d.k === "import" && d.resolved) { const ms = this.moduleScopes.get(d.resolved); if (!ms) throw new Error(`MO-9: ${d.from} is known by its signature only: there is no body to run`); for (const { name, alias } of d.names) { const b = ms.vars.get(name); if (b) scope.vars.set(alias, b); } continue; }   // MO-1: the module's own bindings
      if (d.k === "eq") { const sf = unwrapServer(d.e); if (sf) this.serverNames.set(sf, d.name); }   // SF-1d
      if (d.k === "import" && isPrims(d.from)) { const prims = primsSolid({ createSignal: createSignal as any, createMemo: createMemo as any }); for (const { name, alias } of d.names) { const x = this.declarations?.get(d.declared ?? "")?.find(y => y.name === name); if (!x || x.kind !== "fn" || !x.instantiates || !prims[name]) throw new Error(`${name} from "${d.from}" is not a declared primitive of the prelude`); scope.vars.set(alias, { k: "jfn", f: prims[name], refs: x.refs ?? [], shape: x.shape ?? "value" }); } continue; }   // MO-10: Solid primitives, as a library writes them
      if (d.k === "import") for (const { name, alias } of d.names) { const v = d.from === "@solidjs/web/server-functions" ? LOCAL_WRAPPERS[name] : inPrelude(d, name) ? this.langFn(name) : d.declaredErrors?.includes(name) ? makeErrorClass(name, ["message"], a => String(a[0] ?? name)) : d.from.endsWith("/api") ? (...a: unknown[]) => { const fl = this.flight(`${name}:${a.map(fmt).join(",")}`); return process.env.ORACLE_PROMISES ? fl.first : fl; } : undefined; if (v === undefined) throw new Error(`${name} from "${d.from}" is not in the scenario prelude`); scope.vars.set(alias, { k: "const", value: v }); }
      if (d.k === "server") scope.vars.set(d.name, { k: "const", value: this.serverFn(d, scope) });
      if (d.k === "error") { const msg = d.msg; scope.vars.set(d.name, { k: "const", value: makeErrorClass(d.name, d.params, args => msg ? String(untrack(() => this.ev(msg, scope, new Map(d.params.map((p, i) => [p, args[i]] as const))))) : d.name) }); }   // R-f-1
      if (d.k === "context") { const b: Binding = { k: "ctx", ctx: createContext<Binding | undefined>(NO_PROVISION as any, d.name), dflt: d.dflt ?? null, home: scope, dv: null }; scope.vars.set(d.name, b); if (this.viewCtxs.has(d)) this.viewCtxNames.add(b); }   // a sentinel default: absence is ours to decide (the default, or RG-7b)
      if (d.k === "fn") scope.vars.set(d.name, { k: "fn", decl: d, home: scope });
      if (d.k === "component") scope.vars.set(d.name, { k: "comp", decl: d, home: scope });
      if (d.k === "action") scope.vars.set(d.name, { k: "action", run: this.lowerAction(d.params, d.body, scope) });
    }
    for (const d of this.provisionsFirst(decls)) {
      switch (d.k) {
        case "provide": {                                               // RG-7a: setContext on the current owner; a provided source is the source
          const ctx = this.ctxNamed(d.name, scope).ctx;
          const b = d.e.k === "id" ? scope.lookup(d.e.name) : undefined;
          if (b && (b.k === "sig" || b.k === "store")) setContext(ctx, b);
          else { this.hoistAwaits(null, d.e, scope, false); const own = ownUses(d.name, d.e); if (own.size) { for (const u of own) this.above.set(u, d); (scope.ups ??= new Map()).set(d, getContext(ctx, getOwner() ?? undefined)); } const get = given(d.e, scope.given)?.held ? this.held(d.e, scope) : createMemo(() => this.ev(d.e, scope)); setContext(ctx, { k: "memo", get } as Binding); }   // RG-7b: a `use` of it written in what it is given reads what was above (`up`)
          break;
        }
        case "source": {
          if (d.question) {                                             // ST-5: createSignal(fn) / createOptimistic(fn) / createStore(fn, seed)
            this.hoistAwaits(d.name, d.init, scope);
            const compute = this.computeOf(d.name, d.init, scope);
            if (this.optimisticTargets.has(d.name) && this.pathTargets.has(d.name) && this.plainTargets.has(d.name)) {   // AC-3 with plain writes too: createOptimisticStore(() => truth) over createStore(fn) — writes go to the truth, guesses to the layer
              const derive = async (draft: any) => { const r = compute(draft); const v = r instanceof Flight ? await r.first : await r; return landDraft(draft, v, d.key); };
              const seed = () => d.key && (d.init ?? d.e)?.k !== "rec" ? [] : {};
              const [truth, setTruth] = (createStore as any)(derive, seed(), d.key ? { key: d.key } : undefined); rooted(truth);
              const [view, setView] = (createOptimisticStore as any)(() => truth, seed(), d.key ? { key: d.key } : undefined); rooted(view);
              scope.vars.set(d.name, { k: "store", get: () => view, set: (v: unknown) => setTruth((x: any) => typeof v === "function" ? (v as (y: unknown) => unknown)(x) : v), setPath: setTruth, question: true, setGuess: setView, truth: () => truth });   // AC-4: `refresh` re-asks the truth
            }
            else if (this.optimisticTargets.has(d.name) && this.pathTargets.has(d.name)) {   // AC-3 path targets over ST-5 structured: createOptimisticStore(fn, seed) — the derive writes its draft; the setter guesses per key
              const derive = async (draft: any) => { const r = compute(draft); const v = r instanceof Flight ? await r.first : await r; return landDraft(draft, v, d.key); };
              const [store, setStore] = (createOptimisticStore as any)(derive, d.key && (d.init ?? d.e)?.k !== "rec" ? [] : {}, d.key ? { key: d.key } : undefined); rooted(store);
              const plain = () => { throw new Unsupported("a plain write to an optimistic store"); };
              scope.vars.set(d.name, { k: "store", get: () => store, set: plain, setPath: plain, question: true, setGuess: setStore });
            }
            else if (this.optimisticTargets.has(d.name)) {                   // AC-3 over ST-5: the truth is a signal with a question, written plainly; the guess layer is createOptimistic over it
              const [truth, setTruth] = createSignal(compute as any, this.loadingValue(d.init, scope) as any);
              const [get, setGuess] = createOptimistic(() => truth());
              scope.vars.set(d.name, { k: "sig", get, set: setTruth as any, setGuess: setGuess as any, question: true, optimistic: true, truth });   // AC-4: `refresh` re-asks `truth`, not the guess layer
            }
            else if (this.isStructuredAwait(d.init, d.name)) { const [store, setStore] = (createStore as any)(async (draft: Record<string, unknown>) => { const r = compute(draft); const v = r instanceof Flight ? await r.first : await r; if (v && typeof v === "object") { for (const k of Object.keys(draft)) if (!(k in (v as object))) delete draft[k]; Object.assign(draft, v); } }, {}); /* ST-5 structured: the derive writes its draft (Solid's createStore(fn, seed) idiom) */ scope.vars.set(d.name, { k: "store", get: () => store, set: () => { throw new Unsupported("root write to a derived store"); }, setPath: setStore, question: true }); }
            else { const [get, set] = createSignal(compute as any, this.loadingValue(d.init, scope) as any); scope.vars.set(d.name, { k: "sig", get, set: set as any, question: true, optimistic: false }); }
          } else {
            const init = untrack(() => this.ev(d.init, scope));
            if (typeof init === "object" && init !== null) {                // ST-1: structured → createStore; the root slot is a signal so the whole value can be replaced
              const [store, setStore] = createStore(init as any); rooted(store as object); if (d.key === undefined) byPosition.add(store as object); const [get, set] = createSignal<unknown>(store);
              const key = d.key, w = { set: rootSet(store, set as never, v => setStore(key !== undefined ? keyedWrite(reconcile as never, $TARGET, v, key) as any : () => v as any),   // ST-2a: a root write is reconciled per path; ST-4a: a keyed one by its key (compile/keyed.ts); W-6: a function is the updater
                f => setStore((key !== undefined ? (dr: unknown) => { const r = f(dr); if (r === undefined || r === dr || typeof r !== "object" || r === null) return r; keyedWrite(reconcile as never, $TARGET, r, key)(dr); } : f) as any)), setPath: setStore };
              if (this.optimisticTargets.has(d.name)) {                     // AC-3 over a := store: createOptimisticStore(() => truth) over createStore(v); writes go to the truth, guesses to the layer
                const [view, setView] = (createOptimisticStore as any)(() => get(), Array.isArray(init) ? [] : {}); rooted(view); if (d.key === undefined) byPosition.add(view);
                scope.vars.set(d.name, { k: "store", get: () => view, ...w, question: false, setGuess: setView });
              } else scope.vars.set(d.name, { k: "store", get, ...w, question: false });
            }
            else if (this.optimisticTargets.has(d.name)) {                  // AC-3 over a := signal: createOptimistic(() => truth()) over createSignal(v)
              const [truth, set] = signalOf(init); const [get, setGuess] = createOptimistic(() => truth());
              scope.vars.set(d.name, { k: "sig", get, set: set as any, setGuess: setGuess as any, question: false, optimistic: true });
            }
            else { const [get, set] = signalOf(init); scope.vars.set(d.name, { k: "sig", get, set: set as any, question: false, optimistic: false }); }
          }
          break;
        }
        case "eq": {
          for (const x of keptParts(d.e, d.name)) this.keptExprs.add(x);
          if (scope.givens.get(d.name)?.held) { scope.vars.set(d.name, { k: "memo", get: this.held(d.e, scope) }); break; }
          if (this.foreign(d, scope)) break;
          if (d.e.k !== "draft") this.hoistAwaits(d.name, d.e, scope);
          if (d.e.k === "draft") {                                      // ST-3: createProjection((draft) => …, seed)
            const seedE = d.e.seed; if (seedE.k !== "pre" || seedE.name !== d.name || !seedE.init) throw new Unsupported("draft seed must be `pre self -> seed`");
            const seed = untrack(() => this.ev(seedE.init!, scope));
            const body = d.e.body;
            const proj = createProjection((draft: any) => { const s2 = new Scope(scope); s2.vars.set("d", { k: "const", value: draft }); this.runDraft(body, s2); }, seed as any); rooted(proj as object);
            scope.vars.set(d.name, { k: "memo", get: () => proj });
            break;
          }
          if (this.optimisticTargets.has(d.name) && !d.deferred) {     // AC-3 over an equation: Solid's createOptimistic(fn) / createOptimisticStore(fn, seed) — derived, its setter only guesses
            const compute = this.computeOf(d.name, d.e, scope);
            const plain = () => { throw new Unsupported("a plain write to an equation"); };
            if (this.pathTargets.has(d.name) || d.key) {
              const derive = async (draft: any) => { const r = compute(draft); const v = r instanceof Flight ? await r.first : await r; return landDraft(draft, v, d.key); };
              const [store, setStore] = (createOptimisticStore as any)(derive, d.key && (d.init ?? d.e)?.k !== "rec" ? [] : {}, d.key ? { key: d.key } : undefined); rooted(store);
              scope.vars.set(d.name, { k: "store", get: () => store, set: plain, setPath: plain, question: true, setGuess: setStore });
            } else {
              const [get, setGuess] = createOptimistic(compute as any, this.loadingValue(d.e, scope) as any);
              scope.vars.set(d.name, { k: "sig", get, set: plain as any, setGuess: setGuess as any, question: true, optimistic: true });
            }
            break;
          }
          if (d.key) {                                                  // ST-4: a keyed projection
            const compute = this.computeOf(d.name, d.e, scope);
            const src = createMemo(() => unkeyed(compute(undefined)) as any, this.loadingValue(d.e, scope) as any);   // the answer (sync, or the tail await's) is a memo; the projection reconciles it by key (found by S-ai2-search)
            const proj = createProjection(() => src() as any, [] as any, { key: d.key } as any); rooted(proj as object);
            scope.vars.set(d.name, { k: "memo", get: () => proj, truth: src } as any);   // AC-4: `refresh` re-asks the memo under the projection (S-keyed-refresh)
            break;
          }
          const fnDecl = this.fnOf(d.e, scope);
          if (fnDecl && instantiates(fnDecl)) { scope.vars.set(d.name, { k: "memo", get: this.instantiateFn(d.e as Extract<Expr, { k: "call" }>, fnDecl, scope) }); break; }   // RG-6
          if (d.e.k === "catch" && d.e.e.k === "await") {                   // R-f-4 over a tail await: a matching rejection is the answer, where it is awaited (as the compiled `settle`); a `deferred` one too (it threw at the mount through a boundary)
            const c = d.e; const classes = this.classValues(c.classes, scope); const compute = this.computeOf(d.name, c.e, scope) as (p: unknown) => unknown;
            const alt = (err: unknown) => { const en = new Map<string, unknown>(); if (c.name) en.set(c.name, err); return untrack(() => this.ev(c.alt, scope, en)); };
            const get = (d.deferred ? createDeferred : createMemo)(((prev: unknown) => { const r0 = compute(prev); const r = r0 instanceof Flight ? r0.first : r0; return r instanceof Promise ? r.then(v => v, err => { if (isA(err, classes)) return alt(err); throw err; }) : r; }) as any, this.loadingValue(c.e, scope) as any);
            scope.vars.set(d.name, { k: "memo", get });
            break;
          }
          if (d.e.k === "catch" && !d.deferred) {                      // R-f-4 over a tail await: the equation's flight is an inner memo, read through a boundary
            const c = d.e; const classes = this.classValues(c.classes, scope);
            const inner = createMemo(this.computeOf(d.name, c.e, scope) as any, this.loadingValue(c.e, scope) as any);
            const get = boundaryRead(() => inner(), err => isA(err, classes), err => { const en = new Map<string, unknown>(); if (c.name) en.set(c.name, err); return this.ev(c.alt, scope, en); });
            scope.vars.set(d.name, { k: "memo", get });
            break;
          }
          const compute = this.computeOf(d.name, d.e, scope);
          const opts = this.loadingValue(d.e, scope);
          const get = d.deferred ? createDeferred(compute as any, opts as any) : createMemo(compute as any, opts as any);
          scope.vars.set(d.name, { k: "memo", get });
          break;
        }
        case "effect": {                                                // EF: createEffect(compute, apply)
          const inputs = d.inputs; for (const e of inputs) this.hoistAwaits(null, e, scope, false);
          const apply = (vals: unknown[]) => { const env = new Map<string, unknown>(); vals.forEach((v, i) => env.set(`$${i}`, v)); const r = this.runStmts(d.body, scope, env); return typeof r === "function" ? (r as () => void) : undefined; };
          let last: unknown[] | null = null, node: any = null, cleanup: (() => void) | undefined;
          const undo = () => { const c = cleanup; cleanup = undefined; c?.(); };   // EF-5: a pass that fires nothing keeps the cleanup
          const ended = () => { if (!node || isDisposed(node)) undo(); };
          createEffect(() => (node = getOwner(), inputs).map(e => inputWhole(this.ev(e, scope))), {   // a store enters whole, as a snapshot
            effect: (vals: unknown[]) => { if (!last || last.length !== vals.length || !vals.every((v, i) => sameInput(v, last![i]))) { last = vals; undo(); cleanup = apply(vals); } return cleanup && ended; },   // EF-3: fires when an input changed (an error in between is a change)
            error: () => { last = null; },   // EF-2a: a failed input doesn't fire the apply; the next answer does
          } as any);
          break;
        }
      }
    }
  }
  /** ST-1 by usage: a question source written or probed by path is structured → createStore(fn, seed). */
  private isStructuredAwait(e: Expr, name?: string) { return name !== undefined && this.pathTargets.has(name); }
  pathTargets = new Set<string>();
  asyncError: unknown = null;
  private imperative = 0;
  /** A memo compute over an equation: `pre x` of itself is the previous value; `await e` as the whole body returns the promise. */
  private computeOf(name: string, e: Expr, scope: Scope) {
    return (prev: unknown) => {
      const s2 = new Scope(scope); s2.vars.set(`pre:${name}`, { k: "const", value: prev });
      const was = this.currentEq; this.currentEq = name;
      try {
        const body = e.k === "await" ? e.e : e;
        const v = this.ev(body, s2);
        return v;
      } finally { this.currentEq = was; }
    };
  }
  /** C-2: `pre y` of another node lowers to a companion memo `createMemo(st => ({ cur: y, prev: st?.cur }))` read at `.prev`. One per (scope, name). */
  private prevOf(name: string, scope: Scope): () => unknown {
    const key = `prev:${name}`;
    let b = scope.lookup(key);
    if (!b) {
      let def: Scope | null = scope; while (def && !def.vars.has(name)) def = def.parent;   // cache on the scope that declares `name`, not a per-compute scope
      const home = def ?? scope;
      const get = runWithOwner(home.owner ?? null, () => createMemo((st: any) => { const cur = kept(this.ev({ k: "id", name }, home)); return { cur, prev: st ? asItWas(st.cur) : undefined }; }))!;   // owned by the declaring scope, not by whichever computation first read it
      b = { k: "memo", get: () => (get() as { prev: unknown }).prev }; home.vars.set(key, b);
    }
    return (b as { get: () => unknown }).get;
  }
  private loadingValue(e: Expr, scope: Scope) {                     // R-7: the first paint of any `await … -> v` in the equation
    let init: Expr | undefined;
    const walk = (x: Expr): void => { if (init) return; if (x.k === "await" && x.init) { init = x.init; return; } for (const v of Object.values(x as object)) { if (Array.isArray(v)) v.forEach(y => y && typeof y === "object" && "k" in y && walk(y as Expr)); else if (v && typeof v === "object" && "k" in (v as object)) walk(v as Expr); } };
    walk(e);
    return init ? { loadingValue: untrack(() => this.ev(init!, scope)) } : undefined;
  }
  /** MO-10: `x = f(…)` over a declared primitive — called once, a ref argument as an accessor, a value one untracked; and
   *  `y = x[i]` / `x.k` over its result. A `ref` part is the accessor itself; any other part is the value it is. */
  private foreign(d: Extract<Decl, { k: "eq" }>, scope: Scope): boolean {
    const e = d.e;
    const bindPart = (r: any, part: Shape): Binding => part === "ref" ? { k: "memo", get: r } : { k: "const", value: r };
    if (e.k === "call" && e.f.k === "id") {
      const b = scope.lookup(e.f.name); if (!b || b.k !== "jfn") return false;
      const args = e.args.map((a, i) => {
        if (!b.refs[i]) return untrack(() => this.ev(a, scope));
        const ab = a.k === "id" ? scope.lookup(a.name) : undefined;
        return ab && (ab.k === "sig" || ab.k === "memo" || ab.k === "store") ? ab.get : createMemo(() => this.ev(a, scope));
      });
      const r = b.f(...args) as any; const shape = b.shape;
      const bind = typeof shape === "string" ? bindPart(r, shape) : { k: "memo" as const, get: (() => { const o: any = "items" in shape ? [] : {}; for (const [k, p] of "items" in shape ? shape.items.map((p, i) => [i, p] as const) : shape.fields) Object.defineProperty(o, k, { get: () => p === "ref" ? r[k]() : r[k], enumerable: true }); return () => o; })() };   // R-f-5, MO-10f: each part read where it is read (compile/rt.ts `lazy`)
      this.instances.set(bind, { r, shape }); scope.vars.set(d.name, bind); return true;
    }
    if ((e.k === "index" && e.i.k === "lit") || e.k === "member") {
      const ob = e.o.k === "id" ? scope.lookup(e.o.name) : undefined; const inst = ob && this.instances.get(ob); if (!inst || typeof inst.shape !== "object") return false;
      const key = e.k === "index" ? (e.i as { v: any }).v : e.p;
      const part = "items" in inst.shape ? inst.shape.items[key] : inst.shape.fields.find(f => f[0] === key)?.[1]; if (!part) return false;
      scope.vars.set(d.name, bindPart(inst.r[key], part)); return true;
    }
    return false;
  }
  private fnOf(e: Expr, scope: Scope) { if (e.k !== "call" || e.f.k !== "id") return null; const b = scope.lookup(e.f.name); return b && b.k === "fn" ? b.decl : null; }
  private fnHome(e: Expr, scope: Scope): Scope { const b = e.k === "call" && e.f.k === "id" ? scope.lookup(e.f.name) : undefined; return b && b.k === "fn" ? b.home : scope; }
  private instantiateFn(call: Extract<Expr, { k: "call" }>, f: Extract<Decl, { k: "fn" }>, scope: Scope, own = false): () => unknown {
    if (f.decls.some(x => x.k === "provide") && !own) return runWithOwner(createOwner(), () => this.instantiateFn(call, f, scope, true))!;   // RG-6a: what it provides is for what its call instantiates
    const s2 = new Scope(this.fnHome(call, scope));                   // names from the declaration; arguments from the call
    f.params.forEach((p, i) => {
      const arg = call.args[i];
      if (p.ref) { const b = arg?.k === "id" ? scope.lookup(arg.name) : undefined; if (b && (b.k === "sig" || b.k === "memo" || b.k === "store")) s2.vars.set(p.name, b); else s2.vars.set(p.name, { k: "memo", get: createMemo(() => arg ? this.ev(arg, scope) : undefined) }); }
      else s2.vars.set(p.name, { k: "const", value: arg ? untrack(() => this.ev(arg, scope)) : undefined });
    });
    if (nonTailAwaits(f.tail, false).length) { this.declare([...f.decls, { k: "eq", name: "result$", e: f.tail, line: f.line }], s2); return (s2.lookup("result$") as { get: () => unknown }).get; }   // the result is an equation, with its flights
    this.declare(f.decls, s2);
    const tb = f.tail.k === "id" ? s2.lookup(f.tail.name) : undefined;
    if (tb && (tb.k === "memo" || tb.k === "sig")) return tb.get;
    return createMemo(() => this.ev(f.tail, s2));
  }

  // ---- expressions (reactive scope: tracked by whatever computation is running) ----
  private keptExprs = new Set<Expr>();                                   // C-2: a whole store read there is copied
  private probing = 0;                                                   // inside `latest` or `pending?`: what is read there is not what is read outside
  /** E-9b: as the interpreter's `withLocals`: evaluated when read, once for the call and the observer. */
  private withLocals(f: Extract<Decl, { k: "fn" }>, home: Scope, en: Map<string, unknown>): unknown {
    let live = true;
    for (const d of f.decls) if (d.k === "eq") {
      let at: unknown[] | undefined, v: unknown;
      en.set(d.name, new Local(() => {
        const w = [getObserver(), this.imperative, this.probing]; if (live && at && at.every((x, i) => x === w[i])) return v;
        const x = this.ev(d.e, home, en); if (live) { at = w; v = x; } return x;
      }));
    }
    try { return this.ev(f.tail, home, en); } finally { live = false; }
  }
  ev(e: Expr, scope: Scope, env?: Map<string, unknown>): unknown { const v = this.ev0(e, scope, env); return this.keptExprs.has(e) ? kept(v) : v; }
  private ev0(e: Expr, scope: Scope, env?: Map<string, unknown>): unknown {
    switch (e.k) {
      case "lit": return e.v;
      case "id": {
        if (env?.has(e.name)) { const v = env.get(e.name); return v instanceof Local ? v.read() : v; }
        const b = scope.lookup(e.name);
        if (!b) { const f = this.langFn(e.name); if (f) return f; throw new Error(`unbound ${e.name}`); }
        switch (b.k) {
          case "const": return b.value;
          case "sig": case "memo": case "store": {
            if (!this.imperative) return b.get();
            try { return b.get(); } catch (e) { if (e instanceof NotReadyError) return PENDING_MARK; throw e; }   // H-10: an apply block or handler reads σ; R-f-7: a snapshot of an error throws it
          }
          case "fn": { const f = b.decl, home = b.home; return (...args: unknown[]) => { const en = new Map<string, unknown>(); f.params.forEach((p, i) => en.set(p.name, args[i])); return f.named ? this.withLocals(f, home, en) : this.ev(f.tail, home, en); }; }
          case "action": return b.run;
          case "comp": throw new Error("component applied outside a view");
        }
      }
      case "member": { const o = this.ev(e.o, scope, env) as any; noFlight(o); return o == null ? undefined : o[e.p]; }
      case "index": { const o = this.ev(e.o, scope, env) as any; const i = this.ev(e.i, scope, env) as any; return o == null ? undefined : o[i]; }
      case "tpl": return e.parts.map(p => typeof p === "string" ? p : fmt(this.ev(p, scope, env))).join("");
      case "pre": {
        const own = scope.lookup(`pre:${e.name}`);
        if (own && own.k === "const") { if (own.value === undefined && e.init) return this.ev(e.init, scope, env); return own.value; }   // the equation's own previous value: the memo's `prev`
        const v = this.prevOf(e.name, scope)();                        // C-2 for another node: a companion memo carrying (current, previous)
        if (v === undefined && e.init) return this.ev(e.init, scope, env);
        return v;
      }
      case "peek": return untrack(() => this.ev(e.e, scope, env));
      case "await": {
        for (let s: Scope | null = scope; s; s = s.parent) { const h = hoistedOf.get(s)?.get(e); if (h) return h(); }   // a hoisted `await`: its own node, read here
        const v = this.ev(e.e, scope, env); return !e.stream && v instanceof Flight ? v.first : v;   // in tail position the memo returns the flight (R-1): a stream for `await*`, else its one answer
      }   // in tail position the memo returns the flight (R-1); elsewhere the operand checks below refuse it
      case "latest": { const was = this.imperative; this.imperative = 0; this.probing++; try { return latest(() => { const v = this.ev(e.e, scope, env); return v !== null && typeof v === "object" && (v as any)[$TARGET] !== undefined ? readCopy(v) : v; }); } finally { this.imperative = was; this.probing--; } }   // R-12: `latest` of a value that never had one throws, in a handler as anywhere (Solid S-28)
      case "pending": this.probing++; try { return isPending(() => { const v = this.ev(e.e, scope, env); if (v !== null && typeof v === "object") Reflect.ownKeys(v); return v; }); } finally { this.probing--; }   // Solid D-23: the probe judges reads, so a structured value is read whole
      case "if": return (this.asks(e.c, scope, true) ?? this.ev(e.c, scope, env)) ? this.ev(e.t, scope, env) : this.ev(e.f, scope, env);
      case "throw": throw this.ev(e.e, scope, env);                    // R-f-3
      case "serverfn": { let f = this.serverFns.get(e); if (!f) this.serverFns.set(e, (f = this.serverFn({ name: this.serverNames.get(e) ?? "server fn", params: e.params, body: e.body }, scope))); return f; }   // SF-1d
      case "catch": {                                                  // R-f-4: a matching failure becomes a value
        const classes = this.classValues(e.classes, scope);
        const match = (err: unknown) => isA(err, classes);
        const alt = (err: unknown) => { const en = new Map(env); if (e.name) en.set(e.name, err); return this.ev(e.alt, scope, en); };
        if (this.imperative) { try { return this.ev(e.e, scope, env); } catch (err) { if (err instanceof NotReadyError || !match(err)) throw err; return alt(err); } }
        return boundaryRead(() => { const v = this.ev(e.e, scope, env); noFlight(v); return v; }, match, alt)();   // Solid: an error read inside try still reaches the boundary — a catch is a boundary around the read
      }
      case "un": { const a = this.asks(e, scope, false); if (a !== undefined) return a; const v = this.ev(e.e, scope, env) as any; noFlight(v); return e.op === "!" ? !v : -v; }
      case "bin": {
        { const a = this.asks(e, scope, false); if (a !== undefined) return a; if (e.op === "&&") { const l = this.asks(e.l, scope, true); if (l !== undefined) return this.ev(l ? e.r : e.l, scope, env); } }   // RG-4c: asked, not made
        const l = this.ev(e.l, scope, env) as any; noFlight(l);
        if (e.op === "&&") return l ? this.ev(e.r, scope, env) : l;
        if (e.op === "||") return l ? l : this.ev(e.r, scope, env);
        if (e.op === "??") return l != null ? l : this.ev(e.r, scope, env);
        const r = this.ev(e.r, scope, env); noFlight(r);
        return BIN[e.op](l, r);
      }
      case "arr": { const out: unknown[] = []; for (const i of e.items) { if (i.k === "spread") out.push(...(this.ev(i.e, scope, env) as unknown[])); else out.push(this.ev(i, scope, env)); } return out; }
      case "rec": { const o: Record<string, unknown> = {}; for (const f of e.fields) { if ("spread" in f) Object.assign(o, this.ev(f.spread, scope, env)); else o[f.key] = this.ev(f.v, scope, env); } return o; }
      case "fn": if (e.stmts && inferredAction(e.stmts)) return this.lowerAction(e.params, e.stmts, scope, env);   // AC-1b
        return (...args: unknown[]) => { const en = new Map(env); e.params.forEach((p, i) => en.set(p, args[i])); return e.stmts ? this.runStmts(e.stmts, scope, en) : this.ev(e.body, scope, en); };
      case "stylemap": return classMap(e.css);                      // 07 CSS-5
      case "call": {
        let f: any, self: any;
        if (e.f.k === "id" && this.lang(e.f.name, scope, env) === "until") { const p = e.args[0]; if (p?.k !== "fn") throw new Error("UNTIL_PREDICATE"); return until(() => this.ev(p.body, scope, env)); }   // AC-6: Solid's until
        if (e.f.k === "id" && ["onSettled", "onFlush"].includes(this.lang(e.f.name, scope, env)!)) { const cb = this.ev(e.args[0], scope, env) as () => void; return (e.f.name === "onSettled" ? onSettled : onFlush)(cb); }   // EF-7, EF-8: Solid's own
        if (e.f.k === "member") { self = this.ev(e.f.o, scope, env); f = self == null ? undefined : self[e.f.p]; } else f = this.ev(e.f, scope, env);
        const args = e.args.map(a => this.ev(a, scope, env));
        if (f === BUILTINS.fetch) { const fl = this.flight(String(args[0])); return process.env.ORACLE_PROMISES ? fl.first : fl; }
        while (Array.isArray(f) && f.length === 1 && isView(f) && typeof f[0] === "function") f = f[0]();   // RG-4c, a function prop: the children are one closure, as JSX passes it
        if (typeof f !== "function") throw new Error("call of non-function");
        return f.apply(self, args);
      }
      case "draft": throw new Unsupported("draft outside an equation");
      case "use": { const b = this.provision(e.name, scope, this.above.get(e)); return b.k === "const" ? b.value : (b as { get: () => unknown }).get(); }
      case "spread": throw new Error("spread outside an array literal");
      case "omit": return omit(this.ev(e.e, scope, env) as Record<string, unknown>, ...e.keys);
    }
  }

  // ---- imperative scope ----
  runStmts(stmts: Stmt[], scope: Scope, env: Map<string, unknown>): unknown {
    this.imperative++; try { let r: unknown; for (const s of stmts) { r = this.stmt(s, scope, env); if (r instanceof Returned) return r.value; } return r; } finally { this.imperative--; }
  }
  private stmt(s: Stmt, scope: Scope, env: Map<string, unknown>): unknown {
    switch (s.k) {
      case "let": env.set(s.name, untrack(() => this.ev(s.e, scope, env))); return;
      case "expr": return untrack(() => this.ev(s.e, scope, env));
      case "return": return new Returned(s.e ? untrack(() => this.ev(s.e!, scope, env)) : undefined);
      case "sif": { for (const st of untrack(() => this.ev(s.c, scope, env)) ? s.t : s.f) { const r = this.stmt(st, scope, env); if (r instanceof Returned) return r; } return undefined; }
      case "for": { for (const x of [...(untrack(() => this.ev(s.e, scope, env)) as Iterable<unknown>)]) { env.set(s.name, x); for (const st of s.body) { const r = this.stmt(st, scope, env); if (r instanceof Returned) return r; } } return undefined; }   // 07 §5
      case "try": {
        const runBlock = (ss: Stmt[]) => { for (const st of ss) { const r = this.stmt(st, scope, env); if (r instanceof Returned) return r; } return undefined; };
        try { const r = runBlock(s.body); if (r) return r; } catch (e) { if (!s.handler || !isA(e, this.classValues(s.catchClasses, scope))) throw e; if (s.catchName) env.set(s.catchName, e); const r = runBlock(s.handler); if (r) return r; } finally { if (s.fin) { const r = runBlock(s.fin); if (r) return r; } }
        return undefined;
      }
      case "throw": throw untrack(() => this.ev(s.e, scope, env));
      case "action": this.lowerAction([], s.body, scope, env)(); return;
      case "refresh": { const b = scope.lookup(s.name); if (!b || !("get" in b)) throw new Error("INVALID_REFRESH_TARGET"); const key = this.lastKey.get(s.name); if (key) this.forget(key); const d = Scope.all.find(x => x.vars.get(s.name) === b); for (const h of (d && this.hoistedByName.get(d)?.get(s.name)) ?? []) refresh(h as any); refresh((b.k === "store" ? (b.truth ?? b.get)() : ((b.k === "sig" || b.k === "memo") && (b as any).truth) || b.get) as any); return; }
      case "affects": { const b = scope.lookup(s.name); if (!b || !("get" in b)) throw new Error("INVALID_AFFECTS_TARGET"); affects((b.k === "store" ? b.get() : boxOf.get(b.get) ?? b.get) as any); return; }   // a store binding's get wraps the store: Solid takes the store (#50)
      case "optimistic": case "write": {
        const b = s.target.ctx ? this.provision(s.target.name, scope) : scope.lookup(s.target.name);
        const v = untrack(() => this.ev(s.e, scope, env));          // W-6: a function value is Solid's updater form — the setters take it as is
        if (!b) throw new Error(`unbound ${s.target.name}`);
        if (b.k === "sig") { if (s.target.path.length) throw new Unsupported("path write to a signal"); (s.k === "optimistic" ? (b.setGuess ?? b.set) : b.set)(v); return; }
        if (b.k === "store") {
          const path = s.target.path.map(p => typeof p === "string" ? p : String(untrack(() => this.ev(p, scope, env))));
          if (s.k === "optimistic") {
            if (!b.setGuess) throw new Error(`a guess on ${s.target.name}, which the oracle did not mark as guessed`);
            b.setGuess((d: any) => { if (path.length === 0) return typeof v === "function" ? (v as (x: unknown) => unknown)(d) : v; /* a whole guess is the setter\'s return, which Solid diffs shallowly against the view as guesses */ let o = d; for (const k of path.slice(0, -1)) o = o[k]; const last = path[path.length - 1]; o[last] = typeof v === "function" ? (v as (x: unknown) => unknown)(o[last]) : v; });   // W-6 per key
            return;
          }
          if (path.length === 0) b.set(v);
          else b.setPath((d: any) => { let o = d; for (const k of path.slice(0, -1)) o = o[k]; o[path[path.length - 1]] = v; });
          return;
        }
        throw new Error(`W-1: write to non-source ${s.target.name}`);
      }
    }
  }
  private runDraft(stmts: Stmt[], scope: Scope) {
    const env = new Map<string, unknown>();
    for (const s of stmts) {
      if (s.k === "let") env.set(s.name, this.ev(s.e, scope, env));
      else if (s.k === "expr") this.ev(s.e, scope, env);
      else if (s.k === "write") {
        const d = (scope.lookup("d") as Extract<Binding, { k: "const" }>).value as any;
        const path = s.target.path.map(p => typeof p === "string" ? p : String(this.ev(p, scope, env)));
        let o = d; for (const k of path.slice(0, -1)) { if (o[k] == null) o[k] = {}; o = o[k]; } o[path[path.length - 1]] = this.ev(s.e, scope, env);
      } else throw new Unsupported(`${s.k} in draft`);
    }
  }
  /** AC-1: an action body is a generator; a statement-level `await` is a hold-safe `yield` of the flight. */
  private lowerAction(params: string[], body: Stmt[], scope: Scope, outer?: Map<string, unknown>) {
    const self = this;
    const run = action(function* (...args: unknown[]) {
      const env = new Map(outer); params.forEach((p, i) => env.set(p, args[i]));
      const r = yield* self.block(body, scope, env); return r ? r.value : undefined;
    });
    return (...args: unknown[]) => { const p = run(...args); p.catch(e => { self.asyncError = e; }); return p; };
  }
  /** 12 SF-7b: a server function as the client sees it — a call is a flight. The body runs in place (its generator driven by
   *  promises, not by an action: it is no change of the client's), behind a wire that copies arguments and result (SF-6a) and
   *  lets only declared failures through (SF-6b). Asked in reactive scope, one flight per arguments; in imperative scope, a new request each call. */
  private serverSeq = 0;
  private serverFns = new WeakMap<Expr, unknown>(); private serverNames = new WeakMap<Expr, string>();
  private serverFn(d: { name: string; params: string[]; body: Stmt[] }, scope: Scope) {
    return (...args: unknown[]) => {
      const key = `${d.name}:${args.map(fmt).join(",")}`; const out = (fl: Flight) => process.env.ORACLE_PROMISES ? fl.first : fl;
      const question = !!getObserver();                                       // SF-2: asked in reactive scope — a question, one flight per arguments
      if (question && this.flights.has(key)) return out(this.flights.get(key)!);
      const fl = question ? this.flight(key) : new Flight(`${key}#${this.serverSeq++}`);
      const fail = (msg: string): never => { throw new Error(`WIRE_VALUE: ${d.name}: ${msg}`); };
      const env = new Map<string, unknown>(d.params.map((p, i) => [p, wireCopy(args[i], `argument ${p}`, fail)]));
      const g = this.block(d.body, scope, env);
      const step = (input: unknown, thrown: boolean) => {
        const was = this.currentEq; this.currentEq = null;                    // the body's own flights are not the asking equation's
        let r: IteratorResult<unknown, Returned | undefined>;
        try { r = untrack(() => thrown ? g.throw(input) : g.next(input)); } catch (e) { fl.reject(wireFailure(e)); return; } finally { this.currentEq = was; }
        if (r.done) { try { fl.resolve(wireCopy(r.value?.value, "its result", fail)); } catch (e) { fl.reject(e); } return; }
        Promise.resolve(r.value).then(v => step(v, false), e => step(e, true));
      };
      step(undefined, false);
      return out(fl);
    };
  }
  /** AC-1/AC-7: a statement-level `await` is a hold-safe `yield`; `try`/`catch`/`finally`/`throw` are JavaScript's, around the yields. */
  private *block(stmts: Stmt[], scope: Scope, env: Map<string, unknown>): Generator<unknown, Returned | undefined, unknown> {
      const self = this; const block = (ss: Stmt[], en: Map<string, unknown>) => self.block(ss, scope, en);
      for (const s of stmts) {
        const top = s.k === "let" || s.k === "expr" ? s.e : null;
        const caught = top?.k === "catch" && top.e.k === "await" ? top : null;
        const awaited = top?.k === "await" ? top : caught ? caught.e as Extract<Expr, { k: "await" }> : null;
        if (awaited) {                                                  // AC-1 / R-f-4: with its catch, a try around the yield
          let r: unknown;
          try { const v = untrack(() => self.ev(awaited.e, scope, env)); r = v instanceof Flight ? yield v.first : v instanceof Promise ? yield v : v; }
          catch (e) { if (!caught || e instanceof NotReadyError || !isA(e, self.classValues(caught.classes, scope))) throw e; const en = new Map(env); if (caught.name) en.set(caught.name, e); self.imperative++; try { r = untrack(() => self.ev(caught.alt, scope, en)); } finally { self.imperative--; } }
          if (s.k === "let") env.set(s.name, r);
          continue;
        }
        if (s.k === "sif") { const r = yield* block(untrack(() => self.ev(s.c, scope, env)) ? s.t : s.f, env); if (r) return r; continue; }
        if (s.k === "for") { let out: unknown; for (const x of [...(untrack(() => self.ev(s.e, scope, env)) as Iterable<unknown>)]) { env.set(s.name, x); out = yield* block(s.body, env); if (out) break; } if (out) return out; continue; }   // 07 §5
        if (s.k === "try") {
          try { const r = yield* block(s.body, env); if (r) return r; }
          catch (e) { if (!s.handler || !isA(e, self.classValues(s.catchClasses, scope))) throw e; if (s.catchName) env.set(s.catchName, e); const r = yield* block(s.handler, env); if (r) return r; }   // R-f-6: a typed catch rethrows other classes
          finally { if (s.fin) { const r = yield* block(s.fin, env); if (r) return r; } }
          continue;
        }
        if (s.k === "throw") throw untrack(() => self.ev(s.e, scope, env));
        let r: unknown; self.imperative++; try { r = self.stmt(s, scope, env); } finally { self.imperative--; }
        if (r instanceof Returned) return r;
      }
      return undefined;
  }

  // ---- views ----
  /** A view's items, as Solid's compiled JSX shapes them: in a fragment a reader is a memo; an element's children are its
   *  holes, each inserted at its own marker (`inEl`), so each reader is its own render effect. */
  fragment(m: Markup[], scope: Scope, inEl = false): unknown[] { const items = m.map(x => this.node(x, scope, inEl)); return inEl ? items : items.map(x => (x as { $read?: boolean })?.$read ? R.memo(x as () => unknown) : x); }
  private props(m: Extract<Markup, { k: "el" }>, scope: Scope, kids?: Record<string, unknown>): Record<string, unknown> {
    const parts: unknown[] = []; let run: Record<string, unknown> | null = null;    // 07 §4: a spread is a function source of Solid's merge, between runs of named props
    for (const a of m.attrs) {
      if (a.name === "...") { run = null; parts.push(() => this.ev(a.e, scope)); continue; }
      if (!run) { run = {}; parts.push(run); }
      Object.defineProperty(run, a.name, a.e.k === "lit" ? { enumerable: true, value: a.e.v } : { enumerable: true, get: () => this.ev(a.e, scope) });   // a literal is the value it is, as JSX keeps it (RG-4c: what was given is read off the prop)
    }
    if (kids) parts.push(kids);
    return parts.length === 0 ? {} : parts.length === 1 ? (typeof parts[0] === "function" ? (merge as any)(parts[0]) : parts[0] as Record<string, unknown>) : (merge as (...xs: unknown[]) => Record<string, unknown>)(...parts);
  }
  private node(m: Markup, scope: Scope, inEl = false): unknown {
    const self = this;
    switch (m.k) {
      case "text": return R.createTextNode(m.s);
      case "style": return "";                                                            // CSS-4: removed from the view
      case "read": { const view = !!given(m.e, scope.given)?.held || (m.e.k === "use" && this.viewCtxNames.has(scope.lookup(m.e.name) as object)); const kids = given(m.e, scope.given)?.held === "children"; const g = () => { const v = this.ev(m.e, scope); return isView(v) || (view && v === undefined) || (kids && (v == null || typeof v === "boolean" || Array.isArray(v))) ? v : fmt(v); }; (g as { $read?: boolean }).$read = true; return g; }   // RG-4c: a view that was not given shows nothing; a component's children are a view whoever gave them (the compiled module's `kids`: a list that holds nothing, a portal's place, is one);   // a view value (children) is inserted as structure
      case "el": {
        if (m.tag === "") return this.fragment(m.children, scope, inEl);     // `<>…</>`
        { const u = usedIn(m.tag); if (u !== undefined) { const g = () => { const b = this.provision(u, scope), v = b.k === "const" ? b.value : (b as { get: () => unknown }).get(); return typeof v === "function" ? R.createComponent(v as never, this.props(m, scope)) : v == null ? "" : isView(v) ? v : fmt(v); }; (g as { $read?: boolean }).$read = true; return g; } }   // RG-4c: `<use.item … />`, the view a context holds, applied
        const n = shownIn(m.tag), given = n && scope.lookup(n[0]);
        if (given?.k === "const" && typeof given.value === "object" && given.value) {   // RG-4c: the view it was given, applied; plain content, as it is
          const g = () => { const v = (given.value as Record<string, any>)[n![1]]; return typeof v === "function" ? R.createComponent(v, this.props(m, scope)) : v == null ? "" : isView(v) ? v : fmt(v); }; (g as { $read?: boolean }).$read = true; return g;
        }
        if (/^[A-Z]/.test(m.tag)) {
          const b = scope.lookup(m.tag); if (!b || b.k !== "comp") throw new Error(`unknown component ${m.tag}`);
          const comp = b.decl, home = b.home;
          const kids: Record<string, unknown> = {}, takes = this.shown.get(comp)?.get("children"), content = m.children.filter(c => c.k !== "mview");   // RG-4c
          const fn = (params: string[], decls: Decl[], body: Markup[]) => (p: unknown) => { const s2 = new Scope(scope); for (const x of params) s2.vars.set(x, { k: "const", value: p }); return this.region(decls, body, s2); };
          for (const c of m.children) if (c.k === "mview" && c.prop) kids[c.prop] = fn(c.params, c.decls, c.body);
          const view = m.children.find(c => c.k === "mview" && !c.prop);
          if (takes || content.some(c => c.k !== "text" || c.s.trim())) Object.defineProperty(kids, "children", takes ? { enumerable: true, value: view?.k === "mview" ? fn(view.params, view.decls, view.body) : content.some(c => c.k !== "text" || c.s.trim()) ? fn([], [], content) : undefined } : !content.some(c => c.k !== "text" || c.s.trim()) ? { enumerable: true, value: undefined } : { enumerable: true, get: () => content.length === 1 && content[0].k === "read" && (content[0].e.k === "fn" || !placed(content[0].e)) ? (this.node(content[0], scope, true) as () => unknown)()   /* the value it is, read where it is read (the compiled module's getter): what it gives on is asked there, and `??` sees what was not given */ : slot(() => this.region([], content, new Scope(scope))) });   // RG-4c: content is a block of the caller's names, made and owned where it is shown; one `{e}` that asks nothing of its place is the value it is   // plain content, where a view is taken, is one that asks nothing
          const props = this.props(m, scope, kids);
          return R.createComponent((p: any) => { const s2 = new Scope(home); s2.vars.set(comp.props, { k: "const", value: p }); s2.givens.set(comp.props, { props: { less: [], views: this.views.get(comp) ?? new Set() } }); return this.region(comp.decls, comp.view, s2); }, props);
        }
        const el = R.createElement(m.tag);
        for (const a of m.attrs) { if (a.name === "...") { R.effect(() => this.ev(a.e, scope), (v: any) => { for (const k of v && typeof v === "object" ? Object.keys(v) : []) R.setProp(el, k, v[k]); });
            { const h = untrack(() => { this.imperative++; try { return (this.ev(a.e, scope) as any)?.ref; } finally { this.imperative--; } }); runRefCallback(() => { for (const g of [h].flat(Infinity as 1)) if (typeof g === "function") g(el); }); }   // a `ref` a spread gives, as Solid's spread()
            continue; } if (a.name === "ref") { const h = untrack(() => { this.imperative++; try { return this.ev(a.e, scope); } finally { this.imperative--; } }); runRefCallback(() => { for (const g of [h].flat(Infinity as 1)) if (typeof g === "function") g(el); }); continue; }   // 07 §4: Solid's ref(), called once as the element is made
          if (/^on[A-Z:]/.test(a.name)) { const h = untrack(() => { this.imperative++; try { return this.ev(a.e, scope); } finally { this.imperative--; } }); R.setProp(el, a.name, h); } else R.effect(() => this.ev(a.e, scope), v => { R.setProp(el, a.name, v); }); }   // 07 §5: a handler is an imperative closure
        for (const item of (untrack(() => this.fragment(m.children, scope, true)) as unknown[]).flat(Infinity)) { const marker = R.createTextNode(""); R.insertNode(el, marker); R.insert(el, item as never, marker); }
        return el;
      }
      case "mif": {
        const narrowed = m.c.k === "id" && !given(m.c, scope.given)?.view ? m.c.name : null;   // what is bound is known from the text: nothing is read while the `if` is made
        return R.createComponent(Show as any, {
          get when() { return self.asks(m.c, scope, true) ?? self.ev(m.c, scope); },
          get fallback() { const s2 = new Scope(scope); return self.region(m.fDecls, m.f, s2); },
          children: (item: () => unknown) => { const s2 = new Scope(scope); if (narrowed) s2.vars.set(narrowed, { k: "memo", get: item }); return self.region(m.tDecls, m.t, s2); },
        });
      }
      case "mfor": {
        return R.createComponent(For as any, {
          get each() { return self.ev(m.xs, scope); },
          children: (item: unknown) => { const s2 = new Scope(scope); s2.vars.set(m.name, { k: "const", value: item }); return self.region(m.decls, m.body, s2); },
        });
      }
      case "portal": {
        const self2 = this; if (m.to) void untrack(() => this.ev(m.to!, scope));
        return R.createComponent(this.Portal as any, { get children() { const s2 = new Scope(scope); return self2.region(m.decls, m.body, s2); } });
      }
      case "loading": {
        const props: Record<string, unknown> = {
          get fallback() { return self.fragment(m.fallback, scope); },
          get children() { const s2 = new Scope(scope); return self.region(m.decls, m.body, s2); },
        };
        if (m.on) Object.defineProperty(props, "on", { enumerable: true, get: () => this.ev(m.on!, scope) });
        return R.createComponent(Loading as any, props);
      }
      case "errored": {
        const classes = this.classValues(m.classes, scope);
        const view = (err: () => unknown) => { const s2 = new Scope(scope); if (m.errName) s2.vars.set(m.errName, { k: "memo", get: err }); return self.fragment(m.fallback, s2); };
        const out = R.createComponent(Errored as any, {
          fallback: (err: () => unknown) => {
            if (!classes) return view(err);
            const ok = createMemo(() => isA(err(), classes)); if (!ok()) throw err(); return view(err);   // R-f-4: another class passes to the boundary above, thrown from the fallback (DV-7, fixed in solidjs/solid#4277, had a memo around the boundary throw it)
          },
          get children() { const s2 = new Scope(scope); return self.region(m.decls, m.body, s2); },
        });
        return out;
      }
    }
  }
}

const raw = (x: any) => (x && typeof x === "object" && x[$TARGET]) ? x[$TARGET].v : x;
const BIN: Record<string, (a: any, b: any) => unknown> = {
  "+": (a, b) => a + b, "-": (a, b) => a - b, "*": (a, b) => a * b, "/": (a, b) => a / b, "%": (a, b) => a % b,
  "==": (a, b) => raw(a) === raw(b), "!=": (a, b) => raw(a) !== raw(b),   // identity through a store is the raw object's (ST-2 keeps identity; Solid wraps)
  "<": (a, b) => a < b, ">": (a, b) => a > b, "<=": (a, b) => a <= b, ">=": (a, b) => a >= b,
};
const BUILTINS: Record<string, unknown> = {
  len: (x: unknown) => (Array.isArray(x) || typeof x === "string") ? x.length : (typeof x === "object" && x) ? Object.keys(x).length : 0,
  str: (x: unknown) => fmt(x),
  map: (xs: unknown[], f: (x: unknown, i: number) => unknown) => xs.map(f),
  filter: (xs: unknown[], f: (x: unknown) => unknown) => xs.filter(f),
  sum: (xs: number[]) => xs.reduce((a, b) => a + b, 0),
  fail: (msg: string) => { throw Object.assign(new Error(msg), { panic: true }); },   // R-f-3: a JS throw — a panic, not in the failure row
  every: (xs: unknown[], f: (x: unknown) => unknown) => xs.every(f),
  fetch: (key: string) => key,
};
export { flush, NotReadyError, resetErrorHalt };
export function resetScopes() { Scope.all = []; }

/** RG-4c: the question "was a view given" being asked (the compiled module's `__rt.ask`, `__rt.slot`). */
const ASK: { on: { owner: unknown } | null } = ((globalThis as any)[Symbol.for("rx.ask")] ??= { on: null });
function slot(make: () => unknown): unknown { const a = ASK.on; if (!a) return make(); if (getOwner() === a.owner) return make; ASK.on = null; try { return make(); } finally { ASK.on = a; } }
/** Whether an expression asks something of the place it is evaluated at: a `use`, an `await` (not in a closure, which is a value). */
function placed(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  if (Array.isArray(e)) return e.some(placed);
  const o = e as { k?: string };
  return o.k === "use" || o.k === "await" || Object.values(e).some(placed);
}
