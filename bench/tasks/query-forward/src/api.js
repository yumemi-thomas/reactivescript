// The app's own JS: the query client (a class instance), and a fake backend.
import { QueryClient } from "@tanstack/solid-query";
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
let down = false;
export const setDown = v => { down = v; };
export async function fetchTodos() {
  await new Promise(r => setTimeout(r, 40));
  if (down) throw new Error("server down");
  return [{ id: 1, title: "milk" }, { id: 2, title: "eggs" }];
}
