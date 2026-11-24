# Proposals

This branch is a prototype, and evidence. It is not meant to be merged. Each file here is one decision that can be taken alone, or a bug
of `main` with its smallest program. Nothing here has been sent or opened as an issue.

- **Upstream** is `main` at e650b85. **This branch** is measured at the commit this file is in. Both use Solid 30e7805eb.
- The spec of this branch (`spec/`) is the prototype's, not a proposal's text. Rule ids that begin with MO-8d to MO-8w, MO-10f and after, MO-11, MO-12, MO-13 and MO-14, and C-3a, EF-5a, W-1a and CP-4c, CP-4d
  are **proposed** ids: upstream has none of them.
- A sceptical review of the first set is acted on here. What it rejected is under *Not proposed*.

## Words

| | |
| --- | --- |
| a *row* | one export's line in a `.d.rx` file, which declares a JavaScript module to `.rx` (upstream's MO-8) |
| an *owner* | Solid's: what a piece of state is disposed with |
| a *factory* | a JavaScript function that answers a component |
| a *host* | JavaScript that renders `.rx` components (a file-based router) |
| *cautious* | checked as applied with nothing above it |
| a *facade* | JavaScript a package keeps beside its `.rx`, to give the API it had |
| a *variant* | one of a benchmark program's one-line mistakes, with the diagnostic its author expects |
| a *missed* variant | that diagnostic is no longer given: the program is accepted, **or** refused by another |

## Run the evidence

```sh
node proposals/check.mjs                        # every marked program, on this branch: both checkers, the compiled code, rx-tsc, the tools
node proposals/check.mjs --upstream <folder>    # … and on an exported, built upstream
node proposals/words.mjs                        # each word taken off the benchmark's declarations (after bench/run.mjs)
node proposals/survey.mjs                       # the solid-primitives survey, counted again
node bench/run.mjs --check                      # the benchmark, held in CI
```

The folder: `git archive e650b85 | tar -x -C <folder>`; then in it `cargo build --release` and `cargo build --lib --release --target
wasm32-unknown-unknown` in `compiler/`; `npm ci && npm run build` in `runtime/`; `npm ci` in `tooling/rx-language-server/`; and
`ref/node_modules` as this repository's. A verdict is stated in a comment above each program, and compared. A program that could not be run (no
build, no Chromium for bug 15) is reported as `SETUP`, apart, and is no verdict.

## Bugs of `main`, in the order to take them

Each was run on e650b85. 21, and a question.

1. [03](bugs/03-effect-loses-cleanup.md) an effect's cleanup tears a live listener down, in silence
2. [05](bugs/05-action-in-a-value.md) an action in a value
3. [18](bugs/18-keyed-list-replaced-by-position.md) a keyed list
4. [15](bugs/15-server-text-escaped-twice.md) server text escaped twice
5. [01](bugs/01-builtin-named-imports.md) an import named as a builtin

Then, accepted and wrong when run: [04](bugs/04-effect-over-a-list.md), [08](bugs/08-pre-of-a-list.md), [17](bugs/17-write-a-function-to-a-path.md), [07](bugs/07-fn-provides-to-its-caller.md),
[02](bugs/02-unimported-fetch-fail.md), [13](bugs/13-relative-api.md). Correct and refused: [06](bugs/06-fn-reads-a-context.md), [12](bugs/12-unguarded-snapshot-crate.md) (crate),
[16](bugs/16-component-without-props.md), [11](bugs/11-record-and-function-types.md). Accepted and not compiled: [09](bugs/09-pre-of-a-ref-parameter.md), [10](bugs/10-await-as-a-result.md). Tests and tools:
[14](bugs/14-scenario-sections-unread.md), [19](bugs/19-missing-file-is-ok.md), [20](bugs/20-custom-element-with-a-dot.md), [21](bugs/21-messages.md). A question: [22](bugs/22-equations-make-a-fn-instantiate.md).

## Proposals, in the order they depend on each other

*Strength* is said of the evidence for the decision. Every benchmark program was chosen by the author.

| | changes | strength | needs |
| --- | --- | --- | --- |
| **interop** | | | |
| [01](01-foreign-tags.md) foreign tags | a JavaScript component is applied by its tag | strong | – |
| [02](02-signature-grammar.md) signature grammar | optional, generic and rest parameters; `export const` | strong | – |
| [03](03-declaration-lookup.md) declaration lookup | one project folder; **reverses a decision** | medium | – |
| [04](04-rows-held-to-types.md) rows held to types | `rx-tsc` alone | medium | – |
| [05](05-foreign-views.md) foreign views | views and components as props | medium | 01 |
| [06](06-method-rows.md) method rows | | medium: two stable libraries | 02 |
| [07](07-typed-closures.md) typed closures | | medium: no count | – |
| **checks** | | | |
| [08](08-duplicate-keys.md) duplicate literal keys | | medium | – |
| [09](09-guess-with-nothing-to-wait-for.md) a guess with nothing to wait for | | weak | – |
| [10](10-mutation-in-place.md) an array changed in place | | medium | – |
| [11](11-advice.md) two advisory rows | advice, as 99 has it | medium | – |
| **context and placement** | | | |
| [12](12-context-rows.md) context rows | | medium: two stable libraries | 01 |
| [13](13-factories.md) the cautious rule | | medium | 05 |
| [14](14-nests-and-hosts.md) `nests`, hosts | a host declaration is believed | weak to medium | 12, 13 |
| [15](15-renders.md) `renders(H)` | experimental | weak, and dear | 12, 13 |
| [16](16-accessor-failures.md) `fails(E)` on an accessor | MO-10d kept; `pending` withdrawn | weak | – |
| **packages and fns** | | | |
| [17](17-packages.md) packages | **reverses MO-1b**: to be ruled first | weak | – |
| [18](18-fn-parts.md) a fn's parts | | weak | 17 |
| [19](19-optional-parameters.md) optional parameters | design only | weak | 17 |
| [20](20-generic-fns.md) generic fns | design only | weak | 17 |
| [21](21-locals-in-fns.md) locals in fns | a question | – | – |
| **tooling** | | | |
| [22](22-generated-drafts.md) drafts | for a person to review | medium | 03 |
| [23](23-rx-verify.md) `rx-verify` | refutes; no gate | medium | 03 |

