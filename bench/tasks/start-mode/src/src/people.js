// A fake backend behind the router's data layer: `getPerson` is a query (cached per id); an unknown id rejects with NotFound.
import { query } from "@solidjs/router";

const people = { 1: { name: "Ann", role: "engineer" }, 2: { name: "Bo", role: "designer" } };
export class NotFound extends Error {
  constructor(id) { super(`no person ${id}`); this.name = "NotFound"; this.id = id; }
}
export const getPerson = query(async id => {
  await new Promise(resolve => setTimeout(resolve, 60));
  const person = people[id];
  if (!person) throw new NotFound(id);
  return { ...person };
}, "person");
