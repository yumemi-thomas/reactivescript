import type { QueryClient } from "@tanstack/solid-query";
export type Todo = { id: number; title: string };
export declare const queryClient: QueryClient;
export declare function setDown(v: boolean): void;
export declare function fetchTodos(): Promise<Todo[]>;
