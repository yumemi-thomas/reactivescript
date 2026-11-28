import { createFluxStore } from "@solid-primitives/flux-store";
export const createCounter = initial => createFluxStore({ count: initial }, {
  getters: state => ({ doubled: () => state.count * 2 }),
  actions: setState => ({ increment: () => { setState(s => { s.count++; }); } }),
});
