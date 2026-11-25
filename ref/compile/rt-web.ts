// The browser runtime (10-server SV-3): the `__rt` API of ref/compile/rt.ts over solid-js's DOM build, so a compiled
// program can mount on a page — or hydrate one the server runtime (rt-server.ts) streamed. Views are JSX that Solid's
// compiler lowers (compile/jsx.ts, generate "dom", hydratable); what remains here is the reactive lowering, which must
// create the same owners in the same order as rt-server.ts so each takes the same hydration id on both sides.
import { primsSolid } from "./prims-solid.ts";
import { Portal as WebPortal } from "@solidjs/web";
import { getObserver, DEV } from "solid-js";
import {
  createSignal, createMemo, createEffect, createOptimistic, createOptimisticStore, createStore, createProjection, createDeferred, createErrorBoundary, createContext,
  Show, For, Loading, Errored, createComponent,
  flush, untrack, latest, isPending, action, refresh, affects, until, onSettled, onFlush, onCleanup, NotReadyError, getOwner, isDisposed, runWithOwner, createOwner, sharedConfig, omit, reconcile, createRoot,
} from "solid-js";
import { getContext, setContext, $TARGET } from "@solidjs/signals";
import { hydrate, render } from "@solidjs/web";
import { topOwner } from "./solid-internals.ts";

// 05 H-9 / Solid D-23: `isPending(fn)` judges the reads fn makes, never its return value, so `pending? x` over a structured
// value (a store, a keyed projection) reads its keys — Solid's "whole-store questions are asked through reads"
const readWhole = (v: unknown) => { if (v !== null && typeof v === "object") Reflect.ownKeys(v); return v; };
/** `latest x` (R-12) of a store is its whole value, read inside `latest` and handed out as a snapshot: a later read of a
 *  field outside `latest` would be a tracked read of the store (found by desk9-rx-7: `len(latest rows)` held a `loading on`). */
/** A store's whole value, copied by reading through the store (so a guess still in flight shows, as R-12 asks of
 *  `latest`); Solid's `deep(v)` serves the landed frame and would drop the guess (found by desk9-rx-7). */
const readCopy = (v: unknown): unknown => v === null || typeof v !== "object" ? v : Array.isArray(v) ? v.map(readCopy) : Object.fromEntries(Object.keys(v).map(k => [k, readCopy((v as any)[k])]));
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
const latestWhole = (v: unknown) => v !== null && typeof v === "object" && (v as any)[$TARGET] !== undefined ? readCopy(v) : v;
/** EF-2: effect inputs compare as values: arrays and plain objects (a store's snapshot) by their contents. */
const sameInput = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  const pa = Object.getPrototypeOf(a), plain = (p: unknown) => p === Object.prototype || p === null || p === Array.prototype;
  if (pa !== Object.getPrototypeOf(b) || !plain(pa)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && sameInput((a as any)[k], (b as any)[k]));
};
export { flush };
export type Acc = () => unknown;
export type Writer = { set: (v: unknown) => void; path: (keys: (string | number)[], v: unknown) => void; guess: (v: unknown, keys?: (string | number)[]) => void };
export type Entry = { get?: Acc; w?: Writer; value?: unknown };
/** A signal of `init`. `createSignal(f)` of a function is Solid's derived signal, so a source that begins as a function (a
 *  value like any other) is a signal of a box: a plain signal still, written and held as one is. */
