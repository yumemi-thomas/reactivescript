// What the parts ask of the page and of Solid. Everything reactive is in the .rx modules.
import { createUniqueId } from "solid-js";

/** An id for the instance, the same on the server and in the browser. */
export const uniqueId = (prefix) => `${prefix}-${createUniqueId()}`;

/** The caller's event handler: a function, or Solid's [function, data]. */
export function call(event, handler) {
  if (typeof handler === "function") handler(event);
  else if (handler) handler[0](handler[1], event);
}
/** The caller's ref: a function, a list of them, or nothing. */
export function give(ref, element) {
  if (typeof ref === "function") ref(element);
  else if (Array.isArray(ref)) for (const r of ref) give(r, element);
}
export const focus = (element) => element?.focus({ preventScroll: true });
export const isActive = (element) => element?.ownerDocument.activeElement === element;
/** A field of an element: one that is not an attribute, or that the page changed by itself. */
export function put(element, name, value) { if (element) element[name] = value; }
/** The input and change events a form expects when code, and not the person, changed a field. */
export function announceChange(element) {
  for (const type of ["input", "change"]) element?.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
}
export const formOf = (element) => element?.closest("form") ?? null;

const HIDDEN = { border: "0", clip: "rect(0 0 0 0)", "clip-path": "inset(50%)", height: "1px", margin: "0 -1px -1px 0", overflow: "hidden", padding: "0", position: "absolute", width: "1px", "white-space": "nowrap" };
const styles = (s) => typeof s === "string" ? Object.fromEntries(s.split(";").filter((x) => x.includes(":")).map((x) => [x.slice(0, x.indexOf(":")).trim(), x.slice(x.indexOf(":") + 1).trim()])) : s ?? {};
/** A part's own style with the caller's over it. */
export const mix = (own, user) => ({ ...own, ...styles(user) });
export const hidden = (user) => mix(HIDDEN, user);
/** Present, or not: what a data attribute is. */
export const flag = (on) => on ? "" : undefined;
export const words = (...parts) => parts.filter(Boolean).join(" ") || undefined;

/** Arrow keys, Home and End among the elements a list holds. */
export function move(event, list, selector, orientation, wrap) {
  const all = [...(list?.querySelectorAll(selector) ?? [])]; if (!all.length) return;
  const at = all.indexOf((event.target.ownerDocument.activeElement ?? event.target).closest(selector)), rtl = getComputedStyle(list).direction === "rtl";
  const [prev, next] = orientation === "vertical" ? ["ArrowUp", "ArrowDown"] : rtl ? ["ArrowRight", "ArrowLeft"] : ["ArrowLeft", "ArrowRight"];
  const to = { [prev]: at - 1, [next]: at + 1, Home: 0, End: all.length - 1 }[event.key]; if (to === undefined) return;
  event.preventDefault();
  all[wrap ? (to + all.length) % all.length : Math.max(0, Math.min(all.length - 1, to))]?.focus({ preventScroll: true });
}
export function sizeOf(element) { const { width, height } = element.getBoundingClientRect(); return { width, height }; }
const formatter = new Intl.NumberFormat("en-US", { style: "percent" });
export const percent = (x) => formatter.format(x);
/** Calls a function whose parameter depends on another prop. */
export const tell = (f, value) => { f?.(value); };
/** A list that is focused itself gives the focus to its selected element, or the first that can have it. */
export function enter(event, list, key) {
  if (event.target !== list) return;
  const all = [...list.querySelectorAll("[data-value]:not([disabled])")];
  (all.find((e) => e.dataset.value === key) ?? all[0])?.focus({ preventScroll: true });
}
/** The key of the tab to show: the one asked for if it is there, else the first that can be. */
export function pickTab(list, key) {
  const all = [...(list?.querySelectorAll("[role=tab]") ?? [])]; if (!all.length) return undefined;
  const there = all.find((e) => e.dataset.key === key);
  return (there ?? all.find((e) => !e.disabled) ?? all[0]).dataset.key;
}
export const tabOf = (list, key) => [...(list?.querySelectorAll("[role=tab]") ?? [])].find((e) => e.dataset.key === key);
export const place = (e, orientation) => orientation === "vertical" ? { transform: `translateY(${e.offsetTop}px)`, height: `${e.offsetHeight}px` } : { transform: `translateX(${e.offsetLeft}px)`, width: `${e.offsetWidth}px` };
export const hasTabbable = (e) => !!e.querySelector("a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])");
export function syncRadios(root, value) { for (const r of root?.querySelectorAll("[type='radio']") ?? []) r.checked = r.value === value; }
export const within = (element, target) => !!element?.contains(target);
export const scrollTo = (element) => element?.scrollIntoView?.({ block: "nearest" });
export const byKey = (list, key) => [...(list?.querySelectorAll("[data-key]") ?? [])].find((e) => e.dataset.key === key);
/** What an option says by a field's name or by a function. */
export const ask = (option, how) => how == null ? option : typeof how === "function" ? how(option) : option[how];
/** The next key that can be had from `key`, `by` a step; the first or the last when there is none. */
export function stepKey(items, key, by, wrap) {
  const all = items.filter((i) => !i.disabled); if (!all.length) return undefined;
  const at = all.findIndex((i) => i.key === key); if (at < 0) return (by > 0 ? all[0] : all.at(-1)).key;
  const to = at + by; return (all[wrap ? (to + all.length) % all.length : Math.max(0, Math.min(all.length - 1, to))]).key;
}
/** Type to find: the key whose text begins with what was typed in the last second, after `key` first. */
let typed = "", when = 0;
export function typeKey(items, key, letter) {
  if (Date.now() - when > 1000) typed = ""; when = Date.now(); typed += letter.toLowerCase();
  const all = items.filter((i) => !i.disabled), at = all.findIndex((i) => i.key === key), from = [...all.slice(at + (typed.length > 1 ? 0 : 1)), ...all.slice(0, Math.max(0, at + 1))];
  return from.find((i) => i.textValue.toLowerCase().startsWith(typed))?.key;
}
export const isFocusIn = (e) => !!e?.contains(e.ownerDocument.activeElement);
