const todos = ["milk", "eggs"]; let fail = false;
export const setFail = v => { fail = v; };
export async function fetchTodos() { await new Promise(r => setTimeout(r, 150)); if (fail) throw new Error("server down"); return [...todos]; }
export async function addTodo(text) { await new Promise(r => setTimeout(r, 100)); todos.push(text); return text; }
