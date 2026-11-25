import { createUniqueId } from "solid-js";
export const uniqueId = () => createUniqueId();
export const flag = (on) => on ? "" : undefined;
export function give(ref, element) { if (typeof ref === "function") ref(element); else if (Array.isArray(ref)) for (const r of ref) give(r, element); }
export function call(event, handler) { if (typeof handler === "function") handler(event); else if (handler) handler[0](handler[1], event); }
const NAMES = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";
export const isNative = (e) => e.tagName === "BUTTON" || (e.tagName === "INPUT" && /^(button|color|file|image|reset|submit)$/.test(e.type));
/** A control that is not a native button: Enter and Space press it. */
export function pressKey(event, disabled) {
  const el = event.currentTarget; if (isNative(el) || event.target !== el) return;
  if (event.type === "keydown" && event.key === "Enter") { event.preventDefault(); if (!disabled) el.click(); }
  else if (event.key === " ") { event.preventDefault(); if (event.type === "keyup" && !disabled) el.click(); }
}
/** Arrow keys (both pairs, or one), Home, End and typed letters among a list's items. */
let typed = "", when = 0;
export function roam(event, list, selector, axis) {
  const all = [...(list?.querySelectorAll(selector) ?? [])]; if (!all.length) return;
  const at = all.findIndex((e) => e.contains(event.target)), k = event.key, v = axis !== "horizontal", h = axis !== "vertical";
  let to = k === "Home" ? 0 : k === "End" ? all.length - 1 : (v && k === "ArrowDown") || (h && k === "ArrowRight") ? (at + 1) % all.length : (v && k === "ArrowUp") || (h && k === "ArrowLeft") ? (Math.max(at, 0) - 1 + all.length) % all.length : undefined;
  if (to === undefined && k.length === 1 && k !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (event.timeStamp - when > 500) typed = ""; when = event.timeStamp; typed += k.toLowerCase();
    const from = typed.length === 1 ? at + 1 : Math.max(at, 0); for (let i = 0; i < all.length; i++) { const j = (from + i) % all.length; if (all[j].textContent.trim().toLowerCase().startsWith(typed)) { to = j; break; } }
    if (to === undefined) return;
  }
  if (to === undefined) { if (k === " " || k === "Enter") event.preventDefault(); return; }
  event.preventDefault(); all[to].focus({ preventScroll: true }); return all[to];
}
export const focusFirst = (list, ...selectors) => { for (const s of selectors) { const e = list?.querySelector(s); if (e) { e.focus({ preventScroll: true }); return; } } };
export const focus = (e) => e?.focus?.({ preventScroll: true });
export const click = (e) => e?.click();
/** The Tab key kept inside an element. */
export function trapTab(event) {
  const el = event.currentTarget, all = [...el.querySelectorAll(NAMES)]; event.preventDefault(); event.stopPropagation(); if (!all.length) return;
  const at = all.indexOf(el.ownerDocument.activeElement); all[(at + (event.shiftKey ? -1 : 1) + all.length) % all.length].focus();
}
/** The focus moved into a panel, and back to where it was when that ends. */
export function holdFocus(element) {
  const doc = element.ownerDocument, was = doc.activeElement, made = [];
  for (let n = element; n && n !== doc.body; n = n.parentElement) for (const s of n.parentElement?.children ?? []) if (s !== n && !s.inert && !/^(SCRIPT|STYLE)$/.test(s.tagName)) { s.inert = true; made.push(s); }
  if (!element.contains(was)) { const p = element.querySelector("[tc-dialog-panel]"); if (p && !p.querySelector(NAMES)) p.tabIndex = -1; focusFirst(element, NAMES, "[tc-dialog-panel]"); }
  return () => { for (const s of made) s.inert = false; was?.isConnected && was.focus?.({ preventScroll: true }); };
}
export const leaves = (event, ...inside) => !inside.some((e) => e?.contains(event.relatedTarget));
export const same = (by, a, b) => by ? by(a, b) : Object.is(a, b);
/** An attribute the element's type does not have (`disabled` on an <li>, as terracotta's Button puts it). */
export const attr = (name, value) => ({ [name]: value });
