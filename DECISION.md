# Decision: a component's children are shown, and nothing else

2026-11-25, branch `proto-children-rule`, from `proto-children` 54571c1d. Local; a proposal to upstream, not a merge.
Written before the code. The last section says what the programs changed.

## The two sentences

- RG-4c: "`children` is a view value evaluated in the *caller's* region: its readers are the caller's, its lifetime is
  the caller's, and the child only decides where it is placed."
- 08 (the provision check): "children passed to a component are owned where it reads them, so they see its provisions."

Both are upstream's. The interpreter has the second, compiled code and the oracle have half of each (the content is made
lazily, where it is read, as Solid does; a `use` in it is looked up from the owner of the block it is written in). A
program that can tell is wrong in some runner.

## The decision

1. **A view given to a component is a block of the caller's names that is owned where it is shown.** Each place it is
   shown is an instance: what is provided, awaited, caught and disposed there is that place's. (08's sentence. It is
   what Solid does with JSX children, and what an explicit view of proposal 25 already is.)
2. **A `.rx` component can only show it.** A prop typed `View` (the children, or one of another name) is
   - shown: `{props.children}` in its view;
   - given on: as content or as a `View` prop of another component, or in a spread of the props;
   - named again by a projection of the props (`{ children } = props`, `x = props.children`, a rest);
   - asked whether it was given: `if props.children { … }`, and `props.children ?? e` where it is shown (a default in
     the projection is the same). The answer is whether content was written; nothing is made to give it.

   Anything else is refused: read in an equation, a source, `peek`, an effect, a handler, an action, a closure, a
   record, a list, a context, an argument of a fn, a condition.
3. **Nothing is added.** No word to make it once and hold it (candidate 5): no program needs one today (counts). It
   can be added later without changing a program this accepts.

RG-4c's sentence becomes: "`children` is a view of the caller's names. It is owned where it is shown: its lifetime,
what it reads from contexts, what it waits on and fails with are that place's. A component only shows it."

## Why (counts; the scripts are in `../w`: `census.py`, `census3.py`, `tsxcensus.py`, `tab.py`)

**What `.rx` programs do with children** (every `.rx` file and every `rx` block of a `.md`):

| tree | programs | name a component's children | placed | anything else |
| --- | --- | --- | --- | --- |
| upstream `origin/main` | 744 | 29 | 29 | 0 |
| PR #1 base d843fd7f | 1,896 | 132 | all others | S-context-3 (projection, a default, `if children`, `header ?? "-"`: all kept by 2); 3 pages of bugs 24/34/35, written to show the fault |
| `rx-primitives-2` (twelve packages) | 1,768 | 107 | all others | `keyed`: `props.children(…)`, a function type, not a `View`: not in reach |
| UI SDK rewrite | 30 | 12 | 1 | `viewOf(props.children, now)`: a function or plain content, which is proposal 25's `<props.children …/>`; one `props.children ?? text` |

No real program stores, peeks, carries or reads twice in a value. The ones that do are probes written to find the edge.

**What Solid TSX does** (7,113 files of 2,316 that name children in `solid-checker-intake` apps, read only; a regex
census, so rough): of 2,134 reads of `x.children`, 1,441 placed (68%), about 130 more returned or passed lazily
(`() => props.children`), 112 called or tested by `typeof` (a render function: proposal 25), 69 a default (`??`),
53 tested, 8 inspected (`.length`, `[i]`, most not Solid), and `children(() => props.x)` about 60 times in 3
libraries, each time to ask whether something was given or to tell a function from content without making it twice.
UI SDK's source: 120 reads, 39 defaults, 30 placed, 0 `children()`. TanStack's solid-router: 1 `children()`, with
the comment "to avoid re-accessing the children getter (which in Solid 2.0 would re-invoke createComponent)".
So: Solid's default is "made where read, each read makes it", and its helper exists for the questions rule 2 answers
without making anything.

**Soundness today** (1,147 generated programs: the 1,116 and one receiver added since; interpreter, oracle, both
emitters; 54571c1d): 375 refused, 592 agree, 180 accepted and different in some runner.

## The candidates

| | sound | real programs lost | Solid | texts | code | to teach |
| --- | --- | --- | --- | --- | --- | --- |
| 1 keep both, refuse the plain ambiguity | no: 180 of 1,147 accepted and wrong | the plainest one (`<Toggle>{(use toggle).pressed}</Toggle>`), and a correct `await` in a module where some children read a context | compiled code is neither Solid's nor RG-4c's | both sentences stay, plus a refusal | the gate, `apart(…)`, the snapshot question stay | "it depends who reads" |
| **2 only shown** | to prove (below) | 0 counted | Solid's own default | RG-4c's sentence replaced, 08's kept | gate, `apart`, `AMBIGUOUS_CONTEXT` go; explicit views lose a case | one sentence |
| 3 a value of the caller, made once | yes, if made at the caller | every component that provides to its content or shows it under an `if`: 33 + 19 programs of the base, 4 + 3 of upstream, 6 of 7 of UI SDK (tabs, dialog), the router's layouts, 07's own `Card` example | not expressible: a Solid component cannot make its JSX children above itself without `children()` in its body, and then they are under its owner, not the caller's | 08's sentence and RG-7b's use by content go | interpreter and both checkers rewritten | simple, and wrong for every provider |
| 4 `View` placed, and a type for a made value | as 2 | 0 | a second type that TSX does not have | a type added to 13 | as 2, plus a type | two kinds for a need counted at 0 |
| 5 placed, and one word to hold | as 2, plus the word's own cases (where is it owned, what does it see, shown twice?) | 0 | `children()` | as 2, plus a word | as 2, plus the word in 6 places | the word is asked for by no program |

