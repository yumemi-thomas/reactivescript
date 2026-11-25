import { isServer } from "@solidjs/web";
let server = 16;
export const remSize = () => isServer ? server : parseFloat(getComputedStyle(document.documentElement).fontSize);
export const setServerRemSize = (n) => { if (isServer) server = n; };
/** A hidden 1rem box; `f` hears of each new size. */
export function watchRem(f) {
  const el = document.createElement("div"); Object.assign(el.style, { position: "fixed", visibility: "hidden", width: "1rem", height: "0", pointerEvents: "none" }); document.body.appendChild(el);
  let init = true; const ro = new ResizeObserver(() => { if (init) return (init = false); f(remSize()); }); ro.observe(el);
  return () => { el.remove(); ro.disconnect(); };
}
