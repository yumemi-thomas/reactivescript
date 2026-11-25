const KEYS = ["hash", "host", "hostname", "href", "origin", "password", "pathname", "port", "protocol", "search", "username"];
const pick = (u) => Object.fromEntries(KEYS.map((k) => [k, u[k]]));
export const recordOf = (url, base) => pick(new URL(url, base));
export const withField = (rec, key, value) => { const u = new URL(rec.href); u[key] = typeof value === "function" ? value(u[key]) : value; return pick(u); };
export const withRecord = (rec, r) => { const u = new URL(rec.href); for (const [k, v] of Object.entries(typeof r === "function" ? r(rec) : r)) if (k !== "origin" && v != null) u[k] = v; return pick(u); };
