// rx-verify's probe for primitives.d.rx: makePersisted takes a signal (MO-10h), as the compiler makes it; debounce's
// callback is called after the wait, as a handler (MO-10g), once the debounced function is.
import { createSignal } from "solid-js";
export const probes = {
  makePersisted: { args: () => [createSignal("light"), { name: "rx-verify-theme" }] },
  debounce: { args: () => [() => {}, 5], act: async f => { f(1); await new Promise(r => setTimeout(r, 30)); } },
};
