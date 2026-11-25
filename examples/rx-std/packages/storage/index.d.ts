import type { Accessor } from "solid-js";
export declare function createPersisted<T>(key: string, initial: T, storage?: { getItem(k: string): string | null | Promise<string | null>; setItem(k: string, v: string): unknown; removeItem(k: string): unknown }): [value: Accessor<T>, set: (v: T) => Promise<void>, clear: () => Promise<void>];
