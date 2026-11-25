// The clock: what is called later, and what stops it. The same on the server and in the browser.
export function after(ms, f) { const id = setTimeout(() => f(), ms); return () => clearTimeout(id); }
export function every(ms, f) { const id = setInterval(() => f(), ms); return () => clearInterval(id); }
export function soon(f) { queueMicrotask(() => f()); }
/** Milliseconds since 1970, and since the page began (never set back). */
export const now = () => Date.now();
export const elapsed = () => performance.now();
