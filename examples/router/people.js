// A fake backend: each person answers after a delay; an unknown id rejects with NotFound. Its data goes through the
// router's data layer: `getPerson` is a query (cached per id, asked again after an action), `promote` a form action.
import { query, formAction } from "@solidjs/router";
import { sendErrors } from "@reactivescript/runtime";

const people = { 1: { name: "Ann", role: "engineer" }, 2: { name: "Bo", role: "designer" } };

export class NotFound extends Error {
  // `cause` is what a library or a database driver attaches: the server keeps it, the client is not sent it (SV-5a)
  constructor(id) { super(`no person ${id}`, { cause: new Error(`people.db lookup failed for ${id}`) }); this.name = "NotFound"; this.id = id; }
}

export async function fetchPerson(id) {
  await new Promise((resolve) => setTimeout(resolve, 200));
  const person = people[id];
  if (!person) throw new NotFound(id);
  return { ...person };
}

// the router's cache serializes a rejection itself: sendErrors marks a NotFound (declared in people.d.rx) safe to send (SV-5a)
export const getPerson = query(sendErrors(fetchPerson), "person");

export const promoteForm = formAction(sendErrors(async (form) => {
  const id = String(form.get("id"));
  await new Promise((resolve) => setTimeout(resolve, 150));
  const person = people[id];
  if (!person) throw new NotFound(id);
  if (!person.role.startsWith("lead ")) person.role = `lead ${person.role}`;
  return `${person.name} promoted`;   // a result: kept as the submission's (router 2.0 lists settled outcomes)
}), "promote");
