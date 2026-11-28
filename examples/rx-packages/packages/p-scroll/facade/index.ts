export * from "@solid-primitives/scroll";
import { createScrollPosition as rx } from "../dist/core.js";
/** A record of getters, as the original answers. */
export const createScrollPosition = (target?: any) => { const p = rx(target); return { get x() { return p().x; }, get y() { return p().y; } }; };
