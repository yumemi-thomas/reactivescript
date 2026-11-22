// The server runtime (10-server): the same `__rt` API the compiled modules call (ref/compile/rt.ts), over solid-js 2.0's
// server build. What runs on the server is what the mount needs — equations, source initializers, awaits, the view —
// and nothing an instant after it would (SV-2): effects, actions and handlers do not run. The view renders to HTML
// that `renderToStream` streams, a boundary at a time. Every call mirrors rt-web.ts's (the browser runtime): the same
// solid-js primitives in the same order, so each owner, element and hole takes the id the client will look for (SV-3). A failure of a declared class (R-f-1, MO-8) is marked safe and goes
// to the client as it is; anything else that reaches a boundary — a panic, or a JS rejection of plain `Error` — goes as
// Solid's generic error (SV-5).
import { primsSolid } from "./prims-solid.ts";
import { Portal as WebPortal } from "@solidjs/web";
import { getObserver, DEV } from "solid-js";
import { provideRequestEvent } from "@solidjs/web/storage";
import { Show, For, Loading, Errored, createComponent, createSignal, createMemo, createEffect, createOptimistic, createOptimisticStore, createStore, createProjection, createDeferred, untrack, latest, isPending, deep, NotReadyError, getOwner, runWithOwner, getNextChildId, runInServerComponentScope, omit, createRoot } from "solid-js";
import { escape, renderToStream, markSafeError, generateHydrationScript, getRequestEvent } from "@solidjs/web";
let warnedCopies = false;   // once per process
const warnedFields = new Set<string>();   // SV-5a: a declared field an instance came without, once per class and field
import { $TARGET } from "@solidjs/signals";

// 05 H-9 / Solid D-23: `isPending(fn)` judges the reads fn makes, never its return value, so `pending? x` over a structured
// value (a store, a keyed projection) reads its keys — Solid's "whole-store questions are asked through reads"
const readWhole = (v: unknown) => { if (v !== null && typeof v === "object") Reflect.ownKeys(v); return v; };
/** `latest x` (R-12) of a store is its whole value, read inside `latest` and handed out as a snapshot: a later read of a
 *  field outside `latest` would be a tracked read of the store (found by desk9-rx-7: `len(latest rows)` held a `loading on`). */
const latestWhole = (v: unknown) => v !== null && typeof v === "object" && (v as any)[$TARGET] !== undefined ? deep(v) : v;
export type Acc = () => unknown;
export type Writer = { set: (v: unknown) => void; path: (keys: (string | number)[], v: unknown) => void; guess: (v: unknown, keys?: (string | number)[]) => void };
export type Entry = { get?: Acc; w?: Writer; value?: unknown };
export { generateHydrationScript };

// ---------------------------------------------------------------- values (as rt.ts)
export const ERR = { toString: () => "#error" }; export const PENDING_MARK = { toString: () => "#pending" };
export const fmt = (v: unknown): string => v === ERR ? "#error" : v === PENDING_MARK ? "#pending" : v === undefined ? "undefined" : typeof v === "string" ? v : JSON.stringify(v);
/** A view: an ssr() result, a function (a hole), or an array of views mixed with compiled JSX's static strings. */
const isNode = (v: unknown): boolean => typeof v === "function" || (typeof v === "object" && v !== null && "t" in (v as object));
const isView = (v: unknown): boolean => isNode(v) || (Array.isArray(v) && (v.length === 0 || (v.every(x => x == null || typeof x === "string" || isView(x)) && v.some(x => x != null && typeof x !== "string"))));
/** Take the ids a client-side owner the server has no counterpart for would take (rt-web.ts creates it; the server need not). */
const reserve = (n = 1) => { const o = getOwner() as any; if (o?.id != null) for (let i = 0; i < n; i++) getNextChildId(o); };
const onServer = (what: string) => () => { throw new Error(`SV-2: ${what} does not run on the server`); };

