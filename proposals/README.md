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
node proposals/check.mjs --upstream <folder>    # … and on an exported, built upstream; `--prototype <folder>`: what is marked `prototype=` (19, 20, 21), on `proto-all` (local, not published)
node proposals/words.mjs                        # each word taken off the benchmark's declarations (after bench/run.mjs)
node proposals/survey.mjs                       # the solid-primitives survey, counted again
node bench/run.mjs --check                      # the benchmark, held in CI
```

The folder: `git archive e650b85 | tar -x -C <folder>`; then in it `cargo build --release` and `cargo build --lib --release --target
wasm32-unknown-unknown` in `compiler/`; `npm ci && npm run build` in `runtime/`; `npm ci` in `tooling/rx-language-server/`; and
`ref/node_modules` as this repository's. A verdict is stated in a comment above each program, and compared. A program that could not be run (no
build, no Chromium for bug 15) is reported as `SETUP`, apart, and is no verdict.

## Bugs of `main`, in the order to take them

Each was run on e650b85. 37, and two questions. [37](bugs/37-await-in-children-not-compiled.md), [38](bugs/38-a-view-that-provides.md) and [39](bugs/39-order-of-one-lines-diagnostics.md) are this branch's own, and fixed. 33, 36 and 41 are fixed by the rule of [26](26-children-are-shown.md) (a view is made where it is shown, and asking whether it was given makes nothing). 40 is decided: a `use c` written in `provide c`'s own expression is what is above it; what comes back to itself is `CYCLE`. 35, 42 and 44 are not fixed here.

1. [03](bugs/03-effect-loses-cleanup.md) an effect's cleanup tears a live listener down, in silence
2. [05](bugs/05-action-in-a-value.md) an action in a value
3. [18](bugs/18-keyed-list-replaced-by-position.md) a keyed list
4. [15](bugs/15-server-text-escaped-twice.md) server text escaped twice
5. [01](bugs/01-builtin-named-imports.md) an import named as a builtin
6. [28](bugs/28-runtime-keeps-every-instance.md) an app keeps every instance it ever made
7. [30](bugs/30-provision-leaks.md) what a region provides is seen beside it, in production
8. [29](bugs/29-destructured-children.md) destructured children
9. [33](bugs/33-use-in-children.md) a context read in children; [36](bugs/36-await-by-a-childs-context.md) an await asked by one; [41](bugs/41-condition-on-children.md) a condition on children, served: after [24](24-view-functions.md) is answered

Then, accepted and wrong when run: [04](bugs/04-effect-over-a-list.md), [08](bugs/08-pre-of-a-list.md), [17](bugs/17-write-a-function-to-a-path.md), [07](bugs/07-fn-provides-to-its-caller.md), [25](bugs/25-source-that-holds-a-function.md), [26](bugs/26-updater-of-a-replaced-record.md),
[02](bugs/02-unimported-fetch-fail.md), [13](bugs/13-relative-api.md), [34](bugs/34-closure-as-a-child.md), [35](bugs/35-children-in-a-record.md). A checker that aborts, on a cycle: [40](bugs/40-provision-of-itself.md). Correct and refused: [06](bugs/06-fn-reads-a-context.md), [12](bugs/12-unguarded-snapshot-crate.md) (crate),
[16](bugs/16-component-without-props.md), [11](bugs/11-record-and-function-types.md), [27](bugs/27-brackets-in-a-types-comments.md), [32](bugs/32-a-word-as-a-name.md). Accepted and wrong when run, an action given by name: [44](bugs/44-action-given-to-what-calls-it.md). Accepted and not compiled, or not loaded: [42](bugs/42-await-of-a-plain-source.md), [09](bugs/09-pre-of-a-ref-parameter.md), [10](bugs/10-await-as-a-result.md), [31](bugs/31-type-imported-as-a-value.md). Tests and tools:
[14](bugs/14-scenario-sections-unread.md), [19](bugs/19-missing-file-is-ok.md), [20](bugs/20-custom-element-with-a-dot.md), [21](bugs/21-messages.md), [23](bugs/23-panic-beside-a-wide-character.md), and an editor that never answers, [24](bugs/24-open-block-in-an-editor.md). Questions: [22](bugs/22-equations-make-a-fn-instantiate.md), [43](bugs/43-client-read-in-a-fn.md).

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
| [19](19-optional-parameters.md) optional parameters | prototyped (`proto-optional` 3a4847ec, not published) | weak to medium: 34 of 192, no facade line | 17 |
| [20](20-generic-fns.md) generic fns | prototyped (`proto-generic` b36ab25d, not published) | weak to medium: about 18 of 192, no facade line | 17 |
| [21](21-locals-in-fns.md) locals in fns | a question; prototyped (`proto-locals` a1c93632, not published) | – | – |
| **children** | | | |
| [25](25-views.md) views | a component shows what it is given with what it knows; prototyped (`proto-children`, not published) | medium: three libraries, one rewritten | – |
| [26](26-children-are-shown.md) children are shown | a view a component is given is only shown, and is made where it is shown: RG-4c's sentence against 08's; prototyped (`proto-children-rule`, not published) | high: 180 of 1,147 generated programs accepted and different today, none with it | – |
| [27](27-a-context-that-holds-a-view.md) a context that holds a view | a context declared `View`, or a function giving one, carries a view to the parts that show it (`{use item}`, `<use.item … />`), checked at each; not exported; prototyped on 26 (`proto-children-rule`, not published) | medium: the shape of Kobalte's `Select`, `Combobox`, `Pagination`; 505 programs, each as its name says | – |
| [24](24-view-functions.md) where a `use` in children reads | a question; a fix tried and held back (`proto-view-fn` a05f579a, not published) | – | – |
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
- **63 and 26** (19, 20) were counted with rest parameters and optional accessors. The prototypes' counts, 34, 18 and 11, are in those files.
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
- A guess on a source that began as a record and is written `null`: [bug 26](bugs/26-updater-of-a-replaced-record.md).
- A context read in children, and children kept in a record: bugs [33](bugs/33-use-in-children.md), [35](bugs/35-children-in-a-record.md). A fn that reads a context, given as a value to another module and called there ([36](bugs/36-await-by-a-childs-context.md)).
- A component with no `shape` is not held to HTML's nesting: [01](01-foreign-tags.md).

And correct programs it refuses: an unbound call of a fn that uses a context with a default ([bug 06](bugs/06-fn-reads-a-context.md)); an unbound call of a declared fn whose result is the bare type `Component` ([13](13-factories.md)); a method of an undeclared import, in a view ([06](06-method-rows.md)); and, checked and not compiled, an `await` in children, in a module where children read a context ([36](bugs/36-await-by-a-childs-context.md); upstream compiles it, wrong where the two places provide different values).

## Compatibility with upstream's programs

Over the 305 `.rx` modules of upstream's repository (both binaries, `rxc check` and `rxc app`): **none that upstream accepts is refused**. 63 differ, compared by line: they get more `UNBOUND` (an unimported `fetch` or `fail`) or more `CATCH_NOT_ON_AWAIT`,
and each was refused already. Of the accepted ones, 123 have other code: the fixes of bugs 01 to 18 (25 and 26 change the runtime alone; counted before 28 to 32, and 28 changes the code of every program) and Solid's compiler at the pin, read by kind of line. Upstream's scenarios, run by this branch's runners, hold, but for five files that the stricter reader of scenarios refuses (bug 14).

## Cost, all of it together

`git diff --shortstat e650b85 -- compiler/src ref/src`: 31 files changed, 16111 insertions(+), 1007 deletions(-). Lines in a proposal are those its commits added when they landed.
