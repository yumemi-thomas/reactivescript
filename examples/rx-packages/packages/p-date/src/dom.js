export const toDate = (x) => x instanceof Date ? x : new Date(x);
export const nowDate = () => new Date();
export const isFn = (x) => typeof x === "function";
