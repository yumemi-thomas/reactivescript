// JavaScript's records and lists, as a module.
export const keys = o => Object.keys(o);
export const entries = o => Object.entries(o);
export const fromEntries = list => Object.fromEntries(list);
export const from = list => Array.from(list);
