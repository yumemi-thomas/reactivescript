// Solid 2's createStore, typed for this app's state: its init is a literal (`items: []`), from which TypeScript would infer
// `never[]` for the generic, and .rx passes no type arguments
import type { Store, StoreSetter } from "solid-js";
type Todos = { items: string[]; done: number };
export declare function makeStore(init: Todos): [Store<Todos>, StoreSetter<Todos>];
