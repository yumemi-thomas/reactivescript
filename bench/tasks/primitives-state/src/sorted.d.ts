import type { Accessor } from "solid-js";
export declare function sortedBy<T>(list: Accessor<T[]>, comparator: (a: T, b: T) => number): Accessor<T[]>;
