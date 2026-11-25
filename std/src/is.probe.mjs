export const probes = Object.fromEntries(["isArray", "isFunction", "isNumber", "isString", "isObject"].map(k => [k, { args: () => [[1]] }]));