const boxOf = new WeakMap<Acc, Acc>();
const signalOf = (init: unknown): [Acc, (v: unknown) => void] => {
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

// ---------------------------------------------------------------- values
export const ERR = { toString: () => "#error" }; export const PENDING_MARK = { toString: () => "#pending" };
export const fmt = (v: unknown): string => v === ERR ? "#error" : v === PENDING_MARK ? "#pending" : v === undefined ? "undefined" : typeof v === "string" ? v : JSON.stringify(v);
const raw = (x: any) => (x && typeof x === "object" && x[$TARGET]) ? x[$TARGET].v : x;
/** A view: a DOM node, a function (a hole, a control-flow accessor), or an array of views — which compiled JSX mixes with
 *  its static strings. An array of strings alone is a value. */
const isNode = (v: unknown): boolean => typeof v === "function" || (typeof v === "object" && v !== null && "nodeType" in (v as object));
const isView = (v: unknown): boolean => isNode(v) || (Array.isArray(v) && (v.length === 0 || (v.every(x => x == null || typeof x === "string" || isView(x)) && v.some(x => x != null && typeof x !== "string"))));

// ---------------------------------------------------------------- failures (R-f; a copy of ref/src/failure.ts — this file is served alone)
type ErrorClass = ((...args: unknown[]) => Error) & { cls: new (...args: unknown[]) => Error; errorClass: string };
function errorClass(name: string, params: string[], message: (...args: unknown[]) => unknown, id?: string): ErrorClass {
  const C = class extends Error { constructor(...args: unknown[]) { super(""); this.name = name; params.forEach((p, i) => { (this as unknown as Record<string, unknown>)[p] = args[i]; }); this.message = String(untrack(() => message(...args))); if (id) (this as unknown as { $class: string }).$class = id; } };
  Object.defineProperty(C, "name", { value: name }); Object.defineProperty(C, "declared", { value: true });
  const f = ((...args: unknown[]) => new C(...args)) as ErrorClass; f.cls = C; f.errorClass = name; (f as { $class?: string }).$class = id; return f;
}
const PANIC = { panic: true } as const;   // R-f-10: statically discharges nothing; at run time takes whatever reaches it
/** SV-5a: a failure the server sent arrives as a plain `Error` carrying its declaration's identity (`$class`); the first
 *  test against that class gives it back its class. */
/** SV-5a for a JS module's error class (`export error C` in a `.d.rx`), imported as the class itself: its identity is its
 *  declaration, which the compiler writes (`jsClass(C, "people.d.rx#NotFound")`), the same on the server and the client. */
const jsClassIds = new WeakMap<object, string>();
const jsClassById = new Map<string, object>();   // the same, by identity: the class an arriving error is given back
const isA = (err: unknown, classes: unknown[] | undefined): boolean => !classes || classes.includes(PANIC) || classes.some(c => {
  const k = (c as { cls?: unknown })?.cls ?? c; if (typeof k !== "function") return false;
  if (err instanceof (k as new () => unknown)) return true;
  const id = (c as { $class?: string }).$class ?? jsClassIds.get(k);
  const sent = err && typeof err === "object" ? err as { $class?: string; $classes?: string[] } : undefined;
  if (id && sent && (sent.$class === id || sent.$classes?.includes(id))) {
    // given back its own class when this program declares it (a subclass of k), else k: a `Base` boundary catches a `Child`
    const own = sent.$class !== undefined ? jsClassById.get(sent.$class) as { prototype: object } | undefined : undefined;
    Object.setPrototypeOf(err, own && (own === k || own.prototype instanceof (k as new () => unknown)) ? own.prototype : (k as { prototype: object }).prototype);
    return true;
  }
  return false;
});
/** `e catch (x: C) => alt`, reactive: an error boundary around the read whose fallback is the value (Solid: an errored read
 *  reaches the nearest boundary even inside a JS `try`). The fallback is decided when read, so a change of class re-decides it. */
function catchAcc(f: () => unknown, match: (err: unknown) => boolean, alt: (err: unknown) => unknown): () => unknown {
  const acc = untrack(() => createErrorBoundary(() => readWhole(f()), (err: () => unknown) => new Fallback(() => { const e0 = err(); return match(e0) ? alt(e0) : new Forward(e0); })));
  return () => unwrapFallback(acc());
}
/** Imperative scope: an ordinary try. */
function tryCatch(f: () => unknown, match: (err: unknown) => boolean, alt: (err: unknown) => unknown): unknown {
  try { return f(); } catch (err) { if (err instanceof NotReadyError || !match(err)) throw err; return alt(err); }
}
/** `e catch (x: C) => alt` read where it was written. In reactive scope it is `catchAcc`'s boundary. Read with no observer —
 *  a component `fn` called from a handler — it is a snapshot (04 R-8): the committed value, or `alt` on a matching failure
 *  (R-f-7), as `tryCatch`; a fresh boundary there would have no committed value while a question is out (S-catch-snapshot). */
function catchRead(f: () => unknown, match: (err: unknown) => boolean, alt: (err: unknown) => unknown): unknown {
  return getObserver() ? catchAcc(f, match, alt)() : tryCatch(f, match, alt);
}
class Fallback { get: () => unknown; constructor(g: () => unknown) { this.get = g; } }
function unwrapFallback(v0: unknown): unknown { let v = v0; if (v instanceof Fallback) v = v.get(); if (v instanceof Forward) throw (v as Forward).err; return v; }
const NO_PROVISION: Entry = {};
class Forward { err: unknown; constructor(e: unknown) { this.err = e; } }

// ---------------------------------------------------------------- the wire (12 SF-6; a copy of ref/src/failure.ts's)
function wireCopy(v: unknown, where: string, fail: (msg: string) => never): unknown {
  if (v === null || v === undefined || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.map((x, i) => wireCopy(x, `${where}[${i}]`, fail));
  if (typeof v === "object") { const proto = Object.getPrototypeOf(v); if (proto === Object.prototype || proto === null) { const o: Record<string, unknown> = {}; for (const k of Object.keys(v as object)) o[k] = wireCopy((v as Record<string, unknown>)[k], `${where}.${k}`, fail); return o; } }
  return fail(`${where} is ${typeof v === "function" ? "a function" : `an instance of ${(v as object).constructor?.name ?? "a class"}`}, which the wire cannot carry: send data`);
}
const wireFailure = (err: unknown): unknown => err instanceof Error && (err.constructor as { declared?: boolean }).declared ? err : new Error("Internal Server Error");

// ---------------------------------------------------------------- flights (the scenario harness's async)
/** A controllable flight: an async iterable (a stream — each resolve is a landing) that actions await through `first`. */
export class Flight {
  key: string; first: Promise<unknown>; private settleFirst!: (v: unknown) => void; private rejectFirst!: (e: unknown) => void;
  private queue: { v?: unknown; e?: unknown }[] = []; private waiters: ((x: { v?: unknown; e?: unknown }) => void)[] = []; private started = false;
  constructor(key: string) { this.key = key; this.first = new Promise((r, j) => { this.settleFirst = r; this.rejectFirst = j; }); this.first.catch(() => {}); }
  private push(x: { v?: unknown; e?: unknown }) { const w = this.waiters.shift(); if (w) w(x); else this.queue.push(x); }
  resolve(v: unknown) { if (!this.started) { this.started = true; this.settleFirst(v); } this.push({ v }); }
  reject(e: unknown) { if (!this.started) { this.started = true; this.rejectFirst(e); } this.push({ e }); }
  [Symbol.asyncIterator]() {
    const next = (): Promise<IteratorResult<unknown>> => new Promise((res, rej) => { const take = (x: { v?: unknown; e?: unknown }) => { if ("e" in x) rej(x.e); else res({ value: x.v, done: false }); }; const q = this.queue.shift(); if (q) take(q); else this.waiters.push(take); });
    return { next, return: async () => ({ value: undefined, done: true as const }) };
  }
}

// ---------------------------------------------------------------- one app instance
/** MO-10i: a copy of what a draft holds: arrays, plain objects, Maps and Sets are copied through — what a store or a
 *  draft library hands out as live parts of its state; anything else (a primitive, a function, a Date, an instance of a
 *  class) is the value itself. A value met twice is copied once, so a cycle ends. */
function copyOf(v: any, seen: Map<object, unknown>): unknown {
  if (v === null || typeof v !== "object") return v;
  const had = seen.get(v); if (had !== undefined) return had;
  if (Array.isArray(v)) { const out: unknown[] = []; seen.set(v, out); for (let i = 0; i < v.length; i++) out[i] = copyOf(v[i], seen); return out; }
  if (v instanceof Map) { const out = new Map<unknown, unknown>(); seen.set(v, out); for (const [k, x] of v) out.set(copyOf(k, seen), copyOf(x, seen)); return out; }
  if (v instanceof Set) { const out = new Set<unknown>(); seen.set(v, out); for (const x of v) out.add(copyOf(x, seen)); return out; }
  // an iterator over a draft (`d.items.values()`, `d.map.entries()`) would hand out live parts as it is read: it is run
  // to its end now, and what is kept is an iterator over copies
  if (typeof v.next === "function" && typeof v[Symbol.iterator] === "function") { const xs: unknown[] = []; for (const x of v as Iterable<unknown>) xs.push(copyOf(x, seen)); return xs[Symbol.iterator](); }
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return v;
  const out: Record<string, unknown> = {}; seen.set(v, out); for (const k of Object.keys(v)) out[k] = copyOf(v[k], seen); return out;
}
/** MO-10i (2026-11-22): what a JS fn is lent of a draft: a copy — and in a development build (Solid's `DEV`) one that
 *  refuses to be changed, saying why. A change made to it would be made to the copy, and lost without a word. */
function lent(v: unknown, to: string): unknown {
  if (!DEV || v === null || typeof v !== "object") return v;
  const refuse = (): never => { throw new Error(`${to}(…) changed what it was given: a copy of a draft, so the change would be lost. If ${to} is meant to change the draft in place, declare that parameter \`draft\` in its .d.rx (\`export fn ${to}(draft list: …)\`), and it is given the draft itself; if it needs a value of its own to change, pass one (\`${to}([...d.items])\`). (MO-10i)`); };
  const seen = new WeakMap<object, unknown>();
  const wrap = (x: any): any => {
    if (x === null || typeof x !== "object") return x;
    const proto = Object.getPrototypeOf(x);
    if (!Array.isArray(x) && proto !== Object.prototype && proto !== null) return x;   // a Map, a Set, an iterator, an instance of a class: itself
    let p = seen.get(x); if (p) return p;
    p = new Proxy(x, { get: (t, k, r) => wrap(Reflect.get(t, k, r)), set: refuse, deleteProperty: refuse, defineProperty: refuse, setPrototypeOf: refuse });
    seen.set(x, p); return p;
  };
  return wrap(v);
}
/** 06 ST-4d, where only a run can know it (2026-11-24): in a development build (Solid's `DEV`), the rows a keyed list is
 *  given are read for two with one key, and the list is named on the console — once for a list and a key. The checker
 *  refuses rows written out with one key (`DUPLICATE_KEY`, bin S); a key a click or an answer computes is the data's, and
 *  Solid's own development build says nothing of it: the list then shows one row's state for both, or drops one.
 *  Reported, not refused: the program goes on as its production build does (a keyed answer from a backend is not the
 *  program's to make unique), and the report is the one place it is said. */
const reportedKeys = new Set<string>();
function oneKeyEach(name: string, key: string | undefined, rows: unknown): void {
  if (!DEV || key === undefined || !Array.isArray(rows)) return;
  const seen = new Set<unknown>();
  for (const row of rows) {
    if (row === null || typeof row !== "object") continue;
    const k = (row as Record<string, unknown>)[key]; if (k === undefined || k === null) continue;
    if (!seen.has(k)) { seen.add(k); continue; }
    const id = `${name}\0${key}\0${String(k)}`; if (reportedKeys.has(id)) return; reportedKeys.add(id);
    console.error(`DUPLICATE_KEY [ST-4d] ${name} is keyed by ${key}, and two of the rows it was given have ${key}: ${JSON.stringify(k)} — a key names one row: rows with one key share one identity, so one's state shows for both, or one is dropped. These keys were computed as the program ran (the checker refuses rows written out with one key): give each row its own key where the rows are made. (Reported in a development build only.)`);
    return;
  }
}
/** MO-8c, CP-4c: a development build's word, once an import, on a call of `./api` that nothing answers — the app was given no `api`. */
const unanswered = new Set<string>();
function noApi(name: string) {
  if (unanswered.has(name)) return; unanswered.add(name);
  console.error(`[reactivescript] ${name}(…), imported from "./api", will never answer: "./api" is the app's injected API, not a file (a ./api.js or ./api.ts beside the module is not read), and this app was given none. Give it one, createApp({ api: { ${name} } }) (a whole module: import * as api from "./api.js"; createApp({ api })), or import a module of your own by another spelling, "./api.js" for one.`);
}
function makeApp(opts: { root: any; api?: Record<string, (...a: any[]) => unknown>; conformance?: boolean }) {
  const flights = new Map<string, Flight>();
  const lastKey = new Map<string, string>();
  const truthOf = new Map<Acc, Acc>();                                  // an optimistic signal-form source: its guess layer -> its question
  const registry = new Map<string, Entry[]>();
  const contexts = new Map<string, ReturnType<typeof createContext<Entry | undefined>>>();
  const storeAccs = new WeakSet<object>();
  const modules = new Map<unknown, Record<string, unknown>>();
  // An equation's hoisted awaits, re-asked with it by `refresh`. They are emitted just before the equation and claimed
  // by its accessor when it registers, so a refresh reaches only its own instance's (never a disposed mount's).
  const hoistedBy = new Map<string, Acc[]>();
  const hoistedOf = new WeakMap<Acc, Acc[]>();
  const log: string[] = [];
  let currentEq: string | null = null; let serverSeq = 0; let classSeq = 0;
  const jsErrors = new Map<string, unknown>();   // MO-8: one class per declared JS error, per app
  type Ctx = { name: string; ctx: ReturnType<typeof createContext<Entry | undefined>>; dflt: (() => unknown) | null; owner: ReturnType<typeof getOwner>; dv: Entry | null };
  // During hydration Solid runs a compute under `subFetch` to learn its inputs, with `fetch` and `Promise` mocked, and keeps
  // the server's answer (SV-3b). A flight asked there is that trace, not a question: it is not registered.
  const tracing = () => { let ran = false; new Promise(() => { ran = true; }); return !ran; };
  const flight = (key: string) => { if (tracing()) return new Flight(key); let f = flights.get(key); if (!f) { f = new Flight(key); flights.set(key, f); } if (currentEq) lastKey.set(currentEq, key); return f; };
  // SF-2b: one request per arguments while it stands: the last computation that asked it takes the answer with it
  const askers = new WeakMap<Flight, number>();
  const asked = (key: string, f: Flight) => {
    askers.set(f, (askers.get(f) ?? 0) + 1);
    onCleanup(() => queueMicrotask(() => { const n = askers.get(f)! - 1; askers.set(f, n); if (n === 0 && flights.get(key) === f) flights.delete(key); }));
    return f;
  };
  const named = <T extends (...a: any[]) => unknown>(name: string | null, fn: T): T => (name ? ((...a: unknown[]) => { const was = currentEq; currentEq = name; try { return fn(...a); } finally { currentEq = was; } }) as T : fn);

  const app = {
    root: opts.root,
    log, flights, lastKey, asyncError: null as unknown,
    /** Mount `view` on the root: build it, or (SV-3) adopt the page the server streamed into it. */
    mount(view: () => unknown, hydrating = false) { return hydrating ? hydrate(view as never, app.root) : render(view as never, app.root); },

    // the prelude: what `import pure { … } from "./prelude"` and the built-in names refer to
    B: {
      len: (x: unknown) => (Array.isArray(x) || typeof x === "string") ? x.length : (typeof x === "object" && x) ? Object.keys(x).length : 0,
      str: (x: unknown) => fmt(x),
      map: (xs: unknown[], f: (x: unknown, i: number) => unknown) => xs.map(f),
      filter: (xs: unknown[], f: (x: unknown) => unknown) => xs.filter(f),
      sum: (xs: number[]) => xs.reduce((a, b) => a + b, 0),
      every: (xs: unknown[], f: (x: unknown) => unknown) => xs.every(f),
      indexOf: (xs: unknown[], f: (x: unknown) => unknown) => xs.findIndex(f),
      fail: (msg: string) => { throw Object.assign(new Error(msg), { panic: true }); },   // R-f-3: a JS throw — a panic, not in the failure row
      fetch: (key: string) => opts.api?.fetch ? opts.api.fetch(key) : flight(String(key)),
      log: (...a: unknown[]) => { const said = a.map(fmt); if (opts.conformance) log.push(`log(${said.join(", ")})`); else if (DEV) console.log(...said); },   // CP-4c: a development build prints it; a runner reads `app.log`
    } as Record<string, any>,
    /** `import pure { f } from "./api"`: every function is a flight keyed by its name and formatted arguments. */
    /** MO-8: a class `api.d.rx` declares as an error: the real module's, or (in the harness) a stand-in `C(message)`. */
    jsError: (name: string) => jsErrors.get(name) ?? (jsErrors.set(name, (opts.api?.[name] as unknown) ?? errorClass(name, ["message"], (m?: unknown) => m ?? name, `${name}#${classSeq++}`)), jsErrors.get(name)),
    api: (name: string) => opts.api ? (opts.api[name] ?? (() => { throw new Error(`./api has no ${name}`); })) : (...a: unknown[]) => { if (DEV && !opts.conformance) noApi(name); return flight(`${name}:${a.map(fmt).join(",")}`); },
    /** MO-10: the scenario prelude's `./prims` — Solid primitives, as a library writes them (`ref/compile/prims-solid.ts`). */
    prim: (name: string) => primsSolid({ createSignal: createSignal as any, createMemo: createMemo as any })[name] ?? (() => { throw new Error(`./prims has no ${name}`); }),

    // ---- the scenario harness's view of names (handler rows reach any live binding by name) ----
    // (only a conformance app has that view: the table keeps every binding of every instance, so an app has none)
    reg(name: string, e: Entry) {
      if (opts.conformance) { let l = registry.get(name); if (!l) registry.set(name, (l = [])); l.push(e); }
      const h = hoistedBy.get(name); if (h) { if (e.get) hoistedOf.set(e.get, h); hoistedBy.delete(name); }
    },
    /** SV-5a: a JS module's error class, declared in its `.d.rx`: `id` is that declaration (as rt-server.ts). */
    // the fields an error class's declaration names are the server's to choose (SV-5a): nothing to do with them here
    jsClass<T>(C: T, id: string, _fields?: string[]): T { if (!jsClassIds.has(C as object)) { jsClassIds.set(C as object, id); if (!jsClassById.has(id)) jsClassById.set(id, C as object); } return C; },
    lookup(name: string): Entry { const l = registry.get(name); if (!l?.length) throw new Error(`unbound ${name}`); for (let i = l.length - 1; i >= 0; i--) if (l[i].w) return l[i]; return l[l.length - 1]; },
    dget(name: string, live = false, own?: unknown) { if (own !== undefined && !registry.get(name)?.length) return own; const e = app.lookup(name); return e.get ? (live ? e.get() : app.snapshot(e.get)) : e.value; },   // live: inside a probe (R-12), the read itself
    dset(name: string, keys: (string | number)[], v: unknown, guess = false) { const w = app.lookup(name).w; if (!w) throw new Error(`W-1: write to non-source ${name}`); if (guess) w.guess(v, keys); else if (keys.length) w.path(keys, v); else w.set(v); },

    // ---- declarations ----
    /** `source x := e`: atomic → a signal; structured → a store behind a signal slot, so the root can be replaced (ST-1, ST-2a). */
    /** With a guess written to it (AC-3), the writable is the truth and an optimistic layer derives from it: plain writes
     *  go to the truth, guesses to the layer, and each guess ends when its action's hold commits, showing the truth then. */
    /** ST-4a: `source xs key id := …` — a new value written to it is reconciled by its key: a row whose key is kept
     *  keeps its identity (and what is declared in its row's region), wherever the new list puts it. */
    source(name: string, init: unknown, guessed = false, key?: string): [Acc, Writer] {
      oneKeyEach(name, key, init);
      if (typeof init === "object" && init !== null) {
        const [store, setStore] = createStore(init as any); rooted(store as object); if (key === undefined) byPosition.add(store as object); const [get, set] = createSignal<unknown>(store);
        const w: Writer = {
          // (ST-4d in development: the rows an updater answers, or leaves in its draft, and the rows a write gives)
          set: rootSet(store, set as never,
            v => { oneKeyEach(name, key, v); setStore(key !== undefined ? reconcile(v as any, key) as any : () => v as any); },
            f => setStore((DEV && key !== undefined ? (d: unknown) => { const r = f(d); oneKeyEach(name, key, r === undefined ? d : r); return r; } : f) as any)),
          path: pathWrite(setStore),
          guess: () => { throw new Error("a guess on a := source that the compiler did not mark as guessed"); },
        };
        if (guessed) {                                                    // createOptimisticStore(() => truth) over createStore(v)
          const [view, setView] = (createOptimisticStore as any)(() => get(), Array.isArray(init) ? [] : {}); rooted(view); if (key === undefined) byPosition.add(view);
          const acc = () => view; storeAccs.add(acc);
          return [acc, { ...w, guess: guessInto(setView) }];
        }
        return [get, w];
      }
      const [get, set] = signalOf(init);
      if (guessed) {                                                      // createOptimistic(() => truth()) over createSignal(v)
        const [view, setGuess] = createOptimistic(() => get());
        return [view as Acc, { set: set as (v: unknown) => void, path: () => { throw new Error("a path write to an atomic source"); }, guess: setGuess as any }];
      }
      return [get, { set: set as (v: unknown) => void, path: () => { throw new Error("a path write to an atomic source"); }, guess: () => { throw new Error("a guess on a := source that the compiler did not mark as guessed"); } }];
    },
    /** `source x = e` (ST-5): createSignal(fn); with a guess written to it, a createOptimistic layer over that truth (AC-3);
     *  written or probed by path, createStore(fn, {}) whose derive writes its draft. */
    question(name: string, compute: (prev: unknown) => unknown, opts: { loadingValue?: unknown } | undefined, mode: { optimistic: boolean; structured: boolean; derived?: boolean; record?: boolean; plain?: boolean }, key?: string): [Acc, Writer] {
      const fn = named(name, compute);
      const land = (draft: any, v: unknown) => { oneKeyEach(name, key, v); return landDraft(draft, v, key); };   // ST-4d in development: a keyed answer's rows
      const derive = (draft: any) => { const r = fn(draft); if (r instanceof Flight || r instanceof Promise) return (async () => land(draft, r instanceof Flight ? await r.first : await r))(); return land(draft, r); };
      const seed = () => key && !mode.record ? [] : {};
      if (mode.optimistic && mode.structured && mode.plain && !mode.derived) {   // AC-3 with plain writes too: createOptimisticStore(() => truth) over createStore(fn) — writes go to the truth, guesses to the layer
        const [truth, setTruth] = (createStore as any)(derive, seed(), key ? { key } : undefined); rooted(truth);
        const tacc = () => truth; storeAccs.add(tacc);
        const [view, setView] = (createOptimisticStore as any)(() => truth, seed(), key ? { key } : undefined); rooted(view);
        const get = () => view; storeAccs.add(get); truthOf.set(get, tacc);   // AC-4: `refresh x` re-asks the truth
        return [get, { set: v => setTruth((d: any) => typeof v === "function" ? (v as (x: unknown) => unknown)(d) : v), path: pathWrite(setTruth), guess: guessInto(setView) }];
      }
      if (mode.optimistic && mode.structured) {                        // AC-3 path targets: createOptimisticStore(fn, seed) — the derive writes its draft; the setter guesses per key
        const [store, setStore] = (createOptimisticStore as any)(derive, seed(), key ? { key } : undefined); rooted(store);
        const get = () => store; storeAccs.add(get);
        const plain = () => { throw new Error("a plain write to an equation"); };
        return [get, { set: plain, path: plain, guess: guessInto(setStore) }];
      }
      if (mode.optimistic && mode.derived) {                             // AC-3 over an equation: createOptimistic(fn), whose setter only guesses
        const plain = () => { throw new Error("a plain write to an equation"); };
        const [get, setGuess] = createOptimistic(fn as any, opts as any);
        return [get as Acc, { set: plain, path: plain, guess: setGuess as any }];
      }
      if (mode.optimistic) {
        const [truth, setTruth] = createSignal(fn as any, opts as any);
        const [get, setGuess] = createOptimistic(() => truth());
        truthOf.set(get as Acc, truth as Acc);                            // AC-4: `refresh x` re-asks the truth, not the guess layer over it
        return [get, { set: setTruth as any, path: () => { throw new Error("optimistic path writes are not lowered yet"); }, guess: setGuess as any }];
      }
      if (mode.structured) {
        const [store, setStore] = (createStore as any)(async (draft: Record<string, unknown>) => { const r = fn(draft); const v = r instanceof Flight ? await r.first : await r; if (v && typeof v === "object") { for (const k of Object.keys(draft)) if (!(k in (v as object))) delete draft[k]; Object.assign(draft, v); } }, {}); rooted(store); rooted(store);
        const get = () => store; storeAccs.add(get);
        return [get, { set: () => { throw new Error("a root write to a derived store is not lowered yet"); }, path: (keys, v) => setStore((d: any) => { let o = d; for (const k of keys.slice(0, -1)) o = o[k]; const last = keys[keys.length - 1]; o[last] = typeof v === "function" ? (v as (x: unknown) => unknown)(o[last]) : v; }), guess: () => { throw new Error("optimistic over a structured question source is not lowered yet"); } }];
      }
      const [get, set] = createSignal(fn as any, opts as any);
      return [get, { set: set as any, path: () => { throw new Error("a path write to an atomic source"); }, guess: () => { throw new Error("GUESS_NO_QUESTION"); } }];
    },
    memo: (name: string | null, fn: (prev: unknown) => unknown, opts?: { loadingValue?: unknown }): Acc => createMemo(named(name, fn) as any, opts as any) as Acc,
    /** R-f-5, MO-10f: a JS fn's record or tuple result as a value whose parts are read where they are read — a getter
     *  per part on the result (`refs`: the parts that are accessors, called) — so reading one part reads no other. */
    lazy: (r: any, keys: (string | number)[], refs: (string | number)[]): Acc => { const o: any = keys.length && typeof keys[0] === "number" ? [] : {}; for (const k of keys) Object.defineProperty(o, k, { get: () => refs.includes(k) ? r[k]() : r[k], enumerable: true }); return () => o; },
    /** MO-10i (ruled 2026-11-22): a read of a library's draft is a copy — what `.rx` holds of a draft is never the
     *  library's own object, which it may take back when its callback returns (`copyOf`). */
    copy: (v: unknown): unknown => copyOf(v, new Map()),
    lend: (v: unknown, to: string): unknown => lent(copyOf(v, new Map()), to),
    deferred: (name: string, fn: (prev: unknown) => unknown, opts?: { loadingValue?: unknown }): Acc => createDeferred(named(name, fn) as any, opts as any) as Acc,
    /** `x key k = e` (ST-4): a keyed projection. */
    keyed: (name: string, key: string, fn: () => unknown, record = false): Acc => { const src = createMemo(named(name, () => { const rows = unkeyed(fn()); oneKeyEach(name, key, rows); return rows; }) as any); const p = createProjection(() => (src as Acc)() as any, (record ? {} : []) as any, { key } as any); rooted(p as object); const acc = () => p; truthOf.set(acc, src as Acc); return acc; },   // AC-4: `refresh rows` re-asks the memo under the projection   // the answer is a memo (sync, or the tail await's); the projection reconciles it by key
    /** `x = draft(pre x -> seed) { … }` (ST-3). */
    draft: (seed: unknown, body: (d: any) => void): Acc => { const p = createProjection(body as any, seed as any); rooted(p as object); return () => p; },
    /** `pre y` of another node (C-2): a companion memo carrying (current, previous), owned where `y` is declared. */
    pre: (get: Acc): Acc => { const m = createMemo((st: any) => ({ cur: kept(get()), prev: st ? asItWas(st.cur) : undefined })); return () => (m() as { prev: unknown }).prev; },
    kept,
    firstPaint: (f: () => unknown) => ({ loadingValue: untrack(f) }),
    /** `effect (…) { … }`: compute, then apply; fires on a differing value (EF-2); an input that failed doesn't fire it (EF-2a: the failure shows where it's read), and the next answer does; a store enters whole, as a snapshot. */
    effect(n: number, inputs: () => unknown[], apply: (p: unknown[]) => unknown) {
      let last: unknown[] | null = null, node: ReturnType<typeof getOwner> = null, cleanup: (() => void) | undefined;
      // EF-5: the cleanup runs before the next run of the block and when the region ends. Solid calls what the last
      // apply answered whenever an input is computed again, so a pass that fires nothing hands it back, not run.
      const undo = () => { const c = cleanup; cleanup = undefined; c?.(); };
      const ended = () => { if (!node || isDisposed(node)) undo(); };
      createEffect((() => { node = getOwner(); return inputs().map(v => inputWhole(v)); }) as any, { effect: (vals: unknown[]) => {
        if (!last || last.length !== vals.length || !vals.every((v, i) => sameInput(v, last![i]))) { last = vals; undo(); const r = apply(vals); cleanup = typeof r === "function" ? r as () => void : undefined; }
        return cleanup && ended;
      }, error: () => { last = null; } } as any);
    },
    /** `action f(…) { … }` (AC-1): a generator; a statement-level `await` is a hold-safe yield. */
    action(gen: (...a: unknown[]) => Generator<unknown, unknown, unknown>) {
      const run = action(gen as any) as (...a: unknown[]) => Promise<unknown>;
      return (...a: unknown[]) => { const p = run(...a); p.catch(e => { app.asyncError = e; }); return p; };
    },
    awaited: (v: unknown) => v instanceof Flight ? v.first : v,
    /** `x = await f() catch (e: C) => alt` (R-f-4): a matching rejection lands `alt` as the answer; others reject on. */
    settle: (p: unknown, match: (err: unknown) => boolean, alt: (err: unknown) => unknown) => p && typeof (p as Promise<unknown>).then === "function" ? (p as Promise<unknown>).then(v => v, err => { if (match(err)) return alt(err); throw err; }) : p,
    /** RG-8: Solid's Portal — client-only: the server renders nothing for it, the browser renders it once it has the page. */
    Portal: WebPortal,
    /** CSS-2: a dynamic class with the view's scope class after it. */
    scopedClass: (v: unknown, hash: string) => v == null || v === false || v === "" ? hash : `${v} ${hash}`,
    /** SV-7b: a client question — not asked on the server; the browser asks it once hydrated (Solid's \`ssrSource: "client"\`). */
    clientQuestion: (o?: { loadingValue?: unknown }) => ({ ...(o ?? {}), ssrSource: "client" }),
    /** 12 SF-2: a server fn as the client calls it — every call a flight. Asked in reactive scope it is a question, one
     *  flight per arguments, as a JS import's; in imperative scope each call is a new request. \`fn\` is the module-level
     *  \`"use server"\` function (SF-7a): the body in place, or — once Solid's \`transformDirectives\` has made it a reference
     *  — a request to the server. */
    serverRef(name: string, fn: (...a: unknown[]) => Promise<unknown>) {
      return (...args: unknown[]) => {
        const key = `${name}:${args.map(fmt).join(",")}`;
        const question = !!getObserver();
        if (question && flights.has(key)) return asked(key, flights.get(key)!);
        const fl = question ? flight(key) : new Flight(`${key}#${serverSeq++}`);
        (globalThis as { __rx_app?: unknown }).__rx_app = app;   // the app a body run in place belongs to (it reads it once, at its start)
        let p: Promise<unknown>; try { p = Promise.resolve(fn(...args)); } catch (e) { p = Promise.reject(e); }
        p.then(v => fl.resolve(v), e => fl.reject(e));
        return question ? asked(key, fl) : fl;
      };
    },
    /** SF-6: a server fn's body (a generator, as an action's), driven by promises — not by an action: it is no change of
     *  the client's — behind a wire that copies arguments and result and lets only declared failures through. */
    serverCall(name: string, gen: (...a: unknown[]) => Generator<unknown, unknown, unknown>, args: unknown[]): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const fail = (msg: string): never => { throw new Error(`WIRE_VALUE: ${name}: ${msg}`); };
        let g: Generator<unknown, unknown, unknown>;
        try { g = gen(...args.map((a, i) => wireCopy(a, `argument ${i + 1}`, fail))); } catch (e) { reject(e); return; }
        const step = (input: unknown, thrown: boolean) => {
          const was = currentEq; currentEq = null; let r: IteratorResult<unknown, unknown>;   // the body's flights are not the asking equation's
          try { r = untrack(() => thrown ? g.throw(input) : g.next(input)); } catch (e) { reject(wireFailure(e)); return; } finally { currentEq = was; }
          if (r.done) { try { resolve(wireCopy(r.value, "its result", fail)); } catch (e) { reject(e); } return; }
          Promise.resolve(r.value).then(v => step(v, false), e => step(e, true));
        };
        step(undefined, false);
      });
    },
    hoisted(name: string, get: Acc) { let l = hoistedBy.get(name); if (!l) hoistedBy.set(name, (l = [])); l.push(get); },
    until: (p: () => unknown) => until(p),                                   // AC-6
    onSettled: (f: () => void) => onSettled(f),                             // EF-7
    onFlush: (f: () => void) => onFlush(f),                                 // EF-8
    refresh(name: string, get: Acc) { const key = lastKey.get(name); if (key) flights.delete(key); for (const h of hoistedOf.get(get) ?? []) refresh(h as any); const t = truthOf.get(get) ?? get; refresh((storeAccs.has(t) ? t() : t) as any); },
    affects: (get: Acc) => affects((storeAccs.has(get) ? get() : boxOf.get(get) ?? get) as any),   // a structured source's accessor wraps its store: Solid takes the store (#50), as `refresh` above
    preOr: (v: unknown, init: () => unknown) => v === undefined ? init() : v,

    // ---- modules (09 MO-1): a dependency's factory runs once per app; its exports are shared by every importer ----
    // CP-4b (2026-11-24): a factory the dev server's plugin named (`__rxKey`: the module's path and its text's hash) is
    // keyed by that name. A dev server serves one module under several URLs — a timestamp for each hot update, and Vite 8
    // writes the query of a module it marks `?import` in two orders (`?t=…&import&rx-dep` from an importer whose cached
    // code it patches, `?import&t=…&rx-dep` from one it compiles again) — so the browser evaluates the file twice, and two
    // factories are two instances: a context declared in the module was two contexts, and a page read `no provision`
    // for one the app's entry provides (RG-7b). The same file with the same text is one module; an edited one is another.
    // ---- what a fn answers (09 MO-13i): JavaScript's call of it (`self`) is handed its parts, made once, and no equation
    // over them; `.rx`'s, the accessor it always was, with the parts beside it for a fn that hands them on ----
    result(self: unknown, whole: () => Acc, parts: () => unknown): unknown {
      if (self === JS_CALL) return parts();
      const a = whole(); const o = getOwner(); let made: { v: unknown } | undefined;
      if (!PARTS.has(a)) PARTS.set(a, () => (made ??= { v: runWithOwner(o, parts) }).v);
      return a;
    },
    parts(a: Acc, name: string): any {
      const p = PARTS.get(a); if (p) return p();
      throw new Error(`${name}: its package was compiled by an older version of ReactiveScript, which hands out no parts: build it again (09 MO-13i)`);
    },
    module(key: unknown, factory: (rt: unknown) => Record<string, unknown>) { const k = (typeof key === "function" && (key as { __rxKey?: string }).__rxKey) || key; let m = modules.get(k); if (!m) { m = factory(app); modules.set(k, m); } return m; },
    // ---- context (RG-7) ----
    owner: () => getOwner(),
    /** `context x: T = d` (RG-7): the declaration is the identity; `d`, if any, is evaluated once, owned where it is declared. */
    /** `context x: T = d` (RG-7): the declaration is the identity (a sentinel default: absence is ours to decide); `d` is
     *  evaluated once, owned where it is declared — created now, so it takes its id there on both sides (SV-3). */
    context(name: string, dflt: (() => unknown) | null): Ctx { return { name, ctx: createContext<Entry | undefined>(NO_PROVISION, name), dflt, owner: getOwner(), dv: dflt ? { get: createMemo(dflt as any) as Acc } : null }; },
    provide(c: Ctx, e: Entry) { setContext(c.ctx, e); },
    use(c: Ctx, owner: ReturnType<typeof getOwner>): Entry {
      const e = getContext(c.ctx, owner ?? undefined); if (e && e !== NO_PROVISION) return e;
      if (c.dv) return c.dv;
      throw new Error(`RG-7b: no provision for ${c.name}`);
    },
    useGet(c: Ctx, owner: ReturnType<typeof getOwner>) { const e = app.use(c, owner); return e.get ? e.get() : e.value; },
    runWithOwner,
    /** MO-10a, RG-6a (2026-11-23): a declared JS primitive is called in an owner of its own, under the place it is
     *  written. To that place it is one child, on the server and in the browser, whatever it makes inside — so a
     *  library whose server path makes fewer effects than its browser path (`if (isServer) return …`, before the
     *  `onSettled` the browser runs) no longer moves the hydration keys of everything written after it. Its cleanups
     *  are that owner's, disposed with the region. And it is called outside tracking, as a call that is made once is
     *  (E-9): what the library reads of a `ref` argument while it is being made is a read it means to make once, which
     *  Solid's development build otherwise reports against the component (STRICT_READ_UNTRACKED) — in `.rx` an
     *  element ref is a source, so `createFullscreen(el)` passes a signal where a `.tsx` author passes `() => el`. */
    inst<T>(f: () => T): T { return (getOwner() ? runWithOwner(createOwner(), () => untrack(f)) : untrack(f)) as T; },   // with no owner above there is none to make one under: what needs one (`provide`) says so, as where two copies of Solid are loaded (CP-4a)

    // ---- reads ----
    /** An imperative read sees σ (H-10): a pending value is a value; a snapshot of an error throws it (R-f-7). */
    snapshot(get: Acc) { try { return untrack(get); } catch (e) { if (e instanceof NotReadyError) return PENDING_MARK; throw e; } },
    // ---- failures (R-f) ----
    errorClass: (name: string, params: string[], message: (...args: unknown[]) => unknown) => errorClass(name, params, message, `${name}#${classSeq++}`),   // a declaration's identity: the same on both sides (SV-5a)
    isA, PANIC, catchMemo: catchAcc, tryCatch, catchRead,
    throw: (e: unknown): never => { throw e; },
    eq: (a: unknown, b: unknown) => raw(a) === raw(b),
    untrack, omit, latest: (f: () => unknown) => latest(() => latestWhole(f())), isPending: (f: () => unknown) => isPending(() => readWhole(f())),
    fmt,

    // ---- views: compiled JSX (compile/jsx.ts, generate "dom") does the rest ----
    show: (v: unknown) => isView(v) ? v : fmt(v),
    /** RG-4c: a view a component was given, shown with what it knows. `plain`: plain content is taken as well, shown as it is, and a function of no parameter is a thunk, as JSX has it. */
    view(c: unknown, f: (view: unknown) => unknown, plain?: boolean) { return typeof c === "function" && (!plain || c.length) ? f(c) : app.kids(c); },
    /** `{props.children}`: a component's children — a view, a list of views and strings (what JSX and a JS library pass), or a value to show. */
    kids: (v: unknown) => v == null || typeof v === "boolean" || Array.isArray(v) || isView(v) ? v : fmt(v),
    /** `errored fallback(e: A | B)`: a failure of another class passes to the boundary above (R-f-4) — the fallback hands it out
     *  and a memo throws it there (a rethrow from the fallback itself did not recover until solidjs/solid#4277: ref/oracle/repros/dv7-rethrow.mjs). */
    TypedErrored(props: { classes: unknown[]; fallback: (err: Acc) => unknown; children: unknown }) {
      const classes = props.classes;
      const out = createComponent(Errored as any, {
        fallback: (err: Acc) => {
          const owner = getOwner(); const ok = createMemo(() => isA(err(), classes)); let shown: unknown = null;
          return new Fallback(() => ok() ? (shown ??= runWithOwner(owner, () => props.fallback(err))) : new Forward(err()));
        },
        get children() { return props.children; },
      });
      return createMemo(() => unwrapFallback(typeof out === "function" ? (out as Acc)() : out));
    },
  };
  return app;
}
export type App = ReturnType<typeof makeApp>;
type AppOpts = Parameters<typeof makeApp>[0];
/** MO-13g: the page's app — the first one made in it: the one every JS importer of an `.rx` module is bound to
 *  (`library`, `components`), so a module has one instance in the page however many importers it has, in `.rx` or not. */
