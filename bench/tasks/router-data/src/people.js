// A fake backend behind the router's data layer: `getPerson` is a query (cached per id, asked again after an action
// and by `revalidate`), `promoteForm` a form action.
import { query, formAction } from "@solidjs/router";

const people = { 1: { name: "Ann", role: "engineer" }, 2: { name: "Bo", role: "designer" } };
let asked = 0;
export class NotFound extends Error {
  constructor(id) { super(`no person ${id}`); this.name = "NotFound"; this.id = id; }
}
export const getPerson = query(async id => {
  await new Promise(resolve => setTimeout(resolve, 80));
  const person = people[id];
  if (!person) throw new NotFound(id);
  return { ...person, asked: ++asked };
}, "person");
export const promoteForm = formAction(async form => {
  const id = String(form.get("id"));
  await new Promise(resolve => setTimeout(resolve, 80));
  const person = people[id];
  if (!person.role.startsWith("lead ")) person.role = `lead ${person.role}`;
  return `${person.name} promoted`;
}, "promote");
