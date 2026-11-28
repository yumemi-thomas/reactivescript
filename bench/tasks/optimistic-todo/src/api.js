// A fake backend: it keeps the todos, answers after 150 ms, and refuses a title it does not like.
const todos = [{ id: "a", title: "milk" }];
const wait = ms => new Promise(r => setTimeout(r, ms));
let n = 0;
export const newId = () => `c${++n}`;
export async function fetchTodos() { await wait(60); return todos.map(t => ({ ...t, saving: false })); }
export async function addTodo(id, title) {
  await wait(150);
  if (title === "nothing") throw new Error("nothing to do");
  todos.push({ id, title });
}
