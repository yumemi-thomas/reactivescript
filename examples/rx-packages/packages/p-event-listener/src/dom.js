const list = (x) => (Array.isArray(x) ? x : [x]).filter(Boolean);
/** Listens on every target to every type; answers what stops it. */
export function listenAll(targets, types, handler, options) {
  const stops = []; for (const el of list(targets)) for (const t of list(types)) { el.addEventListener(t, handler, options); stops.push(() => el.removeEventListener(t, handler, options)); }
  return () => stops.forEach((s) => s());
}
