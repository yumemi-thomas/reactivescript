import { QueryClient, useQuery as useLibraryQuery } from "@tanstack/solid-query";
export { QueryClientProvider, useMutation, useQueryClient } from "@tanstack/solid-query";
export function makeClient() { return new QueryClient({ defaultOptions: { queries: { retry: false } } }); }
// The library's result is a store whose `data` waits and throws where it is read. To `.rx` what waits where it is read
// is an accessor (09 MO-10d), so each field is handed out as a function (MO-8r: a few lines of the app's own).
export function useQuery(options) {
  const q = useLibraryQuery(options);
  return { data: () => q.data, isFetching: () => q.isFetching };
}
