import { createUniqueId } from "solid-js";
export const uniqueId = () => createUniqueId();
export function give(ref, element) { if (typeof ref === "function") ref(element); else if (Array.isArray(ref)) for (const r of ref) give(r, element); }
export function call(event, handler) { if (typeof handler === "function") handler(event); else if (handler) handler[0](handler[1], event); }
export const textOf = (e) => e?.textContent ?? "";
const VALID = `[cmdk-item=""]:not([aria-disabled="true"])`, valid = (list) => [...(list?.querySelectorAll(VALID) ?? [])], selected = (list) => list?.querySelector(`[cmdk-item=""][aria-selected="true"]`);
const at = (e) => e?.getAttribute("data-value") ?? undefined;
export const firstValue = (list) => at(valid(list)[0]);
/** Where a key goes: the value of the item it selects. */
export function step(list, how, loop) {
  const all = valid(list), now = selected(list), i = all.indexOf(now);
  if (how === "first") return at(all[0]); if (how === "last") return at(all.at(-1));
  const by = how.endsWith("next") ? 1 : -1;
  if (how.startsWith("group")) { let g = now?.closest(`[cmdk-group=""]`), item; while (g && !item) { g = by > 0 ? g.nextElementSibling : g.previousElementSibling; while (g && !g.matches(`[cmdk-group=""]`)) g = by > 0 ? g.nextElementSibling : g.previousElementSibling; item = g?.querySelector(VALID); } if (item) return at(item); }
  return at(loop ? all[(i + by + all.length) % all.length] : all[i + by]);
}
export const pressSelected = (list) => selected(list)?.click();
export const reveal = (list) => requestAnimationFrame(() => selected(list)?.scrollIntoView({ block: "nearest" }));
export const idOf = (list, value) => valid(list).find((e) => at(e) === value)?.id;
export const HIDDEN = { position: "absolute", width: "1px", height: "1px", padding: "0", margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", "white-space": "nowrap", "border-width": "0" };
export function listHeight(wrapper, sizer) { wrapper.style.setProperty("--cmdk-list-height", sizer.offsetHeight.toFixed(1) + "px"); }
export const one = (x) => ({ [x.id]: x.n });
