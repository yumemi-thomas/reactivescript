// what only the app has: a client in a provider, and options for a query that answers or fails
import { createComponent } from "solid-js";
import { QueryClientProvider, makeClient } from "./query.js";
let n = 0;
export const provide = children => createComponent(QueryClientProvider, { client: makeClient(), get children() { return children(); } });
export const probes = {
  useQuery: {
    args: () => [() => ({ queryKey: ["probe", n++], queryFn: async () => ["a"] })],
    fail: () => [() => ({ queryKey: ["probe", n++], queryFn: async () => { throw new Error("probe") } })],
  },
  useMutation: { args: () => [() => ({ mutationFn: async v => v })], run: m => m.mutate(1) },
};
