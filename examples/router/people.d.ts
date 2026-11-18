// For rx-tsc and editors (TY-1c): people.js's types, as people.d.rx declares its rows.
export type Person = { name: string; role: string };
export declare class NotFound extends Error {}
export declare function fetchPerson(id: string): Promise<Person>;
