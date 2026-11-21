// A fake backend: each call answers after 60 ms.
const wait = v => new Promise(r => setTimeout(() => r(v), 60));
export const loadUser = id => wait({ id, team: "blue" });
export const loadTeam = team => wait({ name: team, size: 4 });
export const loadNews = () => wait(["release 2.0"]);
export const all = ps => Promise.all(ps);
