// A layer over the page: what closes it, where the focus is kept, what of the page is hidden and held still, and where it floats.
// The page's work of dismissable-layer, focus-trap, hide-outside, prevent-scroll and popper (@floating-ui/dom as it is).
import { autoUpdate, computePosition, flip, offset, shift, size } from "@floating-ui/dom";
const layers = [];
const TABBABLE = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";
/** Open `element` over the page; answers what closes it. */
export function openLayer(element, { modal, trigger, dismiss, autofocus = true, returnFocus = true }) {
  const doc = element.ownerDocument, was = doc.activeElement, undo = [], top = () => layers.at(-1) === element;
  layers.push(element); undo.push(() => layers.splice(layers.indexOf(element), 1));
  const on = (type, f) => { doc.addEventListener(type, f, true); undo.push(() => doc.removeEventListener(type, f, true)); };
  on("keydown", (e) => { if (e.key === "Escape" && top()) { e.preventDefault(); dismiss("escape"); } else if (e.key === "Tab" && modal && top()) trap(e); });
  on("pointerdown", (e) => { if (top() && !element.contains(e.target) && !trigger?.contains(e.target)) dismiss("outside"); });
  if (!modal) on("focusin", (e) => { if (top() && !element.contains(e.target) && !trigger?.contains(e.target)) dismiss("focus"); });
  const trap = (e) => { const all = [...element.querySelectorAll(TABBABLE)]; if (!all.length) return e.preventDefault(); const at = all.indexOf(doc.activeElement), to = e.shiftKey ? at <= 0 ? all.at(-1) : undefined : at === all.length - 1 ? all[0] : undefined; if (to) { e.preventDefault(); to.focus(); } };
  if (modal) {
    const hidden = []; for (let n = element; n && n !== doc.body; n = n.parentElement) for (const s of n.parentElement?.children ?? []) if (s !== n && !s.contains(element) && !/^(SCRIPT|STYLE)$/.test(s.tagName) && !s.hasAttribute("aria-hidden") && !s.hasAttribute("data-layer-through")) { s.setAttribute("aria-hidden", "true"); hidden.push(s); }
    undo.push(() => hidden.forEach((s) => s.removeAttribute("aria-hidden")));
    const { overflow } = doc.body.style; doc.body.style.overflow = "hidden"; undo.push(() => { doc.body.style.overflow = overflow; });
  }
  if (autofocus && !element.contains(doc.activeElement)) (element.querySelector("[autofocus]") ?? element.querySelector(TABBABLE) ?? element).focus({ preventScroll: true });
  return () => { for (const u of undo.reverse()) u(); if (returnFocus && (element.contains(doc.activeElement) || doc.activeElement === doc.body || !doc.activeElement?.isConnected)) (trigger?.isConnected ? trigger : was)?.focus?.({ preventScroll: true }); };
}
/** Keep `floating` beside `anchor`; answers what stops it. */
export function float(anchor, floating, { placement = "bottom", gutter = 0, sameWidth = false, placed }) {
  const go = async () => { const p = await computePosition(anchor, floating, { placement, strategy: "absolute", middleware: [offset(gutter), flip({ padding: 8 }), shift({ padding: 8 }), size({ padding: 8, apply: ({ rects }) => { if (sameWidth) floating.style.width = `${Math.round(rects.reference.width)}px`; } })] });
    Object.assign(floating.style, { top: "0", left: "0", transform: `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)` }); placed(p.placement); };
  return autoUpdate(anchor, floating, go);
}
export const timer = () => { let t; return { start(ms, f) { clearTimeout(t); t = setTimeout(f, ms); }, stop() { clearTimeout(t); } }; };
