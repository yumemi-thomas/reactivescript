export type Person = { name: string; role: string };
export declare class NotFound extends Error { constructor(id: string); }
export declare function fetchPeople(): Promise<{ id: string; name: string }[]>;
export declare function fetchPerson(id: string): Promise<Person>;
export declare class Stale extends Error {}
export declare function fetchStamp(id: string): Promise<string>;
