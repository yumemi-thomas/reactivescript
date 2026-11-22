export type Todo = { id: string; title: string; saving: boolean };
export declare function newId(): string;
export declare function fetchTodos(): Promise<Todo[]>;
export declare function addTodo(id: string, title: string): Promise<void>;
