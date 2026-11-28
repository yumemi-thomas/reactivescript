const NONE = { x: 0, y: 0 };
export const positionOf = (target) => target ? ("scrollX" in target ? { x: target.scrollX, y: target.scrollY } : { x: target.scrollLeft, y: target.scrollTop }) : NONE;
export const windowOf = () => typeof window === "undefined" ? undefined : window;
export function onScroll(target, f) { if (!target) return; target.addEventListener("scroll", f, { passive: true }); return () => target.removeEventListener("scroll", f); }
