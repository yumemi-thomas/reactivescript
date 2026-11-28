// The app's own JS: the query client (a class instance), and a fake backend. The backend answers two todos, then one
// more on each later call; opened with `?down` in the URL it is down, and every call fails.
import { QueryClient } from "@tanstack/solid-query";
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const down = () => typeof location !== "undefined" && /[?&]down\b/.test(location.search);
let calls = 0;
const more = ["bread", "tea", "jam"];
export async function fetchTodos() {
  await new Promise(r => setTimeout(r, 40));
  if (down()) throw new Error("server down");
  const n = calls++;
  return [{ id: 1, title: "milk" }, { id: 2, title: "eggs" }, ...more.slice(0, n).map((title, i) => ({ id: 3 + i, title }))];
}
