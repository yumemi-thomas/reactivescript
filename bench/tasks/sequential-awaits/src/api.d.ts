export declare function loadUser(id: number): Promise<{ id: number; team: string }>;
export declare function loadTeam(team: string): Promise<{ name: string; size: number }>;
export declare function loadNews(): Promise<string[]>;
export declare function all<T extends readonly unknown[] | []>(ps: T): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }>;
