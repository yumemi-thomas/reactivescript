// solid-primitives' comparators, as they are (MIT, see LICENSE): not reactive, and none of their syntax is .rx's.
const missing = v => v == null || (typeof v === "number" && Number.isNaN(v));
export const ascending = (a, b) => { const x = missing(a), y = missing(b); if (x || y) return x === y ? 0 : x ? 1 : -1; return a < b ? -1 : a > b ? 1 : 0; };
export const descending = (a, b) => { const x = missing(a), y = missing(b); if (x || y) return x === y ? 0 : x ? 1 : -1; return a > b ? -1 : a < b ? 1 : 0; };
export const by = (accessor, comparator = ascending) => (a, b) => comparator(accessor(a), accessor(b));
export const combine = (...cs) => (a, b) => { for (const c of cs) { const r = c(a, b); if (r !== 0) return r; } return 0; };
export const reverse = c => (a, b) => c(b, a);
export const makeSorted = (list, comparator = ascending) => list.slice().sort(comparator);
export function sortedIndex(list, value, comparator = ascending) { let lo = 0, hi = list.length; while (lo < hi) { const mid = (lo + hi) >>> 1; if (comparator(list[mid], value) < 0) lo = mid + 1; else hi = mid; } return lo; }
export const sortedIndexBy = (list, value, accessor, comparator = ascending) => sortedIndex(list, value, by(accessor, comparator));
export function insertSorted(list, value, comparator = ascending) { const i = sortedIndex(list, value, comparator); return [...list.slice(0, i), value, ...list.slice(i)]; }
// a comparator is a function of two; an accessor of one takes nothing
export const compare = c => (c === undefined ? ascending : c.length === 0 ? c() : c);
