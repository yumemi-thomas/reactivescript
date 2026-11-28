// The JavaScript under the parts: what @ui-sdk/core's objects need done to them, and nothing reactive but `create`.
// Derived from use-primitive.jsx of @ui-sdk/solid 0.1.0-beta.13 (Apache-2.0, see ../NOTICE).
import { attrs, handlers, partState, portalTarget, present, ref, sameValue, subscribe, takeOwnId, writes, yieldToAuthor } from "@ui-sdk/core/renderer";
import { isServer } from "@solidjs/web";
import { createEffect, createSignal, createUniqueId, isHydrating, merge, onCleanup, onSettled, runWithOwner, untrack } from "solid-js";

export { portalTarget };

/** A core instance for the owner that calls this; `options` is followed, so a controlled value shows in its own frame. */
export function create(primitive, options) {
  const instance = untrack(() => primitive({ ...options(), id: `ui-sdk-${createUniqueId()}` }));
  onCleanup(() => instance.destroy());
  instance.follow(() => untrack(options));
  return instance;
}
export const apiOf = (instance) => instance.api;
export const uniqueId = () => createUniqueId();
export const setOptions = (instance, options) => instance.setOptions(options);
/** The part of an instance `named` names, with those props from now on: one object while its key stays. */
export const partOf = (instance, slot, named) => instance.part(slot, named);

// What a part last answered, handed back while it is the same, and the writes it had seen by then.
const answers = new WeakMap();
const answer = (part, value, same) => {
  let last = answers.get(part);
  if (!last) answers.set(part, (last = {}));
  last.seen = writes(part.store);
  return last.value && same(last.value, value) ? last.value : (last.value = value);
};
const sameRecord = (a, b) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => key in b && sameValue(a[key], b[key]));
};
const styleObject = (css) => Object.fromEntries(css.split(";").filter((d) => d.indexOf(":") > 0).map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()]));

/** The attributes core gives a part, as Solid takes them; the user's own id and label win. */
export function attrsOf(part, named, user) {
  takeOwnId(part, user.id);
  const own = yieldToAuthor(attrs(part, named), (name) => user[name] != null);
  const out = {};
  for (const name in own) {
    if (own[name] === undefined || (name === "id" && user.id != null)) continue;
    if (name === "checked") out[isServer ? "checked" : "defaultChecked"] = true;
    else out[name] = name === "style" ? styleObject(own.style) : own[name];
  }
  return answer(part, out, sameRecord);
}
/** The part's state, for what is a function of it: computed where a field is read, and only there. */
export function stateOf(part, named, options, tick) {
  const read = () => {
    options();
    tick();
    return partState(part(), named());
  };
  const state = {};
  for (const key of Object.keys(untrack(read))) Object.defineProperty(state, key, { enumerable: true, get: () => read()[key] });
  return state;
}
export const presentOf = (part, named) => present(part, named);

/** Calls `changed` when core changes what a part shows on its own: not for what `follow` already delivers. */
export function listen(part, changed) {
  const stop = subscribe(part, (live, delivered) => { if (!delivered) changed(live); });
  if (answers.get(part)?.seen !== writes(part.store)) changed(false);
  return stop;
}

// The element that holds a part: two items that trade keys in one change let go only of what each handed over.
const holders = new WeakMap();
function attach(part, el) {
  const bound = ref(part, { by: "framework", attaches: "all" });
  holders.set(bound, el);
  bound(el);
  return () => {
    if (holders.get(bound) !== el) return;
    holders.delete(bound);
    bound(null);
  };
}
const settled = (el) => el.isConnected && !isHydrating();
/** Binds the part to the element it is called with, once that is in the page and hydrated, and follows the part. */
export function binder(part) {
  let el, held, undo;
  const hold = () => {
    const next = untrack(part);
    if (!el || held === next) return;
    undo?.();
    undo = attach((held = next), el);
  };
  createEffect(part, () => { if (held) hold(); });
  // Letting go tells core, whose listeners write the parts' state: a cleanup that writes is an effect's (Solid #5244,
  // "judged by the phase it belongs to"; an `onCleanup` of the body that writes is REACTIVE_WRITE_IN_OWNED_SCOPE in
  // development). `onCleanup` stays for a part torn down before it settled.
  const detach = () => { undo?.(); el = held = undo = undefined; };
  let settledOnce = false;
  onSettled(() => { settledOnce = true; return detach; });
  onCleanup(() => { if (!settledOnce) detach(); });
  return (node) => {
    if (el === node) return;
    undo?.();
    held = undo = undefined;
    el = node;
    if (settled(node)) return hold();
    runWithOwner(null, () => onSettled(() => { if (el === node) settled(node) ? hold() : queueMicrotask(() => { if (el === node) hold(); }); }));
  };
}

// Roots that a controller drives, so a part outside finds its own. Registered a microtask after mount, so a part later
// in the tree hydrates as the server rendered it.
const entries = new WeakMap();
const entry = (controller) => entries.get(controller) ?? entries.set(controller, createSignal()).get(controller);
export function register(controller, scope) {
  createEffect(controller, (current) => {
    if (!current) return;
    const [get, set] = entry(current);
    let there = true;
    queueMicrotask(() => { if (there) set(() => scope); });
    return () => { there = false; queueMicrotask(() => { if (untrack(get) === scope) set(undefined); }); };
  });
  return true;
}
export const entryOf = (controller) => () => { const current = controller(); return current ? entry(current)[0]()?.() : undefined; };

const call = (handler, event) => Array.isArray(handler) ? handler[0](handler[1], event) : handler?.(event);
/** The user's handler, then core's unless the user prevented it. */
export function fire(part, type, event, user) {
  call(user, event);
  if (!event.defaultPrevented) handlers(part)[type]?.(event);
}
/** The user's `ref`: a function, or a list of them. */
export const give = (user, el) => { for (const f of [user].flat(Infinity)) f?.(el); };

// A class, a style or children may be a function of the part's state.
export const classOf = (value, state) => typeof value === "function" ? value(state) : value;
export const styleOf = (value, state, own) => {
  const style = typeof value === "function" ? value(state) : value;
  return own === undefined ? style : { ...(typeof style === "string" ? styleObject(style) : style), ...own };
};
const childrenOf = (value, state) => typeof value === "function" && value.length > 0 ? value(state) : value;
// What a .tsx app gives as a view, as `.rx` shows one: there a value in a hole is data, so `undefined` is text and a list
// of strings is printed (REPORT.md, bug 3).
const shown = (value) => {
  if (!Array.isArray(value)) return value == null || typeof value === "boolean" ? [] : value;
  const items = value.map((item) => Array.isArray(item) ? shown(item) : item == null || typeof item === "boolean" ? "" : typeof item === "number" ? String(item) : item);
  return items.every((item) => typeof item === "string") ? items.join("") : items;
};
/** Children, or what a `render` made, in the place they are shown. */
export const viewOf = (value, state) => shown(childrenOf(value, state));
/** The element's props with its children, which are made where they are read. */
export const elementProps = (rest, element, props, state, other) => merge(rest, element, { get children() { return childrenOf(props.children ?? other, state); } });
