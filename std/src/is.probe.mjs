export const probes = Object.fromEntries(["isArray", "isFunction", "isNumber", "isString", "isObject", "isBoolean", "cast"].map(k => [k, { args: () => [[1]] }]));
