import type { QueryKey, RefetchOptions } from "@tanstack/solid-query";
export declare function useQuery<TData = unknown>(options: () => { queryKey: QueryKey; queryFn: () => Promise<TData> }): { data: () => TData; isFetching: () => boolean; status: () => string; refetch: (options?: RefetchOptions) => Promise<unknown> };
