// rx-verify's probe for store.d.rx: an initial state, so createStore's draft row is checked by calling its setter (its
// callback must get an object, and a write to it must be kept).
export const probes = { createStore: { args: () => [{ items: [], done: 0 }] } };
