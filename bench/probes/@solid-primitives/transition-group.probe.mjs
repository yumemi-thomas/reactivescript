import { createSignal, flush } from "solid-js";
let shown, show;
export const probes = { createSwitchTransition: { args: () => { [shown, show] = createSignal("a"); return [shown, { onEnter: (_e, done) => done(), onExit: (_e, done) => done() }]; }, run: async () => { show("b"); flush(); await new Promise(r => setTimeout(r, 20)); } } };
