import { onCleanup, untrack } from "solid-js";
import { isServer } from "@solidjs/web";
import * as core from "@rx-primitives/keyboard/core";
export { createShortcut, createKeyDown } from "./src/shortcut.js";

// the module is made, and its listeners added, at its first read: here, not when the value is first wanted
const used = accessor => { untrack(accessor); return accessor; };
export const useKeyDownEvent = () => (isServer ? () => null : used(core.event));
export const useKeyDownList = () => (isServer ? () => [] : used(core.keys));
export const useCurrentlyHeldKey = () => (isServer ? () => null : used(core.held));
export const useKeyDownSequence = () => (isServer ? () => [] : used(core.sequence));
export function createKeyHold(key, { preventDefault = true } = {}) {
  if (isServer) return () => false;
  if (preventDefault) {
    const h = e => { if (e.key.toUpperCase() === key.toUpperCase()) e.preventDefault(); };
    window.addEventListener("keydown", h); onCleanup(() => window.removeEventListener("keydown", h));
  }
  return core.createKeyHold(key);
}
