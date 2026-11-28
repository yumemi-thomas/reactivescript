import { createSignal, flush } from "solid-js";
let value, set;
export const probes = { createUndoHistory: { args: () => { [value, set] = createSignal(1); return [value, v => { set(v); }]; }, run: async h => { set(2); flush(); await new Promise(r => setTimeout(r, 10)); h.undo(); } } };
