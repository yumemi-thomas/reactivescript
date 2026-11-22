// A fake backend: each call answers after 60 ms. It keeps what a test asks of it — how many calls were out at once,
// and the order they were asked in — on `globalThis.__backend`.
const seen = globalThis.__backend = { live: 0, peak: 0, asked: [] };
const wait = (name, v) => { seen.asked.push(name); seen.peak = Math.max(seen.peak, ++seen.live); return new Promise(r => setTimeout(() => { seen.live--; r(v); }, 60)); };
export const loadUser = id => wait("user", { id, team: "blue" });
export const loadTeam = team => wait("team", { name: team, size: 4 });
export const loadNews = () => wait("news", ["release 2.0"]);
export const all = ps => Promise.all(ps);