let page: App | null = null;
/** The options the page's app was made with, while it is one the runtime made for a JS importer and no `.rx` program
 *  has taken it. */
let madeForJs: AppOpts | null = null;
const pageApp = (): App => page ?? (madeForJs = { root: null }, page = makeApp(madeForJs));
/** An app. The first made in a page is the page's (MO-13g); where the runtime had already made the page's for a JS
 *  importer (a `.tsx` host that used an `.rx` package before the program started), the program's app is that one, so
 *  the two share every module. A second `createApp` is a second app, with instances of its own (09 MO-1b). */
export function createApp(opts: AppOpts): App {
  if (page && madeForJs) { Object.assign(madeForJs, opts); madeForJs = null; page.root = opts?.root; return page; }
  const app = makeApp(opts);
  page ??= app;
  return app;
}

/** A path write `x.a.b := v` as a store setter's mutation. */
// W-6: a path target applies an updater to the path's value (`xs[i].title := t => `${t}!``), as a root write and a guess do
const pathWrite = (setStore: (f: (d: any) => unknown) => void) => (keys: (string | number)[], v: unknown) => setStore((d: any) => { let o = d; for (const k of keys.slice(0, -1)) o = o[k]; const last = keys[keys.length - 1]; o[last] = typeof v === "function" ? (v as (x: unknown) => unknown)(o[last]) : v; });
/** A guess through an optimistic store's setter: per key, or whole — a whole guess is the setter's return, which Solid
 *  diffs shallowly against the view as guesses. */
