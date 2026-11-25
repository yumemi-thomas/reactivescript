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

~~No program that agreed before is different now, in either set.~~ **False** (found by the independent review): the comparison was of agreement within a revision, not of what is shown across the two. 63 of the 359 generated programs that agree before and after show something else now. The comparison across revisions, its classes and counts are the first section of "After the independent review" below. What is newly refused there is `VIEW_NOT_SHOWN` each time (1,099 of the independent review's, which was written around snapshots, contexts and records).

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
- Dead, and deleted after the review: `around`, `above`, `apart(…)` in a printed signature, `onlyShown`, `kidUses`, `kidReads` (69 lines of `ref/`, 174 of the crate). An old signature that says `apart(…)` is still read: the word is passed over.
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

## After the independent review (2026-11-25, `../review-astra/REVIEW.md`: fix first)

The decision stands; the review found the prototype below the bar it set itself. Each finding was reproduced on
54571c1d, PR #1 a4cba8ef and `origin/main` e650b851 before anything was changed (`../w/p1`, `p2`, `p3`; `matrix.py`
runs every runner of a revision). What was decided on the way is marked **decided**.

### What the rule changes in programs that ran (the comparison that was missing)

| programs | agree before and after | of those, show something else now |
| --- | --- | --- |
| 1,147 generated | 359 | 63 |
| 979 written for the findings (`../w/mkg1.py`) | 696 | 188 |
| 635 of the earlier reviews | 218 | 1 |
| 3,802 of the independent review | 913 | 65 (63 of them the generated ones it copied) |

