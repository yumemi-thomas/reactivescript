# 04 — A row is held to the library's own types (tooling)

Needs nothing in the checkers.

## Problem

<!-- types branch=DECLARATION_MISMATCH upstream=ok -->
```rx
import { f } from "./l.js"
export default component App() { <p>{f(1)}</p> }
-- file: ./l.d.rx
export pure fn f(a: string): number
-- file: ./l.js
export const f = (a) => a
-- file: ./l.d.ts
export declare const f: (a: number) => number
```

## Proposal

Where a declared module has TypeScript types, `rx-tsc` asks TypeScript whether the module is assignable to each row: `DECLARATION_MISMATCH`, on the row. A row may say less
than the library.

Later, apart: a component's props as the library's own type (`props: ToggleOptions & { … }`); `//@ for kit ^6.0.0`, the versions a declaration is for (`DECLARATION_VERSION`).

## What it does not do

- It is assignability, so `any` in a row passes, and the row then says nothing:

<!-- types branch=ok upstream=ok -->
```rx
import { f } from "./l.js"
export default component App() { <p>{f(1)}</p> }
-- file: ./l.d.rx
export pure fn f(a: any): any
-- file: ./l.js
export const f = (a) => a
-- file: ./l.d.ts
export declare const f: (a: number) => number
```

- Types say nothing of `pure`, or of any other word.

## Evidence

Every row of 193 drafted modules (5,111 rows) is held by it in the benchmark.

## Cost

`src/boundary.js` (97 lines), and the projection's `boundary`. One more file is checked for each declaration. Time not measured alone.

## Open

An error, or advice until a project asks?

## Prototype

MO-8f, MO-8o, MO-8q, 13 TY-6 (proposed ids). S-module-26, 31, 32.