const guessInto = (setStore: (f: (d: any) => unknown) => void) => (v: unknown, keys: (string | number)[] = []) => setStore((d: any) => { if (keys.length === 0) return typeof v === "function" ? (v as (x: unknown) => unknown)(d) : v; let o = d; for (const k of keys.slice(0, -1)) o = o[k]; const last = keys[keys.length - 1]; o[last] = typeof v === "function" ? (v as (x: unknown) => unknown)(o[last]) : v; });

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

/** SV-5a, a library-cache adapter (`sendErrors(fetchPerson)`): on the server it marks a declared JS error class's
 *  instances safe to send; on the client there is nothing to send, so it is `fn`. */
export function sendErrors<F extends (...a: any[]) => unknown>(fn: F): F { return fn; }
/** MO-13g: on the server, keeps a request's state across its renders; in the browser there is no request. */
export function holdRequest(): () => void { throw new Error("holdRequest() holds the state of a request on the server (MO-13g); in the browser the page's state lasts as the page does, and there is nothing to hold"); }
/** CP-4d: an `.rx` module's components for a JS host (`import pages from "./pages.rx?rx-lib"`; `const { Home } =
 *  components(pages)`): Solid components bound to the page's app (`pageApp`), made on first use, or to the app passed. */
export function components<T extends Record<string, unknown>>(factory: (rt: unknown) => T, app?: App, name?: string): T {
  const made = new Map<string, unknown>();
  // MO-13h (2026-11-23): a module the plugin named (`?rx-lib` writes its path into the call, and on the module for a
  // host that calls `components(pages)` itself) is instantiated in a root of its own, as a package's is: its state is
  // the page's, not the first component's that rendered it, and its ids are the server's wherever that first use is
  const id = name ?? (factory as { __rxName?: string }).__rxName;
  const inst = id === undefined ? factory : rootedBy(factory, id);
  return new Proxy({} as T, { get: (_, k) => typeof k !== "string" ? undefined : made.get(k) ?? (made.set(k, (props: unknown) =>
    (((app ?? pageApp()).module(factory, inst as never) as Record<string, (p: unknown) => unknown>)[k])(props)), made.get(k)) });
}

