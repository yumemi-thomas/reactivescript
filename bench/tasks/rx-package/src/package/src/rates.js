// The package's own JavaScript: the request the rate is asked with. (A table, so the benchmark needs no network.)
const table = { EUR: 1, USD: 1.25, GBP: 0.8 };
export const asked = [];
export function fetchRate(code) {
  asked.push(code);
  return new Promise((ok, no) => setTimeout(() => (code in table ? ok(table[code]) : no(new Error(`no table for ${code}`))), 15));
}
