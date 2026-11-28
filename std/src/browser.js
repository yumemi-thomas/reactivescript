// The browser's calls, thin: one that listens answers what stops it, and every one runs in the browser only (`client`).
export function on(target, type, f, options) {
  const h = e => f(e);
  target.addEventListener(type, h, options);
  return () => target.removeEventListener(type, h, options);
}
export const onWindow = (type, f, options) => on(window, type, f, options);
export const onDocument = (type, f, options) => on(document, type, f, options);

export function onMedia(query, f) {
  const list = window.matchMedia?.(query), h = e => f(e.matches);
  list?.addEventListener("change", h);
  return () => list?.removeEventListener("change", h);
}
export function onResize(element, f, options) {
  const o = new ResizeObserver(([entry]) => f(entry));
  o.observe(element, options);
  return () => o.disconnect();
}
export function onIntersect(element, f, options) {
  const o = new IntersectionObserver(entries => f(entries[entries.length - 1]), options);
  o.observe(element);
  return () => o.disconnect();
}
export function onMutation(element, f, options) {
  const o = new MutationObserver(records => f(records));
  o.observe(element, options);
  return () => o.disconnect();
}
export function onFrame(f) { const id = requestAnimationFrame(t => f(t)); return () => cancelAnimationFrame(id); }
export const onVisible = f => on(document, "visibilitychange", () => f(document.visibilityState === "visible"));