const moduleSeq = new WeakMap<object, number>();
/** MO-13i: JavaScript's call of a compiled fn, by its `this` (`.rx` calls it with none); and, for an accessor a fn
 *  answered `.rx`, what makes its parts. */
const JS_CALL = {};
const PARTS = new WeakMap<Acc, () => unknown>();
/** A `ref` parameter given by JavaScript: a function is the accessor, anything else the value. */
const accessor = (v: unknown): Acc => typeof v === "function" ? v as Acc : () => v;
/** An export called by JavaScript; `refs`: which of its parameters are `ref`. */
const callExport = (f: (...a: unknown[]) => unknown, a: unknown[], refs: number[] | undefined) => { if (!refs) return f(...a); a = [...a]; for (const i of refs) a[i] = accessor(a[i]); return f.apply(JS_CALL, a); };
/** A module instantiated in a root of its own that no owner holds, its id the module's name (MO-13h). */
function rootedBy<T>(factory: (rt: unknown) => T, name: string | undefined) {
  return (rt: unknown) => {
    const top = topOwner();   // the render's root: its id is the render's (`renderId`)
    const n = moduleSeq.get(rt as object) ?? 0; moduleSeq.set(rt as object, n + 1);
    return runWithOwner(null, () => createRoot(() => factory(rt), { id: (top?.id ?? "") + moduleRootId(name, n) }));
  };
}
/** The id of a module's root: its name, in the letters a hydration key is written with (as rt-server.ts). */
const moduleRootId = (name: string | undefined, n: number) => name === undefined ? `rx${n}_` : `rx_${name.replace(/[^A-Za-z0-9]/g, c => "_" + c.charCodeAt(0).toString(36))}_`;
/** MO-13e: a compiled `.rx` module as a Solid library for JavaScript (a `.tsx` app): each export as a function of the
 *  page's app — a component, a source's or an equation's accessor, a fn, an action, an error class (called, it makes
 *  one; `e instanceof C` holds). The module is instantiated at its first use, in a root of its own that no owner
 *  holds (MO-13h): its state is the page's (09 MO-1b), not the first reader's, and is not disposed with it; the root's
 *  id is the module's name (`name`, as `rx-lib` writes it: `<package>/<module>`), so its nodes have the server's ids
 *  wherever the first use is. An `.rx` program of the same page instantiates the same factory in the same app (`__rx`,
 *  MO-13c): one instance. */
export function library<T extends Record<string, unknown>>(factory: (rt: unknown) => T, name?: string | App, app?: App): T {
  return typeof name === "object" ? primitives(factory, undefined, {}, false, name) : primitives(factory, name, {}, false, app);
}
/** MO-13i: `library`, for a module whose exported fns hand out parts or take `ref` parameters (`refs`, by name).
 *  Its own name, so that a package compiled for this runtime does not link against one that would hand out less. */
export function primitives<T extends Record<string, unknown>>(factory: (rt: unknown) => T, name: string | undefined, refs: Record<string, number[]>, _stateless?: boolean, app?: App): T {
  const made = new Map<string, unknown>();
  const rooted = rootedBy(factory, name);
  const inst = () => (app ?? pageApp()).module(factory, rooted as never) as Record<string, any>;
  return new Proxy({} as T, { get: (_, k) => typeof k !== "string" ? undefined : made.get(k) ?? (made.set(k, Object.defineProperty((...a: unknown[]) => callExport(inst()[k], a, refs[k]), Symbol.hasInstance, { value: (e: unknown) => { const c = inst()[k]?.cls; return typeof c === "function" && e instanceof c; } })), made.get(k)) });
}
