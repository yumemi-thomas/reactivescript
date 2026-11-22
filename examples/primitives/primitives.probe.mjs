// rx-verify's probe for primitives.d.rx: `persisted` is the app's own three lines over makePersisted (MO-10c); debounce's
// callback is called after the wait, as a handler (MO-10g), once the debounced function is.
export const probes = {
  persisted: { args: () => ["light", { name: "rx-verify-theme" }] },
  debounce: { args: () => [() => {}, 5], act: async f => { f(1); await new Promise(r => setTimeout(r, 30)); } },
};