Seven classes, each the rule's own answer; the table with before / now / why / counts is the first section of
proposals/26. Real programs with the shape (upstream 632 components, PR #1 1,243, UI SDK rewrite 1,146; `../w/census2.mts`):
a view shown twice 0, given on as an argument 0, a spread with no content 0, asked 3 (bug 41's two pages and
S-context-3). The one class that gives something up: an argument that is written and is no literal (`part={s}`) is
given whatever its value is, where before its value answered (28 generated, 0 real).

Served and hydrated on the final code, in both emitters: 800 of 800 of the generated set, 822 of 822 of the 979 (157
refused; the frames expected are what the four runners agree on, `../w/fill2.py`). Both checkers say the same of all
1,147 and all 979, and the two emitters lower them alike.

### Each finding

| finding | what was done | test |
| --- | --- | --- |
| `(x) => x + 1` refused after `x = p.children`; an `x` of another block | **fixed**: the walk follows bindings (a scope for each block, parameter, loop item, local, `catch` name), in both checkers, on the AST in the crate (no JSON copy) | S-context-6 (program, first variant); `mkg1.py` A (100 programs) |
| `amount = p.children ?? 0` refused, children declared `number` | **fixed**: a view is a prop *declared* `View` where the type is read; one classification (`viewsOf` / `views_of`) for both checkers, the interpreter, the oracle and both emitters | S-context-6 |
| a JS host's `children: 0` to children typed `number`: `no` before, `yes` after | **fixed**: "was it given" is asked only of a prop declared `View`; anything else is its value's truth, read as before | `compiler/test/js-host.mjs` (production, browser and server) |
| … and what a `View` given by JavaScript as `0`, `""`, `false`, `null`, `[]` answers | **decided**: a value answers as JavaScript does, which is Solid's `props.children ? … : …` (`[]` yes, the others no; `!= undefined` asks only that); a getter (JSX content) was given and is not read | the same test |
| `y = pre x -> ""`: the reference accepted, the crate refused | **fixed, as refused in both**: what a view was an instant ago is a value (a snapshot shown later). It was accepted before the rule | S-context-6, rejected |
| `await fetch((use c) + await fetch("k"))` in content: accepted, not compiled | **made right**: an `await` inside another's question was hoisted after it, in a reader of any view (not compiled on `origin/main` either, in or out of content; the removed gate hid one case). Inner first, in both emitters and the oracle | S-context-6 (last variant but one), server and hydration |
| 63 of 359 changed what they show | **the comparison is across revisions now** (`../w/xrev.py`), for the four sets; classes above | proposals/26, first section |
| Kobalte DateField / TimeField test whether content *resolves* empty | **stated as a loss**: "was it given" cannot answer what content resolves to. In `.rx` the segment's fallback is a prop of its own, or the component stays JavaScript. The rewrites table says so | — |
| `{p.children && "yes"}` of nothing: the oracle printed `false` | **fixed**: `v && e` is the nothing `v` is where it was not given, in every runner | S-context-6 |
| `<Q title={use c} />` shows the caller's value: "newly promised" | **the promise is corrected**: an argument's expression is a value of the caller; only content and a `view name (…) { … }` is a block of the place that shows it. Unchanged behaviour, every runner agrees | S-context-6 |
| `<Q part={p.children} />` puts a `<div>` in `<p>`; the browser moves it on hydration | **fixed**: a view's placement follows it through a name, a choice and the component it is given on to (`ViewUses.at`, the shapes of both checkers, printed as `part-at …`) | S-context-6, rejected (CONTENT_MODEL); `mkg1.py` C |
| `v = false ? p.children : [p.children]`, a seed `pre n -> p.children`, a fn in one arm | **fixed**: a projection is checked arm by arm; a seed is walked | S-context-6, rejected |
| `x = on ? p.children : p.children`, `x != undefined` made the content; `p.children \|\| true` in the oracle | **fixed**: a choice, a default and `\|\|` are asked arm by arm | S-context-6 |
| a JS host's one DOM node shown twice is at the second place only | **stated**: "each place has its own" is of what `.rx` writes and of what JavaScript gives as a getter (made at each read). One made node is one node, as in Solid | proposals/26, Against |
| a newly compiled package on the old runtime: `__rt.given is not a function` | **not done**: compiler and runtime are both 0.3.1 and nothing is released from a prototype; the compiled module now calls `__rt.given`, `__rt.opt`, `__rt.v`, so a release raises both together | proposals/26, Cost |
| the props message repeated on its own advice | **fixed**: it names the views still inside (`{ heading, ...rest } = p`) | S-context-6, rejected |
| a view given to `count?: number` shown as text | **narrowed in**: given on to a prop whose declared type is a value's is refused; a type that is not read is as it was | S-context-6, rejected |
| dead `apart(…)` | **deleted** (above) | parity suite: printed signatures equal |

### Found by my own programs for the fixes, and fixed

- `q.part != undefined` of a literal `""`, `0`, `false` answered "not given" compiled and "given" interpreted: the question of a value is its own (`!= undefined`, `??`: is it not `undefined`; `if`, `!`, `&&`: its truth).
- `{q.part && "Y"}` of `part={0}` showed `0` in the interpreter and nothing compiled: the value of `v && e` is `v` where it was not given.
- `<Q>{w.children}</Q>` with nothing given to `w`, then `q.children ?? "n"`: compiled showed `n`, the others nothing. Content that is written is given.
- A named view of `false` shown: `false` before, nothing after. Restored (`__rt.opt`: only one that was not given shows nothing).
- The props, children among them, spread to an *element* with no content: the interpreter and the oracle showed nothing, compiled code the children (also before). **Refused** (`VIEW_NOT_SHOWN`); with content written it runs as it did (S-context-4).

### Decided: what "was it given" is, exactly

Whether something was *written* for the view: content between the tags; an argument that is no literal nothing; what a
spread or a rest hands on. The argument's value is not read. Considered and not chosen: the value's truth (what the
runners did before for an argument), because the argument may be a view given on, and reading it makes that view; a
protocol that tells a value from a block at run time needs the giver to know what the receiver declares, which it does
not for a component given by value. So a view given on as an argument is "written": whether its giver was given one is
not handed on (a spread hands it on; `{if p.title { <Q title={p.title} /> } else { <Q /> }}` says it). That is weaker
than Solid, which reads the value, and it is the last class of the table.

### What is still different on some runner, and is not the rule's

Of the 635 and the 3,802, accepted, with runners that differ: 27 and 59. 40 of the 59 show exactly what they showed on
54571c1d. The 19 others were refused or not compiled there and were each read: a handler written in a scenario's table
that names a source two instances have, or holds a `use` (the harness: 5); the interpreter does not wait for a pending
attribute (2, also on PR #1 and upstream); the oracle prints a portal's items as `[null]` (1) and stores the function of
a functional path write (1, fixed upstream since); a fn that reads a context given as a value and called in content,
which the interpreter refuses at run time and the others run (7; the same on PR #1 for the reference's emitter, the gate
kept the crate from compiling it); a ref callback (1); a module the probe does not have (1); frames recorded for the old
reading (1). One hole stays, where all runners throw alike: `provide c = use c` with nothing above and no default.

### Lines

| | 54571c1d | 7f3845ec | now |
| --- | --- | --- | --- |
| crate `compiler/src` | 26,853 | 27,123 | 27,352 |
| `ref/` (src, compile, oracle) | 11,989 | 12,167 | 12,307 |

The fixes: crate +692 −463, `ref/` +344 −204 since 7f3845ec (the walk rewritten with scopes, 174 + 69 lines deleted).

### Suites on the fixed code (cbd23214; the commit after it changes this file only)

- `../ci.sh`, every job of the workflows that runs on this Mac: 44 pass (cargo test, both napi builds, wasm, Windows
  check, runtime, names, spec-refs, the four scenario runners at 207 scenarios, crate parity in eight modes, drafts, lib,
  js-host, leaks, confined, runtime-resolve, measure, generated, bench tasks and coverage `--check --strict` as the
  scorecard, tree-sitter, the language server's seven suites, the VS Code package, vite, vite-dir, vite-gate, vite-types,
  wardic, formisch, ssr-router, start, proposals). 2 fail as on 54571c1d, in 0 s, for want of a built Solid Vite plugin
  (`t-vite-hosts`, `t-vite-watch`).
- `proposals/check.mjs --upstream` on `origin/main` e650b851: 303 verdicts, all as stated (the marks of 26 and two of
  25 now say what upstream gives).
- The four sets, every runner, across revisions: above. Served and hydrated: 800 of 800, 822 of 822.
- The UI SDK copy, built with this compiler and runtime: its suite 44 of 44; its `.rx` app in the browser and hydrated;
  the project's Playwright specs (toggle, tabs, dialog, item-icon; client and server-rendered) 552 of 553, 6 skipped,
  3 flaky, the one failure Solid's `EFFECT_RELAY_TEAR` development diagnostic as on the `rx-ui-sdk` branch (REPORT.md);
  its leak gates 5 of 5; its table of mistakes unchanged (12 caught).
- The packages' and the UI SDK's `.rx` sources (18 files): the crate says of each what it said on 54571c1d.
- 1,000 rows with content, production, Chromium, median of 30, three rounds, mount / reverse / change all, ms: before
  1.3–1.4 / 0.8 / 0.6, after 1.4 / 0.8 / 0.6; rows under a provision 1.5–1.6 / 0.7–0.9 / 0.6–0.7 both; rows that ask
  `if props.children` 2.6–2.7 / 0.9–1.0 / 1.2–1.3 before, 2.1–2.2 / 0.9 / 0.7–0.8 after. The module minified 1,492 →
  1,515 bytes, the bundle 151,392 → 151,592. A 450-link chain of names for the children, written in reverse: the crate
  0.00 → 0.01 s, the reference 0.10 → 0.12 s.

Not run: the UI SDK's unit tests (vitest) and its toolbar specs; the twelve packages' own test suites (their sources
were checked, not built and run); the generated sets on PR #1 and upstream in full (the reviewer's cases, the nested
awaits and the 147 that still differ were); Windows and Linux; nothing on GitHub.

### What on PR #1 this would replace (nothing is pushed)

| on PR #1 | with the rule |
| --- | --- |
| bug 33, a context read in children is read at the caller | gone: content is a block of the place that shows it, in every runner (the first program of proposals/26; fails upstream) |
| bug 35, children kept in a record are made above what the component provides | refused: `VIEW_NOT_SHOWN`, a record does not hold a view; its page becomes the rewrite (a view of each name) |
| bug 36, an await in children is asked where they are written | gone: asked where the children are shown, under that place's provisions and boundaries |
| bug 37's gate (the crate does not compile a module whose children read a context and hold an await) | deleted (92 lines); the eighteen programs it refused are compiled, and `cargo test` holds them. The fix of 37 itself (children copied, a hoisted await found by its address) stays |
| bug 40, `provide c = use c` is `CYCLE` | decided otherwise here: a provision reads what is above it (the provider that hands on what it was given). The hole that stays: with nothing above and no default it is accepted and throws in every runner alike. PR #1's `CYCLE` and this are two answers to one question; upstream should pick |
| bug 41, a condition on children breaks hydration | gone: asking makes nothing (the third program of proposals/26; fails upstream on the server) |
| `AMBIGUOUS_CONTEXT`, `apart(…)` (on `proto-children`, not on PR #1) | never needed |

### The widening (a context that holds a view): not done

Part 2 of the brief, a dedicated `context item: View` or `(row: T) => View` that a provider gives a slot to and a
consumer only shows, was **not started**. Part 1 took the whole of the work, and the widening is not small: a view
carried by a context is shown at its consumers, so both checkers must place it there (what is provided, awaited, caught
and nested at each `{use item}`), across modules and in printed signatures, where today they place it at the provider;
and a view with a parameter needs a way to apply what a context gives (`<(use item) row={r} />` has no syntax). Nothing
here says it cannot be proved; nothing was proved. What is known is what was known: with the refusal lifted
(`RX_VIEW_WIDE`), the earlier 134 programs of a carried `View` agree in every runner, and the checkers refuse a correct
program whose provision is the carrier's own. Kobalte's Select, Combobox and Pagination in their own API shape were not
written.

## After the second independent review (2026-11-25, `../review-astra2/REVIEW.md`: fix first)

The core rule held (a view is shown, and made where it is shown). What "was it given" answered did not. It is
redesigned; the review's other findings are fixed; then the widening (a context that holds a view) is done, in commits of
its own. Every case of the review was reproduced first (`../w/r2`).

### Presence, redesigned (decided)

The question is asked of the argument **as it was written**, read with each view in it standing for itself; nothing is
made. Content, a named view block: given. A view given on (argument, content `{p.x}`, spread, rest, default, a name,
through any number of components): what its giver's argument answers. A choice (`?:`, `??`, `&&`, `||`): its branch,
whose condition is read where the question is asked, and tracked. Any other expression: the value's own answer, as
JavaScript has it and as before the rule. The table is proposals/26, Proposal 2.

How: `__rt.ask(() => e)` reads the argument's getter in a mode where `__rt.slot(make)` (content, a component given by
name) answers a token and makes nothing; everything else is the expression that was written, so JavaScript's operators
give the answer and a forward needs no code. The token is given only to the computation that asks (the owner is
compared): a memo of a JavaScript host in between makes the view and keeps it. The descriptor test (`__rt.given`), the
wrapper that made a value a read (`__rt.v`) and the interpreter's side table are deleted: in the interpreter a view is a
value that is not made until shown.

Considered and not chosen: a predicate object beside each prop (a hidden sibling key: a spread and a later explicit
argument pair the wrong predicate with the value, and the key leaks onto elements); a view passed as a tagged thunk (a
JavaScript library that looks at `typeof children` would see a function). The mode costs one comparison where content is
read.

JavaScript hosts (decided): data answers by its value. A getter is **read**, as Solid reads it and as before the rule
(the first prototype answered "given" without reading, which is wrong for `{cond && <X />}` and could not be kept through
a spread); it is made once more to answer. A host that minds offers `slot(make)`, exported by the runtime. (Third review: while a view is asked for, `slot` answers its own
maker, not a token. The token was `[]`, and JavaScript that kept its first read — a getter that makes once, `k ??= props.children`
— showed nothing for ever, on the server and after hydration. A maker is a child Solid shows. `slot`'s second argument, `when`,
is gone: a host that has an answer of its own writes it, `get icon() { return on() ? slot(() => <Icon />) : undefined }`.)

### Each finding of the second review

| finding | what was done | test |
| --- | --- | --- |
| 1. `label={0}` through an explicit argument, a spread and a rest: `L0 / -0 / L0`, and the oracle `L0` three times | **fixed** by the redesign: `-0 -0 -0` in every runner, as before the rule | S-context-7; 1,642 programs |
| 2. `label={maybe}`: `Ldefault → Lok` where it was `default → Lok`; absent through three forwards `LD -D -D` | **fixed**: a value answers by its value, a forward asks its giver: `default → Lok`, `-D -D -D` | S-context-7 (with a click before hydration) |
| … "can it be asked without making the view?" | yes, for everything `.rx` writes; a JavaScript getter is read, or offers `slot` | `compiler/test/js-host.mjs` |
| … Kobalte DateField / TimeField | `{props.children \|\| text}` is their fallback for a value and for a view that was not given; markup that renders nothing by its own control flow is content (stated) | `../w/k1`; proposals/26 |
| 3. a streamed flag in a choice (`x = p.on ? p.title : undefined`): the oracle showed the error fallback | **fixed**: the oracle read the condition while it made the `if`; what is bound is known from the text | S-context-7; 110 programs with an awaited flag |
| 4. `provide c = (use c) + "!"` nested, the outer one updated: `RangeError` after hydration | **fixed**, and it was every Solid-based runner on any update, not hydration: the provision read itself on its second computation. A provision's own expression reads what is above it each time (`__rt.over`) | S-context-7 |
| 5. `<p>{p.children && "yes"}</p>` with a `<div>` for content: `CONTENT_MODEL` | **fixed**: the left of `&&` is asked, and placed nowhere; `\|\|` and `??` show it and are placed | S-context-7, and its rejected twin |
| … a `View` spread onto a numeric prop | **fixed** where the component's type is read (the same module): refused like the argument | S-context-7, rejected |
| … an argument to an imported component "of the same type name" | **not closed in the language checker**: an imported component is known by its printed signature, which has no word for "this prop takes a value" (and a module is checked against signatures as against bodies, MO-9). The type pass refuses both programs of the review (`TS2322`, `../w/res/r2-5`). A word in the signature would close it; none was added | stated |
| … a union of records each with a `View` field permits `str(p.part)` | **fixed**: a field that is a view in one record of a union is one | S-context-7, rejected |
| a JS node shown twice; a module compiled now on an older runtime | as before: one made node is one node; `__rt.ask` / `__rt.slot` / `__rt.over` are not in 0.3.1's runtime, and nothing says so but the failing call | proposals/26, Cost, Against |
| the seventh class ("every non-literal argument is given") is too broad | **gone** (below) | |

Found on the way and fixed: the oracle gave content that is one expression as a memo, so `??` of content given on that
was not given showed nothing; the oracle showed a component's children by its own rule (a portal among them printed
`[null]`, and beside an element could not be printed): it is the compiled module's rule now.

