// What `rx-verify` runs the declaration against (09 MO-11r, MO-11u): a toaster, and — once it is mounted — a component
// handed to `toast`. The row says `renders(Toaster)`: the component must render beneath it.
let Saved;
export const scene = (lib, h) => { Saved = h.component("Saved"); return () => h.s.createComponent(lib.Toaster, {}); };
export const act = lib => { lib.toast(Saved); };
