// A fake backend: an unknown id rejects with NotFound.
const people = { 1: { name: "Ann", role: "engineer" }, 2: { name: "Bo", role: "designer" } };
export class NotFound extends Error {
  constructor(id) { super(`no person ${id}`); this.name = "NotFound"; }
}
export async function fetchPerson(id) {
  await new Promise((resolve) => setTimeout(resolve, 30));
  const person = people[id];
  if (!person) throw new NotFound(id);
  return { ...person };
}
// A second question of the backend, with a failure of its own.
export class Stale extends Error {}
export async function fetchStamp(id) {
  if (id === "0") throw new Stale("stale");
  return `seen ${id}`;
}
