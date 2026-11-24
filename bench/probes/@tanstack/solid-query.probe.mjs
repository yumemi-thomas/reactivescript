import { QueryClient } from "@tanstack/solid-query";
const client = new QueryClient();
export const uses = { queryClient: lib => lib.useQueryClient() };
export const probes = {
  QueryClientProvider: { props: () => ({ client }) },
  useMutation: { args: () => [() => ({ mutationFn: async () => 1, onSuccess: () => {} })], run: async m => { await m.mutate(); } },
};
