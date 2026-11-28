import { createMutable } from "@solid-primitives/mutable";
export const createCart = () => createMutable({ count: 0 });
export const add = cart => { cart.count++; };
