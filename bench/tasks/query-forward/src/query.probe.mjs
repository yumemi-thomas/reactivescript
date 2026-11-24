import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
let n = 0;
const ask = queryFn => () => { const queryKey = ["k", ++n]; return [() => ({ queryKey, queryFn })]; };
export const providers = { queryClient: (children, s) => s.createComponent(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }), get children() { return children(); } }) };
export const probes = { useQuery: { args: ask(async () => { await new Promise(r => setTimeout(r, 5)); return 1; }), fail: ask(async () => { throw new Error("down"); }) } };
