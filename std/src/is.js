// What a value is. A value that may be a function is asked by `isFunction`.
export const isArray = x => Array.isArray(x);
export const isFunction = x => typeof x === "function";
export const isNumber = x => typeof x === "number";
export const isString = x => typeof x === "string";
export const isObject = x => typeof x === "object" && x !== null;
export const isBoolean = x => typeof x === "boolean";
// JavaScript's `x as T`: the value as it is, under the type the caller says. Nothing is checked: it is the caller's word.
export const cast = x => x;
