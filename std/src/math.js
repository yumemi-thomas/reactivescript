// JavaScript's numbers, as a module: an .rx program has no globals (spec/10 SV-7a).
export const PI = Math.PI;
export const max = (...values) => Math.max(...values);
export const min = (...values) => Math.min(...values);
export const abs = x => Math.abs(x);
export const ceil = x => Math.ceil(x);
export const cos = x => Math.cos(x);
export const floor = x => Math.floor(x);
export const round = x => Math.round(x);
export const sin = x => Math.sin(x);
export const sqrt = x => Math.sqrt(x);
export const isFinite = x => Number.isFinite(x);
export const isInteger = x => Number.isInteger(x);
