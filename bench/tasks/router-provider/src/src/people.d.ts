export type Person = { name: string; role: string };
export declare class NotFound extends Error { constructor(id: string); }
export declare function fetchPerson(id: string): Promise<Person>;
