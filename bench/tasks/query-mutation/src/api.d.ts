import type { QueryClient } from "@tanstack/solid-query";
export type Todo = { id: number; title: string };
export declare function fetchTodo(id: number): Promise<Todo>;
export declare function renameTodo(change: { id: number; title: string }): Promise<void>;
export declare function makeClient(): QueryClient;
export declare function dehydrated(client: QueryClient, ready: unknown): string;