3 is RG-4c read literally. It cannot be chosen: `provide` in a component is for its content, and that is the first
thing children are used for.

## What must be shown for this to stand

- The 1,147 and every earlier probe: each is refused by both checkers, or shows the same in the interpreter, the
  oracle, both emitters, the server and after hydration.
- No program of either tree, the benchmark, the guide, the packages or the UI SDK copy is refused that was accepted
  (S-context-3's forms are kept on purpose).
- Nothing that was refused, or right, is compiled and wrong.
- Bugs 33, 35, 36, 37 and the gate: gone, not moved.

## What would change my mind

- A real `.rx` library that must hold or inspect what it was given (a transition group that keeps a leaving child, a
  `Switch` that reads its `Match`es). Then candidate 5, on top of this: `x = once(props.children)`-like, owned by the
  block that says it. Nothing here closes that door.
- A program this accepts on which two runners differ and that cannot be refused without refusing a placed one.
- A cost: more than a few percent on mounting 1,000 rows that have content.
- Upstream ruling for RG-4c's caller (candidate 3) with an answer for `provide`.
- A JavaScript host for which "was it given" cannot be answered without making the content.

## Fallback

If the prototype shows it unsound or loses a real program: candidate 1 as it is on 54571c1d, with what was learned
added to bugs/33.

## What the programs changed (after the code)

The decision stands. What follows replaces the lines above where they differ.

**Proof.** Interpreter, oracle, both emitters; what is accepted then served and hydrated in both emitters.

| programs | before (54571c1d) | after |
| --- | --- | --- |
| 1,147 generated | 375 refused, 592 agree, 180 accepted and different | 346 refused, 800 agree, 1 on which all four throw alike |
| served and hydrated | not run | 800 of 800, in both emitters |
| 635 probes of the earlier reviews | 308 refused, 234 agree, 85 different or not compiled, 8 fail alike | 267 refused, 328 agree, 31 different or not compiled, 9 alike |
| 3,802 probes of the independent review (three runners before: the reference's emitter ran out of memory on one of them there) | 1,590 refused, 1,629 agree, 583 different or not compiled | 2,163 refused, 1,529 agree, 110 different or not compiled |

No program that agreed before is different now, in either set. What is newly refused there is `VIEW_NOT_SHOWN` each time (1,099 of the independent review's, which was written around snapshots, contexts and records).

**The 346 refused of the generated set** (the user's cross-table): 106 were accepted and different before; 7 were refused already (5 `CONTEXT_NOT_FOUND`); **233 showed the same in every runner before**: a view through a context 66, a snapshot 78, an effect 30, a handler 31, a closure 14, a record 14. They agreed on one mount of the caller's reading. Asked harder (134 probes: shown twice, toggled, in rows, with state, without a default, without a boundary) a record and a list differ in 6.

**What is left different, and is not of children**: the oracle prints a portal's and a list's items as `[null]`; the interpreter does not wait for a pending attribute, in a block or a component either (on 54571c1d too); a ref callback is not called by the interpreter and the oracle; a closure as children that is also shown (34); a handler written in a scenario's table that holds a `use` (the harness). And one hole of the checkers that the stack overflow hid: `provide c = use c` with nothing above and no default is accepted, and throws in every runner.

**Found and fixed on the way**: `provide c = use c` overflowed both checkers; the interpreter read a provision's own value for it (`n = use c`, `provide c = n`: the provider that hands on what is above it); a spread did not give the children in the interpreter and the oracle where none were written; `{ children = "x" } = props` never took its default compiled (an empty application was given `children: []`); a prop typed `View` that was not given printed `undefined`.

**Narrowed by a real program: a type that cannot be read.** The UI SDK copy types its props by JavaScript (`import("./bridge.js").ToggleProps`) and gives `props.children` to a helper, `viewOf(props.children, now)`: a function or plain content. The rule is of a prop *declared* `View` where the checker reads the type (written out, a type of the module, one imported from `.rx`): what JavaScript's types hide is as it was, as in proposal 25. That is a hole by design: there, a snapshot is still accepted.

## The user's three questions (asked while it was being built)

**1. Which of the refused shapes are real, and is each rewritten?** S-context-5 holds each rewrite, run in every runner, served and hydrated.

| shape | in real code | written instead | 
| --- | --- | --- |
| a view through a context, shown by what the provider applies | not counted apart in TSX | an argument typed `View` |
| … shown by a part the *caller* places | Kobalte `Select`, `Combobox`, `Pagination` (3 families); UI SDK 0 | **no form that keeps the caller's program.** The root shows its list, or the part is given the view: both run, both change the API |
| passed lazily, `() => props.children` | about 50 of 2,134 reads (to a provider's helper) | `provide`, then `{props.children}` |
| a memo of it, `children()` | about 20 + 60, to ask or to tell a function from content | `props.children != undefined`; a view with a parameter (25) |
| a record of views | UI SDK 37 (forwarding getters) | given on; a view of each name |
| a list, `[props.children, x]` | 0 found | one after the other |
| an effect over it | 0 found | `effect (props.children != undefined)` |
| a handler that reads it | 0 found | a source that says when |
| a snapshot shown later | 0 found | shown |
| inspected (`.length`, `[i]`) | 8, most not Solid | none: a view has no parts in `.rx` |

Real losses, counted: one API shape of three families of one library.

**2. Would "an opaque value that may be carried, and only finally shown" be as sound?** Not provable today, so the present rule is kept; part of it is close.

- *Run*: with the refusal lifted, 134 probes. A view carried by a context or answered by a closure: the runners agree on all, and the checkers refuse every one whose provision or boundary is missing where it is shown. A record, a list: 6 differ (made once compiled, at each place in the interpreter).
- *It changes two receivers that agree on `out` today* (`carried2`, `carried3`: the reader provides, or sits under a provision): they would show the reader's value. That is the rule's own answer ("where it is shown"), and better than today's, where the same content shows `in` when placed and `out` when carried.
- *Why not now*: a closure's answer can be called in a handler or an effect, and no rule that reads the program's text sees that it is a view; a record needs its fields compiled as getters in both emitters; the checkers place a carried view at the application (sound, since what is above the application is above every place beneath it, and it refuses a correct program whose provision is the carrier's own); a view with a parameter carried by a context needs a way to apply it (`<s.item … />`) and its placement in both checkers.
- *What a later widening needs*: that nothing accepted now changes. It holds by construction: every accepted program only shows. The first step is the context alone, declared `View` or a function giving one, which is what Kobalte needs.

**3. Each refusal says what to write.** One message for each of peek, source, effect, handler, closure, record, list, context, argument, the props given whole, and anything else; the same words in both checkers.

## Kept simpler, removed

- Gone: `AMBIGUOUS_CONTEXT` and its check (33 lines), the crate's gate on awaits (92 lines) and its field; "plain content is a view that asks nothing" as a case of 25.
- Dead and not deleted: `around`, `apart(…)` in a printed signature, `onlyShown`, `kidUses` (about 150 lines in the two checkers and the two signature printers). Deleting them changes printed signatures; not done.
- Added: the walk that finds a view read as a value (100 lines of `ref/src/modules.ts`, 309 of the crate's, messages included); content as a block and "was it given" (41 lines of the reference's emitter, 83 of the crate's, 36 of the oracle, 22 of the interpreter, 6 in each runtime). Crate: +411 −141; `ref/`: +222 −44.

## Not done

- The independent review's wish for "which kind was given" on `View | ((s) => View)`: `if props.children` of such children can be accepted now (asking makes nothing); it was not.
- `otherMention` (25) and `viewUses` (this) are two walks; one would do.
- A view given on as an argument is placed by the checkers as before; no program was found on which that is wrong, and none was generated for nesting (`<div>` content shown inside a `<p>` by another component).

## Suites, the benchmark, the UI SDK, cost

- Every job of the workflows that runs on this Mac (`../ci.sh`, then `../after.sh` for what the last change touched): all pass but `t-vite-hosts`, `t-vite-types`, `t-vite-watch`, which need a built Vite plugin and fail the same on 54571c1d. `cargo test` holds the eighteen programs the gate refused, compiled.
- Both checkers agree on 1,150 programs of the tree, on the 1,147 and on the 134; the two emitters lower 508 alike.
- The benchmark, tasks and coverage, `--check --strict`: as the scorecard. One program was refused on the way (`primitives/event-dispatcher`: `createEventDispatcher(peek props)`, props that declare no view): the cause of the narrowing above.
- The twelve packages and the UI SDK sources, 47 files, checked by both compilers: 2 lines of the UI SDK's dialog change (`viewOf(props.children)` of children declared `View`, written `{props.children}`). With them the copy builds; 44 of 44 of its suite; its app served and hydrated; its table of mistakes the same (12 caught); 5 of 5 leak gates. Its Playwright specs (548) were not run.
- 1,000 rows with content, production, Chromium, median of 30, two runs each, mount / reverse / change all, ms: before 1.4 / 0.8 / 0.6, after 1.4 / 0.8 / 0.6; rows that provide a context to a child: 1.6 / 0.9 / 0.7 both; rows that ask `if props.children`: 2.9 / 1.0 / 1.4 before, 2.2 / 0.9 / 0.8 after (the content is no longer made to answer). The module minified: 1,492 to 1,515 bytes; the bundle 151,392 to 151,595.
