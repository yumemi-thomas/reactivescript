# 19 — What not to do

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
module made false. Two `Accepted variants` sections (7 programs) never ran, since no runner read the heading. One check was counted as three. The compiled runner and the oracle shared one bug ([03](bugs/03-effect-loses-cleanup.md)), so agreement was no
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

**A `library in .rx` pitch.** 22 of 739 primitives. See [13](13-packages-in-rx.md).

**Reading the language from compiled output alone.** `rx-declare` reads JSX from a package's `solid` file. Read from the compiled
JavaScript, an event that is an attribute is a call in a template, and nothing was proven.