// ---------------------------------------------------------------- failures (R-f; SV-5: a failure is safe to send)
type ErrorClass = ((...args: unknown[]) => Error) & { cls: new (...args: unknown[]) => Error; errorClass: string };
function errorClass(name: string, params: string[], message: (...args: unknown[]) => unknown, id?: string): ErrorClass {
  const C = class extends Error { constructor(...args: unknown[]) { super(""); this.name = name; params.forEach((p, i) => { (this as unknown as Record<string, unknown>)[p] = args[i]; }); this.message = String(untrack(() => message(...args))); if (id) (this as unknown as { $class: string }).$class = id; markSafeError(this); } };
  Object.defineProperty(C, "name", { value: name }); Object.defineProperty(C, "declared", { value: true });
  const f = ((...args: unknown[]) => new C(...args)) as ErrorClass; f.cls = C; f.errorClass = name; (f as { $class?: string }).$class = id; return f;
}
const PANIC = { panic: true } as const;
const isA = (err: unknown, classes: unknown[] | undefined): boolean => !classes || classes.includes(PANIC) || classes.some(c => { const k = (c as { cls?: unknown })?.cls ?? c; return typeof k === "function" && err instanceof (k as new () => unknown); });
/** The server renders once: an errored read throws where it is read, so a catch is an ordinary try around the read. (The
 *  client's is an error boundary: its ids are reserved.) */
function catchAcc(f: () => unknown, match: (err: unknown) => boolean, alt: (err: unknown) => unknown): () => unknown {
  reserve(2);   // a client error boundary takes two ids
  return () => { try { return f(); } catch (err) { if (err instanceof NotReadyError || !match(err)) throw err; return alt(err); } };
}
function tryCatch(f: () => unknown, match: (err: unknown) => boolean, alt: (err: unknown) => unknown): unknown {
  try { return f(); } catch (err) { if (err instanceof NotReadyError || !match(err)) throw err; return alt(err); }
}
/** As the client's: with no observer the read is a snapshot (04 R-8) and the client builds no boundary, so no ids. */
function catchRead(f: () => unknown, match: (err: unknown) => boolean, alt: (err: unknown) => unknown): unknown {
  return getObserver() ? catchAcc(f, match, alt)() : tryCatch(f, match, alt);
}

