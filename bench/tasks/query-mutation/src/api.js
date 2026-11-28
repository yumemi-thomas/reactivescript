// The app's own JS: a fake backend, and the query client — made per page, and in the browser started from the cache
// the server sent (TanStack's dehydrate / hydrate).
import { QueryClient, dehydrate, hydrate } from "@tanstack/solid-query";

const todos = { 1: { id: 1, title: "milk" }, 2: { id: 2, title: "eggs" } };
const seen = globalThis.__backend = { fetches: 0 };
export async function fetchTodo(id) {
  seen.fetches++;
  await new Promise(r => setTimeout(r, 40));
  return { ...todos[id] };
}
export async function renameTodo({ id, title }) {
  await new Promise(r => setTimeout(r, 40));
  todos[id].title = title;
}
export function makeClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
  const sent = typeof document !== "undefined" && document.getElementById("cache");
  if (sent && sent.textContent) hydrate(client, JSON.parse(sent.textContent));
  return client;
}
/** The client's cache as JSON, once `ready` (a query's data) has answered. In the browser: what the server sent. */
export function dehydrated(client, ready) {
  if (typeof document !== "undefined") return document.getElementById("cache")?.textContent ?? "";
  return JSON.stringify(dehydrate(client));
}
