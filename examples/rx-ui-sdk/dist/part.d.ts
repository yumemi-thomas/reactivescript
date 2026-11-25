// the types of part.js, for TypeScript — do not edit (spec/09 MO-13e). An .rx module reads part.d.rx and part.rx.d.ts.
import type * as __m from "./part.rx.js";
import type { Accessor as __Accessor } from "solid-js";
/** A `ref` parameter: an accessor, or the value — where the value may be a function, an accessor. */
type __Ref<T> = (() => unknown) extends T ? __Accessor<T> : [Extract<T, (...a: never) => unknown>] extends [never] ? T | __Accessor<T> : __Accessor<T>;
type __Refs<A extends unknown[], R extends boolean[]> = { [K in keyof A]: K extends keyof R ? (R[K] extends true ? __Ref<A[K]> : A[K]) : A[K] };
/** The module as an .rx app instantiates it (MO-13c). */
export declare const __rx: (rt: unknown) => Record<string, unknown>;
export declare const usePart: (...args: __Refs<Parameters<typeof __m.usePart>, [true, false, true, true, true]>) => { "part": __Accessor<ReturnType<typeof __m.usePart>["part"]>; "attrs": __Accessor<ReturnType<typeof __m.usePart>["attrs"]>; "now": ReturnType<typeof __m.usePart>["now"]; "tick": __Accessor<ReturnType<typeof __m.usePart>["tick"]> };
