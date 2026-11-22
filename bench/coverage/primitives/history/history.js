import { createUndoHistory as create } from "@solid-primitives/history";
// what is tracked is read; what is handed back restores it
export const createUndoHistory = (value, restore) => create(() => { const v = value(); return () => restore(v); });
