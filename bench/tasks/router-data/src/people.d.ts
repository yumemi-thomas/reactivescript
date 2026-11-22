import type { FormAction } from "@solidjs/router";
export type Person = { name: string; role: string; asked: number };
export declare class NotFound extends Error { id: string; constructor(id: string); }
export declare function getPerson(id: string): Promise<Person>;
export declare const promoteForm: FormAction<[form: FormData], string, FormData>;
