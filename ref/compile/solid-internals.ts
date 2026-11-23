// Everything the runtime reads of Solid that Solid does not publish, to answer two questions about the code that is
// running: which render is this (09 MO-13g: outside a request, an .rx package's state is the render's), and which
// owner lasts as long as that render (MO-13h: a module's root is under it; a request's state is held while one of its
// renders is open). Solid 2 answers the first in public — `getHydrationWriter()` is one object for each render, found
// through the caller's owner — and has no public "root owner of this render", no "when this render ends", and no silent
// read of the request scope. So, here and nowhere else in the runtime:
//
//   1. `owner._parent`                                      an owner's parent (null at a root, and after disposal)
//   2. `globalThis[Symbol.for("@solidjs/web/render-roots")]`  @solidjs/web's WeakMap: each open render's root owner →
//                                                           that render's context
//   3. `context.event`                                      on that context: the request event an integration put on
//                                                           its render (where the request scope does not follow an await)
//   4. `globalThis[RequestContext].getStore()`              the request scope's store (`RequestContext` is exported by
//                                                           @solidjs/web; that it holds an AsyncLocalStorage is
//                                                           @solidjs/web/storage's doing)
//
// Each is checked where it is read, and what it finds is held against the public answer. A Solid that is shaped
// otherwise is refused with an error that names its version and what is missing: nothing here falls back to a guess,
// because a wrong guess is one render reading another's state. `runtime/test.mjs` asserts the same four facts against
// the installed Solid ("Solid's contract"), reading Solid and not this file, so a Solid bump that moves one fails there first. What Solid would have to
// publish for this file to go is in spec/archive/rfc-rx-packages-2026-11-22.md.
import { getOwner, runWithOwner } from "solid-js";
import * as web from "@solidjs/web";
import { RequestContext } from "@solidjs/web";

/** The releases of Solid this file was written against and is tested with. */
export const SOLID_TESTED = "2.0.2 to 2.0.3";
const RENDER_ROOTS = Symbol.for("@solidjs/web/render-roots");

export type Own = { id?: string };
export type Ev = { request: Request; locals: Record<PropertyKey, unknown> };
/** A render: the root owner Solid keeps for it, the object that is its identity (its hydration writer, Solid's public
 *  one-per-render object), and the request event an integration put on it, if one did. */
export type Render = { root: Own; key: object; event: Ev | undefined };

/** The installed solid-js's version, where the platform can say (Node 22.3+); for the error's text only. */
function solidVersion(): string {
  try {
    const m = (globalThis as any).process?.getBuiltinModule?.("node:module");
    const v = m?.createRequire(import.meta.url)("solid-js/package.json")?.version;
    if (typeof v === "string") return v;
  } catch { /* another platform, or a bundle with no solid-js beside it */ }
  return "(version unknown: see solid-js/package.json)";
}
/** Solid is not shaped as this file reads it. */
function refuse(missing: string): never {
  throw new Error(`[reactivescript] solid-js ${solidVersion()} is not shaped as @reactivescript/runtime reads it: ${missing}. The runtime finds the render an .rx module's state belongs to through this (Solid has no public API for it), and it does not guess where it cannot: a guess would give one render another's state. This runtime was written against solid-js ${SOLID_TESTED}; use one of those, or a @reactivescript/runtime made for the Solid installed (ref/compile/solid-internals.ts lists what is read).`);
}

/** Solid's public answer to "which render is this": one object for each render, found through the caller's owner. Read
 *  off the namespace, so a Solid without it is refused here by name and not at the import. */
const getHydrationWriter = (): object | undefined => {
  const f = (web as { getHydrationWriter?: () => object | undefined }).getHydrationWriter;
  if (typeof f !== "function") refuse("@solidjs/web has no getHydrationWriter()");
  return f();
};
/** (1) An owner's parent: null at a root. */
function parentOf(o: object): object | null {
  if (!("_parent" in o)) refuse("an owner has no `_parent` field");
  const p = (o as { _parent: unknown })._parent;
  if (p != null && typeof p !== "object") refuse("an owner's `_parent` is not an owner");
  return (p ?? null) as object | null;
}
/** (2) Solid's table of open renders, if a render was ever started in this process. */
function renderRoots(): { get(o: object): unknown } | undefined {
  const t = (globalThis as any)[RENDER_ROOTS];
  if (t !== undefined && (t === null || typeof t.get !== "function" || typeof t.has !== "function")) refuse("globalThis[Symbol.for(\"@solidjs/web/render-roots\")] is not a WeakMap");
  return t;
}
/** (4) The request scope's event, without the warning `getRequestEvent()` gives where there is none (a render outside
 *  a request is an ordinary thing). */
export function scopeEvent(): Ev | undefined {
  const store = (globalThis as any)[RequestContext as never];
  if (store === undefined) return undefined;
  if (store === null || typeof store.getStore !== "function") refuse("globalThis[RequestContext] is not an AsyncLocalStorage (it has no getStore)");
  return store.getStore() as Ev | undefined;
}

/** The renders already held against the public answer, each by its writer, with the root that agreed. Keyed by the
 *  writer, which goes with its render: Solid reuses owners, so a table keyed by the root would keep each render's
 *  writer — and through it the render's context and its request — for as long as the owner is in Solid's pool. */
const agreed = new WeakMap<object, object>();
/** The render `owner` belongs to: the nearest owner at or above it that Solid's table names, with what the table says
 *  of it. `undefined` under no render (no owner, a root made outside a render, a disposed subtree). The answer is held
 *  against `getHydrationWriter()`, which finds the caller's render by Solid's own means: where the two disagree, Solid
 *  has changed and this throws. */
export function renderOf(owner: Own | null): Render | undefined {
  if (!owner) return undefined;
  const roots = renderRoots();   // before Solid's own reader of the table, which would fail on another shape with a TypeError
  const writer = runWithOwner(owner as never, getHydrationWriter) as object | undefined;
  let root: object | null = null, context: unknown;
  for (let p: object | null = owner; p; p = parentOf(p)) { context = roots?.get(p); if (context) { root = p; break; } }
  if (!root) {
    // with no owner above it in a render, getHydrationWriter() still answers inside a request scope that has one
    // render open; anywhere else an answer means a render this walk did not find
    if (writer && !roots) refuse("a render is open (getHydrationWriter() answers) and there is no table of render roots at globalThis[Symbol.for(\"@solidjs/web/render-roots\")]");
    if (writer && !scopeEvent()) refuse("getHydrationWriter() finds a render through an owner, and no owner above it is in the table of render roots");
    return undefined;
  }
  if (typeof context !== "object") refuse("the table of render roots does not hold a render's context for its root owner");
  if (!writer) refuse("the table of render roots names a render that getHydrationWriter() does not find");
  if (agreed.get(writer) !== root) {
    if (runWithOwner(root as never, getHydrationWriter) !== writer) refuse("the owner the table of render roots names is not the root of the render getHydrationWriter() finds");
    agreed.set(writer, root);
  }
  return { root: root as Own, key: writer, event: (context as { event?: Ev }).event };   // (3)
}
/** The render the running code belongs to. */
export const currentRender = (): Render | undefined => renderOf(getOwner() as Own | null);

/** The topmost owner above the running code (the browser: a render's root owner there is the top of its tree, and its
 *  id is the render's, which a module's root takes as the server's did). */
export function topOwner(): Own | null {
  let top = getOwner() as object | null;
  for (let p = top; p; p = parentOf(p)) top = p;
  return top as Own | null;
}
