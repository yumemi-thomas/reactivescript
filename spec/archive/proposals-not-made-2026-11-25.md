# What proposals/ does not propose, and why

Taken out of `proposals/` on 2026-11-25, after a sceptical review. The prototype still has each form here.

## `handler`, a callback the library calls later

A closure given to a declared call is a pure function (SC-3), so it cannot write a source. The word before a function type (`onSuccess?: handler () => void`) makes it a handler's. **An action by its name does the same today, on both trees**, so the word is a convenience of the caller:

<!-- check branch=ok upstream=ok -->
```rx
import { useMutation } from "./q.js"
export default component App() {
  source done := false
  action finish() { done := true }
  m = useMutation({ onSuccess: finish })
  <button onClick={() => { m.mutate(1) }}>{done ? "ok" : "go"}</button>
}
-- file: ./q.d.rx
export pure fn useMutation(options: { onSuccess?: () => void }): { mutate: (v: number) => void } instantiates
```

What remains true of it: 26 of the benchmark's programs are written with the closure, and none was rewritten with an action to count what that costs. It leaves open the case that fails: an action given where JavaScript calls at once
(`proposals/bugs/05-action-in-a-value.md`). MO-10g, S-module-12.

## `draft`, a value a library hands out to be changed

One library has the callback form (`solid-js`'s `createStore`), two programs use it, it is the largest checker change of the branch, and a JavaScript updater works with no word:

<!-- check branch=ok upstream=ok -->
```rx
import { makeStore } from "./store.js"
import { inc } from "./app.js"
export default component App() {
  [s, set] = makeStore({ n: 1 })
  <button onClick={() => { set(inc) }}>{s.n}</button>
}
-- file: ./store.d.rx
export pure fn makeStore(v: any): [any, (update: (state: any) => void) => void] instantiates
```

`.rx` has structured sources with path writes. MO-10i, S-module-25.

## `pending` before `ref`, and either word on a record's field

MO-10d says that any accessor can hold. `proposals/16-accessor-failures.md` keeps `fails(E)` on a whole result.

## `for (const x of e) { … }` in imperative scope

No count of programs was made, and it has snapshot and suspension rules of its own (the list is the one it started with; an `await` in it is the run's). d45dc35, S-surface-10.

## Strict mode (`rx-tsc --rx-strict`), and `pure` in generated files

A record cannot certify `pure`. `proposals/22` and `23`.

## TypeScript 7

**What was tried.** The language server, `rx-tsc`, the draft's check and the check of a declaration against its module run on
tsrs 7.1.0-beta.tsrs5, a port of TypeScript 7.1 beta (`rx-tsc --version`, run). Upstream is on TypeScript 6.0.3 through Volar.
Reading a library's types for a draft stays on TypeScript 6 in process: it makes over a million calls for a large package.

**The regression that blocks it.** TypeScript 7.1 beta refuses a correct program that 6.0.3 accepts (microsoft/TypeScript 64673; the
fix, 64307, was not merged when recorded):

```ts
declare function f<T>(v: T): T extends any[] ? T[number] : NonNullable<T>;
const g: <T>(v: T) => T extends any[] ? T[number] : NonNullable<T> = f;
```

A value of a generic function type that writes a conditional over its own type parameter is not assignable to the same type. A
declaration's rows are written as instances of their type, which relate. An app's own code is not.

`node tooling/rx-language-server/test/checker.js` (15 checks, run at a349e48) holds the regression: it fails when it is gone.

**Other differences.** Options TypeScript 7 removed (`baseUrl`, `node10`, `ES5`) are errors. Two messages have other codes. One task
of 37 and no scenario of 245 changed its output (record in `spec/archive/ts7-tsrs-2026-11-24.md`, not re-run).

**What it gives.** `rx-tsc` over the 37 tasks: 64 s of CPU to 13 s (record, not re-run).

**What to do.** Nothing, until the regression is fixed in a release. tsrs is a beta by one author; the pin is exact.


## Dead ends

Dead ends, each with its evidence. Numbers with no command are the archive's records, and were not re-run.

**Words that were built and withdrawn.** Each is refused by name in both declaration parsers here (S-module-18, 21, 22, 23, 27, the
unit `a_word_no_longer_in_the_vocabulary_is_refused`).

| word | what it said | why it went |
| --- | --- | --- |
| `signal` | a parameter is a Solid signal | one library; three lines of JavaScript do it |
| `tracked` | a callback called in a computation | an unmarked function is already pure |
| `methods(…)` | methods that keep an instance stable | an assertion nobody could check; `peek` |
| `joins(…)`, `forwards` | typed route paths; a call hands its arguments on | TypeScript's question; `pure` says it |
| `renders`, `renders(root, …)`, `renders(later)`, `nests(… under …)`, `outlet`, `under`, `carries` | where TanStack Router's values are rendered | one library, and an analysis of values with holes |
| `pending`, `fails` on a plain field; `holds` | a store's field waits | one library; before `ref` instead |
| `trusted` | a row strict mode need not see | every row would have it |
| several rows of one name | overloads | the words must agree; TypeScript has the rest |

**Guessing from a name.** `create…`, `use…` and `on…` were read as `instantiates`, `uses` and `handler`. 248 rows had nothing but
the name for `instantiates`; with proof, 115 of 301 have it again. A name is a convention.

**Guessing from a shape.** `() => T` in a result was read as an accessor. Seven were false: each call made another value.

**A list of known libraries.** Nine, by hand, with a version range each. Two words were false.

**Writing a word from a run.** A hook that fails with no provider shows that something is missing, not what. A run refutes.

**Following values.** A component carried in a value, a draft, a result with held fields: each was first an analysis (aliases,
records, spreads, closures, calls). Four reviews found holes each time. What replaced it is local: where a name may stand
(MO-10k). Do not start from the analysis.

**Tests that prove nothing.** A result of `rx-verify` was "held" by a run that could not have failed; now each is run again over a
module made false. Two `Accepted variants` sections (7 programs) never ran, since no runner read the heading. One check was counted as three. The compiled runner and the oracle shared one bug ([03](../../proposals/bugs/03-effect-loses-cleanup.md)), so agreement was no
evidence; the interpreter was right.

**A claim to check before it is repeated.** Of the claims an independent review sampled, half of those about tasks and two thirds of those about
coverage were not verified at the time (its record). More were found not to hold while these documents were written: README, *Claims corrected*.

**Splitting a draft's type check to run it in parallel.** Two of 305 checks lose an error when cut: TypeScript's depth limit depends
on what it read before. Two processes took 0.71 s for 0.84 s, with more CPU. A check is never cut.

**A generated file by position in an install.** A draft named a dependency's type where npm had hoisted it, and wrote it out where not:
one `package.json` gave two drafts. Types are resolved from the library's place.

**The package's source to find its words.** 16 of 192 packages ship it. 360 lines, comments only.

**A check that is one library's rule.** A query key that misses an input was a checked mistake for a while. It is TanStack's rule. The bar:
the checker enforces reactivity, ownership, and what a declaration says in generic words.

**A `library in .rx` pitch.** 22 of 739 primitives. See [13](../../proposals/17-packages.md).

**Reading the language from compiled output alone.** `rx-declare` reads JSX from a package's `solid` file. Read from the compiled
JavaScript, an event that is an attribute is a call in a template, and nothing was proven.
