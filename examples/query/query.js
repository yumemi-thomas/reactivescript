import { QueryClient } from "@tanstack/solid-query";
export { QueryClientProvider, useQuery, useMutation, useQueryClient } from "@tanstack/solid-query";
export function makeClient() { return new QueryClient({ defaultOptions: { queries: { retry: false } } }); }
