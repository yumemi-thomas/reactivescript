export const abortAll = (cs) => cs?.forEach((c) => c.abort());
export const makeControllers = (n) => Array.from({ length: n }, () => new AbortController());
