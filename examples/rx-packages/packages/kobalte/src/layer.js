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
const REVERSE = { top: "bottom", right: "left", bottom: "top", left: "right" };
/** Kobalte's popper: the origin a transition of the content starts from, for where it was placed. */
function origin(placement, rtl) {
  const [side, align] = placement.split("-"), back = REVERSE[side];
  if (!align) return `${back} center`;
  if (side === "left" || side === "right") return `${back} ${align === "start" ? "top" : "bottom"}`;
  return `${back} ${(align === "start") !== rtl ? "left" : "right"}`;
}
export function float(anchor, floating, { placement = "bottom", gutter = 0, sameWidth = false, placed }) {
  const pad = 8;   // Kobalte's overflowPadding
  const go = async () => {
    floating.style.setProperty("--kb-popper-content-overflow-padding", `${pad}px`);
    const p = await computePosition(anchor, floating, { placement, strategy: "absolute", middleware: [offset(gutter), flip({ padding: pad }), shift({ padding: pad }), size({ padding: pad, apply: ({ availableWidth, availableHeight, rects }) => {
      const w = Math.round(rects.reference.width);
      floating.style.setProperty("--kb-popper-anchor-width", `${w}px`);
      floating.style.setProperty("--kb-popper-content-available-width", `${Math.floor(availableWidth)}px`);
      floating.style.setProperty("--kb-popper-content-available-height", `${Math.floor(availableHeight)}px`);
      if (sameWidth) floating.style.width = `${w}px`; } })] });
    floating.style.setProperty("--kb-popper-content-transform-origin", origin(p.placement, getComputedStyle(floating).direction === "rtl"));
    Object.assign(floating.style, { top: "0", left: "0", transform: `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)` });
    const content = floating.firstElementChild; if (content) floating.style.zIndex = getComputedStyle(content).zIndex;
    placed(p.placement); };
  return autoUpdate(anchor, floating, go);
}
export const timer = () => { let t; return { start(ms, f) { clearTimeout(t); t = setTimeout(f, ms); }, stop() { clearTimeout(t); } }; };
/** Kobalte's tooltips share a warm-up: once one has shown, another (or the same) shows at once while one is open, and
 *  for `skipDelayDuration` after the last closed (tooltip-root's globalWarmedUp and globalSkipDelayTimeout). */
const warm = { on: false, skip: undefined, cool: undefined };
export function tipShown() { warm.on = true; clearTimeout(warm.skip); clearTimeout(warm.cool); warm.skip = warm.cool = undefined; }
export function tipHidden(skipDelay, closeDelay) {
  clearTimeout(warm.skip); warm.skip = skipDelay >= 0 ? setTimeout(() => { warm.skip = undefined; }, skipDelay) : undefined;
  if (warm.on) { clearTimeout(warm.cool); warm.cool = setTimeout(() => { warm.cool = undefined; warm.on = false; }, closeDelay); }
}
export const tipWarm = () => warm.on || warm.skip !== undefined;