### What changed in programs that ran (measured again)

1,642 programs written for this (`../w/mkp.py`: 14 forms of the argument × 13 ways it is given on × 12 ways it is asked,
each with a change over time; 110 with an awaited flag), on 54571c1d, on PR #1 07b2e368 (its last commit changes no
runner; the two answer alike on all 1,642) and now, in the interpreter, the oracle and both emitters:

- now: **1,642 agree** (before: 1,553, and 89 on which the runners differed);
- the 1,060 whose argument is a value: **996 answer exactly as before; 64 differ only in that a view slot holding
  `undefined` shows nothing where it showed the word; none otherwise**;
- 263 changed in all, in five of the classes of the first round: asked, content is not made (61); the word `undefined`
  (65); children that were not written are not given (33); a spread or a rest hands the children on (58); content that is
  a choice of the children follows its branch (46). The class that cost something is gone: the 72 programs of the 979
  that it had changed answer as before the rule again.
- served and hydrated, in both emitters: 1,642 of 1,642; 378 of them with a click on the served page before the
  client takes over, replayed after.

The earlier sets on the new code: 1,147: 800 agree, 346 refused, 1 alike in error (as in the first round; 63 changed, the
same). 979: 822 agree, 157 refused; against before the rule 182 changed (188 in the first round), none of them "not
given → given". 635 and 3,802: no output differs from the first round.

