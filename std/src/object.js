// JavaScript's records and lists, as a module.
export const keys = o => Object.keys(o);
export const entries = o => Object.entries(o);
export const fromEntries = list => Object.fromEntries(list);
export const from = list => Array.from(list);
// JavaScript's `new Set(xs)` and `new Map(pairs)`: a made thing is a value, changed by a write of a new one.
export const setOf = xs => new Set(xs);
export const mapOf = pairs => new Map(pairs);
