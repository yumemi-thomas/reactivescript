// In-place array helpers, as an app's utils have them.
export function moveItem(list, from, to) { const [x] = list.splice(from, 1); list.splice(to, 0, x); }
export function sortBy(list, key) { list.sort((a, b) => String(a[key]).localeCompare(String(b[key]))); }
export const later = run => { setTimeout(run, 0); };