**Upstream's rulings that a file touches.** 03: *"a project-level folder … was the alternative, not taken"* — reversed, and argued. 17: MO-1b — reversed, and to be ruled before any ABI. 16: MO-10d — kept, and the word that went against it withdrawn. 12 to 15: RG-7b's *beneath* —
kept; each file says which placement its word names, and 14 says where that is only believed. 11: 99's *stays advisory* — kept. 21: E-9 against RG-6 — asked.

## Numbers, and what they are of

- **Programs.** The benchmark has 37 tasks (44 good entries) and 123 coverage entries: 160 programs. They are the author's.
- **Packages.** 128 packages are pinned in `bench/package.json`. 122 are stable releases, most of them solid-primitives'. 6 are pre-releases: TanStack Query, Router and Start (release candidates), UI SDK and its core (beta), Kobalte (alpha).
- **Overlap.** The 40 variants of `nests` are one set, over a factory and six host declarations (14). They were counted under two proposals before.
- **Handler.** "26 programs refused without it" counted programs as they are written; an action's name is accepted in the same places.
- **63 and 26** (19, 20) include primitives with rest parameters, which neither proposes.
- **192** surveyed primitives need JavaScript beside their `.rx`; 188 of them also for a host object or a global.
- **350** verification claims and **10,967** generated-declaration checks are of programs and rows the author chose.
- The table `words.mjs` prints:

| word or form | rows | programs | correct programs refused without it | variants whose diagnostic is missed | of them, refused by another | programs those are of |
| --- | --- | --- | --- | --- | --- | --- |
| handler | 39 | 31 | 26 | 1 | 0 | 1 |
| draft | 4 | 2 | 2 | 8 | 1 | 2 |
| uses(c) | 41 | 21 | 4 | 25 | 10 | 14 |
| provides(c) | 22 | 21 | 21 | 22 | 4 | 9 |
| nests(…) | 7 | 7 | 7 | 40 | 0 | 6 |
| renders(H) | 5 | 4 | 4 | 7 | 0 | 3 |
| pending/fails before ref | 6 | 6 | 0 | 13 | 0 | 6 |
| method rows | 10 | 4 | 1 | 9 | 3 | 2 |
| default rows | 5 | 4 | 4 | 4 | 3 | 2 |
| context from | 8 | 8 | 8 | 14 | 3 | 5 |
| catches(…) on a prop | 0 | 0 | 0 | 0 | 0 | 0 |
| instantiates (upstream's) | 38 | 35 | 28 | 9 | 4 | 6 |
| pure (upstream's) | 89 | 51 | 22 | 2 | 2 | 2 |
| rejects(E) (upstream's) | 13 | 9 | 8 | 14 | 1 | 7 |

## Not proposed, and what the prototype still has

[`spec/archive/proposals-not-made-2026-11-25.md`](../spec/archive/proposals-not-made-2026-11-25.md) has the reasons, and the dead ends and the TypeScript 7 note that were files 18 and 19.

`handler` before a function type; `draft`; `pending` before `ref`, and `pending` or `fails(E)` on a record's field; type arguments at a call; `for (const x of e)` in imperative scope; strict mode; `pure` in generated files; a shared scope of declarations
(`@rx-types`). The prototype has each of them, and the benchmark uses them.

## Known gaps of the prototype

Programs it accepts that go wrong when run. Each was found, and is left because no check that could see it would be sure.

- An action given by name to JavaScript that calls it at once (loud; both trees): [bug 05](bugs/05-action-in-a-value.md).
- A host declaration whose host does not mount the page there: [14](14-nests-and-hosts.md).
- A call of a `renders(H)` fn for the application that lacks what another has: [15](15-renders.md).
- A method's io through an alias another module exports: [06](06-method-rows.md).
- `pre` of a name for a part of a store: [bug 08](bugs/08-pre-of-a-list.md). Rows taken out of a source with no key, in a keyed equation: [bug 18](bugs/18-keyed-list-replaced-by-position.md).
- `provides(c)` on a component that reads a `View` prop before its provider: [12](12-context-rows.md).
- A component with no `shape` is not held to HTML's nesting: [01](01-foreign-tags.md).

And correct programs it refuses: an unbound call of a fn that uses a context with a default ([bug 06](bugs/06-fn-reads-a-context.md)); an unbound call of a declared fn whose result is the bare type `Component` ([13](13-factories.md)); a method of an undeclared import, in a view ([06](06-method-rows.md)).

## Compatibility with upstream's programs

Over the 305 `.rx` modules of upstream's repository (both binaries, `rxc check` and `rxc app`): **none that upstream accepts is refused**. 63 differ, compared by line: they get more `UNBOUND` (an unimported `fetch` or `fail`) or more `CATCH_NOT_ON_AWAIT`,
and each was refused already. Of the accepted ones, 123 have other code: the fixes of bugs 01 to 18 and Solid's compiler at the pin, read by kind of line. Upstream's scenarios, run by this branch's runners, hold, but for five files that the stricter reader of scenarios refuses (bug 14).

## Cost, all of it together

`git diff --shortstat e650b85 -- compiler/src ref/src`: 31 files changed, 15503 insertions(+), 855 deletions(-). Lines in a proposal are those its commits added when they landed.
