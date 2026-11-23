export type Person = { name: string; role: string };
export declare class NotFound extends Error { id: string; constructor(id: string); }
export declare const getPerson: (id: string) => Promise<Person>;
