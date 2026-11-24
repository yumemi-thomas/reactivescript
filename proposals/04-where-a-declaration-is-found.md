# 04 — Where a package's declaration is found, and what holds it to the library

## Problem

A declaration is read beside the file an import resolves to (MO-10c). A package that ships none needs a module of the
app's own that re-exports each name.

<!-- check branch=ok upstream=IO_IN_REACTIVE -->
```rx
import { f } from "kit"
export default component App() { <p>{f(1)}</p> }
-- file: ./rx-types/kit.d.rx
export pure fn f(a: number): number
```

Upstream reads `rx-types/` nowhere. And nothing compares a row with the module's own types, so a row with a wrong type is
believed:

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

- **The place.** The first that exists: (1) the project's, `rx-types/<spec>.d.rx`, in the importer's folder or one above;
  (2) the package's own, beside the file the import resolves to; (3) a shared one,
  `node_modules/@rx-types/<scope>__<name>/`; (4) a generated one ([10](10-generated-declarations.md)). With none, R-io-4
  as today.
- **Types.** An import from a package with types is typed by them. A `.d.rx` types a module with none (TY-4b, as today).
- **Held to the library.** Where both exist, `rx-tsc` asks TypeScript whether the module is assignable to each row. A row
  may say less than the library, never something else: `DECLARATION_MISMATCH`, on the row.
- **Pinned.** `//@ for kit ^6.0.0` is a comment to the checkers. `rx-tsc` refuses the declaration when the installed
  version is outside the range (`DECLARATION_VERSION`).

The four parts can be taken alone, in this order.

## Evidence

- The benchmark keeps 159 declarations under `rx-types/` for packages as npm has them (`find bench/tasks bench/coverage
  -path '*rx-types*' -name '*.d.rx' | wc -l`). None of the packages ships a `.d.rx`.
- The types' check is what makes a tool's draft trustworthy: every row of 193 drafted modules (5,111 rows) is held by it
  (`bench/coverage/coverage.txt`, held by CI).
- One shared declaration exists: `declarations/solid-js`, for `createStore`'s setter.

## Cost

- Places: 114 lines in the crate, 44 in `ref/src`, for the search and the cautious rules that came with it (d9d2476).
- Types: `src/boundary.js` (97 lines), `src/checker.js` (170), `src/versions.js` (49), and the projection's `boundary`.
- Time: `rx-tsc` checks one more file for each declaration the program imports. Not measured alone.
- Both checkers must resolve a package as a bundler does. Upstream's already do (MO-10c).

## What it does not do

- Types say nothing of `pure`, `uses` or `handler`: those are run ([11](11-rx-verify.md)) or read from the code
  ([10](10-generated-declarations.md)).
- A package whose conditions resolve to several files needs a declaration beside each.

## Alternatives tried and rejected

- *A re-exporting module for each package* (upstream's way). It works and stays. In the benchmark it was a JS file and a
  declaration for each package.
- *An export condition (`"rx"`).* Not needed: the file beside the resolved one is found with no change to a package.
- *Restating the library's types in each row.* A restated type is equal, looser, or a mismatch. Nothing reads it. Rows
  name the library's types instead (`import("kit").Options`), which is why 159 files are short.
- *`any` where a type is hard to write.* Not allowed in a row of a typed package unless the library has `any` there. The
  benchmark counts 0 introduced (`bench/scorecard.txt`).

## Compatibility

A project with a folder named `rx-types` would have it read. A wrong row that upstream accepts is refused by `rx-tsc`.

## Open questions

- Is a shared scope (`@rx-types`) wanted, and who reviews it?
- Should the mismatch be an error, or advice until a project asks?

## Prototype

MO-8f, MO-8k, MO-8q, 13 TY-4b, TY-6. S-module-26, 31, 32. d9d2476, d7c4c50, 4841bc8.