On the final code with the widening (894db2d7; `../w/tool/*.json`, the speed run's `scripts/matrix.mjs`): 1,642: 1,642
agree, served and hydrated 1,642 of 1,642. 1,147: 800 agree, 346 refused, 1 alike in error; served 800 of 800. 979: 822
agree, 157 refused; served 822 of 822. 635: 340 agree (328), 261 refused (267), 23 differ (27), 8 alike in error, 3 not
compiled. 3,802: 1,549 agree (1,532), 2,158 refused (2,163), 50 differ (58), 42 alike in error, 3 not compiled. No
program that agreed in the first round shows something else; the 13 newly accepted carry a view by a context declared
`View` and agree in the four runners; the others that moved to "agree" are the oracle's two fixes. Both checkers say the
same of every program of the five sets but two of the 3,802, a diagnostic's wording (`kids` in the reference, `children`
in the crate), and the emitters lower all alike but one of the 635 (a CSS error's position in the message): the three
are the same on 54571c1d.

### The widening: a context that holds a view (done; proposals/27, S-context-8)

`context item: View` or `(row: T) => View`; `provide item = props.item`; `{use item}` or `<use.item row={r} />`; shown
and nothing else; not exported. Decided on the way:

- **Module-local.** The checker already carries what a provision's value needs to each `use` of the context, inside a
  module. Across modules that needs a contract in the context's signature; a view context is refused if exported, and
  the components that provide and show it carry the facts in their own signatures.
- **Flow**: from each place that shows it up to that component's root, then from the provider's block (above every such
  place) to the provider's root. Sound; what the caller writes around the part alone is not read, and that refuses one
  correct shape (proposals/27, with its program in `../w/mkc.py`).
- **HTML**: real linking, not a worst case (a worst case refused a select inside a `<form>` and `<li>{use item}</li>`):
  a provider's shape says `item-at use:<key>`, a part's `use:<key>-at ul`, and each application links them, through
  content, forwards and portals. No word added to a signature.
- **`<use.item … />`** for a view with a parameter (a tag, as `<props.f … />`); a context's type may be a function's
  (the parser stopped at `=>`).

Proof: 505 programs with the expected verdict in each name (`../w/mkc.py`, `ckc.py`): 334 accepted and 171 refused, each as its name says; of the 334 the four runners agree on 333 (one differs in the
oracle alone, which remakes a kept row of a keyed loop for any applied view, on 54571c1d too); the crate says what the
reference says of all 505, lowers and projects them alike; served and hydrated in both emitters, 315 of 315 (18 in
which the view waits or fails inside a portal are not served: a portal is made by the client alone, `../w/c10`). Kobalte's Select,
Combobox and Pagination in their shape, each a library module and a caller, in every runner; the parts are `SelectItem`,
not `Select.Item` (a record of components is not a value in `.rx`).

Found by these programs, and fixed in both checkers: the content model let `<li>`, `<dd>`, `<dt>`, `<summary>` inside a
`<p>` (the parser closes it; so on 54571c1d).

### Lines

| | c2e34162 | presence redesigned (d2d4f550) | with the widening |
| --- | --- | --- | --- |
| crate `compiler/src` | 27,352 | 27,302 (+49 −99) | 27,876 (+598 −35) |
| `ref/` (src, compile, oracle) | 12,307 | 12,323 (+169 −153, the three runtimes' `ask`, `slot`, `over` with their comments among them) | 12,496 (+211 −38, the type projection included) |

The redesign of the question removed code in both emitters (the arm-by-arm predicate, the wrapper of value arguments)
and in the interpreter (the side table). The widening is mostly the two checkers: the link of each place a context is
shown to what is given for it.

### Suites on the final code

Run on the final code before the one full suite:

- `compiler/test/js-host.mjs`: 12 of 12 (data by value; a getter read, once, to answer; a host's `slot` not made, with
  its own answer, and handed on through `merge`; production and the server).
- S-context-7 and S-context-8 in every runner, served and hydrated, both checkers, both emitters, the type pass.
- proposals/check.mjs with `--upstream` (e650b851): the marks of 24 and 27 corrected, then all as stated.
- The UI SDK copy built with this compiler and runtime: its suite 44 of 44; its `.rx` app in the browser and hydrated;
  its table of mistakes as it was; the project's Playwright specs (toggle, tabs, dialog, item-icon; client and
  server-rendered) 552 of 553, 6 skipped, 1 flaky, the one failure Solid's development diagnostic as on `rx-ui-sdk`.
- 1,000 rows, production, Chromium, median of 30, three rounds, twice, alternating with 54571c1d in one session (ratios
  after / before; the machine was under other load): rows with content, mount 1.0 to 1.08, reverse 1.0, change all 1.0;
  rows under a provision 1.0; rows that ask `if props.children`, mount 0.78, change all 0.55. The module minified 1,492
  to 1,520 bytes, the bundle 151,392 to 151,941.

One full suite, `../ci.sh`, every job of the workflows that runs on this Mac, on 41d85756 (the commit after it changes
this paragraph alone): **44 of 46 pass** — cargo test, both napi builds, wasm, the Windows check, the runtime's tests and
contract, names, spec-refs, the four scenario runners (209 scenarios), served and hydrated, the type pass, crate parity
in eight modes, drafts, lib, js-host, leaks, confined, runtime-resolve, measure, generated, the benchmark's tasks and
coverage `--check --strict`, tree-sitter, the language server's suites, the VS Code package, vite, vite-dir, vite-gate,
vite-types, wardic, formisch, ssr-router, start, proposals. 2 fail in a second for want of a built Solid Vite plugin
(`t-vite-hosts`, `t-vite-watch`), as on 54571c1d.

Not run: the UI SDK's unit tests (vitest) and toolbar specs; the twelve packages' own suites; Windows and Linux; nothing
on GitHub. The 3,802 and the 635 were not served again (their accepted programs were in the first round).
