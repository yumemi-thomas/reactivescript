// A persisted signal as `.rx` reads any signal: a reader and a setter. The library takes the signal it keeps.
import { createSignal } from "solid-js";
import { makePersisted } from "@solid-primitives/storage";
export const persisted = (init, options) => { const [get, set] = makePersisted(createSignal(init), options); return [get, value => { set(value); }]; };