// ---------------------------------------------------------------- the wire (12 SF-6; a copy of ref/src/failure.ts's)
function wireCopy(v: unknown, where: string, fail: (msg: string) => never): unknown {
  if (v === null || v === undefined || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.map((x, i) => wireCopy(x, `${where}[${i}]`, fail));
  if (typeof v === "object") { const proto = Object.getPrototypeOf(v); if (proto === Object.prototype || proto === null) { const o: Record<string, unknown> = {}; for (const k of Object.keys(v as object)) o[k] = wireCopy((v as Record<string, unknown>)[k], `${where}.${k}`, fail); return o; } }
  return fail(`${where} is ${typeof v === "function" ? "a function" : `an instance of ${(v as object).constructor?.name ?? "a class"}`}, which the wire cannot carry: send data`);
}
const wireFailure = (err: unknown): unknown => err instanceof Error && (err.constructor as { declared?: boolean }).declared ? err : new Error("Internal Server Error");

// ---------------------------------------------------------------- flights (the harness's async)
/** As rt.ts's Flight. A rejection is sent as it is only when its class is declared (SV-5): `errorClass` marks those. */
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

// ---------------------------------------------------------------- one request (SV-4: module state is per request)
type Owner = ReturnType<typeof getOwner>;
type Ctx = { name: string; id: symbol; dflt: (() => unknown) | null; owner: Owner; dv: Entry | null };

/** `request`: the request this app renders (SV-4: one app per request). Libraries that locate a server render by Solid's
 *  request event (`@solidjs/router` reads the page's URL from it) see this one; without it, a placeholder for `/`. */
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
export function createApp(opts: { api?: Record<string, (...a: any[]) => unknown>; request?: Request } = {}) {
  const flights = new Map<string, Flight>();
  const lastKey = new Map<string, string>();
  const registry = new Map<string, Entry[]>();
  const modules = new Map<unknown, Record<string, unknown>>();
  const log: string[] = [];
  const declared: unknown[] = [];
  let currentEq: string | null = null; let serverSeq = 0; let classSeq = 0;
  const jsErrors = new Map<string, unknown>();   // MO-8: one class per declared JS error, per app
  const jsClassIds = new Map<unknown, string>();   // SV-5a: a declared JS error class the program imports, by its declaration (`jsClass`)
  const jsClassFields = new Map<unknown, string[]>();   // SV-5a: the fields its declaration says are sent (`export error C(status)`)
  const flight = (key: string) => { let f = flights.get(key); if (!f) { f = new Flight(key); flights.set(key, f); } if (currentEq) lastKey.set(currentEq, key); return f; };
  const named = <T extends (...a: any[]) => unknown>(name: string | null, fn: T): T => (name ? ((...a: unknown[]) => { const was = currentEq; currentEq = name; try { return fn(...a); } finally { currentEq = was; } }) as T : fn);
  const ro = (get: Acc): [Acc, Writer] => [get, { set: onServer("a write"), path: onServer("a write"), guess: onServer("a write") }];

  const app = {
    log, flights, lastKey, asyncError: null as unknown,
    /** Render `view` as a stream: `write` receives each chunk, `end` the close. */
    /** One request (a request event, as Solid's integrations provide one — a server function called during the render runs
     *  in it, SF-2b). */
    stream(view: () => unknown, sink0: { write: (s: string) => void; end: () => void }) {
      // the shell carries hydration keys; one with markup and none means the compiled templates read another copy of
      // Solid than this runtime renders with (a bundler that inlined one of them): nothing would hydrate. The copy that
      // matters is solid-js's, which holds the render's hydration context: two @solidjs/web over one solid-js still key
      // (runtime/test.mjs renders both ways)
      let first = true;
      const sink = { end: () => sink0.end(), write: (c: string) => { if (first) { first = false; if (!process.env.SV_SCOPE && /<[a-z][^>]*>/i.test(c) && !/\b_hk=/.test(c) && !warnedCopies) { warnedCopies = true; console.warn("[reactivescript] the server's first chunk has markup but no hydration keys, so the client may not be able to hydrate it (markup a page renders on purpose without keys, or keys in a later chunk, would show this too). If hydration fails, check for two copies of Solid: the compiled modules and @reactivescript/runtime may load different copies (solid-js, and with it @solidjs/web) — keep Solid, the runtime and libraries that render all external to the server build, or all bundled together"); } } sink0.write(c); } };
      return provideRequestEvent({ request: opts.request ?? new Request("http://127.0.0.1/"), locals: { [REQUEST_APP]: app } }, () => renderToStream((process.env.SV_SCOPE ? () => runInServerComponentScope(view) : view) as never).pipe(sink as never)); },

    B: {
      len: (x: unknown) => (Array.isArray(x) || typeof x === "string") ? x.length : (typeof x === "object" && x) ? Object.keys(x).length : 0,
      str: (x: unknown) => fmt(x),
      map: (xs: unknown[], f: (x: unknown, i: number) => unknown) => xs.map(f),
      filter: (xs: unknown[], f: (x: unknown) => unknown) => xs.filter(f),
      sum: (xs: number[]) => xs.reduce((a, b) => a + b, 0),
      every: (xs: unknown[], f: (x: unknown) => unknown) => xs.every(f),
      indexOf: (xs: unknown[], f: (x: unknown) => unknown) => xs.findIndex(f),
      fail: (msg: string) => { throw Object.assign(new Error(msg), { panic: true }); },
      fetch: (key: string) => opts.api?.fetch ? opts.api.fetch(key) : flight(String(key)),
      log: (...a: unknown[]) => { log.push(`log(${a.map(fmt).join(", ")})`); },
    } as Record<string, any>,
    /** MO-8: a class a `.d.rx` declares — a failure the server sends as it is (SV-5). */
    jsError(name: string) { if (jsErrors.has(name)) return jsErrors.get(name); const C = (opts.api?.[name] as unknown) ?? errorClass(name, ["message"], (m?: unknown) => m ?? name, `${name}#${classSeq++}`); declared.push(C); jsErrors.set(name, C); return C; },
    /** A JS function's promise: a rejection with a declared class is marked safe to send; any other is redacted (SV-5). */
    api: (name: string) => {
      if (!opts.api) return (...a: unknown[]) => flight(`${name}:${a.map(fmt).join(",")}`);
      const f = opts.api[name] ?? (() => { throw new Error(`./api has no ${name}`); });
      return (...a: unknown[]) => { const r = f(...a); return r && typeof (r as PromiseLike<unknown>).then === "function" ? Promise.resolve(r).catch(e => { if (isA(e, declared)) markSafeError(e); throw e; }) : r; };
    },
    /** MO-10: the scenario prelude's `./prims` — Solid primitives, as a library writes them (`ref/compile/prims-solid.ts`). */
    prim: (name: string) => primsSolid({ createSignal: createSignal as any, createMemo: createMemo as any })[name] ?? (() => { throw new Error(`./prims has no ${name}`); }),

    reg(name: string, e: Entry) { let l = registry.get(name); if (!l) registry.set(name, (l = [])); l.push(e); },
    /** SV-5a: a JS module's error class, declared in its `.d.rx` (`export error C`, or `export error C(status, code?)` to
     *  send those fields too; `code?` may be absent from an instance): `id` is that declaration. */
    jsClass<T>(C: T, id: string, fields?: string[]): T {
      if (!jsClassIds.has(C)) { jsClassIds.set(C, id); if (fields?.length) jsClassFields.set(C, fields); }
      return C;
    },
    /** SV-5a: what is sent for `err`, if it is an instance of a JS error class this app's program declares: a copy of it,
     *  of its class (so a typed boundary and `instanceof` still hold on the server), with its message, its declaration's
     *  identity and the fields its declaration names, marked safe to send. Solid serializes an error with every field it
     *  holds (a library's `cause`, a response's headers, the stack), so the library's own instance is never the one sent.
     *  Undefined when nothing declares its class: it is redacted (SV-5b). */
    markSendable(err: unknown): Error | undefined {
      if (!err || typeof err !== "object") return undefined;
      // the nearest declared class up its prototype chain names it, whatever order the program registered its classes in;
      // the declared classes above that one go with it, so a client boundary typed with a base class matches it too
      // a field by its name, with the class that declares it and whether its row lets it be absent (`code?`); the
      // nearest class's row decides for a field several declare
      const ids: string[] = []; const fields = new Map<string, { by: string; optional: boolean }>();
      for (let p = Object.getPrototypeOf(err); p && p !== Object.prototype; p = Object.getPrototypeOf(p))
        for (const [k, i] of jsClassIds) if ((k as { prototype?: unknown }).prototype === p && !ids.includes(i)) {
          ids.push(i);
          for (const f0 of jsClassFields.get(k) ?? []) { const optional = f0.endsWith("?"); const f = optional ? f0.slice(0, -1) : f0; if (!fields.has(f)) fields.set(f, { by: i, optional }); }
        }
      if (!ids.length) return undefined;
      if ((err as { $class?: string }).$class === ids[0] && SENT.has(err)) return err as Error;   // already the copy
      const e = err as Error & Record<string, unknown>;
      const sent = Object.create(Object.getPrototypeOf(err)) as Error & Record<string, unknown>;
      Object.defineProperty(sent, "message", { value: String(e.message ?? ""), writable: true, configurable: true });
      Object.defineProperty(sent, "name", { value: e.name, writable: true, configurable: true });
      for (const [f, { by, optional }] of fields) {
        if (f === "stack" || f === "cause") continue;
        // its own data property, as the instance read it: the copy's prototype is the class's, where an accessor of
        // that name (`get status()`) would refuse an assignment, or run a setter
        if (f in e) Object.defineProperty(sent, f, { value: e[f], writable: true, enumerable: true, configurable: true });
        // the declaration says every instance has the field and this one does not: the client would read `undefined`
        // where its type says a value. The failure is still sent, as its class; the server says so, once
        else if (!optional && !warnedFields.has(`${by}\0${f}`)) {
          warnedFields.add(`${by}\0${f}`);
          console.warn(`[reactivescript] ${by} declares the field ${f}, but an instance thrown has none: it is sent without it, and the client reads undefined. Set it where the error is made, or declare it optional, \`${f}?\` (SV-5a)`);
        }
      }
      Object.defineProperty(sent, "$class", { value: ids[0], writable: true, enumerable: true, configurable: true });
      if (ids.length > 1) Object.defineProperty(sent, "$classes", { value: ids, writable: true, enumerable: true, configurable: true });
      SENT.add(sent);
      markSafeError(sent);
      return sent;
    },
    dget(name: string) { const e = app.lookup(name); return e.get ? app.snapshot(e.get) : e.value; },
    lookup(name: string): Entry { const l = registry.get(name); if (!l?.length) { if (jsErrors.has(name)) return { value: jsErrors.get(name) }; throw new Error(`unbound ${name}`); } return l[l.length - 1]; },   // a server function's request has its module's error classes, not the page's registry

    // ---- declarations: the same primitives, from the server build. Writes do not happen on the server (SV-2). ----
    source(name: string, init: unknown, guessed = false, _key?: string): [Acc, Writer] {   // guessed: the client's optimistic layer over the writable (AC-3), so the owner trees (and hydration keys) match
      void name;
      if (typeof init === "object" && init !== null) { const [store] = createStore(init as any); const [get] = createSignal<unknown>(store); if (guessed) { const [view] = (createOptimisticStore as any)(() => get(), Array.isArray(init) ? [] : {}); return ro(() => view); } return ro(get as Acc); }
      const [get] = createSignal(init); if (guessed) { const [view] = createOptimistic(() => (get as Acc)()); return ro(view as Acc); } return ro(get as Acc);
    },
    question(name: string, compute: (prev: unknown) => unknown, o: { loadingValue?: unknown } | undefined, mode: { optimistic: boolean; structured: boolean; derived?: boolean; record?: boolean; plain?: boolean }, key?: string): [Acc, Writer] {
      const fn = named(name, compute);
      const derive = (draft: any) => { const r = fn(draft); if (r instanceof Flight || r instanceof Promise) return (async () => landDraft(draft, r instanceof Flight ? await r.first : await r, key))(); return landDraft(draft, r, key); };
      if (mode.optimistic && mode.structured && mode.plain && !mode.derived) { const [truth] = (createStore as any)(derive, key && !mode.record ? [] : {}, key ? { key } : undefined); (createOptimisticStore as any)(() => (key && !mode.record ? [] : {}), key && !mode.record ? [] : {}, key ? { key } : undefined); return ro(() => truth); }   // the client's layer, created for its owner slot only: the server shows the truth (it has no guesses), since Solid's server runs a projection's fn at once and one over a pending store throws NotReadyError out of the component (solidjs/solid#5097)
      if (mode.optimistic && mode.structured) { const [store] = (createOptimisticStore as any)(derive, key && !mode.record ? [] : {}, key ? { key } : undefined); return ro(() => store); }
      if (mode.optimistic && mode.derived) { const [get] = createOptimistic(fn as any, o as any); return ro(get as Acc); }   // AC-3 over an equation: the client's createOptimistic(fn), so the owner trees (and hydration keys) match
      if (mode.optimistic) { const [truth] = createSignal(fn as any, o as any); const [get] = createOptimistic(() => (truth as Acc)()); return ro(get as Acc); }
      if (mode.structured) {
        const [store] = (createStore as any)(async (draft: Record<string, unknown>) => { const r = fn(draft); const v = r instanceof Flight ? await r.first : await r; if (v && typeof v === "object") { for (const k of Object.keys(draft)) if (!(k in (v as object))) delete draft[k]; Object.assign(draft, v); } }, {});
        return ro(() => store);
      }
      const [get] = createSignal(fn as any, o as any); return ro(get as Acc);
    },
    memo: (name: string | null, fn: (prev: unknown) => unknown, o?: { loadingValue?: unknown }): Acc => createMemo(named(name, fn) as any, o as any) as Acc,
    /** R-f-5, MO-10f: a JS fn's record or tuple result as a value whose parts are read where they are read — a getter
     *  per part on the result (`refs`: the parts that are accessors, called) — so reading one part reads no other. */
    lazy: (r: any, keys: (string | number)[], refs: (string | number)[]): Acc => { const o: any = keys.length && typeof keys[0] === "number" ? [] : {}; for (const k of keys) Object.defineProperty(o, k, { get: () => refs.includes(k) ? r[k]() : r[k], enumerable: true }); return () => o; },
    /** MO-10i (ruled 2026-11-22): a read of a library's draft is a copy — what `.rx` holds of a draft is never the
     *  library's own object, which it may take back when its callback returns (`copyOf`). */
    copy: (v: unknown): unknown => copyOf(v, new Map()),
    lend: (v: unknown, to: string): unknown => lent(copyOf(v, new Map()), to),
    deferred: (name: string, fn: (prev: unknown) => unknown, o?: { loadingValue?: unknown }): Acc => createDeferred(named(name, fn) as any, o as any) as Acc,
    keyed: (name: string, key: string, fn: () => unknown, record = false): Acc => { const src = createMemo(named(name, () => fn()) as any); const p = createProjection(() => (src as Acc)() as any, (record ? {} : []) as any, { key } as any); return () => p; },
    draft: (seed: unknown, body: (d: any) => void): Acc => { const p = createProjection(body as any, seed as any); return () => p; },
    pre: (get: Acc): Acc => { const m = createMemo((st: any) => ({ cur: get(), prev: st ? st.cur : undefined })); return () => (m() as { prev: unknown }).prev; },
    firstPaint: (f: () => unknown) => ({ loadingValue: untrack(f) }),
    /** SV-2: the apply half runs on the client, after hydration. The compute half is reactive scope — Solid's server runs it;
     *  an input's failure is an answer (E-12), not a server error. */
    effect(_n: number, inputs: () => unknown[], _apply: (p: unknown[]) => unknown) {
      createEffect((() => { try { return inputs(); } catch (e) { if (e instanceof NotReadyError) throw e; return ERR; } }) as any, { effect() {}, error() {} } as any);
    },
    action(_gen: (...a: unknown[]) => Generator<unknown, unknown, unknown>) { return onServer("an action"); },
    /** SV-5a: a JS promise that rejects with a declared JS error class (imported by the program) is sent as it is, carrying
     *  its class's identity; the side branch only marks it, before Solid serializes it, and changes nothing else. */
    awaited: (v: unknown) => {
      if (v instanceof Flight) return v.first;
      // a rejection of a declared class rejects on with what is sent for it (`markSendable`); anything else as it was
      if (jsClassIds.size && v && typeof (v as PromiseLike<unknown>).then === "function") return Promise.resolve(v).then(x => x, (err: unknown) => { throw app.markSendable(err) ?? err; });
      return v;
    },
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
        if (question && flights.has(key)) return flights.get(key)!;
        const fl = question ? flight(key) : new Flight(`${key}#${serverSeq++}`);
        (globalThis as { __rx_app?: unknown }).__rx_app = app;   // the app a body run in place belongs to (it reads it once, at its start)
        let p: Promise<unknown>; try { p = Promise.resolve(fn(...args)); } catch (e) { p = Promise.reject(e); }
        p.then(v => fl.resolve(v), e => fl.reject(e));
        return fl;
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
    hoisted(_name: string, _get: Acc) {},
    refresh: onServer("refresh"),
    affects: onServer("affects"),
    onSettled: onServer("onSettled"),                                       // EF-7: imperative scope only, and no imperative run happens here (SV-2a)
    onFlush: onServer("onFlush"),                                           // EF-8
    preOr: (v: unknown, init: () => unknown) => v === undefined ? init() : v,

    module(key: unknown, factory: (rt: unknown) => Record<string, unknown>) { let m = modules.get(key); if (!m) { m = factory(app); modules.set(key, m); } return m; },
    // ---- context (RG-7): the server build's owner context, keyed by the declaration ----
    owner: () => getOwner(),
    context(name: string, dflt: (() => unknown) | null): Ctx { return { name, id: Symbol(name), dflt, owner: getOwner(), dv: dflt ? { get: createMemo(dflt as any) as Acc } : null }; },
    provide(c: Ctx, e: Entry) { const o = getOwner() as any; o._context = { ...o._context, [c.id]: e }; },
    use(c: Ctx, owner: Owner): Entry {
      const e = ((owner ?? getOwner()) as any)?._context?.[c.id]; if (e) return e;
      if (c.dv) return c.dv;
      throw new Error(`RG-7b: no provision for ${c.name}`);
    },
    useGet(c: Ctx, owner: Owner) { const e = app.use(c, owner); return e.get ? e.get() : e.value; },
    runWithOwner,

    snapshot(get: Acc) { try { return untrack(get); } catch (e) { if (e instanceof NotReadyError) return PENDING_MARK; throw e; } },
    errorClass: (name: string, params: string[], message: (...args: unknown[]) => unknown) => errorClass(name, params, message, `${name}#${classSeq++}`),   // a declaration's identity, sent with its failures (SV-5a)
    isA, PANIC, catchMemo: catchAcc, tryCatch, catchRead,
    throw: (e: unknown): never => { throw e; },
    eq: (a: unknown, b: unknown) => a === b,
    /** MO-10h: a `signal` parameter's argument: a Solid signal of the value, which the library is handed. */
    signal: (v: unknown) => createSignal(v as never) as unknown,
    untrack, omit, latest: (f: () => unknown) => latest(() => latestWhole(f())), isPending: (f: () => unknown) => isPending(() => readWhole(f())),
    fmt,

    // ---- views: compiled JSX (compile/jsx.ts, generate "ssr", hydratable) does the rest ----
    show: (v: unknown) => isView(v) ? v : escape(fmt(v)),
    /** A failure of another class passes to the boundary above (R-f-4): on the server, a rethrow from the fallback. The
     *  client's unwrapping memo has no counterpart here: its id is reserved. */
    TypedErrored(props: { classes: unknown[]; fallback: (err: Acc) => unknown; children: unknown }) {
      const out = createComponent(Errored as any, {
        fallback: (err: Acc) => { const ok = createMemo(() => isA(err(), props.classes)); if (!ok()) throw err(); return props.fallback(err); },
        get children() { return props.children; },
      });
      reserve();
      return out;
    },
  };
  return app;
}
export type ServerApp = ReturnType<typeof createApp>;

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

/** CP-4d: an `.rx` module's components for a JS host (`import pages from "./pages.rx?rx-lib"`; `const { Home } =
 *  components(pages)`): Solid components bound to the request's app (SV-4: module state is per request), found through
 *  Solid's request event and made on first use. A host that renders outside a request passes the app itself
 *  (`components(pages, createApp({ request }))`); with neither, rendering one throws rather than share one app's module
 *  state across unrelated renders. */
export function components<T extends Record<string, unknown>>(factory: (rt: unknown) => T, app?: ReturnType<typeof createApp>): T {
  const made = new Map<string, unknown>();
  const appNow = () => {
    if (app) return app;
    const ev = getRequestEvent() as { request: Request; locals: Record<PropertyKey, unknown> } | undefined;
    if (!ev) throw new Error("an .rx component imported with ?rx-lib was rendered on the server outside a request: its module state would be shared by every render in the process. Render it inside the framework's request (Solid's request event), or pass the app: components(pages, createApp({ request })) (CP-4d)");
    return (ev.locals[HOST_APP] ??= createApp({ request: ev.request })) as ReturnType<typeof createApp>;
  };
  return new Proxy({} as T, { get: (_, k) => typeof k !== "string" ? undefined : made.get(k) ?? (made.set(k, (props: unknown) =>
    ((appNow().module(factory, factory as never) as Record<string, (p: unknown) => unknown>)[k])(props)), made.get(k)) });
}

/** MO-13e: a compiled `.rx` module as a Solid library for JavaScript (a `.tsx` app): each export as a function of the
 *  request's app (SV-4: module state is per request), found as `components` finds it — a component, a source's or an
 *  equation's accessor, a fn, an action, an error class. The module is instantiated at its first use in the request, in
 *  a root of its own. */
export function library<T extends Record<string, unknown>>(factory: (rt: unknown) => T, app?: ReturnType<typeof createApp>): T {
  const made = new Map<string, unknown>();
  const rooted = (rt: unknown) => createRoot(() => factory(rt));
  const inst = () => {
    if (app) return app.module(factory, rooted as never) as Record<string, any>;
    const ev = getRequestEvent() as { request: Request; locals: Record<PropertyKey, unknown> } | undefined;
    if (!ev) throw new Error("an export of a compiled .rx package was used on the server outside a request: its module state would be shared by every render in the process. Render inside the framework's request (Solid's request event) (MO-13e)");
    return ((ev.locals[HOST_APP] ??= createApp({ request: ev.request })) as ReturnType<typeof createApp>).module(factory, rooted as never) as Record<string, any>;
  };
  return new Proxy({} as T, { get: (_, k) => typeof k !== "string" ? undefined : made.get(k) ?? (made.set(k, Object.defineProperty((...a: unknown[]) => inst()[k](...a), Symbol.hasInstance, { value: (e: unknown) => { const c = inst()[k]?.cls; return typeof c === "function" && e instanceof c; } })), made.get(k)) });
}
const HOST_APP = Symbol.for("reactivescript.app");
const REQUEST_APP = Symbol.for("reactivescript.request-app");   // the app whose stream this request event is
/** SV-5a: the copies `markSendable` made, which are what is sent. */
const SENT = new WeakSet<object>();
/** SV-5a, a library-cache adapter: `fn` with its rejections (and throws) of a JS error class the request's app declares
 *  marked safe to send, before anything else sees them. For a library that serializes a promise itself, as
 *  `@solidjs/router`'s `query` does: `export const getPerson = query(sendErrors(fetchPerson), "person")`. Outside an app's
 *  request, and on the client, it changes nothing. */
export function sendErrors<F extends (...a: any[]) => unknown>(fn: F): F {
  // what is sent for `e` (its sendable copy, SV-5a), or `e` itself where nothing declares its class or no app is asking
  const sendable = (e: unknown) => { const l = (getRequestEvent() as { locals?: Record<PropertyKey, unknown> } | undefined)?.locals; return ((l?.[REQUEST_APP] ?? l?.[HOST_APP]) as { markSendable?: (e: unknown) => unknown } | undefined)?.markSendable?.(e) ?? e; };
  return ((...a: unknown[]) => {
    let r: unknown;
    try { r = fn(...a); } catch (e) { throw sendable(e); }
    return r && typeof (r as PromiseLike<unknown>).then === "function" ? Promise.resolve(r).then(v => v, e => { throw sendable(e); }) : r;
  }) as F;
}
