// The package's own JavaScript: the request the rate is asked with. (A table, so the benchmark needs no network.)
/** What a page costs; page 9 has no quote. */
export const fetchQuote = page => new Promise((ok, no) => setTimeout(() => (page === 9 ? no(new Error("no quote for page 9")) : ok(page * 10)), 15));
/** What an effect follows, and that it stopped. */
export const followed = [];
export const follow = page => { followed.push(`+${page}`); return () => { followed.push(`-${page}`); }; };
const table = { EUR: 1, USD: 1.25, GBP: 0.8 };
export const asked = [];
export function fetchRate(code) {
  asked.push(code);
  return new Promise((ok, no) => setTimeout(() => (code in table ? ok(table[code]) : no(new Error(`no table for ${code}`))), 15));
}
