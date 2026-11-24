# 10 — Generated declarations: proven words only (tooling)

Depends on [04](04-where-a-declaration-is-found.md), and on whichever words of 02, 05 and 08 are taken.

## Problem

A package with no `.d.rx` is an undeclared import. A component from it cannot be applied; a function that only computes is
io. Writing a declaration for each package is work, and a wrong word in it accepts a wrong program.

## Proposal

A tool drafts a declaration from a package's TypeScript types, and from the JavaScript an import resolves to. It writes it
under `node_modules/.rx-types/`, with a first line that says what it was drafted from. Three rules:

1. **Only proven words.** A word is written where the code proves it by a general rule. None off a name (`use…`, `on…`), a
   shape (`() => T`), a run, or a list of libraries. An absent word means what it means today.
2. **A generated file refuses nothing that no file accepts.** What the import says stands, and a name with no row is an
   undeclared import. Two exceptions: a proven `instantiates`, `uses` or `draft`, and a `ref` (the gain).
3. **A question is asked only where its answer changes a verdict.** A draft for a person has a `// TODO` for each; a
   generated file has none.

Rule 2, run. Upstream reads this file nowhere; the program is accepted with and without it:

<!-- check branch=ok upstream=ok -->
```rx
import pure { format } from "kit"
export default component App() { <p>{format(1)}</p> }
-- file: ./node_modules/.rx-types/kit.d.rx
//@ generated kit@1.0.0 (MO-8l, draft 16, types 0)
export fn format(n: number): string
-- file: ./node_modules/kit/package.json
{ "name": "kit", "version": "1.0.0", "main": "./index.js" }
-- file: ./node_modules/kit/index.js
export const format = n => String(n)
```

The same row, written by a person, is held to:

<!-- check branch=IMPORT_ROW_MISMATCH+IO_IN_REACTIVE upstream=ok -->
```rx
import pure { format } from "kit"
export default component App() { <p>{format(1)}</p> }
-- file: ./rx-types/kit.d.rx
export fn format(n: number): string
```

Rule 1, run (`rx-declare ./kit.js --why`):

<!-- tool branch=ok upstream=- tool=declare args=./kit.js,--why says-branch="pure not proven — it changes its argument `xs` in place" -->
```text
export default component App() { <p>a</p> }
-- file: ./kit.js
export function sorted(xs) { return xs.sort(); }
export function later(cb) { setTimeout(cb, 10); }
-- file: ./kit.d.ts
export declare function sorted(xs: number[]): number[];
export declare function later(cb: () => void): void;
```

It prints `export fn sorted(draft xs: number[]): number[]` and `export fn later(cb: handler () => void): void`.

## Evidence

From `bench/coverage/coverage.txt`, held by CI at a349e48:

- 193 modules of 104 packages drafted whole: 5,111 rows. 1,659 words written: 984 `handler`, 459 `pure`, 139
  `instantiates`, 43 `provides`, 25 `uses`, 9 `draft`. No `rejects`, `nests`, `renders`, `pending` or `fails`.
- 660 questions are left: 364 `pure`, 209 `handler`, 40 overloads, 30 `uses`, 8 `renders`, 7 `nests`, 2 `rejects`.
- Of the words the benchmark's programs keep, 132 are proven (77 in tasks, 55 in coverage entries), 0 contradicted, 92
  neither (56 and 36).
- Rule 2: `node --experimental-strip-types bench/generated.mjs` reads 10,967 accepted uses and programs again with the generated
  declaration. 0 are newly refused with no reason (re-run at a349e48, 2 min 15 s).

False words, and how they were found (`spec/archive/generated-words-2026-11-24.md`, not re-run): `ref` off the shape
`() => T` was false seven times (each read made another value); `uses(toast)` from a list of known libraries was false of
Kobalte's `ProgressTrack`. All were found by running the drafts with `rx-verify`. Both rules went.

What code proves least: `handler` outside event maps, since a callback that goes into a record spread on a component is
lost (`bench/audit.txt` has 19 such rows among the kept); `uses`, since routers read their context on one path.

## Cost

- The drafting: `declare.js` 1,226 lines, `declare-infer.js` 314, `questions.js` 136, `generate.js` 180, `declare-check.js` 61.
- The reading of code: `infer.js`, 2,054 lines. It is the dearest file in this branch. `pure` needs most of it.
- Time: `@ui-sdk/solid` drafts in 6.7 s of CPU (record, not re-run), once per installed version.
- In the checkers: rule 2 is a set of exceptions for generated rows, in both.

## What it does not do

- It does not run the package.
- It proves nothing of a package that ships code it cannot read (a computed call, a class with a subclass).
- It does not draft for a package with no types.

## Alternatives tried and rejected

- *Guess, and let a person correct.* An import nobody reviewed then accepted programs. Withdrawn.
- *A list of known libraries, by hand.* Two of its rows were false, and its version ranges were wider than what was read.
- *The package's original source.* 16 of 192 packages ship it; 360 lines wrote comments. Deleted.
- *A default that is right more often (`handler` on `on…`).* It changes what an absent word means.

## Compatibility

A package that is undeclared today gets a declaration. Programs accepted stay accepted, but for rule 2's exceptions.

## Open questions

- Is the drafting upstream's to ship, or a separate package?
- Without `infer.js`, a draft from types alone has components, `ref` and no words. Is that enough for a first step?

## Prototype

MO-8l, n, v, w; `tooling/rx-language-server/DECLARATIONS.md`. 1f73c9a, af2b65a, 22549e5, 0d40700, c90c41a, f326c4e.
