// The app's own module over @tanstack/solid-query's `useQuery` (09 MO-8r, MO-10c). The library's result is a store whose
// `data` waits for the first answer and throws the query's error where it is read; to `.rx` what waits where it is read is
// an accessor (MO-10d), so each field the app reads is handed out as a function.
import { useQuery as useLibraryQuery } from "@tanstack/solid-query";
export function useQuery(options) {
  const q = useLibraryQuery(options);
  return { data: () => q.data, isFetching: () => q.isFetching, status: () => q.status, refetch: o => q.refetch(o) };
}
