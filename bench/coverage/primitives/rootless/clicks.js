import { createSignal } from "solid-js";
import { createSingletonRoot } from "@solid-primitives/rootless";
export const useClicks = createSingletonRoot(() => { const [clicks, setClicks] = createSignal(0); return [clicks, () => setClicks(c => c + 1)]; });
