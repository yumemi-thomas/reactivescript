import { createSignal } from "solid-js";
import { makePersisted } from "@solid-primitives/storage";
export const persisted = (init, options) => { const [get, set] = makePersisted(createSignal(init), options); return [get, v => { set(v); }]; };
