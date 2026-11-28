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
| bug 40, `provide c = use c` is `CYCLE` | decided otherwise here: a `use c` written in what `provide c` is given is what is above that provision (the provider that hands on what it was given). *Corrected after the third review:* this row said the provision "reads what is above it" by a switch of the runtime while it was computed (`__rt.over`), and that the case with nothing above was a hole that stays. The switch is gone — the read is made before the block provides, and is the text's, not the moment's —; through a name or a second context of the block it is `CYCLE` (it froze); with nothing above and no default it is `CONTEXT_NOT_FOUND` (below, *After the third independent review*) |
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
| 4. `provide c = (use c) + "!"` nested, the outer one updated: `RangeError` after hydration | **fixed**, and it was every Solid-based runner on any update, not hydration: the provision read itself on its second computation. A provision's own expression reads what is above it each time (then by `__rt.over`, which the third review found wrong through a name, with two contexts, and for a `use` written before the `provide`; now a read made before the block provides: S-context-9) | S-context-7, S-context-9 |
| 5. `<p>{p.children && "yes"}</p>` with a `<div>` for content: `CONTENT_MODEL` | **fixed**: the left of `&&` is asked, and placed nowhere; `\|\|` and `??` show it and are placed | S-context-7, and its rejected twin |
| … a `View` spread onto a numeric prop | **fixed** where the component's type is read (the same module): refused like the argument | S-context-7, rejected |
| … an argument to an imported component "of the same type name" | **not closed in the language checker**: an imported component is known by its printed signature, which has no word for "this prop takes a value" (and a module is checked against signatures as against bodies, MO-9). The type pass refuses both programs of the review (`TS2322`, `../w/res/r2-5`). A word in the signature would close it; none was added | stated |
| … a union of records each with a `View` field permits `str(p.part)` | **fixed**: a field that is a view in one record of a union is one | S-context-7, rejected |
| a JS node shown twice; a module compiled now on an older runtime | as before: one made node is one node; `__rt.ask` / `__rt.slot` / `__rt.above` are not in 0.3.1's runtime, and nothing says so but the failing call | proposals/26, Cost, Against |
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

## After the third independent review (2026-11-26, `../review-opus2/REVIEW.md`: 2,452 programs)

Its verdict: the rule (a view is shown only) is ready; presence, a provision of itself and a context that holds a view
each needed fixes first. Each finding was reproduced with the review's own programs, then fixed or decided.

| finding | what was done | where it is held |
| --- | --- | --- |
| 1. while a view is asked for, `slot` answered a frozen `[]`: JavaScript that keeps its first read (a getter that makes once, `icon ??= <Card />`, `k ??= props.children`) showed nothing for ever, on the server and after hydration | **fixed**: it answers its own maker, a function, which Solid shows as a child. `GIVEN` and `slot`'s `when` are gone | `compiler/test/js-host.mjs`: eight shapes, the server, both builds, hydration |
| 2. `provide c = f(use c)` by a switch of the runtime (`__rt.over`): wrong through a name (froze on the first update, on main and PR #1 too), with two contexts of one block (one answer when made, another after an update), in a closure (overflow), for a `use` written before the `provide` | **redesigned**, the switch is gone. *Decided:* a `use c` written in what `provide c` is given is what is above that provision, in a closure there too — the text's, compiled as a read made before the block provides. A block's provision is the block's wherever it is written (the emitters and the oracle make it first; the interpreter always did). Through a name, a second context of the block, or a default of itself: `CYCLE`, with the rewrite in its message. Nothing above and no default: `CONTEXT_NOT_FOUND`. PR #1 refused the direct form (`CYCLE`, bug 40) and accepted the one through a name, which froze: here the direct form is the way to write a merging provider (`provide theme = { ...(use theme), fg: props.fg }`), and the frozen one is refused | S-context-9; `compiler/tests/cli.rs`; the review's 188 programs: none differs |
| 3. a context that holds a view: a recursive type refused ("another type") | **fixed**: the checkers ask that both are a view with a parameter; whether the types are one is the type pass's (recursive, fields in another order, `Array<T>`, a view that asks for less) | S-context-10 |
| 4. `provide body = c ? p.a : p.b` (and `??`, `\|\|`, `: undefined`) shown in a `<tbody>`: `CONTENT_MODEL` | **fixed**: a choice of the component's views holds no text. `flag && p.a` and `: null` stay refused, rightly: `false` and `null` are shown as text | S-context-10; 28 of the review's 42 accepted and served alike, 14 rightly refused |
| 5. an optional view given to a context: the type pass refused it, so Kobalte's `itemComponent?.()` could not be written | **fixed**: provided as it is; where it was not given nothing is shown | S-context-10, `test/tsc.js` |
| 6. the checkers' time: providers of one view context nested (6: more than 20 s) | **fixed**: what was placed once under the same ancestors and providers is placed (14: 0.02 s) | `compiler/tests/cli.rs` |
| 7. `<use.item />` without a required argument: said by no tool but the types runner | **fixed**: reported at its tag | `test/tsc.js` |
| A. `if p.l ?? p.r`, `if c ? p.l : p.r`: refused, accepted through a name | **fixed**: a choice or a default of views is asked as one is | S-context-10; 36 of the review's programs |
| spec 03 and proposals/26 on content: "any other expression is a value and answers as JavaScript has it" is false of content | **corrected**: a value written as content is its text and was given; `{""}` alone is nothing. In one sentence, in spec 03 | S-context-10 |
| found here: `p.l != undefined` of a view given `null` — not given in compiled code and the oracle, given in the interpreter | **fixed**: the language's `!=` is strict, and so is the question | S-context-10 |
| found here: `context item: ((row: T) => View)`, the type in parentheses, was no context that holds a view | **fixed** | S-context-10 |
| `renderItem={use item}`, the view given on as an argument (Kobalte's own line) | **refused still** (decided: not simple — it is a rewrite of the program every runner reads, in two implementations). Written `{view renderItem (q) { <use.item item={q.item} /> }}` | proposals/27 |
| the root and the part that shows the view in two modules | **refused still** (decided: not simple — an exported context would need its view in its printed contract). The two live in one module; the other parts anywhere | proposals/27 |
| a provision the caller writes between the provider and the part | refused still, as stated in 27; Kobalte itself has none (the review's census) | proposals/27 |
| old, on main too: `<Q l="o" {...(s ? { l: undefined } : {})} />` — the interpreter keeps `o`, compiled code takes the spread's `undefined` | **not fixed** | the review's `p2-spr-over` |

### Measured on the final code (`scripts/matrix.mjs` of the speed branch; interpreter, oracle, both emitters, both checkers alike, lowered alike)

| set | before these fixes (538b0392) | after | what moved |
| --- | --- | --- | --- |
| the review's presence sets: p1 506, p2 474, p3 408 | 483 / 352 / 344 agree | 483 / 388 / 344 agree | p2: 36 from refused to alike (finding A). No output changed |
| the review's row-state and explicit-view sets: s1 149, e1 98 | 98 / 74 agree | the same | nothing (s1's 51 are the oracle alone, which remakes kept rows of an applied view, as said above; 3 are older than the branch) |
| the review's view-context sets: v1 265, m1 168, t1 96, y1 26, k1 15 | 256 / 113 / 42 / 17 / 11 agree | 258 / 113 / 70 / 22 / 11 agree | v1: 2 (a recursive type); t1: 28 (a choice in a table; 14 stay refused: `false` is text); y1: 5 (types by the type pass); k1: the 4 refused are the three limits of 27 and one of 26 |
| the review's provisions of themselves: o1 167, o2 13, o3 8 | 129 agree, 25 differ, 6 stopped; 4 agree, 5 differ, 4 stopped; 4 agree, 1 differ, 1 stopped | 149 agree, 8 refused, 5 error text (the review's own syntax), 5 refused whose oracle run does not end (it runs what the checkers refuse); 7 agree, 6 refused; 5 agree, 3 refused | no runner differs on any accepted program |
| 1,642 (presence) | 1,642 agree | 1,642 agree | nothing |
| 1,147 | 800 agree, 346 refused, 1 threw alike | 800 agree, 347 refused | the one that threw (*no provision*) is `CONTEXT_NOT_FOUND` |
| 979 | 822 agree, 157 refused | the same | nothing |
| 505 (a context that holds a view) | 333 agree, 170 refused | 334 agree, 169 refused | one more accepted; the one "differ" is the oracle's kept rows |

Served and hydrated, both emitters, the review's sets with their frames filled: p1 483 of 483, p2 328 of 328, p3 343
of 344, s1 146 of 146, e1 74 of 74, v1 244 of 246, m1 112 of 113, t1 42 of 42, k1 3 of 3, o1 107 of 107 that its
harness can read (22 have a `|` in a frame). The four that miss are the review's four, older than the branch and the
same without its forms: a late fetch after hydration in a loop (two), an await under an inner `if` (one), and **the
text of an explicit view in a `<tbody>`, which is accepted and moved by the browser's parser** (one: `<p.row … />`
whose view is text; a context that holds a view refuses the same text). That last one is a hole of the content model
that this work did not close.

Suites on the final code: the four scenario runners 211 of 211, served and hydrated, the type pass, crate parity,
lowering and projection parity, `cargo test`, `compiler/test/js-host.mjs` 17 of 17, `test/tsc.js` 56 of 56. The full
suite was run once on the branch that holds this one merged (`rx-best`), not here.

What is weaker than before: nothing is accepted that was refused for a reason that still holds, by the sets above.
What changed its answer on purpose: a closure written in a provision reads what is above it (it read the provision);
`x = use c; provide c = x` is `CYCLE` (it froze); `slot` has no `when`.

## `rx-best`: the parts in one branch (2026-11-26, local, nothing pushed)

One branch from PR #1's head (8155d684), with, in this order, each merged green before the next (`scripts/quick`):
upstream main (bbe2a189: AC-1h, R-8 through components), `proto-children-rule` (explicit views, a view is only shown,
whether one was given, a context that holds a view, and the third review's fixes above), `rx-std` (f208152a: `std/`
and the twelve packages written on it), `proto-optional` (3a4847ec, E-9a) and `proto-generic` (b36ab25d, 07 §2), and
`examples/rx-ui-sdk` (fd2eb969) rewritten for the rule. Upstream's acceptance was not weighed; what does not merge
soundly was to be left out and listed.

### What is in, and what had to be reconciled

| merged | what met what | what was done |
| --- | --- | --- |
| upstream main | AC-1h's `waits` (an action whose change outlasts the call) and MO-10l's `waits` (a JS fn whose result waits or fails), one field name in both checkers | upstream's is `outlasts` |
| | the run checks: this branch's take their scope (AC-1g's answers, AC-3's hooks), upstream's take `actions_in` | both, one signature |
| | R-8: upstream covers a snapshot by a prop the child shows, this branch by the component's own regions; upstream records a component's handler props | both covers, in that order; the handler props from the arguments as this branch reads them |
| | the guide's `STALE_NEXT_READ` examples call `fetch`, which an app's program does not have here | they import their request |
| `proto-children-rule` | C-1 for a provision of itself: PR #1 (04087769) refuses the direct form and accepts it through a name; the merged rule is the other way (above) | the merged rule; `provisionCycles` and what fed it are gone from both checkers; what 04087769 kept of a name's failures (never cut short by who asked first) is kept. PR #1's S-context-4 is S-context-11, each form with its verdict under the rule; bugs/40 rewritten with its marks |
| | the closure kept in a provision: PR #1's scenario said it reads the provision (`4`, `6`) | it reads what is above it (`710`, `712` with two providers): the one result this branch changes on purpose |
| | `NESTED_NOT_RENDERED`, twice on a line: by name (the prototype) or as written (a4cba8ef) | as written |
| | `compiler/test/js-host.mjs` bundled with esbuild, which the tools' move took out of the workspace | Rolldown (`scripts/lib/bundle.mjs`) |
| | a merged loop that never advanced (`fails_of` over a context's provisions: one side's `while`, the other's body) | found by the compiler's own warning before it ran; fixed |
| `rx-std` | nothing in the language; `std/test/browser.mjs` needed esbuild | Rolldown; the twelve packages build to the same code and their tests answer as on `rx-std` (230 of 276, 31 of 34 served: the same tests fail) |
| `proto-optional`, `proto-generic` | a printed fn row is read from its end here (its words, then the result), and each prototype read it from its start; both mark the same row (`f<T>(a: T, b?: T)`) | read from the end, past the type parameters, with the optional mark; the projection writes both; spec 09's table has a row for each |
| | the tree-sitter parser is a generated file, and git merged its text | generated again from the merged grammar (92 corpus tests) |
| `examples/rx-ui-sdk` | the package as written is refused in two places (a module's own `children: View` handed to a JavaScript function) | rewritten: children shown, children told the part's state as a view with a parameter, `render` as a view of the part for two parts (its REPORT.md); 44 of 44 |

**Left out**: nothing that was asked for. Not in any of the parts, and so not here: a type alias with type parameters
(`type Item<T> = …` is a parse error; a generic fn's own parameters are the prototype's whole scope); locals in fns
(the third prototype, 21: not asked for); `renderItem={use item}` and an exported context that holds a view (above).

### Interactions: 516 programs that mix the parts, and what they found

`mkx.py` (kept beside the worktree, `../a/`): 12 places a value goes (plain, content, a view asked for, a view with a
parameter, a context, a provision given from what is above it, a context that holds a view — plain, with a parameter,
optional, a choice in a table —, inside a component, inside a provision) × 8 calls (a generic fn, one with two type
parameters and `keyof`, an optional parameter given and left out, both at once, a fn that instantiates with and
without its optional argument) × the fns, components and contexts in the program's module or in one it imports ×
AC-1h's handler (none; in plain markup, in content, in a view with a parameter, as a callback prop), and the same
handlers without `latest` (60, to be refused), and 72 that run the held action (two ids minted while the first still
waits, then both answers).

| | |
| --- | --- |
| alike in the interpreter, the oracle, both emitters | 456 of 456 accepted |
| refused, as written to be (`STALE_NEXT_READ`, wherever the handler is written) | 60 of 60 |
| both checkers alike; lowered alike; projected alike | 516, 516, 516 |
| the type pass | 456 of 456 |
| served and hydrated, both emitters | 456 of 456 |

They found **no fault** of the merged tree. Nine of them are S-mix-1. Nine more written by hand for what the product
would not reach (a view with a parameter whose body instantiates a generic fn; a provision's own `use` as a fn's
argument beside a second context of the block; an action reached through a context from a handler in a view; a tree
with a generic fn over its own type and a depth counted from above; a theme merged from above beside an optional
carried view): six alike in every runner and served, two refused as meant, one a parse error (the type alias above).

What the merges themselves found is the table above: two clashes of names or signatures, one rule decided twice, one
loop, three tests on a bundler that was gone, one generated file.

### Suites

`scripts/quick` after each merge: 20 passed, 0 failed (the benchmark part is time-boxed there).

`scripts/ci`, every job of the workflows that runs on this Mac, once, on the merged tree (8 at once, 429 s, 1,282 s of
CPU): **41 passed, 4 failed, 2 not run here**. The four, each looked at and run again:

| failed | why | then |
| --- | --- | --- |
| tree-sitter | **a fault of the merged tree**: the grammar had no rule for a printed signature's `view` rows, which `examples/rx-ui-sdk/dist/*.d.rx` hold (no file of the repository had one before) | a rule and a corpus test; 93 corpus tests, the repository parses |
| bench-tasks | 4 checks of one task's dev server (`__rt.slot is not a function`): Vite had pre-bundled the runtime of the baseline run made in this folder before the merges, and kept it. Not the product's; the benchmark's workspace now drops that copy when the runtime it is given is another | all as the scorecard or better: good 44 of 44, types 186 of 186, runtime 279 of 279, bad caught 247 of 247, unrepresentable 13 of 13 |
| t-vite-types, t-ssr-router | they need what `t-vite` installs, and ran before it in a folder that had never run it | pass |

Not run here: `t-vite-hosts`, `t-vite-watch` (they need a built Solid Vite plugin, as on every branch).

Beside it: `compiler/test/js-host.mjs` 17 of 17; `proposals/check.mjs` with `--upstream` (the export of e650b851): 347
verdicts over 72 documents, all as stated (one of upstream's own, `bugs/25`, the type pass on that export, said
`TS2322` in a first run and what the document says in the second: not looked into, and no mark of this branch);
`examples/rx-std`: its
twelve packages build, 230 of 276 and 31 of 34 as on `rx-std`, `std/test/browser.mjs` 39 of 39; `examples/rx-ui-sdk`:
44 of 44.

Sizes against PR #1's head (8155d684): the crate 25,979 to 28,555 lines, `ref/` 12,148 to 13,160, scenarios 201 to
218 files; the runtime's browser build 32,564 to 33,289 bytes.

Not run: the UI SDK's Playwright specs, unit tests and leak gates on this tree (552 of 553 on the children-rule
branch); the twelve packages' originals as a baseline again; run-time performance; Windows and Linux; nothing on
GitHub; the 3,802 and 635 programs of the first review rounds; the first rounds' sets on this tree (the 1,642, 1,147,
979 and 505 were run on the children-rule branch's final code, which is merged here unchanged).

## `rx-best`, the author's side: what a kit of parts needs (2026-11-26, local, nothing pushed)

Asked: generic components; a tag chosen by a value; compound parts; a view context shared by two modules; the two holes
that were known; a rule found by the generator's review (an action given by name). In that order, each with programs
first. The sets, their generators and logs are beside the worktree (`../b/`: `mkg.py`, `mkd.py`, `mkn.py`, `mkk.py`,
`mkt.py`, `mkm.py`; `ck.py` holds each program to what its name says; `fill.py` writes the frames the four runners agree
on for the served run).

| | decided | form | programs: as named / served and hydrated (both emitters) |
| --- | --- | --- | --- |
| 1 generic components and types | **in** (proposals/28, S-generic-2) | `component List<T>(props: { items: T[]; children: (r: { item: T }) => View })`, `type Item<T> = …`; inferred at the tag, none written there | 170 of 170 / 118 of 118 |
| 2 a tag chosen by a value | **no new form** (proposals/29, S-view-8) | a closed set is an `if` over a prop typed by its literals; a tag or component the caller chooses is `render`, a view shown with the part's attributes | 153 of 153 / 144 of 144 |
| 3 compound parts | **in** (proposals/30, S-module-47) | `import * as Select from "./select.rx"`, `<Select.Item>`, `Select.Opt`; no value, nothing made | 125 of 125 / 101 of 101 |
| 4 a view context in two modules, `renderItem={use item}` | **left out**, with what each needs (proposals/27, last section; S-module-48 holds what is written today) | root and the part that shows the carried view in one module; other parts anywhere; `{view renderItem (q) { <use.item {...q} /> }}` | 33 of 33 / 22 of 22 |
| 5a a spread after an attribute | **fixed** (S-surface-13) | the text's reading was the compiled one; the interpreter did not see a field go | 46 of 46 / 46 of 46 |
| 5b text of a view in a `<tbody>` | **fixed, and wider than reported** (S-server-6) | a value shown directly in a table context is `CONTENT_MODEL`, wherever it is written | 246 of 246 (151 refused) / 95 of 95 |
| 6 an action given by name | **in, narrowed** (S-check-4, bugs/44) | called there where the callee is known to call now: the language's calling methods, a module fn that calls that parameter | 120 of 120 (43 refused) / 77 of 77 |

Both checkers say the same of every program of the seven sets, and the two emitters lower every accepted one alike.

### 1. Generic components and generic types

*Decided:* TypeScript's text after the name, as a fn's is (20). The compiled JavaScript has none; a tag infers. What
the checkers read of them is two things.

- **A generic alias applied is read.** `Slot<View>`, `Render<Row>`, `Select.RootProps<Opt>`: each parameter's name is
  replaced by its argument (a default where none is written), so a prop that is a view there is one and RG-4c holds it.
  Before, `type Item<T>` was a parse error. An alias that binds a name again (`infer T`, a mapped type's key, a generic
  function type) is not read, which is the answer for any type that cannot be read.
- **A type parameter is a value's type, never a view.** A view is not given on to a prop declared `T`; children are not
  declared `T` (both `VIEW_NOT_SHOWN`); a named view block has no prop `T` to go to. Without this a generic component
  would be the way to read a view as a value: `children: T`, `str(props.children)` — the interpreter showed `#error`,
  compiled code threw. With `children: any` that program is still accepted: the hole of a type that is not read, as before.
- **A view context is typed `any` inside the library.** A context is the module's and has no `T`. The root's props carry
  `T`, so the caller's view is typed; between the root and the part that shows it the row is `any`. Kobalte's is the same.

Found on the way and fixed: a function-typed alias inside a union was written out without parentheses (`View |
Render<T>` was read as no view; so for a plain alias before); an exported alias that is a view's type was not in the
printed signature, so a module checked against the signature (MO-9) refused what the source accepted; the printed
component row with a default type parameter could not be read back (found by the interpreter's MO-9 check).

*One thing weaker.* A source of a bare `T` written with a `T` (`source value: T | undefined`, `value := v`) was
`TS2345`: the write's type refuses a function, and TypeScript cannot decide that for an unknown `T`. The write's type is
read by a tuple's length now, as `eq` is since 20. Every verdict on a known type is the same (the whole suite). For a
`T` that the caller makes a function, the write applies it, in every runner, as Solid's setter does.

*For TSX:* `export declare function List<T extends { id: number }>(props: { items: T[]; children: Render<T>; empty?:
View }): JSX.Element`. A TSX caller's `r.item.nmae` is `TS2339`, a constraint not met `TS2353` (a built package and
`tsc`, by hand; no test holds it yet).

*Shapes that type-check and run now:* a list, a table whose columns are keyed by `keyof T`, a Select and a Combobox
that own their list and keep the chosen `T`, with the caller's option type in the item's view; a generic component
that forwards to another; children that are a view with a parameter or plain content.

### 2. A tag chosen by a value: not added

*Decided:* no element whose tag is a value. The content model (SV-7d) needs the tag: with `<props.as>` each literal of
the prop must be held, so the caller's block content in a part whose `as` may be `"p"` is refused though this caller
wrote `"div"` — and to accept it a component's printed shape would have to be one per value of the prop. An open `as`
(any tag, any component) has no content model at all, and a component given by name is a value (RG-4a). What exists
gives the same reach with everything known: an `if` for a closed set (sets whose tags take the same content refuse
nothing: headings, `ul`/`ol`, `div`/`section`), and `render` for what the caller chooses. Both were run hard, since
they are now the answer: 153 programs, the part's attributes (state, an action, ARIA) spread on the caller's element or
component, a `render` that is optional, under a root's context, shown twice, handed on.

*Cost to an author:* n branches for n tags; a library whose API is `as` (Kobalte, terracotta's 195 uses) is `render`
in `.rx`, one line more for its callers. *Would change it:* a kit whose parts cannot be `render`.

Found: a view's parameter may hold a `View` under a name other than `children` (`<props.render icon={props.icon} />`),
alike in every runner.

### 3. Compound parts

*Decided:* a namespace import, and nothing else. `import * as Select from "./select.rx"`; `<Select.Root>`,
`<Select.Item>`; `Select.Opt` in a type's text. It is no value. Both parsers read the module with each member it names
as a named import (`Select$Item`), so no runner knows of namespaces and every rule of a named import holds as it is: a
part's contexts, its shape, a generic root's inference. The checkers' messages say `Select.Item`; the type pass's own
say `Select$Item`. A JavaScript kit with a declaration file the same, MO-11q's members through it (`<Kit.Dialog.Root>`).
For JavaScript and TSX there is nothing to build: an `.rx` module's exports are an ES module's.

*Not chosen:* `export component Select.Item(…)` in `.rx` (Kobalte's `import { Select }` with a root that is itself
applied): an object at run time and a row per member in the signature, for a shape the namespace gives as
`<Select.Root>`. *Not built:* a re-export, which a kit in several modules needs to be one namespace (below).

### 4. A view context in two modules: left out

The check of a context that holds a view links every place that shows it to every provision of it, inside one module:
which arguments each place gives, what stands between it and its component's root, where the parser would put it. With
the place in another module none of that is known when the root is checked. What would carry it is written in
proposals/27 (the context's row says the view's parameter; every part that shows it gives plain values only; the
root's row is written as if the view were shown at the provision). It is sound by 27's own argument, and it is two
signature rows and their checks in two checkers: not provable in the time. No kit read needs it: the part that shows
the view is one component and sits beside the root. `renderItem={use item}` is one written line today. One namespace
over several modules needs a re-export; today a namespace for each module, or one module.

### 5. The two holes

- **A spread after an attribute.** `<Q l="o" {...(s ? { l: undefined } : {})} />`: by the text, the last part that
  *has* a field gives it, `undefined` too; when the spread no longer has it the attribute stands. Compiled code and the
  oracle did that. The interpreter's change of a path did not see a field come or go (`{ l: undefined }` and `{}` were
  one value), so it kept the spread's answer. One line of the interpreter. On upstream too.
- **A value shown in a table.** Reported as the text of an explicit view in a `<tbody>`. The same held with no view at
  all: `<table><tbody><tr>…</tr>{n}</tbody></table>` was accepted, and the served page had the text before the table
  (8 of 11 first probes differed when served; on upstream too). Text written there was refused, a value shown there
  was not. Now a read that shows a value is text for the content model, in place, as content, in a view with a
  parameter, through a context, as a component's root (`roots #text` in its shape). What is no value stays: a view the
  component was given under whatever name, a field of a view's parameter declared `View`, a view a context holds, a
  loop, a choice of views. A prop whose type is not read is as it was. No program of the tree is newly refused.
  *Refuses, and could be right:* a JavaScript function's view written directly in a `<tbody>` or a `<tr>`
  (`<tbody>{rows()}</tbody>`); none in either tree.

### 6. An action given by name

The archived count (`rx-gen`, `spec/archive/mo8j-action-by-name-2026-11-26.md`) says the reviewer's rule as any call's
argument refuses no program of either tree or of the benchmark, and would refuse correct ones that are not there
(`preventDefault(save)`, `createCallback(save)`: a JavaScript import may keep what it is given). So it is not "right" as
asked. *Decided:* the part of it that is: where the callee is known to call now — the language's methods and functions
that call what they are given, and a fn of the module whose body calls that parameter (by name, or by giving it to one
of those; outside a closure, or in a closure given to one of those). `[1, 2].map(inc)` in an equation is
`ACTION_CALLED_IN_OWNED_SCOPE`, as its closure is; Solid's development build stopped on it and production ran the
action in the equation. Still accepted and wrong: a fn of another module that calls its parameter, a parameter handed
on to a second fn, an action reached through a record or a list.

### What is weaker than before

1. A source of a bare type parameter is written with a value of that type unchecked for being a function (1).
   *Undone 2026-11-26* ("Roadmap, track 1", step 2): refused again, with `x := () => v` in the message.
2. Nothing else is accepted that was refused.

What is refused that was accepted, each for a page that was wrong when served or a run that stopped: a value shown
directly in a table context (5b); an action given by name to what calls it now (6); a view given on to a prop declared a
type parameter, and children declared one (1: neither could be written before).

### Lines

| | b63f3767 | now |
| --- | --- | --- |
| crate `compiler/src` | 28,551 | 29,053 (+574 −72) |
| `ref/` (src, compile, oracle, types) | 13,160 | 13,317 (+218 −61) |
| scenarios | 218 files | 225 files |

### Suites

`scripts/quick` after each item: green (19 or 20 steps; the benchmark is time-boxed there).

`scripts/ci`, every job of the workflows that runs on this Mac, once, on e411c683 (471 s, 1,320 s of CPU): **44 passed, 1
failed, 2 not run here**. The one: `proposals` — 20's page still stated that a generic type alias is a parse error on
this branch, which item 1 changed; the mark is corrected and that step run again alone: all as stated, on this tree and
on upstream's export (e650b851). Passed among the 44: cargo test, both napi builds, wasm, the Windows check, the four
scenario runners, served and hydrated, the type pass, crate parity in every mode, the benchmark's tasks and coverage
`--check --strict` (every bad variant caught, as the scorecard), tree-sitter, the language server's suites, the VS Code
package, vite, wardic, formisch, ssr-router, start, js-host. Not run here: `t-vite-hosts`, `t-vite-watch` (they need a
built Solid Vite plugin, as on every branch).

Not run: the UI SDK's Playwright specs, unit tests and leak gates; the twelve packages' own suites; `examples/rx-ui-sdk`
and `examples/rx-std` rebuilt on this tree; the earlier review sets (1,642, 1,147, 979, 505 and the review's own) on
the new code — the suite's scenarios hold their cases, the sets themselves were not run again; run-time performance;
a TSX caller of a generic `.rx` package as a test (by hand only); Windows and Linux; nothing on GitHub.

Tooling: the tree-sitter grammar reads a component's type parameters and a signature's generic rows (corpus tests);
a namespace import needed no grammar change. The language server runs the crate's wasm: nothing of its own changed,
and no test of it was added for these forms. Its untracked copy of the wasm was refreshed by hand before the suite.


## Roadmap, track 1 (2026-11-26: the checkers and the language)

The roadmap of 2026-11-26 (kept beside the tree, `ROADMAP-fable.md`), track 1, in its order; each step merged green
alone. Its program sets are generated with the verdict in each program's name and kept outside the tree
(`rx-t1.noindex/sets/`: `mk1.py` …, `ck.py` holds each program to its name, `fill.py` writes the frames the four
runners agree on for the served run).

### Step 1: five defects (X3, X4, X5, X9, X10)

| | what was wrong | now | held by |
| --- | --- | --- | --- |
| X3 | `source x := await …` passed both checkers and was never compiled (bugs/42) | `AWAIT_IN_EXPRESSION` [ST-5a], "write `source x = …`" | S-check-5, bugs/42 |
| X4 | `p.h ?? ((e: any) => 0)`: the reference emitter wrote the arrow as a bare operand (`a ?? (e) => 0`), which JavaScript does not parse; the crate compiled it | an arrow operand is written in parentheses | S-check-5 |
| X5 | a props key that is no identifier (`"tc-button"`) was printed bare in a signature row | printed quoted, read back so by both readers (a name may hold `:`), and by the grammar | S-check-5 (MO-9 check), `ref/units.ts`, a corpus test |
| X9 | `context sel: <T>(p: { item: T }) => View` was a context of a plain value, silently | `GENERIC_CONTEXT` [RG-7a], through an alias and in parentheses too | S-check-5 |
| X10 | `INSTANTIATION_NOT_BOUND` said "declares state" of a fn that declares an equation (bugs/22) | it names the first `ref` parameter, the first declaration (`declares an equation, \`half\``), or the context read | S-check-5, bugs/22 |

*Decided.* X3 takes bug 42's smaller answer: a seed is a snapshot (E-4), and the source that waits is the one with a
question; waiting once for a seed would be a second, unwritten meaning of `:=`. The code is the existing
`AWAIT_IN_EXPRESSION` (an `await` where none can stand), with ST-5a as its rule. X9 is a code of its own, since nothing
else names it: a context has no type parameter (the decision of proposals/28 and B13, kept). X5: the row lists the
props a component reads, as before; a key it does not read is not in the row (the roadmap's probe read none), and that
is not a loss — an importer reads an unlisted prop as one the component does not read, as the module's own check does.

*Census.* No `.rx` program of the tree has `source … := await` or a generic context, so nothing is newly refused there
(`rx-std`'s REPORT.md noted the `:=` form as one that `rx-lib` refused; it now fails at the checkers, with the
rewrite in the message).

### Step 2: W1 undone — a write of a bare `T` is refused again, and a function written to a path with it

*Decided (the roadmap's change of `rx-best` item 1).* The type pass's `set` takes `Exclude<T, Function>` or an updater
again, for every `T`: a type parameter may be a function, a write applies a function (W-6), and `x := () => v` stores `v`
for every `T` — Solid's own idiom (`setValue(() => v)`), which the type pass already accepted. Rejected with the
roadmap: keeping the relaxation (one shorter line, and the one documented hole of the generic work), storing instead of
applying where the declared type names a type parameter (the emitters read no types; one text, two meanings), a hidden
"not a function" constraint on the caller's `T` (refuses a correct select of callbacks).

*Found beside it, and fixed the same way.* A path write of a function (`s.f := (x: number) => x * 2`, a field that holds a
function) passed both checkers and the type pass, whose `setAt` took any `T`; the interpreter and both emitters applied it
(W-6 at a path, since f4e7d3cf) and threw, the oracle stored it. W-6 already said "`x := f` is refused by its type": `setAt`
now refuses a function as `set` does (a draft's path the same: its write takes an updater too).

*The message.* TypeScript prints the parameter's type expanded, so the message is added where every reader of the type
pass's diagnostics gets them, `tooling/rx-language-server/src/checker.js` (`plain`): a TS2345 whose parameter is the
prelude's `Exclude<…, Function>`, or a function given where the updater `(p: X) => X` stands, says "W-6: a write applies a
function … write `x := () => v`, which stores `v` for every type". The code stays TS2345. rx-tsc, the editor and
`ref/types` say it alike.

| | |
| --- | --- |
| programs (`mk2.py`: 3 declared types × 3 writers (effect, action, handler) × 4 caller types × bare/functional; a function caller stored and called; the generic action of a combobox; 4 path shapes × bare/functional; a generic path; known types) | 87: 41 the type pass alone refuses, every one TS2345 with the W-6 message; 46 accepted |
| accepted, frames from the interpreter, then interpreter, oracle, both emitters, served and hydrated in both | 43 of 43 alike (3 more are a write that changes nothing, so no instant — the set's own) |
| both checkers, lowered, projected | 87 of 87 alike |
| the 170 of rx-best's `mkg.py` | 1 writes a bare `T` (the combobox), refused as the others |
| scenarios, the type pass | 662 of 662 after S-generic-2's combobox was rewritten (`value := () => v`) and a rejected variant added |
| `test/tsc.js` | 59 of 59 (three new: the bare `T`, its twin, a path) |
| `examples/rx-packages/check.mjs` | its record rewritten byte for byte: no verdict moved |
| `examples/rx-std` | 13 of 13 build |
| `examples/rx-ui-sdk` | builds; `check/run.mjs` as before (good and correct programs accepted). `app/test.mjs` cannot run: its harness imports esbuild, which nothing installs (not in CI; left) |

What this refuses that was accepted: a bare `T` written to a source, and a function written to a path. Nothing of the
tree but S-generic-2's combobox was either.

### Step 3: W2 — a value that holds io, followed

*The one mechanism* (04 R-io-3, both checkers, alike). An expression holds io at a path: `actionParts`, which existed
for a field called by name (`r.go()` was refused), plus `itemParts`, what an item of a list holds (each item of a
literal, after a spread too; through names, choices, `filter`/`toSorted`/`slice`/`concat`). Three uses of it:

1. The parameter of a closure given to `map`, `filter`, `some`, `every`, `find`, `reduce` (its second), `forEach`,
   `flatMap`, `toSorted` — as a method or the language's function — over a list, and a `for` row in a view, hold what an
   item holds: calling them (or a field of them) in reactive scope is `ACTION_CALLED_IN_OWNED_SCOPE`, by the rule that
   already refused `g = inc; g()`.
2. `calledPaths`: the paths of a fn's parameter its body calls while it runs ("" the parameter, `go` a field, `*` an
   item), through a local that names a path, a closure given to a calling method, and a parameter of another fn that
   calls it — a fixpoint over the module's fns, the cycle cut where it closes (a recursive fn and two that call each
   other are held). It replaces `paramCalledNow` (one step, by name). A call in reactive scope that gives a value holding
   io at a called path is refused; so is an item given by name (`[inc].map(callIt)`).
3. The printed row says it: `export pure fn runAll(fs: any[]) calls(fs.*)` (09 MO-9b), read back by both readers and the
   grammar, so an importer holds a fn of another module, and one re-exported through a third, the same.

*Decided.* (a) `calls(…)` is a derived mark of a printed `.rx` signature, never written: a JavaScript declaration that
says it is refused by name in both declaration parsers (it was read into the result's type text in silence). So the
vocabulary bar (MO-8r) is not engaged; a JS fn that runs what it is given is one the generator declines `pure` for. (b) A
method called on a parameter is a path too (`fs.map(…)` prints `fs.map`): a record `{ map: inc }` given there is called,
so it is no noise to the soundness, only to the row. (c) An instantiating fn's call bound to a name (`y = run(…)` of a fn
that declares) never reached the call check: it does now — it runs where it is written. (d) `fs.map((g) => () => g())`
is refused: a closure written in reactive scope is pure (SC-3), as `() => inc()` there already was.

*Still open, and said* (spec 04): an io value inside a value whose type is not read (a prop or context typed `any`:
step 5, W4), and one given to JavaScript that calls it at once (bugs/05).

| | |
| --- | --- |
| programs (`mk3.py`: 10 holders — a list, two, nested, a record in a list, a spread, after a spread, a name, filtered, a choice, a field — × 11 ways to call — `map`, `forEach`, `some`, `filter`, `reduce`, the language's `map`, a fn, a second, a third, an item by name, another module — × in an equation / in a handler; a `for` row; carried five ways; a record's field through one and two fns; a local naming an item; a pure list; recursive and mutual fns; a shadowed name; a component's handler in a list six ways; another module's fn four ways, a pure twin and a handler twin each; a fn re-exported through a third module) | 294: 134 refused by both checkers, 160 accepted, each as named |
| both checkers, lowered, projected; the type pass | 294 of 294 alike; 294 of 294 |
| the 160 accepted, frames from the interpreter: interpreter, oracle, both emitters, served and hydrated in both | 160 of 160 alike |
| census: scenarios (four runners, the type pass, crate parity) | nothing newly refused |
| `bench/run.mjs --check --strict` | as the scorecard |
| `examples/rx-packages/check.mjs` | `check.json` rewritten byte for byte (292 of 300 caught, 3 of 200 correct refused: unchanged) |
| `examples/rx-std` (13 build), `examples/rx-ui-sdk` (builds; `check/run.mjs` output identical) | unchanged |
| the signature round trip | `ref/units.ts` (`calls(f, fs.*, fs.map, r.go)` printed, read, printed again), the crate's by the parity runner on every program with a module, a corpus test |

proposals/31's 456 programs were not found on disk (their generator is not kept); its five leftovers are written again
here: the two that are W2's are refused (S-check-6), the three of a prop or a context typed `any` are step 5's.

### Step 4: B3 — a statement closure in a record or a list

*Taken* (spec 02 SC-3, both checkers and the interpreter's run-time check alike): a statement closure written as a field
of a record literal or an item of a list literal, in reactive scope, is imperative and an io value, as the action that
stood in for it was (`{ onKeyDown: down }`). It is carried freely — names, spreads, a context, a view's argument, a fn's
result — and step 3's mechanism refuses it where it is called while the view computes.

*Decided: it ends only where a handler goes.* The roadmap argued it has the action form's reach. That reach includes
holes the action form has today (an io value given to JavaScript that calls it at once, bugs/05), and the closure form
was refused there; so taking B3 as stated would have accepted programs that were refused and are wrong: the census found
them — S-module-12's `useQuery({ queryFn: () => { … } })` and `useMutation({ retry: … })`, and the benchmark's
`export route = { loader: () => { asked := … } }`, which the router calls while it computes. So: it may end at an
element's `on…`/`ref` (by name or a spread's field), a component's handler prop (SC-4b), a parameter or a record's field
a JavaScript declaration says `handler` (MO-10g). Given anywhere else — a plain attribute or prop, a spread's field that
is none, a JavaScript argument not marked `handler`, an export of the module — it is `REACTIVE_WRITE_IN_OWNED_SCOPE`,
the verdict a closure written there has. Through a name too (`opts = { queryFn: … }; useQuery(opts)`): the fact is
`actionParts` in a closure mode, beside step 3's. *Open, as for an action*: a record given to a component's
non-handler prop (or a view's argument across modules) whose receiver calls a field of it while it computes (step 5's
subject).

*Rewritten.* The UI SDK's `own()` (a JavaScript identity whose declaration marked each field `handler`) is gone: its 18
uses are the record itself, in `examples/rx-ui-sdk` and `examples/rx-packages/packages/ui-sdk`; `elementProps`'s
declaration says that the `ref` and `on…` it merges into an element's props are handlers. Terracotta's Button writes
its three handlers in its `attrs` record instead of three actions.

| | |
| --- | --- |
| programs (`mk4.py`: 4 bodies × 6 holders — a record, a nested one, a list, a record in a list, a choice, a spread — × where it goes — an attribute, a handler prop, carried, an element's spread, a component's spread — × called from a handler; an effect's apply; called in an equation, in content, in a closure given to `map`, by a fn; a `for` of handlers; a view's argument; a context; a fn's result; another module's; where no handler goes eight ways; exports) | 241: 114 refused by both checkers, 127 accepted, each as named (one accepted by the checkers alone: a JavaScript module the runners do not have) |
| both checkers, lowered, projected; the type pass | 241 of 241 alike |
| the 126 accepted with frames: interpreter, oracle, both emitters, served and hydrated in both | 126 of 126 alike |
| census: the scenarios, `bench/run.mjs --check --strict` | nothing newly refused; the three found above are refused again |
| `examples/rx-packages`: `check.mjs`; the originals' tests both ways (`run.mjs`, `SSR=1`) | `check.json` byte for byte; every file's numbers as before the rewrite |
| `examples/rx-ui-sdk`: build, `check/run.mjs`, `app/test.mjs` | builds; check identical; 44 tests, original 44, rewrite 44, the `.rx` app served and hydrated ok (the suite's harness imports esbuild, which the tree does not install: run with the copy an earlier setup had) |
| `examples/rx-std` | 13 of 13 build |

### Step 5: W4 — the census, and children nobody declares

*The census first*, as the roadmap asked (the reference checker instrumented for the run, not committed; 1,241
programs: every scenario program, variant and accepted variant, every `.rx` of the benchmark, the 65 packages, rx-std,
the UI SDK and the examples):

| what | in accepted programs | of which |
| --- | --- | --- |
| markup given to a prop the receiver does not declare as a view | 432 to a prop declared `View`; 17 to a typed one (the type pass's); **26** to one that says nothing | all 26 content between the tags: 3 to `children: any` (S-context-2), 23 to a component whose props type is not read or not written; no `view` block, no view value |
| a function read from a prop or a context of a type that says nothing, called in reactive scope | **28** (24 more typed) | all methods of a value: `props.items.toSorted`, `c.picked.includes`, `props.value` of a controlled prop, `props.table.getPageCount` |

*Decided.* (1) The giver's check, as the roadmap wrote it, would refuse the 26 — nearly every one correct
(`<Panel>…</Panel>` to a component that shows `props.children` and declares no type): not taken. (2) The call rule
would refuse 28 correct calls: not near zero, so left and listed, as the roadmap said. (3) What is taken is the
receiver's side, for children only: where the module's own text says nothing of them — no props type, props `any` or
`unknown`, `children: any` or `unknown` — children are what a caller writes between the tags, `children?: View`, in the
one classification every runner and both checkers share (`viewsOf`/`views_of`). That refuses only a use as a value
(`str(props.children)`, `c = props.children` then a value, a fn given them, a comparison), and it **fixed a fault of
the runners found by this step's set**: `{if props.children { … {props.children} … }}` of markup, in a component that
declares no type, failed to hydrate on c8ed3aa6 (the children were read twice as values); as a view it is served and
hydrated alike. A spread of the whole props (`<input {...props} />`, six of the packages' parts) does not give
undeclared children on. A type the checkers do not read (an alias imported from JavaScript) is left as it was: the UI
SDK hands such children, possibly a function of its state, to its own JavaScript (`viewOf(props.children, now)`) —
reading them as a view there refused correct code, found by the census and so not taken.

*Open, and said* (spec 03 RG-4c): a prop other than `children` typed `any` that is given a view; children of a type
not read; the 28 calls (a prop or context typed `any` holding io and called by a reader, proposals/31's last two).

| | |
| --- | --- |
| programs (`mk5.py`: 6 ways to say nothing — none, `any`, `unknown`, optional `any`, props `any`, an alias — × 9 uses — shown, twice, asked and shown, given on; `str`, a name then a value, a fn, a comparison, a template — × 3 callers and in a module of its own; declared twins) | 202: 111 refused by both checkers, 91 accepted (12 of them the type pass refuses: `unknown` shown is no `Element`), each as named |
| both checkers, lowered, projected | 202 of 202 alike |
| the 79 with frames: interpreter, oracle, both emitters, served and hydrated in both | 79 of 79 alike (5 failed to hydrate before the runners read such children as a view) |
| census of newly refused: scenarios, `bench/run.mjs --check --strict`, rx-packages (`check.mjs`, build), rx-std (build), the UI SDK (build, check) | none; the packages' `check.json` byte for byte (the alias reading, dropped, had caught 3 more of its planted mistakes) |
| the runners on the packages' own tests, both ways; rx-std's tests; the UI SDK's suite | as before (rx-std's measured with and without this step: identical); UI SDK 44 of 44 |
| rule 28's 170 (`mkg.py`) | as at step 2 |

### Step 6: L8 — locals in fns (E-9's first reading)

*Taken*: proposals/21's prototype (`proto-locals` a1c93632, E-9b), brought onto this tree (it was made before the
generic, optional, W2 and B3 work: 26 conflicting hunks, each merged by hand — the walker that names namespaces and the
one that finds fns, `named` beside `tparams`, the optional `ref` parameters' `??=` before a lifted body, `apart` in
`latest`/`pending?` beside the asked question in `if`). A fn with no `ref` parameter whose body only names values is
lifted: its names in any order, each evaluated when read, once for a call and the observer that reads it; no node.

*Decided, 21's questions.* (1) E-9 is meant. (2) `x = area(peek a, 2)` is `SNAPSHOT_KEPT`, and the message says *a lifted
call*, in both checkers. (3) A type declared beside the names (or alone) is no node either — E-9 names a source, an
effect, a region — so it is lifted too (bug 22's second program: accepted). (4) What a fn answers to JavaScript is its
row's, never the body's form: over every package of the tree, one exported row changed (`keyboard`'s `createKeyHold`,
which named one local, lost `instantiates`, so TSX callers would have been handed a value where the original hands an
accessor). It now declares `ref key`, which is the original's contract (an accessor back; a string or an accessor in),
and `ref/units.ts` fails if that row's kind changes. A one-line fn and the same fn with a local now answer alike, which
is what "never the body's form" asks.

| | |
| --- | --- |
| S-locals-1 (34 bodies), both units | all runners, served and hydrated (quick) |
| 21's rewriting test (`rewrite6.py`: the body of every one-line fn of every scenario named — read once, so it stands in place; and read three times, so the runtime's `names` shares it — 141 fns in 28 scenarios) | every frame held in the interpreter, the oracle and both emitters, both ways; three failures are the rewriter's own (a `.d.rx` row, two lines that are no fn); one is the oracle's alone and older: a promise compared with `==` (`fetch(x) == fetch(x)`, the one-line form too), for the runner track |
| census | nothing newly refused: scenarios, `bench/run.mjs --check --strict`, rx-packages (check.json byte for byte, tests both ways as before), rx-std (13 build; tests identical), UI SDK (check identical, 44 of 44) |
| rows printed for JavaScript, every package | one changed, `createKeyHold`, fixed by its row |

### Step 7: L1 — a re-export, stage 1 (sources)

*Taken* (09 MO-6e, both parsers, both loaders, the grammar): `export { Root, Item as SelectItem } from "./root.rx"`. A
re-exported name is the declaring module's: each loader, when a module's imports are loaded, sends an import of such a
name to the module that declares it (through a chain of re-exports), as a namespace import is expanded at load — so a
context keeps its identity, and no checker or runner sees the entry in between. *Decided:* the names a module re-exports
are its imports too (TypeScript's `export … from` binds none; here the module may use them, which is harmless and one
rule less); only an `.rx` module is re-exported; a cycle is `MODULE_CYCLE`.

*Found on the way, older, fixed:* two imports under one name were both taken, the second silently
(`import { A } from "./x.rx"; import { B as A } from "./y.rx"`): `DUPLICATE_DECLARATION` now, in both checkers. And the
type reader of both loaders looped on an import cycle that names one name (it followed the import without marking it):
it stops there.

*Left for stage 2* (said in MO-6e): a package's entry — its printed signature (the context's origin must be carried, or
an importer reading `index.d.rx` would make a second context), the ES re-export `rx-lib` writes, the `.d.ts` re-export.

| | |
| --- | --- |
| programs (`mk7.py`: a kit behind one entry named four ways — by name, by namespace, both, partly from the declaring module —; a chain; aliases; a context provided through one name and read through another; a type; a module using what it re-exports; a source and an action; six mistakes) | 18: 6 refused by both checkers, 12 accepted, each as named; both checkers, lowered, projected, the type pass alike |
| the 12 with frames, served and hydrated in both | 12 of 12 alike |
| S-module-50 | every runner, served and hydrated, the type pass, crate parity |
| census | nothing newly refused: scenarios, `bench/run.mjs --check --strict`, rx-packages (check.json byte for byte, every package builds), rx-std 13 of 13, UI SDK (build, check identical) |
| grammar | 100 corpus tests; 1,023 of 1,023 files of the repository |

### Step 7, stage 2: a package's entry that re-exports (09 MO-6f)

*Taken.* Before it, a kit entry built by `rx-lib` shipped an empty `.d.rx` and JavaScript that exported nothing: an app
could not use it. Now (both checkers print and read it, both loaders follow it, both emitters and both projections write
it, `rx-lib` ships it):

- the printed signature says where each re-exported name is declared, `export { ThemeProvider as Root, theme } from
  "../theme.rx"`, by the path the module wrote. *Decided:* a pointer, not a copy of the declaring module's rows. A copied
  row would need its origin carried for a context to stay one context (the roadmap's "rows with their origin"); the
  pointer is that origin, and the importer reads the declaring module's own rows — which `rx-lib` ships beside it
  anyway, since it ships every module an entry reaches at its own path. One less form to keep in two printers.
- an importer of a module known by its signature (a package's entry, or a module with no body, MO-9) is sent, name by
  name, to the module that declares it, through any chain, as stage 1 does for a program's own modules; a missing
  declaring signature is `MODULE_NOT_FOUND`, a chain that comes back `MODULE_CYCLE`.
- *Decided:* the code still reaches each name through the module the importer named (`through` on the import), not
  through the declaring module's own path: a module an entry reaches need not be an entry, so only the entry is in the
  package's `exports`, and only the bundler's resolution of that specifier picks the side's build (`browser`, `node`).
  Each compiled module hands on what it re-exports, from the one instance of the declaring module the app has (MO-13c),
  so a context and the state behind a name are one wherever they are reached from.
- `x.js` exports the values (a context and a type stay `.rx`'s, MO-13f), `x.d.ts` and the projection re-export each.

| | |
| --- | --- |
| bench `rx-package`, a kit entry added (`kit/index.rx`: a provider under another name, the context, a type, a part of the package's first entry, a part beside it in `kit/`) | its .d.rx printed by both checkers; the .rx app against the shipped `.d.rx` and against the source, the same verdicts (the good app and 13 mistakes, 2 new: the kit's part outside its root, the kit's context provided beside its reader); served and hydrated: one context provided by the kit's name and read by the package's badge, and the other way; the `.tsx` app type-checked by tsrs against the `.d.ts` (a probe more), in the browser and on the server. 8→10 types, 45→48 runtime, 11→13 bad, all green |
| units, both checkers (`a_kit_known_by_its_signatures_…`) | the import sent to the declaring module with its `through`, identity across names, `MODULE_CYCLE`, `MODULE_NOT_FOUND`, the row read back as printed |
| grammar | the row in a printed `.d.rx`; 101 corpus tests, 1,023 of 1,023 files |
| census | nothing is refused that was accepted: the new diagnostics arise only from a `.d.rx` that has the new row, which no file had (it was "not an export" before) |

### Step 8: L2 + B4 — a view with a parameter given on is the view block it stands for; L7

*Taken* (spec 03 RG-4c; both loaders, so every runner and both checkers read the result): at a component's
application, `renderItem={use item}` (a context of the module that holds a view with a parameter), `row={props.row}` (a
required view with a parameter of the enclosing component) and `{...props}` (each such view its props type declares
required, and the rest of the spread without them, Solid's `omit`) are read when the module is loaded as
`{view renderItem (view$) { <use.item {...view$} /> }}` and so on. Neither side's types are needed: a context that holds
a view is the module's own, and a props type is in its component's text; what the receiving prop is, is held by the rules
that exist, on the block. *Decided:* an optional view is left as written — given on, a block would be "given" where
nothing was — and refused as before; the second, misleading line of that refusal (`<Mid> declares no render prop row`,
when it declares one) is left out where the props type declares the view, in both checkers. The generated block has no
place in the text (as the parser's own made items, CP-8) and is read at its element's line.

*L7, taken:* a call of a JavaScript fn whose declaration says it answers `View` is no text for the content model (as a
JavaScript component in the same place is not); a result not said, or a value's, is still `CONTENT_MODEL`; a generated
draft's result is no claim and stays so.

| | |
| --- | --- |
| programs (`mk8.py`: three forms — a context's view as an argument, a prop as an argument, the props spread — × four receivers — shown with arguments, with a spread, asked then shown, shown twice — × one module or two, each beside its long form; optional views through an argument and a spread; an optional receiver; values and views given on as before) | 56: 4 refused (the optional ones), 52 accepted, each as named; both checkers, lowered, projected, the type pass alike |
| the short form against its long form | 25 pairs, the same frames in the interpreter, the oracle and both emitters |
| the 52 with frames, served and hydrated in both | 52 of 52 alike |
| the presence set (1,642, `w/p6f`), since "was it given" is the risk | 1,642 of 1,642 alike, as before |
| S-module-48 (`renderItem={use item}` moved from refused to a variant with its frame), S-server-6 (L7: a declared `View` accepted, an `any` refused) | every runner, served and hydrated, the type pass, crate parity |
| census | nothing newly refused (it only accepts more): scenarios, `bench/run.mjs --check --strict`, rx-packages (check.json, builds; its B4 repro `view-spread.rx` is accepted), rx-std, UI SDK |

### Step 8b: an action that waits only in a loop was taken for one that settles as it returns (found reading for step 9)

*Fixed, both checkers* (`actionWaits`, `action_waits`): whether an action's change can outlast its call (AC-1h's
"held") looked into a branch and a `try` but not into a `for` body. An action whose only `await` is in a loop
(`for (const id of ids) { let r = await …; … }`) was taken as one that never waits, and a handler beside it that writes
`seq := seq + 1` and calls it was accepted: the next click reads the committed `seq` and mints the same id again
(accepted and wrong, silent). The spec already said "a write that some path of the body carries to an `await`"; the
checkers did not follow it. AC-1d, AC-1e and AC-1g follow awaits into a loop already (probed). S-infer-8 has the case as
a rejected variant. Census, every program's diagnostics before and after (`census9.ts`: every scenario program and
accepted variant, bench, rx-packages, rx-std, the UI SDK, std, the examples and eval's 340 .rx files, 1,593 programs): none
differs; the only newly refused program is the new variant. Not a Solid matter.

### Step 9: B10 — an action that answers at the call (built as a prototype on `proto-b10`; merged onto PR #1 on 2026-11-27, below)

*The test the roadmap set:* can the difference from Solid's `action()` be said in two sentences? Yes: *an action that
never waits gives `action()` nothing to hold — AC-1 already calls such a body an ordinary instant, AC-1g has no answer
to guard and AC-1h no held write of its own. So the only thing lost is the promise, and with it a caller's way to wait
for a change that has already settled when the call returns.* So the form was built (06 AC-1i): `action show(t:
string): number { … return id }` answers that value at the call (a `.tsx` caller gets a number); an `await`,
`refresh`, `affects`, a guess or an inline `action { … }` in its own statements is `ACTION_ANSWER_HELD`; its body is
checked as a handler's run (AC-1h's run form applies: a counter it writes before calling an action that waits is
`STALE_NEXT_READ`); it is still an action (refused while a view computes; R-f-6, no failure out). Lowered to a plain
function (`__rt.now`) in both emitters; the interpreter runs it as a handler's body and answers its result; the oracle
drives its body to the end at once; both projections type it `function f(…): T`. Not shaped by any Solid bug: it is
Solid's documented `action()` that is left out, because there is nothing for it to do.

| | |
| --- | --- |
| programs (`mk9.py`: the answer in a handler, twice; one that answers calls another; a branch, a loop, an early return; a type alias as the result; `: void`; a counter beside it, not held; one inside a waiting action; from another module; the seven held words, in a branch and a loop too; called while a view computes, twice; a stale counter before a waiting action it calls; a failure let out; three type mistakes) | 23: 11 refused by both checkers, 3 refused by the type pass, 9 accepted, each as named; both checkers, lowered, projected alike |
| the 9 with frames, the interpreter, the oracle, both emitters | alike; served and hydrated in both servers, 9 of 9 |
| quick on the branch | 21 of 21 |

*Left, for the user, then:* whether to merge it (the brief: a prototype only); the user merged it (below). Known edges: R-f-6's message says "a handler
cannot (it does not await the action)", which reads oddly for one that answers at once; the printed `.d.rx` row is still
`export action show` (the type is the projection's, which is what a `.tsx` caller and an `.rx` importer's type pass
read); `@reactivescript/runtime` gains `now`, so a package using the form needs the runtime of its version (MO-13i).

### Step 9, merged onto PR #1 (2026-11-27, the user's decision)

`proto-b10` (eb5b910d) merged onto 15db0404: no textual conflict. The nine commits since its base touched none of B10's
lines but DECISION's. `tooling/tree-sitter-rx/src/{parser.c,grammar.json,node-types.json}` (the 224k-line part of
the diff) were regenerated from the merged `grammar.js` with tree-sitter-cli 0.27.2: byte for byte B10's;
`tree-sitter test` 101 of 101. `runtime/dist` and the WebAssembly builds were rebuilt, not merged.

*Re-checked under the rules that landed after its base.* 47 programs more (`rx-pin.noindex/b10/sets/mk10.py`,
outside the tree, with `ck.py`, `pairs.py` and `fill.py` beside it). Each interaction is written twice, through an
action that answers and with the same statements in the handler. Every runner must show the pair alike.

| rule | what was probed | found |
| --- | --- | --- |
| SC-4c, `ref`s of one pass | an action that answers called in a `ref`: one element, two of one pass, the rows of a `for` with a functional count | each pair alike in the four runners; served (a server calls no `ref`, SV-2) and hydrated alike, both servers. Nothing here depends on SC-4c's wording: a `ref` runs the action's statements as it runs its own, whatever a `ref` reads |
| H-4 as F-3 | S-hold-7's shape (a write beside a shown error fallback), its `catch`-answer variant, reading a `catch` answer, reading an errored equation in a `try` | pairs alike, served and hydrated alike |
| an `await … catch` settled where it is awaited | the same programs (the form's own body may not `await`) | nothing to settle in the body; a reader of a `catch` answer holds the change the action writes, as the handler's |
| the pin's store engine (`$PROXY`/`$RECORD`) | the answer is a store's whole value, one of its rows, a path write's old value, a keyed list (`key id`, ST-4a) the handler writes back | pairs alike in every runner and both servers |
| called while computing (the outside review's finding on 15db0404) | the answer in an equation, content, an attribute, an `if`, a `for` row and collection, an effect's input, `pre`, `peek`, `latest`, a source's initializer and question, a template, a record, a fn, a prop, a key; and the review's indirections | every direct position refused, both checkers alike. The review's indirections (ternary, `??`, `.at`, a fn that answers the action) are accepted for a plain action too: B10 adds no shape. What it changes is the outcome: such a call of a plain action launches it, while one that answers writes at once and Solid throws `REACTIVE_WRITE_IN_OWNED_SCOPE`. The review's fixer has the class |
| `ACTION_ANSWER_HELD`'s list | an `await` or `refresh` in a local closure the body calls, nested, in a `try`; a closure that is an action of its own; one made and not called; `await` in a `return` and a write; an inline `action { … }` with and without an `await` | **two changes**, below |
| AC-1h beside the form | a counter in a handler beside an action that answers and launches one that waits; the same with a plain action; an inline action that waits, in a handler and in the form's body | **a gap**, below |

What changed, in both checkers (`same` alike on every program here and below):

- **A local closure the body calls by name is its own statements** (AC-1b reads them so): `let w = () => { let r =
  await … }; w()` in an action that answers waited in no runner and answered at once, while the same handler is an
  action that holds. It is `ACTION_ANSWER_HELD` now (`held_word`/`heldWord` follow the closures `inferred_action` follows).
  The list is otherwise as built: `await`, `refresh`, `affects`, a guess, each of which holds an action's change.
- **An inline `action { … }` is no longer refused.** It is its own run (AC-1b), launched as a call of a declared action
  is: with no `await` it is an ordinary instant, and with one it is what a call of a waiting action is, which the form
  allowed. The prototype's refusal refused correct code (mk9's `no-held-inline`, now accepted, alike in every runner).
- **An action outlasts its call when its own statements launch one that does** (AC-1h). That is a call by name of an
  action known to outlast, a local closure that is an action of its own and waits, or an inline action that waits;
  `action_joins`/`actionJoins` compute it to a fixed point over a block's actions. The form had been declared never to
  outlast (`outlasts = ret.is_none() && …`), so `let n = seq + 1; seq := n; note(n)`, with `note` answering and
  launching `save`, held `seq` in every runner and minted one id twice, unrefused. A plain action that only launches
  `save` was missed the same way before B10, and so was a handler's inline action that waits. All three are
  `STALE_NEXT_READ` now (S-answer-1, S-infer-8). An action of another module counts only as what is known: its signature
  says nothing of its body (MO-3). A first version counted it as outlasting and refused a correct `action go(n) { log(n) }`
  over an imported `log` that never waits. Caught by the census probes (`b10/sets/pi`) before any census, and changed.

Programs: mk9's 23 again (11 refused, 3 refused by the type pass, 9 accepted as before, and `no-held-inline` accepted on
purpose); mk10's 47 (11 refused, as named; 36 accepted, alike in the four runners, 11 pairs alike); 33 of them filled,
served and hydrated in both servers, 33 of 33 (the four `effect` programs filled with their chained instant, the
inline write's the same). `scenarios/S-answer-1` (new) holds the form, its refusals and an accepted inline action.

*Not B10's, found by its probes, recorded and not changed:*

- **X15: a run that reads an equation whose question has not answered yet.** The interpreter drops the whole run (`n
  := 1; got := A + "!"` writes neither), while the oracle and both emitters write Solid's `NotReadyError` sentinel
  through (`#pending!`). Handler and action that answers alike (`b10/sets/pend`). It needs a ruling on what a run reads
  of a question never answered; until then the runners differ there.
  *(Ruled and fixed the same day, 04 R-8a: "Outside review of 15db0404", below.)*
- **A counter beside a direct call of an imported action is `STALE_NEXT_READ` whether or not it waits** (15db0404 and
  now, `b10/sets/pi`): an `.rx` import's signature does not say whether an action outlasts its call. It now reaches an
  imported action that answers too. That refuses correct code; the fix is a word in the module signature (printed in
  `.d.rx`, so `DECLARATION_VERSION`). Left for the user.
- **A counter inside a declared action that launches a waiting one is not checked** (the walker reads a declared
  action's own `await`s only; its writes join the launched change, D-7). The form's body is a run and is checked.
  *(Checked now, `STALE_NEXT_READ`: the same section below.)*

*Census* (before = 15db0404, `rx-pin.noindex/head/rs`, built on the same pin; after = this tree):

| census | result |
| --- | --- |
| scenarios (`scripts/matrix.mjs scenarios`, both revisions: interpreter, oracle, both emitters, both checkers, lowered, projected, the type pass) | 0 agree in both and show something else. Moved: `S-answer-1` (new: on 15db0404 a parse error) and `S-infer-8`'s two new rejected variants (accepted on 15db0404) |
| the review sets, as "Review sets on 3395c64e" ran them (`b10/rsets`: `run.mjs`, `merge.mjs`, `table.mjs`, the sets read from `rx-t3.noindex/sets`): 72 folders, 18,798 programs, before and after; filled sets served and hydrated after | **nothing moved**: "moved: none" and "output changed: 0" in all 72, and every column (verdicts, `same`, `lower`, served) as the pin's census |
| `proposals/check.mjs` | 190 verdicts over 78 documents, all as stated |
| `examples/rx-packages`: `build.mjs`, `check.mjs` | 65 built; `check.json` unchanged byte for byte |
| `examples/rx-std`: `build.mjs`, `run.sh` | `summary.mjs` byte for byte as the ecosystem step's run |
| `examples/rx-ui-sdk`: `build.mjs`, `check/run.mjs`, `app/test.mjs` | builds; both columns as the ecosystem census; 44 of 44, original and rewrite |
| `std/test/browser.mjs` | 39 of 39 |
| bench `--check --strict`, the full `scripts/ci` uncached with the Vite plugin fork | bench as the scorecard: good 44 of 44, types 188 of 188, runtime 282 of 282, bad caught 249 of 249, unrepresentable 13 of 13. ci: 47 of 47 passed, nothing kept from before (1,007 s). Scenarios 245 of 245 in the oracle, compiled and served runners, 0 skipped; `t-vite-hosts` ran all six comparisons, npm's plugin's included; `t-vite-watch` and `t-vite` ran |

The only new acceptances are B10's form (and an inline action inside it); the new refusals are the closure case of
`ACTION_ANSWER_HELD` and the three `STALE_NEXT_READ` shapes above. None of those shapes occurs in any census program.
No Solid bug shaped any of it, and none was found.

### Read again under the user's rule of 2026-11-26: no rule bent around a Solid bug

The rule: a Solid bug is never a reason to refuse correct code or to shape a language rule; it is recorded as a DV
with a memo. Steps 1 to 7 were read again against it and against the drafts of plain-Solid bugs
(`solid-main.noindex/drafts/SUMMARY.md`): none of their rules was shaped by one, and none was changed. Step by step:
1, the five defects are the language's or our tools' own; 2, W-6's functional write is the language's (Solid's setter
does the same, by design); 3, R-io-3 is the language's — Solid's development build stopping on
`ACTION_CALLED_IN_OWNED_SCOPE` is a check of its own, not a bug, and only showed the hole; 4, B3 ends where a handler goes
because of SC-3 and of JavaScript that may call while it computes; 5, the hydration failure W4's set found (undeclared
children read twice as values) is Solid's documented behaviour of children, not one of the drafts' bugs, and the rule is
"a view is only shown", the language's; 6 and 7 touch nothing of Solid's. X6 (`REF_READS_REF_WRITE`, the rc.22 ref
regression) is track 3's to judge, and is not touched here.

## Roadmap, track 2: every runner agrees (2026-11-26)

The second track of `ROADMAP-fable.md` (X1, W5, W3 + X6, X2, X7), beside track 1 on the same PR. The sets and logs are
outside the tree (`/Users/thomas/dev/rx-t2.noindex/sets`, `logs`; generators in `gen/`).

### a. X1: a kept keyed row is remade (decided: the interpreter is right)

The third review's three s1 programs reduce to one line of Solid: `reconcile(v, key)` keeps a surviving row's proxy only
where something below the row was read under tracking (`store/reconcile.ts` `descend`, §6d; the same in
`@solidjs/signals` 2.0.4, run). A row whose body reads nothing of the row (`for r in p.rows { <Made /> }`, a view given by
the caller and shown in each row) got a new proxy, and `<For>` made it again: its state was lost, silently in
production. No context and no prop are needed (`for r in rows { <Made v="x" /> }` alone); the prop is only where it is
met. Bug page: `proposals/bugs/45`.

**Which side the spec takes.** ST-4a: a row whose key is kept keeps its identity and its region, wherever the new list
puts it. Nothing in ST-4a or RG-2a makes this depend on what the row reads, and a rule that did could not be written: a
row that reads nothing today reads a field after an edit, and its state would start to survive. So the interpreter is
right, and the runtime follows it: `ref/compile/keyed.ts` reconciles each surviving row into its own proxy first, then
the list (used by `rt-web.ts`, `rt.ts`, and the oracle). Rejected: (a) emitting `<For keyed={r => r.id}>` — the emitters
do not know the key of a list that comes through a prop, and the row would become an accessor; (b) reading every row
under tracking to give it a node — a node for each row, kept for the row's life, for nothing it shows; (c) a checker
refusal — the programs are ordinary.

Two more things the same programs showed, decided the same way:

- **An updater's fresh rows** (`rows := rs => [{ id: "b", … }, …]`) were adopted whole by Solid's setter (every row
  made again, also where the row is read); the interpreter reconciles them by the key (W-6: a functional write applies
  to the slot, and ST-4a reconciles what is written). Now both runtimes and the oracle reconcile what an updater answers
  by the key.
- **A list inside a row** (`groups key id`, `g.items`): ST-4a says "the key applies at any depth, as Solid's"; the
  interpreter paired an inner list's rows by position. It now reconciles them by the key, and a row with no key by its
  position, as Solid does.

The oracle did not reconcile a keyed source by its key at all (it replaced by position): that was most of W5's "48 in
the oracle alone" of the s1 set, which now reads 149 of 149 with nothing else changed.

**Programs whose output changed.** The review's sets (a505, a1642, p1, p2, p3, v1, m1, t1, e1, y1, k1, x1–x3: 4,231)
and this step's 139 (`gen/mkx1.py`: five places of the loop × four bodies × seven writes, a view shown in each row three
ways, the key at depth), through interpreter, oracle, both emitters, on c8ed3aa6 and after: 140 went from differ to
agree; **no program that agreed shows anything else**; 66 differ as before, all the interpreter alone (36 a pending
attribute it does not wait for, 30 the quotes of an error's text: X7, step e). The s1 set, with both servers: 149 of
149 (the ten that differed on the server are portals, which PT-3 does not serve: `scripts/matrix.mjs` now compares the
served frame with the mount's frame before its portal).

**Proof.** `scenarios/S-store-kept-row.md` (four runners); `compiler/test/rows.mjs`, in CI (a row's own count kept,
direct, through a prop, and read; rendered and hydrated; development and production: 12 of 12 fail on the old runtime);
bench `keyed-edits` and S-check-3 as before.

### b. W5: the oracle and an applied view's rows (closed by a)

"The oracle remakes a kept row of a keyed loop for any applied view" (proposals/27, and the s1 set's 48) was not about
applied views: the oracle wrote a keyed source by position (`setStore(() => v)`, no key), so a swap, a drop, an
addition or a path write next to a fresh list made rows again wherever a fresh list came after; the view in the row
only made it visible (its `Made` logs). With a's keyed write in the oracle, 48 programs (`gen/mkw5.py`: a keyed, a
plain, a derived keyed and a selected list × four writes then a fresh list × a view applied through a prop, through a
context, and one that reads nothing): 24 differed in the oracle alone before, 48 agree after. The s1 set reads 149 of
149 and the 505 of proposals/27 has no row in the oracle alone (its 334 accepted agree in four runners). Nothing of
the oracle's lowering of an applied view changed.

### c. W3 and X6: served then hydrated (diagnosed; one fixed by record, two left with a ruling)

Each of the third review's three programs was reduced, and the reduced shape run on Solid alone, at the pin and on
2.0.4 (`npm pack`, outside the tree).

- **`p3-err-aw-ifinner-app`: Solid's (DV-26).** A read that fails after the shell, inside a `loading` of a part, caught
  by an `errored` above the part. Sixteen reductions (`if` or not, through `TC` or not, an outer `loading` or not, a
  failure or an answer): every one with the `loading` inside an element of a part streams an empty fragment marked
  failed; the client then draws `bad`. In plain Solid, `ref/oracle/repros/w3-error-through-a-part.mjs`: `direct`
  (DV-9's shape) streams the fallback, `part` and `prop` stream nothing; the same on 2.0.4. Recorded as a `server`
  divergence in `scenarios/S-server-7.md` and spec 10 DV-26; nothing refused (the program is ordinary).
- **`v1-aw-loop-app`, `-part`: ours, small, not fixed.** After the takeover a row made by a handler asks `fetch("k")`,
  which the server already answered for the first row. In one runtime that is one question while it stands (SF-2b), so
  the interpreter and a browser alone show `t1v2v` at once; the hydrated client has the first row's answer from the
  stream but not in its own table of questions, so it asks again and shows the row waiting (`t1v`, and `t1vw` where the
  row has its own boundary) until that answer lands, which the scenario's table never does. Ruled: SV-3b stands ("every
  question the server answered is answered on the client with the server's answer; it is not asked again"), so this is
  the runtime's to fix: the server would send its answers by question with the stream, and the client would seed its
  table with them, held by the hydrating node that traced each. Not done in this step: what reaches a user is one
  request more after hydration (only for a server fn in reactive scope, the one real question that is shared; a JS
  import is called as it is written) and a frame that waits for it; frames agree once it lands.
- **X6 (two `ref`s): decided, refused; not yet built.** Measured (`compiled`, `ssr` CSR and hydrated, dev and prod):
  sibling elements read the value before, rendered and hydrated; a `ref` in a `for` row reads the write rendered and the
  value before hydrated; one in an `if` reads the write in both; the interpreter reads the write in all. The roadmap's
  ruling ("hydration matches the browser") has no browser to match: Solid shows no write before its flush, and a
  `flush()` after a `ref`'s write (tried) fixes the siblings but rebuilds an `if`'s region while hydrating and leaves
  the row as it was. No ruling the runners can all follow exists without changing when Solid calls a `ref`, so the
  reading is to be refused: a plain read, in a `ref`, of a source that another `ref` writes (a functional write,
  `n := v => v + 1`, composes in any order and stays accepted). Spec 07 now says what was measured (its sentence said
  the rendering browser reads the write, which is wrong for siblings). The refusal needs both checkers; it is the next
  thing after d and e.

### d. X2: every live step of the rewritten packages that differs, attributed

`examples/rx-packages/live.mjs` over the 27 cases, both ways, rendered and served then hydrated. Before: 90 and 74 of
130 alike, with no cause written. Each differing step was read (`V=1 ALL=1 FULL=1`; `SELF=1` compares a side with
itself hydrated, `DUMP=n` prints both pages, `WHY=1` a diagnostic's text; a line that is in both but more often in one
is now shown), and its cause is in `causes.json`, merged into `live.json` per step (`differ`); a step that differs with
no cause makes `live.mjs` exit 1.

**After: 115 and 99 of 130.** Of the 15 rendered steps that differ: the original 5, a step that follows from the
original's 2, the rewrite (left) 7, the harness 1. Of the 31 hydrated: the original 22, following 2, the rewrite (left)
7. **The language: none.** So nothing goes ahead of track 1 from this step.

The rewrite's own mistakes, fixed in the packages (each case then alike in both columns):

- Kobalte ToggleGroup (0 → 5 of 5): an item's value was written as `data-value` (the original keeps it off the page; now a
  symbol on the element, `mark`), and a disabled item had a `tabindex`.
- Kobalte Popover (1 → 5): the positioner's CSS variables (`--kb-popper-*`, `min-width: max-content`, the content's
  `z-index`), the content's `--kb-popover-content-transform-origin`, `data-expanded` on its title and close button, and
  the focus: Kobalte traps, gives and returns it only for a modal layer, and its trigger cancels `pointerdown` so it is
  not focused by a click.
- Kobalte Select (1 → 6): `data-pointer-type`, the content's style variables, the listbox's `tabindex` while nothing is
  focused, `aria-disabled="false"`, `data-highlighted` on an item's label and indicator.
- Kobalte Tooltip (3 → 7): the style variables, and the warm-up shared by all tooltips (a tooltip shows at once while one
  is open and for `skipDelayDuration` after one closed): the rewrite had left it out, and the step after Escape shows it.
- Icons: the `circle-check` shape of 1.80.0 and its alias class `lucide-check-circle-2` (what is left is the original's).
- UI SDK Accordion (4 → 5): a part's binding to its element lived as long as the part's component, so core kept
  `aria-controls` on a closed trigger; it is now made in the shown region and ends with the element.
- UI SDK Tooltip (0 → 6): its content was always portaled; the original renders it in place, and portals only into a
  `container` given (now taken).

The original's (written per step in `causes.json`): Kobalte Dialog does not close on Escape on Solid 2.0.3 (and the two
steps after follow); @lucide/solid writes React's `key` as an attribute; both RadioGroups, hydrated, keep ids from their
server render that their own rendered page does not have; solid-slider's dots do not follow an added slide, and it fails
to hydrate; cmdk-solid and Kobalte's layered parts cannot be served ("Client-only API called on the server side"), so
their hydrated column compares a served rewrite with a browser render. The harness: a slider transform read mid-way
through its animation.

Left, the rewrite's, with why: terracotta Listbox keeps `tc-has-active` after closing in the original only because its
blur listener goes with the option's owner before the focus moves (copying it needs the closing known inside a nested
blur run); UI SDK Listbox has no form inputs, and its bridge reads core's presence before its effect has given core a
controlled value (the original tracks what core delivered, `use-primitive`'s `marks`) — a bridge redesign.

The originals' tests on the edited packages: Kobalte's as before (icons and the UI SDK have none); `check.mjs` 292 / 219
/ 35 caught, 3 / 25 / 5 correct refused, unchanged (`check.json` identical). Not rerun: `size.mjs` (the gzip column; the
fixes add a few hundred bytes), the primitives' tests (untouched).

Found on the way, not a step: the rewritten cmdk, hydrated, makes Solid's development build report
`STRICT_READ_UNTRACKED` ("reactive value read directly in an effect callback"): an effect's apply reads by design, so
this is a read the runtime does not wrap; recorded, not reduced.

### e. X7: the runners that disagree on accepted programs

The 635 and the 3,802 of "What is still different on some runner" run again on this tree (`../w/old`, `../w/opus`;
4,437, the two sets share programs), interpreter, oracle and both emitters: **63 differed**. Then, with the fixes
below, against c8ed3aa6: 14 differ → agree, 2 differ → the same error, none that agreed shows anything else.

Fixed:

- **A pending attribute** (`<b class={await fetch(use c)}>` under a `loading`): the interpreter showed the element at
  once; it now waits as a pending read in content does (its boundary catches it, or it holds). The oracle and both
  emitters already did (the 2 of DECISION, and a third shape).
- **A context's default that names what the module declares after it** (`source d := "x"` below `context c = d`): both
  emitters threw `Cannot access v$d before initialization`; the runtimes made the default's memo when the context was
  declared. Made lazy (Solid's `lazy` memo), as the oracle and the interpreter read it. Accepted and wrong, in
  production too. The type projection had the same order (`__.ctx<T>(d)`, TS2448 "used before its declaration" on
  the same program, so `rx-tsc` refused it): both projections now give the default as a thunk (`__.ctx<T>(() => d)`,
  the prelude's `ctx` takes one); 667 of 667 in the type pass, the crate's projection the reference's on 1,438.
- **An error's text**: the interpreter named a flight `"k"` where the others say `k` (32 "differ" of the review's p3
  and v1 sets, and 2 here, were that alone).
- The oracle's keyed lists (`p0_lst`, `p1_list`, `pr_list-comp`): fixed by a.

Left, and why (the 45 that still differ, by kind):

| kind | programs | whose |
| --- | --- | --- |
| a closure given as content or as `children: any`, shown or called (`<T>{n => 5}</T>` to `children?: View`, `{props.children}` of a function prop): the compiled code throws, the interpreter shows something | q34-*, c34-*, 18 | the checkers: accepted and wrong. It is W4's subject (a view only to a prop declared to take one) and proposals' "closure as children" (34): track 1, step 5 |
| `x = r(…)` where `r` instantiates, through an alias, an argument, a prop, a record, a source | p7_x-*, pa_Cprobe-*, 14 | the interpreter refuses at run time (E-9), the checkers accept: L8 (locals in fns, E-9) is track 1's step 6, which decides this |
| a handler written in the scenario's table that holds `use` or reads `props`, an action named `chained` | am2_hand, p4_clos-handler, p1_register, 6 | the harness |
| a closure given as children and later shown again, with a source in it (`V_mixed`, `V_fn-inst`, …) | V_*, V2_*, 10 | the interpreter re-runs where the others do not; read, not reduced — with the first row, a closure as children |
| the order of two views given on (`vf-alt2`), an inline `ref` the interpreter does not call (`A-ref-inline`), a store path the oracle prints `NaN` (`g-store-path`), a provision the oracle reads outside (`so14`) | 6 | one each, the interpreter or the oracle (test instruments); not reduced |

The p3 set's 36 "unread await" programs (`p3-el-attr-*`) are frames alike in every runner: the compiled code asks a
question nothing shows (an `await` whose answer is only in content that a presence test reads), the interpreter
does not (E-3, demand). The spec's side is the interpreter's; Solid's memo is eager, and making the runtime's memos
lazy is a change of what every component runs first, so it is recorded, not made, here.

## Roadmap, track 3 (2026-11-26: X6 built, then every review set again)

The probes and sets are outside the tree (`/Users/thomas/dev/rx-t3.noindex/probes`, `sets`, `logs`).

### X6: what a `ref` reads of another `ref`'s write — first refused (a006d85a), then withdrawn (below, "X6 again")

*Checked again first.* 43 programs (`probes/mkx6.mjs`, `mkx6b.mjs`) through every runner, served and hydrated, on
19171dc2 and after. What a `ref` reads of a source another `ref` writes in the same pass:

| shape | interpreter | rendered | hydrated |
| --- | --- | --- | --- |
| two siblings, the writer first; a parent writes, a child reads; an action writes; through an equation | the write | before | before |
| a reader in a `for` row (before or after the writer, or inside it); one `ref` counting in each row (`n := n + 1`) | the write | the write | before |
| a reader in an `if` before the writer | the write | before | before |
| a reader first in one template; a reader in an `if` after the writer; both in one `if`; a reader in a `view (…)` block after the writer | alike in all three (the first reads the value before, the others the write) | | |

So track 2's ruling stands: the answer is the order Solid's compiler and its hydration make the pass, and a flush
cannot fix it (track 2, c). *Decided:* the reading is refused in every order, also in the four shapes that agree
today. Why not narrower: a rule that accepts "a reader in an `if` after the writer" or "a reader first in its template"
would be a description of Solid's template splitting and of when an `insert`'s region is made (top-level siblings read
the value before; the same two inside an `if` read the write), which the language does not own and which a change of
Solid's compiler moves; and in those shapes the program reads either the initial value (write it as a constant) or a
write that an equation reads as well. Refusing them is the cost, and the census below found no program that pays it.
*What I would change my mind on:* a correct program of a library that needs to read, in a `ref`, what a parent's `ref`
gave (an anchor element read by a child inside an `if`); then that shape could be ruled with a scenario, once Solid
says the order is its contract.

*The rule* (both checkers, `refReads` / `ref_reads`, alike; S-server-8). For each `ref` given to an element or to a
component written in `.rx` (a JavaScript component's `ref` is its declaration's, SC-4b): what it reads and writes in its
closure's body, in an action it names (`ref={put}`) or calls by name (transitively), and in a closure it gives a method
that calls it at once (CALLS_NOW: `forEach`, `map`, …). A closure it makes for later (a listener, a timer) is not walked;
a name a parameter, a `let` or a `catch` binds is not the source's. A read of an equation is a read of the sources under
it; `peek` reads too; a write by a function of the value reads nothing. Refused: a read of a source another `ref` of the
module writes, or of one the same `ref` writes while it is in a `for` row below the source (one instance a row). The
message names the writer and says what to write (`n := v => …`, or an equation, an effect, a handler).

*Narrowed while building:* a `view (…)` block was first counted as made once per call, like a row; a block shown once
was then refused (correct), and one shown twice with `n := n + 1` agrees in every runner, served and hydrated: taken
out. *Not followed* (said in SC-4c): a `ref` of another module, and a handler prop a `ref` calls (`ref={e =>
props.onEl(e)}`, the caller's closure) — the second is a hole of the same kind as W4's (a function given to what the
checker does not read); written down below as X13.

| census: newly refused | |
| --- | --- |
| the probes (`x6`, `x6b`: 43) | 20 refused that differed (13 between the interpreter and compiled code, 7 between rendered and hydrated), 5 refused that agreed (the four shapes above, and a reader in a view block after the writer); of the 14 that must stay accepted none is refused by SC-4c (two are `UNBOUND` before and after: the probe's own `setTimeout` and `console`); the one already refused stays `STALE_OWN_READ` |
| scenarios: the four runners, served and hydrated in both emitters, crate parity, the type pass (`scripts/quick`) | none |
| `bench/run.mjs --check --strict` | none ("as bench/scorecard.json, or better") |
| `examples/rx-packages`: `build.mjs` 65 of 65, `check.mjs` | `check.json` unchanged byte for byte; `live.mjs` below |
| `examples/rx-std` | 13 of 13 build |
| `examples/rx-ui-sdk` | builds; `check/run.mjs`: the rewrite's column accepts all 8 correct lines and the good program |
| `proposals/check.mjs` | 190 verdicts over 77 documents, all as stated |

Strictness raised; nothing weaker.

*Found on the way: DV-27, Solid's.* `els := [...els, 1]` in a `ref` showed `1` hydrated and `2` rendered. Reduced by kind
(`probes/mkx6c.mjs`): a `ref`'s write of an atomic source is shown when a served page is taken over; a write of a store
(an array or record source, any form: plain, functional, a path) is made — the next change shows it — but its reader is
not run again for it. The same in plain Solid compiled by its own compiler (`ref/oracle/repros/dv27-hydrate`: `1/2/5`
hydrated for a store, a signal holding an array, a number; `2/2/5` rendered). Recorded as a `hydrated` divergence (spec
10 DV-27, S-server-9; `ssr/run.ts` now reads a `hydrated` divergence at the hydration instant too, where it read it only
for later instants). Not refused: the program is ordinary. Not run on 2.0.4.

*SV-3b's re-ask after hydration (track 2, c): left.* The fix is a protocol between the two runtimes, not a local change:
the server would send each answered question with its key in the stream, the client would seed its table of questions
with them, held by the node that traced each while it hydrates, and both emitters would hand the key to the hydrating
node. What reaches a user is one request more, for a server fn in reactive scope only; frames agree once it lands.
Written down as X14.

New roadmap items:

| | what | class |
| --- | --- | --- |
| X12 | DV-27: a store a `ref` writes while hydrating is shown at its next change only (Solid's; a bug page with the TSX twin, and 2.0.4 run) | served ≠ client, Solid's |
| X13 | (withdrawn with the refusal: nothing is left to follow) | — |
| X14 | SV-3b: the client asks again a server fn the server answered, for a row made after hydration (track 2, c) | served ≠ client, ours |

### Review sets on 3395c64e (and the three fixes of the commit that adds this section)

Every set I could find, 72 folders, 18,798 programs (a filled folder repeats programs of its raw one) (copies, chunked, outputs and scripts in
`/Users/thomas/dev/rx-t3.noindex/sets`: `run.mjs`, `merge.mjs`, `table.mjs`, `now.mjs`). Each through
`scripts/matrix.mjs` twice: **before** = c8ed3aa6 (the roadmap's base, `rx-merge.noindex/rs`), **after** = this tree;
the interpreter, the oracle, both emitters, both checkers alike (`same`), both emitters lowered alike (`lower`). Where
every frame of a set is written (the `f` folders, the astra reviews), served and hydrated in both emitters too, on this
tree. Then once more on this tree after the fixes below (`@now`): only the programs they were for moved.

| set (programs) | before | after | both checkers, lowered | served and hydrated, both emitters | moved, and why |
| --- | --- | --- | --- | --- | --- |
| review-astra (18), review-astra2 (35) | 14 / 4 refused; 26 / 9 | the same | all | 14 of 14; 26 of 26 | none |
| opus2 p1 (506), p1f (483) | 483 agree, 23 refused | the same | all | 483 of 483 | none |
| p2 (474), p2f (328) | 389 agree, 68 refused, 17 same error | the same | all | 328 of 328 | none |
| p3 (408), p3f (344) | 344 agree, 64 differ | 372 agree, 36 differ | all | 343 of 344 | 28 differ → agree: an error's text (X7, track 2 e). The 36 left are the "unread await" programs (track 2 e: E-3 demand, recorded). The one served miss is `p3-err-aw-ifinner-app`, DV-26 (Solid's) |
| s1 (149), s1f (146) | 98 agree, 51 differ; 98 / 48 | 149; 146 | all | 146 of 146 | 51 and 48 differ → agree: X1 (track 2 a) |
| e1 (98), e1f (74) | 74 agree, 24 refused | the same | all | 74 of 74 | none |
| v1 (265), v1f (246) | 258 agree, 5 refused, 2 differ | 260 agree, 5 refused | all | 244 of 246 | 2 differ → agree (track 2). The served misses are `v1-aw-loop-app`/`-part`: X14 |
| m1 (168), m1f (113) | 112 agree, 56 refused | the same | all | 112 of 112 accepted | none |
| t1 (96), t1f (42) | 70 agree, 14 refused, 12 stopped | the same | all | 42 of 42 | none (the 12 stopped are the review's own frames) |
| y1 (26), k1 (15), k1f (3) | 23 / 3; 11 / 4; 3 | the same | all | 3 of 3 | none |
| o1 (167), o1f (129), o2 (13), o3 (8) | 149 / 8 / 5 same error / 5 stopped; 107 + 22 stopped; 7 / 6; 5 / 3 | the same | all but the 22 `o1f` programs whose frames have a `\|` (the harness stops on them) | 107 of 107 readable | none |
| 505 (`a505`), its 333 filled (`w/c6f`) | 334 agree, 169 refused, 1 differ, 1 stopped | 335 agree, 169 refused, 1 stopped | all | 319 of 333 | 1 differ → agree (the oracle's keyed rows, track 2 b). Served: 14 portal programs missed, and both reasons written here on 2026-11-26 were wrong (corrected 2026-11-27, "Outside review of 15db0404", *The added scope*): they are faults of `ref/ssr/run.ts`, not of the tables and not X14 — the expected shell was cut from the client's mount frame, which is not the server's where what is under the portal reaches a boundary outside it (12), and a question the browser is the first to ask was counted as asked again (2) |
| 1,642 (`a1642`), filled (`w/p6f`) | 1,642 agree | the same | all | 1,642 of 1,642 | none |
| 1,147 (`w/amb`), filled 800 | 800 agree, 347 refused | the same | all | 800 of 800 | none |
| 979 (`w/g1`), filled 823 | 822 agree, 157 refused | the same | all | 822 of 822 accepted | none |
| rx-best `a/` (`mkx.py` x 444, x2 72, q1–q9 29) | 384 / 60; 72; 22 agree, 3 same error, 3 refused, 1 differ | the same, then `q-order` agrees | all | — | `q-order` (an equation reading one written below it): **the oracle threw `unbound x`**, fixed here |
| rx-best `b/` (d, g, h, k, m, n, t: 965, and their 9 filled folders, 626) | e.g. g2 138 agree, 16 differ, 13 refused; t3 95 / 151 refused | the same | all | 607 of 607 accepted | none. g2's 16 "differ" are its `ty-*-wrong-*` programs, wrong types the type pass refuses (16 of 16 `TS2551`/`TS2322`/`TS2339`, run here); the four runners read no types |
| 635 (`w/old`) | 342 agree, 261 refused, 23 differ, 6 same error | 349, 260, 15, 8 | checkers all; **lowered 634 of 635 → 635** | — | 7 differ → agree, 1 → same error (track 2 e: keyed lists, a pending attribute, a lazy default, an error's text); 1 refused → same error: `px_ok-method`, named correct, accepted by W2 (track 1), its harness cannot click it |
| 3,802 (`w/opus`) | 2,165 refused, 1,547 agree, 48 differ, 39 same error | 2,162, 1,556, 40, 41 | **checkers 3,800 of 3,802 → all; lowered 3,801 → all** | — | the same 8 as the 635 (copies), and 2 refused → agree, `ALL_A2-toast-comp`/`-handler`: a context default `{ push: (m) => { … } }`, accepted by B3 (track 1), alike in four runners |

Nothing moved from agree or differ to refused; no program both revisions agree on shows anything else; nothing
accepted that every runner did not already show alike. The 55 programs that still differ on this tree (15 of the 635, 40
of the 3,802, one program often in both) are exactly track 2's "45 left" by kind: a closure given as content or as
`children: any` (W4, track 1 step 5), an instantiating call through a value (L8, step 6), handlers the harness's tables
hold, closures given as children and shown again, and four instrument cases.

Fixed here, all three older than the roadmap (the same at c8ed3aa6):

- **Both checkers differed** on `ALL_D-two-fns` and `-rev` (`NESTED_NOT_RENDERED`): one component nested by two
  records on one line, under `children` and under `kids`; the reference named the last record's word, the crate the
  first's. The reference now keeps the first, as the crate does.
- **The two emitters differed** on `px_plain-style` (a `<style>` whose CSS is refused): the reference's message carried
  `(1:42)`, a position in the text the emitter made, not in the program. Taken off, as the crate's has none.
- **The oracle** made equations in written order and threw on one that reads an equation written below it (E-1 has no
  order; the interpreter and both emitters read it). It orders them by what they read, as it already did for a
  provision.

Not found on disk: proposals/31's 456 (track 1 says so too). The 3,802 and 635 are `w/opus` and `w/old`.

### X6 again: a Solid bug is no reason to refuse a program (the user's rule, 2026-11-26)

*The rule given:* the design is not bent to deal with Solid's faults; such a fault is recorded as a divergence with a
memo, and a correct program is not refused for it. Plain-Solid issue drafts now exist (`solid-main.noindex/drafts`,
read only, nothing posted).

*Re-judged.* `REF_READS_REF_WRITE` rested on "rendered and hydrated differ". Draft 5 shows that difference is Solid's
regression in 2.0.0-rc.22 (the release of #4768, which runs a `ref`'s callback in the creating pass): until rc.21 every
`ref` read the screen, rendered and hydrated alike. Run here with the draft's harness at rc.21 on draft 4's counter
program: the sibling, the `<For>` row and the `<Show>` all read `0`, nothing replaced, in both modes. So the only
difference that was ours is the interpreter's (each `ref` was its own run, and the next read the write). *Decided:* a
`ref` reads the screen as the pass found it, as a handler does (02 SC-4c, rewritten): the interpreter now calls the
`ref`s of the elements one instant made together, each reading σ, their writes landing as one instant. No case is left
that differs with no Solid bug involved — every difference between the interpreter and compiled code is a `ref` in a
row, an `if` or a view block reading an earlier `ref`'s write, which rc.21 would not show — so **the refusal is withdrawn
from both checkers**, as are its 99 row and its guide section. X13 goes with it.
*(Corrected 2026-11-27, "Outside review of 15db0404": that sentence is false. #4768 is deliberate and #5110 keeps
#4767 — a `ref` of an element made under a hold reads the hold's values, which the interpreter did not do, with no
Solid bug involved; and the rendered half of DV-28 is Solid's rule, not a regression. The refusal stays withdrawn.)*

*Recorded.* DV-28 (spec 10), with the draft, rc.22, #4768 and what a user writes that is the same on every Solid (each
`ref` stores its own element; what needs two reads them in an effect or an equation; a counting `ref` writes by a
function). S-server-8 now shows the screen's frames, with Solid's as `oracle` and `hydrated` divergences.

| census of what is accepted again | |
| --- | --- |
| the 43 probes of X6 (fresh, frames `@`) | all accepted but the probes' own (`STALE_OWN_READ`, two `UNBOUND` globals); both checkers alike, lowered alike, 43 of 43. Interpreter and compiled code agree on the siblings, the nested, the action, the equation and every functional write; they differ on 11, each a `ref` in a `for` row, an `if` or a view block reading an earlier write (DV-28), and on 2 the interpreter's element model cannot run (`addEventListener`). Served: rows hydrated read the screen as the interpreter does (the render shows the write: DV-28); `if`s and view blocks hydrated show the write (DV-28); four that write an array or a record in a `ref` are DV-27 |
| the 18,798 of the review sets, interpreter included, after the change | nothing moved but the three fixes of the review-set commit |
| scenarios (`scripts/quick`), the four runners, served and hydrated | all; S-server-8 with its divergences |
| bench, rx-packages, rx-std, UI SDK, proposals | unchanged: no program of them was refused by the rule (census of a006d85a), and the interpreter is not theirs |

*Memos added for the other drafts.* X1 (`ref/compile/keyed.ts`, bug page 45): the runtime works around draft 1
(`reconcile(v, key)` remakes a kept row), to be removed once Solid keeps the proxy. DV-26: draft 2. DV-25: it is Solid's
intended behaviour since rc.23 (#4908, its rule F-3, test E1), not a 2.0.1 regression (draft 3); wording fixed in spec 05,
S-fail-2, S-module-1 and the repro. **Flagged, not changed:** our H-4 and D-41 (a change holds until a re-asked question
answers, also beside a shown error fallback) were not shaped to avoid DV-25, but they now disagree with a ruling of
Solid's, not with a bug: whether the language keeps H-4 there or follows F-3 is a design question for the user.
(Decided by the user the same day: the language follows F-3 — "F-3 followed" below, which also finds that H-4 already
said so for an `errored` region and that the disagreement was narrower than this paragraph says.) DV-27 has
no draft yet.

### F-3 followed: a write beside a shown error fallback shows at once (the user's decision, 2026-11-26)

*Decided by the user:* the language follows Solid's deliberate rule F-3 (#4908, since 2.0.0-rc.23; Solid's
`lean.test.ts` "E1 a write publishes beside a shown error fallback"). It is not a Solid bug — that is why it is followed;
a bug would have stayed a DV with a memo (the standing rule).

*What F-3 is, read in Solid's source* (`packages/signals/src/boundaries.ts` at the pin, 30e7805: `hiddenBy`, the error
boundary's pass, `freshAbove`): a reader under a boundary whose last pass chose its fallback is off screen and holds
nothing, whatever it reads; an error boundary on its fallback with a retry pending under it keeps the fallback and holds
nothing outside it — unless a `<Loading>` above has not shown content, which then catches the pending; a reader outside
the boundary that reads the same async still holds, one hold per reader that is the display. A `try`/`catch` around an
`await` in a memo is the memo's own value (F-12), not a fallback.

*The rule as now written* (spec 05 H-4, H-12's clause; DV-25 closed with its history): after a source's question has
failed into an `errored` region's fallback, a change that makes it ask again commits in its own instant — every reader of
the change that is the display shows it beside the old fallback, with the question in flight (`pending?` reads `true`);
the fallback stays until an answer replaces the error; the content behind it (`{…}` readers, attributes, `if`
conditions, `for` collections, a component's content through a prop) holds nothing. What still holds such a change: a
reader that is the display and pending on it (another question of the change — the failed question's answer, if first,
is staged and reveals with that hold, D-41's mirror); the reader of a `catch` answer, which is a value (R-f-4), wherever
the `catch` stands; an armed `loading` above the error fallback, which takes the content and shows its own fallback with
the change's frame; an action's body until it returns.

*What was found when it was measured.* H-4 already said "a reader behind a fallback holds nothing", and S-module-1's
frame had been F-3's (`#2 nobody Z`) since `CATCH_NOT_ON_AWAIT` (fee49e0e): its DV-25 record matched its own frame.
S-fail-2's (`zzznone`, hydrated) no longer reproduces at the pin; every runner holds there, as F-3 says (`other` is a
`catch` answer: its reader is the display). So the user's two examples split: S-module-1 instant 3 is F-3 and stays;
S-fail-2 instant 6 is not F-3 (Solid itself holds it), and its frame stays `unavailable-missing none`. DV-25 had been a
`catch` lowered onto Solid as an error boundary, meeting F-3. 24 probes (`rx-t3.noindex/probes/mkf3.mjs`: E1's three
variants, S-module-1's throw, an action, a prop, two fallbacks, a typed boundary passing, `loading on`, a probe beside
the fallback, a held recovery, controls behind the fallback, `catch` in seven places) through every runner, before
(821fa264) and after, found three things, all fixed:

| | before | now |
| --- | --- | --- |
| an `if` condition or a `for` collection behind a shown error fallback (the interpreter) | held the change: what the control reader had been served still counted as a flight a display waits on | holds nothing, as a plain read there (`behindErrorFallback`, `ref/src/runtime.ts`) |
| an `await … catch` not an equation's result — inside an expression, a view's reader, a condition (the oracle, both emitters) | lowered as an error boundary whose fallback is the catch's value, so Solid released its reader (F-3) where the interpreter held: the last live DV-25 | the `await` a `catch` takes is settled where it is awaited, as the result form always was (`awaits.ts`/`awaits.rs` `caught`; `emit.ts`, `emit.rs`, `oracle/lower.ts`) |
| an `await` written in an `if` condition (the interpreter; found by the `catch` probes, no `catch` needed) | held nothing: a pending condition with a branch shown counted only what it was served | holds as a pending read (H-4, "a pending control reader holds or is caught as a pending read is") |

Also: the oracle's `deferred x = await … catch` threw through a boundary at the mount (`1none`); it is settled as the
plain form (the emitters do not lower a deferred catch yet: unchanged). Pinned by `scenarios/S-hold-7.md` (the E1 shape
with a condition and a probe, four runners; a variant where an inline catch's answer holds).

*Checkers.* No diagnostic, refusal or advice rested on the hold: neither checker reads it, and neither changed (`same`
alike on every program below). Nothing is refused or accepted differently.

| census | |
| --- | --- |
| the 24 probes, every runner, before → after | 4 differ → agree (`catch-inexpr`, `catch-reader`, `if-behind`, `for-behind`); 17 agree as before; `catch-if` differs before and after, and agrees once the third fix is in (two more probes, `probes/f3b`: an `await` in a condition, with and without an equation); `catch-effect` is my table's (an effect's write is an instant it does not list), and shows an effect's input never holds; `catch-deferred` is not compiled by the emitters (before too). `same` and `lower` 24 of 24 |
| the review sets, as "Review sets on 3395c64e" ran them (`sets/runf3.mjs`, `out-f3/`): the 3,774 of the 18,798 that hold `errored` or `catch` — the only ones either change can reach (the interpreter's needs a shown error fallback; no program without one has an `await` in a condition) — interpreter, oracle, both emitters, both checkers, both lowerings, before (821fa264) and after; filled sets served and hydrated after | **nothing moved**: every verdict the same, no program both revisions agree on shows anything else, `same` and `lower` alike on all 3,774. Served misses, all as before: DV-26 (`p3-err-aw-ifinner-app`), X14 (`v1-aw-loop-*`); 14 portal programs of the 505, which are the server harness's own faults and not X14 nor their tables' (corrected 2026-11-27, "Outside review of 15db0404"); one more in the 635, `p7_y-hidden` (children with an `await` given to a hidden `if` under `loading`, hydrated late: the frame before `w`), never served before, the same on 821fa264 — not this change, not reduced |
| scenarios (`scripts/quick`, then the full run below) | S-hold-7 new; S-module-1 and S-fail-2 lose their DV-25 records and keep their frames; nothing else moves (all four runners, served and hydrated, the crate's parity and lowering, the type pass) |
| `examples/rx-packages`: `build.mjs`, `check.mjs` | all built; `check.json` unchanged byte for byte. No program there has an `await … catch` in reactive scope (the one `catch` is an action's `try`), and the interpreter is not theirs |
| `examples/rx-std`, `examples/rx-ui-sdk` | build; the UI SDK's `check/run.mjs`: the rewrite's column accepts the good program and all 8 correct lines, as before (its drafts column reads `DECLARATION_VERSION` here, the pin check against this checkout's installed package: no checker or declaration changed) |
| the full `scripts/ci`, uncached, with the Vite plugin fork (`bench --check --strict`, `proposals/check.mjs`, every runner and suite) | 47 of 47 passed, nothing kept from before (1,728 s) |

Nothing stricter dropped and nothing correct refused: the checkers are untouched. A Solid bug was not involved: F-3 is
Solid's ruling, the three fixes are ours.

## Audit: rules and Solid bugs (2026-11-27)

*The rule given (the user, 2026-11-27):* every real Solid issue is the user's to file; we account it as a Solid issue and
do what is right. A Solid bug is a divergence (DV) with a memo: it never refuses correct code and never shapes a rule;
the design does what is right as if Solid were fixed. A deliberate Solid rule — ruled by its maintainers, pinned in its
tests or changelog, closed "by design" — is followed (F-3, yesterday). Track 1 read only its own steps against this.
This audit reads every older rule against it.

*How.* Every `DV-n` of spec 05, 09 and 10, the repros README, the scenarios' `## Divergences` sections, the plain-Solid
drafts (`solid-main.noindex/drafts`, read only), and the history (`git log -S'DV-'`, every commit that names a Solid
issue, a repin or a workaround), each bug's live window set against the rules, diagnostics, refusals, checker cases,
emitter and runtime choices and scenario frames made in it. Every repro was run on the pin of the day (30e7805) and on
Solid main 50a4bfdde, the pin the user is moving to (their run, `rx-pin.noindex/logs/repros-new.txt`, and mine for
DV-26's after-shell case and DV-19's store mode); a hydration repro in Chromium. Issue states read with `gh`, read only.

### Inventory

"Fixed" is judged at 50a4bfdde. *Bug*: Solid's own rules or maintainers call it one. *Ruling*: a deliberate rule of
Solid's, which the language follows (`proposals/32`). *Ours*: a rule or a harness of this project.

| DV | what | whose | status | Solid issue / fix | at 50a4bfdde |
| --- | --- | --- | --- | --- | --- |
| 1 | the mount rendered partially | ours (the harness mounted with `insert`) | resolved 2026-10-22 | — | — |
| 2 | a failed action's plain writes commit | ruling (D-7) | adopted 2026-10-22 | — | the oracle's frames |
| 3 | a render effect in a re-armed fallback holds the content's reveal | bug | fixed 2026-10-26 | #4268, fix #4282 | `content c2` first ✓ |
| 4 | a derived store's per-key `isPending` false under a boundary | bug | fixed 2026-10-26 | #4269, #4278 | `1 pending` ✓ |
| 5 | `pre` is the value before the most recent change | ruling (the memo's `prev`) | adopted 2026-10-23 | — | — |
| 6 | `SNAPSHOT_INITIALIZER` | ours (E-4) | — | — | — |
| 7 | an outer boundary that took a rethrow from an inner fallback does not recover | bug | fixed 2026-10-26 | #4270, #4277 | `ok0` ✓ |
| 8 | a keyed projection swallows later failures and pending | bug | fixed 2026-10-26 | #4271, #4280 | ✓ |
| 8b | `pending?` of a projection read nothing | ours (the lowering), against ruling D-24 | fixed 2026-10-27 | — | `keys`, `length` ✓ |
| 9 | a failed boundary drew no fallback on the server; hydration asked again | bug | fixed 2026-10-27 | #4287 | streamed and hydrated `failed: no user` ✓ |
| 10 | `latest` of a guess reads ahead of its held lane; the one-effect grouping | ruling (#4284 closed; `verdict-contract.test.ts`) and a bug in it | adopted 2026-10-26; the bug fixed | #4284 | `one` and `two`: `1 x1 / 5` ✓ |
| 11 | the hydration window | ruling | adopted 2026-10-26 | #4272, closed by design | as ruled |
| 12 | a boundary hydrated in its error state never recovers | bug | fixed 2026-10-26 | #4273, #4279 | `pear` ✓ |
| 13 | an empty fragment loses its slot (universal) | bug | fixed 2026-10-26 | #4274, #4276 | ✓ |
| 14 | replayed events share one instant | bug | fixed 2026-10-26 | #4285, #4299 | `2` ✓ |
| 15 | a client question's served fallback is rebuilt | bug | fixed 2026-10-27 | #4286 | nothing dropped ✓ |
| 16 | a reader reading `latest` first publishes an empty slot | bug | fixed 2026-10-26 | #4275, #4281 | both orders `off` ✓ |
| 17 | two mounts under one boundary merge their holds | bug | fixed 2026-10-26 | #4283, #4302 | ✓ |
| 18 | a keyed projection's rows miss later landings (regression of #4280) | bug | fixed 2026-10-27 | #4305 | ✓ |
| 19 | `latest` of a shown guess answers the truth after a re-ask | bug against ruling #4695 decision 3 | fixed in rc.22 (the signal form; the same in rc.23 and 2.0.4) | #4689 | signal mode ✓; the store mode, which nothing displays, answers `3` — outside the ruling (a *displayed* slot), not a DV; noted in 05 and the README |
| 20 | a guess read by effects alone reverts under the action's refresh | bug | fixed in rc.22 | #4690 | ✓ |
| 21 | posture is per read | ruling, not built | open (Solid's `it.fails`) | #4695 decision 1 | recorded in S-solid-27, 49, 50 |
| 22 | `pending?` under a new question under a guess | ruling, not built | open | #4695, S-44 | recorded in S-solid-44 |
| 23 | a branch a probe opens is born held | ruling | built in rc.22 | #4695 decision 4 | ✓ |
| 24 | a component value is owned at its application | ours (a static assumption, MO-11c) | — | — | — |
| 25 | a write beside a shown error fallback shows at once | ruling F-3 | followed 2026-11-26 | #4908 (rc.23), `lean.test.ts` E1 | `#2 nobody` (F-3's) |
| 26 | a failure caught above a part's `loading` streams an empty fragment | bug | **open** | remainder of #4287 (a stated limit of #4303); the before-shell case's fix is PR #5225 (open); draft 2 unfiled | before and after the shell, `part` and `prop` blank |
| 27 | a store a `ref` writes while hydrating keeps the server's text | bug | **fixed at 50a4bfdde** (open in 2.0.4) | fixed by #4906 (2026-11-26); draft 6 being written | hydrated `2/2/5` ✓ (`1/2/5` at 30e7805) |
| 28 | a `ref` in a `<For>` row or a `<Show>` reads an earlier `ref`'s write; a `<Show>` rebuilt on hydration | bug: a regression in rc.22 (#4768) against the maintainer's ruling in #5110 ("refs are like event handlers") | **open** | draft 5 unfiled; related #5098, #5110 | open (the pin's run); recorded in S-server-8 |
| (X1) | `reconcile(v, key)` gives an unsubscribed kept row a new proxy | Solid's code (the #2902 prune, pinned) against its documentation | **open** | #5220, fix PR #5222 (both open) | draft 1: reproduced at 50a4bfd |
| (—) | a server projection over a pending store throws; then it stops following its source when hydrated | bug | fixed at both pins and in 2.0.4; live in 2.0.3 | #5097 (fix fc0dac0cd), #5146 (fix #5150) | `rendered: A`; `Y,B` ✓ |

The eval fuzzers' Solid issues (#4831 to #5104, `eval/`) are no DVs: no spec text, rule, checker or runtime line cites
one; the one workaround they caused, in the guide (#5039), went on 2026-11-19.

### Rules and code written while a bug was live, judged

(a) right on its own; (b) shaped by the bug, the language must change; (c) a workaround in generated code or the runtime.

| bug | what was written in its window | judgment |
| --- | --- | --- |
| DV-3 | S-22 row 3′ ported with the ruled frame; nothing lowered around it | (a) |
| DV-4 | the lowering at JSX granularity (each `{…}` its own insert, 2026-10-24) | (a): it is what Solid's compiler emits; DV-4 stopped showing as a side effect |
| DV-7 | a typed boundary's fallback and a reactive `catch` handed a failure of another class out as a value (`Fallback`/`Forward`), and a memo around the boundary threw it; the server reserved the memo's id | **(c), fixed in Solid: removed.** The fallback throws it itself, in the oracle and both client runtimes, as the server runtime always did; the reserved id goes. A change of class is re-decided because the fallback reads the failure |
| DV-8 | a keyed equation lowered to `createProjection` | (a); DV-8b's key reads follow Solid's D-24, (a) |
| DV-9 | the `ssr` runner on Solid's production server build | (a): it is what serves a user, and SV-5b's generic error is the production build's |
| DV-9 | `ref/ssr/run.ts` turned every hydration failure of a table with a `server` divergence into "≠ … DV-9" | **(c), a harness leniency for a fixed bug: removed.** The one table it still covered, S-server-7 (DV-26), passes without it, served and hydrated, both emitters |
| DV-13 | the emitters wrote an empty view as `null` | **(c), fixed in Solid: removed**, an empty view is `<></>` again. The same `null` was also how a block with no view says "nothing to show", which a fn's body drops (`strip_return_null`, the reference's `return null;` filter): that use is kept, now explicit, since it is right on its own |
| DV-12, 14, 15 | SV-3a, SV-3e, SV-6 kept the ruled frames; `ssr/run.ts` reads a recorded `hydrated` divergence where the frame shown is the record's | (a); the comment named DV-15 and now names DV-28, whose `<Show>` it serves |
| DV-16 | the interpreter holds in both orders | (a): D-28 |
| DV-17 | S-5 kept two independent holds; MO-1c mounts one entry | (a): D-3, D-4; MO-1c is the language's |
| DV-18, 20 | nothing | — |
| DV-19 | 2026-11-05 (8190e1ea) H-11 followed Solid's behaviour of the day; reverted the next day when #4695 ruled it a bug; the eval references read the count under the list's region | (a): the rule now is the ruling; the references are right either way |
| DV-22 | the guide's `GUESS_WHILE_LOADING` advice, to test `pending? x` in the handler too | (a) for the checker (it accepts the covered program, as the ruling makes it right); the guide's line is a user-side note for today's Solid, labelled DV-22 |
| DV-26 | nothing refused; S-server-7 records the `server` frame | (a) |
| DV-27 | nothing refused; S-server-9 records the `hydrated` frame; `ssr/run.ts` reads a `hydrated` record at the hydration instant | (a) |
| DV-28 | SC-4c rewritten (a `ref` reads the screen), `REF_READS_REF_WRITE` withdrawn (track 3) | (a), and now pinned: Solid's maintainer ruled the same on 2026-11-20 (#5110) |
| X1 | `ref/compile/keyed.ts` keeps a kept row's proxy; the updater's rows and a list in a row reconciled by key | **(c), open: stays**, memo updated (#5220, #5222, the #2902 prune). The updater and depth cases are ST-4a itself, (a). Not a (b): see "Written up" |
| #5097/#5146 | `rt-server.ts`: the server renders the truth and makes the client's optimistic layer for its owner slot only | **(c), fixed at both pins and in 2.0.4, live in 2.0.3, which the runtime installs and its peer range allows: stays**, memo updated. It goes when the runtime moves to Solid ≥ 2.0.4 (upstream's line renders the layer) |
| DV-25 (ruled) | `CATCH_NOT_ON_AWAIT` (2026-11-19, the day DV-25 was recorded) | (a): the commit cites Ryan's ruling of the language that day, not the record |
| H-12 | a re-armed `loading` over an error fallback takes its pending content (2026-10-24, "Solid's behaviour") | (a): Solid's F-4 and D-12 (an armed boundary catches what is pending under it) |

**No (b) case was found.** No rule, diagnostic, refusal or checker case of the language was shaped by a Solid bug that is
still standing; the one that was (X6's refusal) was withdrawn yesterday. Both checkers are untouched by this audit.

### Written up, not changed

- **X1, if Solid documents the prune instead of fixing it.** Options: (1) keep ST-4a (a kept key keeps its row) and the
  runtime's keep pass as the language's own lowering; (2) follow Solid's prune, so a row that reads nothing of its item
  is remade on a fresh list. Recommended: (1). (2) is not writable as a rule a user can follow (it depends on what the
  row reads, which an edit changes), and it loses state silently. Nothing to decide until #5220 is answered.
- **The runtime's Solid.** Moving `runtime/`, the examples and the benchmark from 2.0.3 to 2.0.4 (and the runtime's peer
  to `^2.0.4`) removes the #5097 workaround. It changes what every example installs, so it is a step of its own, not
  this audit's.

### Census of what the two removals change

Neither checker changed, so no verdict can move; what can move is output. The census asks whether it does.

| | |
| --- | --- |
| the review sets (`rx-t3.noindex/sets/runaudit.mjs`, `cmpaudit.mjs`, `out-audit/`): the 835 of the 18,798 that hold what the removals reach — a typed boundary (`fallback(e: …)`), a `catch`, an empty block (`{}`) — through `scripts/matrix.mjs`, before (c4b77fbc, `rx-t3.noindex/before`) and after: interpreter, oracle, both emitters, both checkers, both lowerings | **nothing moved**: every runner's output of every program the same; the four runners alike on the same 108 before and after (the rest are refused alike); `same` and `lower` 835 of 835 |
| the sets whose frames are all written, served and hydrated in both emitters, before and after | 203 programs, **nothing moved**; three fail the same way on both (`w-635`: `am2_fn-await`, `pa_Cprobe-gate-*`, a parse error and two of the harness's tables) |
| scenarios (`scripts/quick` on 30e7805): interpreter, oracle, both emitters, crate parity and lowering, served and hydrated, the type pass, the benchmark | all pass (oracle and compiled 242 of 242); `spec-refs` asked for DV-7's entry, now in spec 05. S-server-7 served and hydrated without the DV-9 leniency, both emitters |
| `examples/rx-packages` `build.mjs`, `check.mjs` | 65 built; `check.json` unchanged byte for byte |
| `examples/rx-ui-sdk` `build.mjs`, `check/run.mjs` | builds (its source maps differ only by the worktree's path); the rewrite's column accepts the good program and the correct lines, as before |
| `std/test/browser.mjs` | 39 of 39 |
| the full `scripts/ci`, uncached, with the Vite plugin fork, on 30e7805 (`bench --check --strict`, `proposals/check.mjs`, every runner and suite) | 47 of 47 passed, nothing kept from before (731 s) |

Nothing stricter dropped, nothing correct refused, nothing accepted that a runner shows differently.

The DV status on Solid main 50a4bfdde, the pin the user is moving to, is the pin's own step to write (its #4906 replaced
the store engine). Its repros: DV-27 fixed; X1, DV-19's store form, DV-26 and DV-28 open; the rest as above.

## Pin moved to Solid main 50a4bfdde (2026-11-27)

`ref/SOLID_NEXT` moves from 30e7805eb to 50a4bfdde (Solid main, 2026-11-26), whose #4906 runs stores on the thin engine
and deletes the deep one. On the user's added scope, the runtime and every test that installs Solid for it now run on
the same pinned main, as `ref/` does: one Solid for every runner.

*The rule applied (the user's):* a real Solid bug is Solid's (a DV with a memo and a plain-Solid repro; the user files
it, nothing is posted) and never shapes the language; a deliberate Solid rule is followed.

### The first ci on the new pin: 43 of 47, and why

The oracle and the compiled runner failed 8 scenarios each (S-effect-store-1, -3, S-keyed-alias, S-pre-1, -2, S-region-7,
S-store-7, S-store-kept-row; 234 of 242), the hydrated runner 5 of them, `proposals/check.mjs` 6 verdicts in 4 bug pages.
Every failure was ours, one cause: our runtimes asked a store proxy for `$TARGET`, the deleted deep engine's record.
On the thin engine every value answers `$TARGET` with `undefined`, so a store was taken for a plain object everywhere
the runtime asks "is this a store?". `ref/oracle/repros/pin-4906-target.mjs` shows it on both pins: at 30e7805eb
`v[$TARGET] !== undefined` is true exactly for store proxies (a store, a row or list inside one, an optimistic store, a
projection and its rows, a derived store) and false for merge and omit views and plain values; at 50a4bfdde it is false
for all; `v[$PROXY] === v && v[$RECORD] === undefined` gives the first answers on both. In plain Solid the same effects
fire on both pins (`pin-effect-store.mjs`: an effect over a store, written by a setter, a guess and a new answer).

| failure (runner) | plain-Solid repro | class | what was done |
| --- | --- | --- | --- |
| S-effect-store-1, -3 (oracle, compiled): no effect after the first | `pin-effect-store.mjs` (fires on both pins), `pin-4906-target.mjs` | C | an effect's input that holds a store is copied whole (EF-2): `inputWhole` asked `$TARGET`, so the input was the store itself, the same object every time, and never differed. `isStore` (`$PROXY`, `$RECORD`) in `rt.ts`, `rt-web.ts`, `rt-server.ts`, `oracle/lower.ts` |
| S-keyed-alias `BBAA` (oracle, compiled, hydrated) | `pin-4906-target.mjs` | C | a keyed equation over a source with no key copies the source's rows (`unkeyed` → `whole`): no copy was made, so the projection's rows aliased the source's |
| S-pre-1, S-pre-2 (oracle, compiled, hydrated) | the same | C | what `pre` keeps of a store is a copy (`kept`, C-2): none was made, so `pre` was the live store |
| S-region-7 | the same | C | the same `kept` copy (a registration's list) |
| S-store-7 `1A` for `1loading` | the same | C | `latest` of a store is a copy read inside `latest` (`latestWhole`, R-12); Solid's `latest(() => store)` still hands back the proxy on both pins (checked), so the copy is what keeps the guess's reads inside `latest` |
| S-store-kept-row: a kept row made twice | the same; `solid-main.noindex/drafts/1-reconcile-kept-row/repro.mjs` | C (and X1 still open) | `keyedWrite` (X1's workaround) found no row to keep: its proxy check asked `$TARGET`. It takes `isStore` now |
| proposals/bugs/04, 08, 18, 45 | the scenarios above | C | their branch frames are those programs: they pass again |

`==` through a store (ST-2) compared `x[$TARGET].v`, the deep engine's raw: on the thin engine a store's proxy is its
record's one identity, so two proxies compare as they are, and a proxy against a plain object compares by Solid's
`snapshot()` (the record itself while nothing below it was written). Probed on both pins against the interpreter
(a selection held in a source and compared with a row, through path writes and an append; a seeded record against
the row it seeded): the four runners agree.

No class A: #4906 introduced no Solid bug that our programs meet. No class B was needed: #4906's two intended changes are
rules the language already had (recorded in `proposals/32`):

- **F-10 for stores** (a store write is visible at the flush that carries it, for every reader) is 02 W-4 and 05 H-10,
  with `STALE_OWN_READ` for a read of the run's own write. Nothing in the spec, interpreter or emitters moved.
- **`affects` of a derived store marks the view, not its source** (#4906's description; Solid's test "a marked view is
  pending at its first untracked read; its source is not") is 06 AC-5. `S-affects-projection` (new) holds it for a
  keyed equation and a draft over a source. It found a bug of ours, on both pins: the oracle and both emitters handed
  Solid's `affects` an equation's accessor rather than its projection, which Solid refuses, so `affects view` threw into
  the action's `catch` (the interpreter was right). Fixed as `#50` was for a source: the keyed equation's and the draft's
  accessors are store accessors (`storeAccs`; the oracle's binding says `proj`).

### What #4906 changed in the judgments the audit listed

Each checked on the new pin, in plain Solid where the judgment is about Solid (`ref/oracle/repros/`, the same output at
30e7805eb and 50a4bfdde unless said):

| judgment | at 50a4bfdde |
| --- | --- |
| X1, `ref/compile/keyed.ts` | still needed: the thin engine's reconcile (`store/thin.ts` `merge`: "a keyed diff of a plain store skips a row nothing below ever read through a node") prunes as `descend()` did; draft 1's `repro.mjs`: `none` remakes both rows, `reads` keeps them. `reconcile(n, key)(p)` still adopts `n` into the row's proxy (S-store-kept-row, `compiler/test/rows.mjs`). Its proxy check was `$TARGET`: fixed above. Memo: #5220 and #5222 open |
| S-server-9 (DV-27) | **fixed**: `dv27-hydrate` shows `2/2/5` hydrated (`1/2/5` at 30e7805eb), probably by #4906. The divergence row is removed, so the hydrated frame is checked as written; spec/10 DV-27 says so |
| DV-8b, `__rt.isPending` key reads | unchanged: `pending?` of a projection reads its keys (`Reflect.ownKeys` tracks the thin engine's key node); S-ai2-search passes; `dv8b-projection-pending.mjs` the same on both pins |
| DV-4, DV-8, DV-18 (per-key store and projection nodes) | stay fixed: their repros give the same frames on both pins |
| S-store-7's lowering (`latest` hands back the proxy) | still so on the thin engine (checked); the copy, now made, keeps the guess |
| DV-19's store form | unchanged: `latest=3` (expected 2) on both; outside the ruling (a displayed slot), as the audit says |
| `rt-server.ts`'s optimistic-store line (#5097/#5146) | **removed**: fixed in 2.0.4 and at both pins (`rendered: A` in plain Solid on both). It was kept only because the runtime installed 2.0.3; it installs the pin now and asks for `^2.0.4`. The server renders the client's optimistic layer over the truth, as upstream's line does |
| ST-4a `landDraft` keyed answers | unchanged: a derive that returns its keyed answer is reconciled by the key, a kept row keeps its proxy (`order Bac`, rows 1 and 2 kept, on both pins) |
| `pre` of a store at depth (S-pre-2, S-keyed-alias) | the `$TARGET` fault above; pass |
| raw identity through stores (S-region-7) | the `$TARGET` fault and `==` above; pass |
| DV-7 (the wrapper removed by the audit), DV-13 (`<></>`) | stay fixed (`dv7-rethrow.mjs`, `dv13-universal-empty.mjs` the same on both pins) |

Other DVs on the new pin: DV-26 and DV-28 open (S-server-8's hydrated records still hold: without them the run fails
with Solid's frames), DV-19's store form as above; no other repro moved (`logs/repros-{old,new}.txt` differ only in
DV-27's line).

### The runtime, the examples and the benchmark on the pinned Solid (the user's added scope)

- **`runtime/`**: its devDependencies link `file:../../solid-next/packages/{solid,web,signals}`, as `ref/` does; its
  lock is updated. Its peers are `^2.0.4`: the server line above relies on the #5097 and #5146 fixes, which 2.0.4 is the
  first release to have (nothing else we now rely on is newer than 2.0.0). `npm pack` ships no `file:` dependency:
  `prepack` writes the shipped package.json without its devDependencies (`runtime/pack.mjs`, which also refuses a local
  path in any other dependency list) and `postpack` puts the file back; checked on the packed tarball. `test.mjs`
  links seroval from where `@solidjs/web` is installed, and its "a second copy of Solid" case copies a package's own
  files and links what it imports (the pin's packages are a pnpm workspace whose `node_modules` link one another).
  `SOLID_TESTED` says 2.0.4 and the pin. `runtime/test.mjs`: 82 checks, the server's AC-3 guess included (it failed on
  the installed 2.0.3 once the workaround was gone, as it should).
- **`bench/`**: `bench/package.json` links the pin's `solid-js`, `@solidjs/web`, `@solidjs/signals`,
  `@solidjs/universal`, and overrides `@solidjs/compiler` (which `@solidjs/vite-plugin` brings) with the pin's. The
  paths are relative to `bench/.out/ws`, where the harness installs the file (its description says so); the lock is
  made there. `tasks/start-route` (installed at `bench/.out/ws/deps/start-route`) the same; `tasks/start-mode/src`'s
  listed `solid-js` and `@solidjs/web` are `^2.0.4` (that file is the app as a project lists it, not installed).
- **`examples/`**: `rx-packages`, `rx-std`, `formisch`, `start`, `wardic` link the pin's Solid (and its compiler, by
  override where a plugin brings one); the two with locks are reinstalled. `rx-std` lists `@solidjs/signals` itself now:
  the runtime's peer had only been there hoisted out of npm's `solid-js`. `compiler/test/{formisch,start,wardic}.mjs`
  install their example's package.json elsewhere, so they re-base its `file:` paths there (`scripts/lib/relink.mjs`).
  `rx-ui-sdk` (and `rx-std-ui`, whose README says the same) has no lock: its `node_modules` is the bench workspace's,
  with Solid linked from the pin. Their esbuild harnesses read no tsconfig (`tsconfigRaw: {}`): bundling the pin's
  `dist/internal.js`, esbuild had read the checkout's own `tsconfig.build.json`, which maps `solid-js` to `src/`, and
  put a second copy of Solid in the page (every hydration test timed out, `sharedConfig.getNextContextId` of the copy
  that hydration never set up); an npm install has no tsconfig. `live.mjs` already bundled with `tsconfig: false`.
- **Vite builds beside a linked Solid** (found by the first full ci with the installs moved: `runtime-resolve`'s
  production server, `t-start`, the benchmark's `start-mode` and `start-route` answered 500). Solid's real path is now
  outside any `node_modules`, and Vite keeps a linked dependency in its server bundle beside what Node loads from
  `node_modules` (the runtime, a router) on the installed copy: two Solids, so `provide` found no owner. An app installed
  from npm has Solid inside `node_modules`. The Vite config a test or the benchmark installs gets
  `resolve.preserveSymlinks` (`scripts/lib/relink.mjs` `linkedSolid`: `compiler/test/runtime-resolve.mjs`, `start.mjs`,
  and `bench/harness.mjs` `stage()` on the staged copy, so no task's own files change). Where the task's `node_modules`
  is itself a link (a task with an install of its own, `start-route`), preserved paths gave its router two identities;
  there Solid's packages are made external to the server build instead. (Not everywhere: under a dev server Solid's
  plugin keeps the runtime in Vite's graph on purpose, and runtime-resolve's dev cases check exactly that.) The
  benchmark also lists `@solidjs/compiler` itself: it compiles a package's JSX with the workspace's top-level copy,
  which had only been there hoisted out of `@solidjs/vite-plugin`'s npm dependency.
- **Not moved**: `std/` and `declarations/solid-js` install no Solid (peers `^2.0.0`, right for them); `eval/` is the
  fuzzers' benchmark of record, pinned to rc.23 on purpose, and installs no runtime.
- **GitHub**: `runtime.yml` and `bench.yml` now build or restore `../solid-next` (`.github/actions/solid-next`, pnpm
  11.1.1, Node 24) before installing the runtime and the workspace; `suites.yml` and `editor.yml` already did. Every
  job that installs the runtime (`runtime`, `bench`, `suites` ref, `editor`) has the pin beside it. The runtime's
  publish job publishes the packed tarball, which names no local path.

### A Solid regression found on the way: DV-29 (class A, not #4906's)

With the examples on the pinned Solid, `examples/rx-packages/live.mjs` showed Kobalte's popover, select and tooltip
rewrites differing from the originals at the step that reopens them (the trigger keeps its closed attributes while the
content shows), and one Kobalte select unit test ("controlled clear selection") failing. On npm 2.0.3 all pass; on
2.0.4 (development and production builds) and on main at 30e7805eb and 50a4bfdde they fail, so it is older than #4906.
Reduced, through the compiled module, to plain Solid: `ref/oracle/repros/cleanup-action-write.mjs`. A part shown by
`<Show>` has an effect whose cleanup calls an action. Once that cleanup has run as the part was disposed, a render
effect over a memo of the root's record misses the next change. A plain write in the cleanup does not do it (`plain`).
The candidates in 2.0.4 are #5124 ("a removed row's cleanup can call an action during teardown") and #5161 (not
bisected: Solid is not rebuilt here). The rule stands: `S-effect-cleanup-action` (new) holds the ruled frames in the
interpreter, the oracle, both emitters and the server (Solid's `Ft` is the recorded `oracle` divergence at instant 4).
spec/05 DV-29 records it. `causes.json` attributes the live steps to it, and cutting the rewrites' cleanup actions in
their built modules makes all three cases and the unit test agree again. Nothing is refused. The user's to file.

### Census on the new pin

Before = 9bb604d5 (PR #1's head with the audit, the merge base of this commit) on Solid 30e7805eb
(`rx-pin.noindex/before`, its own install and crate); after = this tree on 50a4bfdde.

| census | result |
| --- | --- |
| scenarios: interpreter, oracle, both emitters, crate parity and lowering, served and hydrated, the type pass | all pass; oracle and compiled 244 of 244 (242 and the two new), 8 recorded divergences (DV-29's added), the server runner 244 of 244; S-server-9 without its record; S-server-8's hydrated records still needed (removed, the run fails with Solid's frames) |
| the review sets, as "Review sets on 3395c64e" ran them (`rx-pin.noindex/sets`: `run.mjs`, `merge.mjs`, `table.mjs`, the sets read from `rx-t3.noindex/sets`): all 72 folders, 18,798 programs, before and after — interpreter, oracle, both emitters, both checkers alike (`same`), both lowerings (`lower`); the filled sets served and hydrated after | **nothing moved**: every verdict the same in every set, no program both revisions agree on shows anything else ("output changed: 0" in all 72), `same` and `lower` alike on every program as before (o1f's 22 the harness stops on, as before). Served: the same misses as on 3395c64e — `p3-err-aw-ifinner-app` (DV-26), `v1-aw-loop-*` (X14), the 505's 14 portal and X14 tables |
| `proposals/check.mjs` | 190 verdicts over 78 documents, all as stated (bugs/04, 08, 18, 45 pass again) |
| bench `--check --strict` | as the scorecard or better: good 44 of 44, types 188 of 188, runtime 282 of 282, bad caught 249 of 249, unrepresentable 13 of 13; coverage as `coverage.json` |
| `examples/rx-packages`: `build.mjs`, `check.mjs`, `run.mjs` (both ways), `live.mjs` | 65 built; `check.json` unchanged byte for byte; the originals' tests: the same as on npm 2.0.3 file by file (sorted), but Kobalte's select "controlled clear selection" (rx 48 → 47 of 58: DV-29, checked by cutting the cleanup actions); served tests the same; live: Kobalte's popover, select and tooltip differ at the reopening step, attributed to DV-29 in `causes.json`, nothing unattributed |
| `examples/rx-std`: `build.mjs`, `run.sh` | twelve packages built; `summary.mjs` byte for byte as `rx-t1.noindex`'s run on npm 2.0.3 |
| `std/test/browser.mjs` | 39 of 39 |
| `examples/rx-ui-sdk`: `build.mjs`, `check/run.mjs`, `app/test.mjs` | builds; the rewrite's column accepts the good program and the correct lines, as before (its drafts column reads `DECLARATION_VERSION`, as before); `app/test.mjs` 44 of 44, both the original and the rewrite (33 of 44 before the tsconfig fix, 44 on npm 2.0.3) |
| `runtime/`: `npm test`, `npm pack` | 82 checks; the tarball's package.json has no devDependencies and no local path |
| the full `scripts/ci`, uncached, with the Vite plugin fork (`bench --check --strict`, `proposals/check.mjs`, every runner and suite, `t-vite-hosts` and `t-vite-watch` run, not skipped) | 47 of 47 passed, nothing kept from before (603 s) |

Nothing stricter dropped, nothing correct refused, nothing accepted that a runner shows differently: neither checker
changed. Every fix was ours (the store brand, `affects` of a projection, the harnesses for a linked Solid); the
Solid bug found (DV-29) is recorded, not lowered around.

**For the user to file** (nothing posted): DV-29, `ref/oracle/repros/cleanup-action-write.mjs` — since 2.0.4, after a
shown part's effect cleanup calls an action while the part is disposed, a render effect over a memo misses the next
change (2.0.3 and earlier correct; candidates #5124, #5161). No new bug from #4906. Still open from before: #5220
(X1), DV-26 (draft 2), DV-28 (draft 5).

## Ecosystem on the main pin (2026-11-27)

Every ecosystem package the runners test against is at its newest Solid 2 version, on the pinned Solid (50a4bfdde).
npm was read again on the day: nothing newer than the list below. Not in scope: `eval/` (rc.23 on purpose) and
`tooling/`. Build and test tools (Playwright 1.65, Rolldown 1.3, TypeScript 7, jest-dom 8) are not packages tested
against, and stay.

| package | from | to | what changed |
| --- | --- | --- | --- |
| `@kobalte/core` | npm 2.0.0-alpha.5 | its `solid2` branch at 9c237a06 (2026-11-23), built from source | #783 (text-field: an untracked read, the id fallback for an explicit `undefined`, a controlled value that starts `undefined`), #786 (select, combobox: no `STRICT_READ_UNTRACKED`), #770 (a collection scrolls its own container, never the window). The originals' tests (already copied from `solid2`): select 57 → 58 of 58, tabs 15 → 16, text-field 35 → 39 (the rewrite's side runs the original text-field: 35 → 39). live: the original switch no longer warns `STRICT_READ_UNTRACKED`. One port change, below |
| `@tanstack/solid-router` | 2.0.0-rc.10 (start-route, examples/start), rc.11 (bench, rx-packages, compiler/test/vite.mjs) | 2.0.0-rc.12 | the same `router-core` 1.171.39 and `history` 1.162.5 as rc.11; `router-plugin` 1.169.0 and `router-generator` 1.168.0 are still what it pairs with, so router-rx-routes' fork (on rc.11's release commit) is on the same generator |
| `@tanstack/solid-start` | 2.0.0-rc.10, rc.11 | 2.0.0-rc.12 | builds: start-route no longer needs an install of its own (it had one because rc.11 did not build); it runs on the workspace's install |
| `@ui-sdk/core`, `@ui-sdk/solid` | 0.1.0-beta.13 | 0.1.0-beta.18 | `use-primitive.jsx` reworked inside (a part is subscribed when it is made and followed once settled, entries shared between users, an element made without `dynamic` on the client); `checkbox.jsx`: a checkbox in a group inside a field. Our bridge is its own implementation of the same contract, and the ported Checkbox has no field or group: nothing to follow. `app/test.mjs` 44 of 44 both sides, as before |
| `@wardic/dom`, `@wardic/solid` | 1.2.0, 2.0.1 | 1.3.1, 2.1.1 | a "stage" API (`stageWard`, `createBatchOnStage`, …) and more overloads (`ward` has 5 signatures): the whole draft 250 → 297 rows, 11 more questions; wardic-motion keeps `ward`, so its TODOs 2 → 3. The draft asks what it cannot prove, as it should |
| `@solid-primitives/animation` | 1.0.1 | 1.0.2 | the originals' tests (1.0.2's copies) 41 → 53 of 53; the rewrite's side 27 → 33 (its facade re-exports the parts not rewritten from the original) |
| `@solid-primitives/i18n`, `scheduled`, `sse`, `storage` | 3.0.0, 2.0.0, 1.0.0, 5.0.0 | 3.0.1, 2.0.1, 1.0.1, 5.0.1 | no test moved; drafts as below (storage also in rx-std and compiler/test/vite.mjs, with `utils` 7.0.1, which storage 5.0.1 needs) |
| `@lucide/solid` | 1.80.0 | 1.81.0 | nothing moved |
| `@tanstack/virtual-core` | 3.19.11 (compiler/test/vite.mjs: 3.13.13) | 3.19.13 | nothing moved |
| `effect` | 4.1.5 | 4.1.6 | nothing moved |
| `vite` | 8.3.8 | 8.4.0 | it wants Rolldown ~1.3.2 and installs its own beside ours (1.2.19) |
| `@codemirror/view` | 6.44.0 | 6.44.2 | nothing moved |
| `@solidjs/router` (compiler/test/vite.mjs) | 2.0.0 | 2.0.1 | the version everything else already had |
| `@tanstack/table-core` | 8.21.3 | stays | 9.3.1 removes `getCoreRowModel` and `getPaginationRowModel` (features registered with `tableFeatures`, `create…RowModel`, state in `@tanstack/store` atoms), and its Solid adapter `@tanstack/solid-table` 9.3.1 is still Solid 1 (`solid-js/web`, `createComputed`, `mergeProps`): moving means writing table-pagination's adapter and its declarations again |
| `graphql` | 16.15.0 | stays | 17.1.0 is outside the peer range of the one package that uses it (`@solid-primitives/graphql` 3.0.0: `^16.6.0`) |
| `@babel/core`, `@babel/preset-typescript`, `@solidjs/babel-plugin` 2.0.2 | rx-packages, rx-std | removed | the hydration harness compiles with the pinned `@solidjs/compiler` (below); Babel is still installed under `@solidjs/vite-plugin` 3.0.1 and TanStack's plugins, not by us |

### Kobalte from source

`ref/KOBALTE` holds the commit, as `ref/SOLID_NEXT` holds Solid's; `ref/scripts/kobalte.sh [--latest]` clones
kobaltedev/kobalte's `solid2` branch to `../kobalte` (beside `../solid-next`), checks the pin out, overrides `solid-js`,
`@solidjs/web`, `@solidjs/signals` and the compiler its build runs (`unplugin-solid`'s `@solidjs/compiler`) with links
to the pinned checkout in its `pnpm-workspace.yaml`, installs `@kobalte/core` and what it needs with pnpm, and builds
`@kobalte/utils` and `@kobalte/core`. Checked: every `solid-js`, `@solidjs/web`, `@solidjs/signals` and
`@solidjs/compiler` in Kobalte's tree is the pin's real path, and no npm Solid is in its store. `examples/rx-packages`
and `bench/package.json` link `../kobalte/packages/core` as they link Solid (npm makes the link and writes nothing in
Kobalte's tree); Kobalte's own dependencies resolve in its pnpm tree, and Solid from there is the same real path.
GitHub: `.github/actions/kobalte` builds or restores it after `solid-next`, in `bench.yml` and in `suites.yml`'s job
that installs the bench workspace; `scripts/ci`'s `bench-install` says what to run when `../kobalte` is not built.

### The ports against the newer originals

- **select** (#770): the listbox brought the focused option into view with `element.scrollIntoView({ block: "nearest" })`,
  which also scrolls the window; Kobalte now scrolls only the collection's own container. `dom.js` `scrollTo(view,
  element)` is Kobalte's `scrollIntoView` (from React Spectrum, Apache-2.0), and the listbox passes itself. #786's
  untracked reads have no counterpart in the port (an `.rx` read is tracked where the language says), and its test
  ("does not read options or the trigger ref untracked") passed on the rewrite before and after.
- **text-field and the form control** (#783): there is no text-field port (its tests run the original on both sides);
  `form.rx`'s label, description, error and field already fell back with `id ?? default`, so an explicit `undefined`
  id was already the default id. Nothing to change.
- **tabs** (#770's "does not scroll the page"): the port never scrolled; the test passed on the rewrite before and after.
- The headers say `@kobalte/core 2 (solid2, 9c237a06)`; `NOTICE`, `LICENSES.md`, `REPORT.md` the same.
- **DV-29** stays: Kobalte's popover, select and tooltip rewrites differ from the originals at the reopening step, and
  the rewrite's "controlled clear selection" still fails (47 of 58 as before). It is on the rewrite's path (its
  cleanup calls an action), not Kobalte's, so Kobalte's branch could not change it; `cleanup-action-write.mjs` still
  shows it on the pin (`action`: the last set misses; `plain` right).

### The hydration harness without Babel

`examples/{rx-packages,rx-std}/test-utils/hydration-harness.ts` (one file, two copies) compiled the fixture with
`@solidjs/babel-plugin` and Babel's TypeScript preset. Now: `transform(source, { filename, generate, hydratable: true })`
of the pinned `@solidjs/compiler`, then Oxc strips the types (`rolldown/utils` `transformSync`, `lang: "ts"`): the
compiler keeps TypeScript as written, as it does under Vite, where Oxc strips it after the plugin. (Vite's own
`transformWithOxc` cannot be imported in a jsdom worker: its `URL` is jsdom's.) `moduleName: "@solidjs/web"` is both
compilers' default (`DEFAULT_MODULE_NAME` in the compiler, `moduleName: "@solidjs/web"` in the Babel plugin's
defaults), so it is no longer written. rx-std lists `@solidjs/compiler` (the pin's) and `rolldown` itself now. Before
and after, every assertion of both projects compared by name, both modes: **nothing changed** in the hydration tests
(p-controlled-signal, p-event-listener, p-interaction, p-scroll; rx-std's pagination, form-control, resize-observer,
keyboard, media), and rx-std's summary is byte for byte the same.

### The benchmark's harness: TanStack Start on the workspace

`bench/tasks/start-route` had an install of its own because Start rc.11 did not build; on rc.12 the workspace's
install builds it, so its `package.json` and lock are gone and it runs Vite from the workspace. The other part of that
workaround in `scripts/lib/relink.mjs` (Solid's packages made external to the server build where a task's
`node_modules` is a link, because preserved paths gave its router two identities) is no longer needed:
router-rx-routes, the one task still with an install of its own, holds only the forked generator and plugin there,
and passes with `resolve.preserveSymlinks` (checked: router-rx-routes 4/9/17/16 and start-route 1/6/9/7/1, as the
scorecard). `linkedSolid` keeps `preserveSymlinks` alone.

### What the numbers moved (bench `--write`, uncached)

Every check of the scorecard and the coverage suite is as it was (good 44 of 44, types 188, runtime 282, bad 249,
unrepresentable 13; every coverage entry's counts the same). What moved is what the libraries' drafts say:

- tasks: wardic-motion's TODOs 2 → 3 (above); the whole drafts 4,893 → 4,984 rows (+47 ×2 for wardic, −3 for
  start-route's router, rc.10 → rc.12), `any` the libraries' own 643 → 625 (−8 ×2, −2), by place 414 → 383 (−16 ×2,
  +1), questions 1,436 → 1,457, words read 603 → 599 (wardic's 21 → 19, twice). `audit.txt`: start-route's router is
  read from the workspace's install.
- coverage: UI SDK beta.18 has one more prop in navigation-menu, segmented-control and tabs, and 7 more words proved in
  `overlays` (`inferred` 12 → 19, TODOs 129 → 128); `@wardic/solid` as above; animation 1.0.2 (`inferred` 1 → 13),
  storage 5.0.1, i18n 3.0.1 and wardic's gestures entry lose a TODO each. analytics, clipboard, fullscreen,
  geolocation, signal-builders, utils and video moved too (more words read, fewer TODOs) with no version changed:
  `coverage.json` was last written at a447fc7e, 146 commits before, and the ratchet fails only on an increase, so
  the generator's improvements since were never written. They are now.
- `examples/rx-packages/size.json` was last measured at 052c0ea2 (before the pin): Kobalte's JS grows by the scroll
  helper; the rest is the commits since (the runtime in `alone`, the UI SDK rewrites).
- rx-ui-sdk's `check/run.mjs`: its column for the original's drafts said `DECLARATION_VERSION` on every line (the drafts
  are `for @ui-sdk/solid ^0.1.0-beta.17`, which beta.13 is not); beta.18 is, and the column measures again: the good
  program accepted, 8 of 12 mistakes caught (not the four parts outside their root: a draft proves no context), three
  correct lines refused as drafted (a function of the state as children and as `render`, `VIEW_FN_MISPLACED`; a ref
  that writes state, `REACTIVE_WRITE_IN_OWNED_SCOPE`). REPORT.md's table (beta.17, before the view-function rules)
  had the drafts refuse two and take the `render` function; no checker changed here, and the drafts hold only proven
  words, so a JS component's function children are not known to be views. The rewrite's column is unchanged (12 of
  12, no correct line refused).

### Census

Before = 0b5221e7 (the pin, npm Kobalte, Babel in the harness); after = this tree.

| census | result |
| --- | --- |
| `examples/rx-packages`: `build.mjs`, `run.mjs` both ways, `live.mjs`, `check.mjs`, `size.mjs` | 65 built; client tests, by assertion: the originals 1,228 → 1,246 of 1,262 (Kobalte select, tabs, text-field, animation, above), the rewrites 1,073 → 1,083 (text-field and animation through the originals' parts); the server's 101 and 90 of 105 unchanged; no other assertion moved. live: switch's original warning gone, slider's attributed harness step agreed this run, nothing unattributed; `check.json` byte for byte |
| `examples/rx-std`: `build.mjs`, `run.sh` | `summary.mjs` byte for byte; every assertion of both modes, both sides, the same |
| `examples/rx-ui-sdk`: `build.mjs`, `check/run.mjs`, `app/test.mjs` | builds; the rewrite's column as before, the drafts' measured again (above); 44 of 44, original and rewrite |
| `std/test/browser.mjs` | 39 of 39 |
| bench `--check --strict`, then `--write` | as above: every check the same, the draft numbers moved by the libraries |
| `ref/oracle/repros/cleanup-action-write.mjs` (DV-29) | still shows it |
| the full `scripts/ci`, uncached, with the Vite plugin fork | 47 of 47 passed (596 s): scenarios in every runner, `proposals/check.mjs`, bench `--check --strict`, `t-start` on Start rc.12 (11 of 11), `t-wardic` on 2.1.1, `t-formisch`, `t-vite` (9 of 9, Vite 8.4.0), `t-vite-hosts` and `t-vite-watch` run. `t-vite-hosts`' two comparisons with npm's plugin skip in every ci run that names the fork (nothing installs npm's then, as on the earlier runs); run once after installing it as `vite.mjs` does: all 5 pass |

Nothing stricter dropped, nothing correct refused by the rewrites or the checkers (neither checker changed), nothing
accepted that a runner shows differently. **For the user to file:** no new upstream bug. DV-29 still reproduces
(`ref/oracle/repros/cleanup-action-write.mjs`), unchanged by Kobalte's branch, as are #5220 (X1), DV-26 and DV-28.

## Bench on GitHub vs local (2026-11-27)

The bench workflow failed on GitHub at 0b5221e7 (run 45920933851, all four jobs at "The benchmark, against
bench/scorecard.json…"), while the full `scripts/ci` was green on the same head here. On GitHub every draft read
nothing: "whole drafts: 0 words read", "0 proven by the generator", in all four jobs. That gives inferred words 0
everywhere, every word a question, and the hand-written words each a TODO. Examples: primitives-virtual inferred 4 →
0, questions 14 → 25; solid-use-primitives TODOs 1 → 6. It was not the pin: the bench workflow had failed this way on
every run since the generator moved to Rust (45778619880 onwards).

**Cause.** `bench.yml` never built `compiler/target/wasm32-unknown-unknown/release/rx_words.wasm`. That is the crate
(compiler/words) rx-declare reads a package's code with, and its toolchain step had no wasm32 target. The file is
gitignored. Without it, `src/rxc.js` `wordsPath()` throws, and `declare-infer.js` catches that as "the code could not
be read". The draft is still written: the types only, every word a question. Nothing failed loudly. `scripts/ci`'s
`wasm` step and `scripts/setup.sh` build it, so a local run always had it. Shown in a fresh GitHub-like setup
(`rx-gh.noindex`: new clones of the repository at a3d680dc, of solid-next at the pin and of Kobalte at ref/KOBALTE,
built only as `bench.yml` and its actions build them, `CI=1`, `bench/run.mjs primitives-virtual solid-use-primitives
--tasks-only --check --strict`):

| setup | words read | questions | --check |
| --- | --- | --- | --- |
| as `bench.yml` builds it | 0 | 34 | 12 problems, GitHub's exactly (primitives-virtual 7/6/0/2/3/25, solid-use-primitives 7/6/0/5/2/9) |
| the same, plus the two wasm builds | 493 | 16 | as the scorecard |

Nothing else differed: Solid, Kobalte, the runtime and the `npm ci` install resolved alike.

**A local leak too.** The bench cache (scripts/lib/cache.mjs) keeps a draft under the requests it made of the crate
(`RX_TRACE`). A `words` request that threw was not traced. So a draft made while the words build could not be loaded
(absent, or half written by a cargo build running beside it) was kept as though it depended on nothing. Later cached
runs got it back with the build in place. That is how a cached `bench/run.mjs primitives-virtual --check` here first
gave GitHub's numbers. It was right uncached, and the full `scripts/ci` is uncached, so 0b5221e7's green stands.
Checked both ways: a run with an invalid `RX_WORDS_WASM`, then a run with the real one. With the old `ask`, the second
run reused the empty draft (25 questions). With the fix it drafted again (14).

**Fix.**
- `bench.yml`: the toolchain gets `targets: wasm32-unknown-unknown`, and the crate step builds `cargo build --lib
  --release --target wasm32-unknown-unknown` and `cargo build -p rx-words --release --target wasm32-unknown-unknown`,
  as `scripts/ci` and `scripts/setup.sh` do. The language server then asks the crate in process on GitHub too, as it
  does here, not through `rxc serve`.
- `bench/run.mjs` and `bench/generated.mjs` refuse to start without the words build, naming the command
  (`needWords`, bench/harness.mjs). A missing build is no longer measured as the generator's result.
- `src/rxc.js` traces a request that throws, answered `null`. A result made without the build is never valid again
  once the build answers.
- bench/harness.mjs keys the crate's and the words' WebAssembly builds by the files `src/rxc.js` really loads
  (`wasmPath()`, `wordsPath()`, now exported). A copy bundled in `src/` (after `npm pack`) comes first there. Before,
  the key hashed `compiler/target` while the answers came from the copy.

**The scorecard.** Not changed. Its numbers are what the generator gives when it can read the code. The a3d680dc
rewrite (`--write`, uncached, the words build present) moved only what the library bumps moved: start-route's whole
draft 301 → 298 rows; wardic-motion and wardic-values 371 → 418 rows, inferred 21 → 19, questions 134 → 145,
wardic-motion's TODOs 2 → 3 (wardic 2.1's stage API and `ward`'s 5 signatures); and the coverage entries of the bumped
primitives, UI SDK beta.18 (`@ui-sdk/solid` inferred 12 → 19, `overlays` 0 → 7) and wardic. None of them went to the
0-words state GitHub showed. `bench/run.mjs --write` on the fixed tree (uncached, tasks and coverage) writes
bench/scorecard.json, scorecard.txt, coverage/coverage.json, coverage.txt and both audit.txt files byte for byte as
a3d680dc has them.

| check | result |
| --- | --- |
| the full `scripts/ci`, uncached, with the Vite plugin fork | 47 of 47 passed (588 s), bench `--check --strict` and `generated` among them, `t-vite-hosts` run |
| `bench/run.mjs --write` | no file changed |
| a missing words build (`RX_WORDS_WASM` absent) | `bench/run.mjs` and `bench/generated.mjs` exit 1 and name the build command |

## Outside review of 15db0404: findings and rulings (2026-11-27)

An outside reviewer checked the two days before 15db0404 (`rx-review.noindex/notes`: probes, logs, a README). Each
finding was reproduced on this tree first (`rx-fix.noindex/out/base`), then ruled and fixed. The probes — the
reviewer's 12 sets and eight of mine (`io2`, `io3`, `aw`, `aw2`, `kids`, `x15`, `launch`, `b10io`) — and every log are outside the tree, in
`rx-fix.noindex/probes`, `out` and `census`. Both checkers stay equal on every program below (`same`), and both
emitters print the same text (`lower`).

### The table

| | finding | ruling | change | census |
| --- | --- | --- | --- | --- |
| 1 | an io value is called while an equation computes (`(a > 2 ? fs[0] : fs[1])()`, `fs.at(0)()`, `pick(fs)()`, … 11 shapes new since 19171dc2, and the action form at the base too) | **R-io-3d: the fact follows the value, with a default.** A form the checkers read keeps the paths; any other form gives the value everything it was made from (`?`: somewhere in it). The callee of a call is read in whatever form it is written | both checkers, alike: `actionParts`/`parts_of` read every form of an expression (no `default: nothing`); `calledPaths`/`called_paths` the same for a fn's parameter (`calls(xs.?)`); a closure the module writes is read as a callee; a closure or a fn given beside an io value may be handed it. 04 R-io-3d, S-check-9 | the reviewer's `t1` (the 11 shapes) and `t1c` (18, the action form): every one refused, by both. Mine: `io2` 33 refused as named, 15 accepted and alike in every runner (one more is refused for a rule of its own, `UNSTABLE_LIST_IDENTITY`); `io3` (another module, through the signature) 6 refused, 3 accepted. Newly refused elsewhere: see *Census* |
| 2 | `await … catch (e) => "none" + t`: after `t := 5` compiled code shows `none0` | **R-f-4a (decision d): a `catch` answer is an expression of its reader.** It reads its sources where the `await` is read | the `await` is settled to its answer or to the failure it caught, marked (`__rt.settle`), a failure of computing its operand too; the reader computes the answer (`__rt.caught`), with no boundary of its own. The three runtimes, the oracle, both emitters, in both forms. 04 R-f-4a, S-fail-9 | `pin/catch-alt-reads`, `-eq`: every runner, served and hydrated. `f3` 21 and `f3b` 16: see 7 |
| 3 | a `ref` on an element made under a hold: the interpreter showed the write at once, with the old value | **Followed: Solid's rule** (#4767, kept by #5110). An element a hold makes is made with the hold's values; its `ref` reads them, and what it writes is the hold's | the interpreter calls such a `ref` with the staged values and joins its writes to the hold; one whose region the hold drops is never called. 02 SC-4c, S-hold-8 | `pin/ref-born-held`, `x6b/hold-born`, `-plain`, `-other`: every runner |
| 4 | `{...props}` gives undeclared children on in both emitters, not in the interpreter or the oracle | **The emitters are right: a spread is Solid's** (07 §4), and Solid's spread gives `children` on. W4's sentence said what the checkers do (nothing is refused), not what is shown | the interpreter and the oracle show the children a spread carries where the element writes none of its own. 03 RG-4c, 07 §4, S-region-9 | `w4/spread-all`, `w4b/spread-any`, `kids/spread-*` (5): every runner |
| 5 | W4 refuses correct code: a function given as children to an untyped component and called; `title={props.children}` of text | **Children nobody declares are a value where the module shows they are**: a component it does not export, that uses them as a value, every application of which gives a value (one `{…}`, text, nothing). Else W4 stands | the loader marks the component (`kidsValue`, as `named` on a fn), so both checkers and every runner share it; the givers hand such children as the value they are. 03 RG-4c, S-region-9, S-check-8 | `w4` and `kids`: the four the reviewer names accepted again and alike everywhere; markup given, or an exported component: refused as before |
| 6a | the oracle stores the function of a functional write to a path | a defect | `setPath` applies it | `pin/path-fn`, `x6b/store-path-fn*` |
| 6b | the emitters print a fn's local closure differently | a defect of the reference emitter (parentheses) | a closure that stands where its name was is parenthesised only where it is called | `t1` lowered 40 of 40 |
| 6c | a `ref`'s write at the mount beside an effect is an instant of its own | a defect | the `ref`s' writes fold into the mount's frame, the effect's are the next | `pin/ref-effect-mount` |
| 7 | older differences, interpreter against Solid | see *Finding 7* | | |

### Finding 1: why a default, and what it costs

The hole was not eleven shapes but one sentence of the old rule: "as far as their literals say". `actionParts` had a
`default: nothing`, so every form it did not list lost the fact. The fix turns the default over: the checkers now name
every form of an expression, and a form they do not read answers `?` — the value holds, somewhere, what it was made
from. A list of shapes cannot leak the next one, because the next one is `?`.

*Decided.* (a) `?` is a call too: `pick(fs)()`, `wrap(inc).f()`. The one exception is a method of plain data
(`total(rows).toFixed(1)`, `names.join(",")`): by name it is the data's own method, and where the path is known a
record's own field of that name is still followed (`{ map: inc }.map()` is refused, as before). (b) Giving on is never
refused by this rule — only a call. In the closure mode of B3 (where a statement closure may *go*) `?` refuses
nothing: `<button {...merge(base, { onClick: () => { … } })}>` must stay accepted, and B3's giver check is as it was.
(c) A spread of a record no longer forgets the fields written before it (`{ go: inc, ...rest }.go()` was accepted).
(d) What the module's text does not make — JavaScript's, a prop's, a context's, a source's — is its declaration's to
say, as before: a `?` there would refuse `table.getRowModel().rows.map(r => r.getValue("x"))` for a handler in the
table's options. (e) Higher order: a callee that is a closure the module writes (by a name, a field or an item of a
literal) is read for what it calls; a closure written among the arguments of a call of `.rx` may be handed the other
arguments (`each((h) => h(), inc)`), and a fn given there by name that calls its parameter may too.

*Not taken.* Refusing every call of a function the checker cannot read with an argument that holds io:
`{for row in rows { for col in cols { <td>{col.render(row)}</td> } }}` with handlers in the rows is ordinary table
code, and a `render` that is a closure of a literal is read anyway.

*Still open, and said* (04 R-io-3d): an expression closure kept in a record or a list and later handed an io value by a
fn that is only given both (`all([(h) => h()], inc)`), and a source that is written an io value. Both were open
before; neither is new.

*The signature.* A path may now be `*`, `?` or `()` (`{ *: io; … }`, `calls(xs.?)`): the two readers take them. No
word is added: both are derived marks of a printed signature, as `calls(…)` is.

### Finding 7: the older differences

| difference | whose | change |
| --- | --- | --- |
| two awaits in one reader; a nested await; `(await f(s)) + t` with `t` written during the hold; a reader's own `await` | ours: the interpreter evaluated an `await` that is not an equation's result inline in its reader, one flight after the other; 07 §3 says each is a flight of its own, and the compilers hoist them | the interpreter makes each a node of its own where it is first reached (`awaits.ts`, the same list the compilers read). A stale change group in the hold decision, found by `aw/eq-two` (a group's members were left open after it committed, and the next instant's fresh write was committed with it), fixed |
| `(await … catch …) + t`, `t` written during the hold: the interpreter showed it, compiled code held it | ours: the lowering made a boundary on every run of the reader | gone with 2 (no boundary) |
| `latest (A + n)` with `n` written during the hold | ours | `latest` of an expression reads each input's last answer where it is still asked (R-9) |
| `children: number[]` with `len(props.children)` over `{[1, n]}`: 0 in the interpreter, 5 in Solid | ours, both: the giver formatted the value as content (5 is the length of `[1,1]`, the text it was formatted to), the interpreter gave a view | a list, a record and a function type with no name that is not read are a value's type (`valueType`), and such children are given as the value: 2 everywhere. Stricter: a view given to a prop of such a type is now refused, as one given to `number` was |
| an `if` condition or a `for` list that reads a held value and a source written during the hold (`aw/if-await-t`, `aw2/if-plain-t`, `for-plain-t`) | **left**: Solid's condition is a computation and takes the write into the hold; the interpreter's is a display and shows it. A first fix broke two scenarios and was withdrawn | recorded here; not a Solid bug, not fixed |

### The four design decisions

- **a. DV-28 and SC-4c: split, and the rule restated on Solid's own principle.** Read: #4767 (a `ref` born into a
  hold), #4768 (deliberate: a `ref` runs in the pass that builds its element, "agreed with Ryan"), #5098, #5110 (the
  ruling of 2026-11-20: a `ref` reads the screen like an event handler; #4767's arm is kept). So "a regression in
  rc.22" was wrong for the rendered half. SC-4c now says what those four say: *a `ref` reads the values its element
  was made with* — the hold's for an element made under a hold (finding 3, followed), the screen for the elements one
  pass makes. DV-28a (rendered) is no longer called a bug: what is left is *which pass* makes a nested region, which
  in Solid depends on the kind of region and its place (a `<For>` row always after the writer; a `<Show>` after it
  only when written after it; `lowerShow` moves it). That is an order of Solid's compiler, not of the program, and the
  language does not transcribe it: stating it would make `if` and `for` differ for no reason a program can name.
  DV-28b (hydrated: a row reads the screen, a `<Show>` is rebuilt) stays Solid's bug. "No case left that differs with
  no Solid bug" is withdrawn. No advisory row: it would mark every `ref` that reads what another wrote, right on every
  runner in the four shapes that agree; the divergence and its memo say what to write instead. The X6 refusal stays gone.
- **b. Supported release: the peer is raised, and a job holds it.** `runtime/test.mjs` was run on npm's 2.0.4
  (`RX_SOLID_FROM`): it fails there — typed boundaries on the client pass every sent error on, a primitive is called
  tracked, cleanups run in another order. So `^2.0.4` was a wrong claim since the pin moved to Solid main. The peer is
  `>2.0.4`, and `runtime/npm.mjs` (the `runtime-npm` step, and the runtime workflow) runs the same test on npm's
  newest Solid: in the range, every check must pass; out of it, the test must fail there, or the job fails and says to
  lower the peer. It turns over by itself on the day Solid releases.
- **c. Use and re-export: one binding.** `import { A } from "./a.rx"` beside `export { A } from "./a.rx"` is accepted
  where both name one export of one module under one name (through a chain of re-exports too: the loaders resolve
  both to the declaring module). The emitters bound it twice (`Identifier 'V$A' has already been declared`) and the
  type projection imported it twice: both bind it once. Two names, or two modules, is still `DUPLICATE_DECLARATION`,
  and the message now says which two places.
- **d. A `catch` answer** is an expression of its reader (finding 2).

### After the merge of B10 (34c28a0b): the two items its step 9 left

- **Finding 1 covers an action that answers.** `(a > 2 ? mint : mint)()`, `(fs[5] ?? fs[0])()`, `fs.at(0)()`,
  `pick(fs)()`, `(a > 2 ? r : r).go()` with `mint` an action that answers (AC-1i), and the same with a plain action:
  all `ACTION_CALLED_IN_OWNED_SCOPE`, both checkers (`probes/b10io`, 9 refused; the same call in a handler accepted).
  An action is io whatever it answers, so the fact is the same fact.
- **X15, ruled and fixed (04 R-8a).** A run's read of a value that has never had one fails at its statement, as
  `latest` of it does (R-12; Solid's F-9: a node with no committed value has nothing to serve): what the run wrote
  before stands, a `try` takes it. A built app does not reach it (R-8's check, `UNGUARDED_SNAPSHOT`, is made when the
  crate compiles an app: a button outside the region that waits is refused there); the reference checker does not
  make that check and a scenario's handler row runs whatever is covered, so the runners could be driven there, and
  differed: the interpreter dropped the whole run, compiled code and the oracle put Solid's pending mark on the
  screen (`#pending!`). The three runtimes' `snapshot` and the
  oracle's no longer swallow the failure; the interpreter throws at the read. `pending? x` reads no value and is
  untouched (S-solid-28). S-await-3, `probes/x15`.
- **A counter in a declared action that launches a waiting one: refused** (`STALE_NEXT_READ`, 06 AC-1h). It was
  accepted and wrong: `action note() { let n = seq + 1; seq := n; save(n) }` held `seq` through two calls and
  minted one id twice (the oracle on the unchecked program: `0 / 0 / 0 / 1 a`). `runFindings`/`run_findings` read a
  launch in a declared action as in a plain run. S-infer-8, `probes/launch`.
- Not touched, as told: an imported action that never waits counted as outlasting (a word of `.d.rx`, the user's).

### The added scope (the research agent's three cases, `rx-review.noindex/solid-check`)

- **Portal programs of the 505: ours, in `ref/ssr/run.ts`.** (1) The expected server shell was the client's mount
  frame cut at ` » `; where what is under the portal reached a boundary outside it (`tw`, `tbad`, a held mount) the
  client's frame has no ` » ` and is not the shell. The shell is now the mount of the program with nothing in its
  portals (the interpreter, on the program with its portal bodies emptied): Solid's server skips a `<Portal>`'s
  subtree. (2) "asked again" counted every question the browser asked; it now counts those the server asked. A
  question first asked under a portal is the browser's own, and the late check takes the page over where the stream
  has ended and the landing is not the server's. (3) Found by the rerun: hydrating, Solid makes what is under a portal
  once hydration has settled, and a boundary outside the portal that has settled keeps its content, so until an
  answer lands the page is the shell (`t`) where a client render shows the boundary's fallback (`tw`): Solid's rule
  (its `portal-async-content` test), written into 03 PT-3, and the hydrated mount of a portal program may be its
  shell. The 14 then pass, served and hydrated, in both emitters. The portal and X14 attributions of those 14 programs in "Review sets
  on 3395c64e" and "F-3 followed" above are wrong and are corrected in place.
- **DV-21**: still Solid's on 50a4bfdde and 2.0.4; #4698 and #4699 closed as not planned on 2026-11-06 with no
  comment. In the memo (05); the ruled frames are kept.
- **DV-22**: the core fault still reproduces; the held-region symptom does not. In the memo (05).

### Census

Before = 15db0404 (`rx-review.noindex/rs`, the reviewed head, built on the same pin); after = this tree, with B10
merged (34c28a0b). `census/run.mjs` runs the review sets as "Review sets on 3395c64e" did (`scripts/matrix.mjs`, in
chunks of 400): the interpreter, the oracle, both emitters, both checkers alike, both lowerings, on both revisions;
the filled sets served and hydrated in both emitters, on this tree.

| census | result |
| --- | --- |
| the review sets: 72 folders, 18,798 programs, before → after | **nothing newly refused; nothing agreed that now differs.** 70 folders: every verdict the same. Moved: `p5_g-store-path`, in the 635 and in the 3,802 (one program, two copies): differ → agree (6a, the oracle's functional write to a path). Two programs every runner agrees on, before and after, show something else: `review-nameddata` and `second-nameddata` (`<Wrap>{0}</Wrap>` to `children: number`, `p.children ? 1 : 0`): `yes` → `no` in every runner — the children are the number 0 now, they were the text `"0"` (finding 7's row on value children; the frame written in the set records the old text). `same` and `lower`: all, both revisions (but the 22 of `o1f` whose frames the harness cannot read, as before) |
| the same, served and hydrated (the filled sets) | 24 folders, 6,185 programs: all served and hydrated alike in both emitters but three, each as before — `p3-err-aw-ifinner-app` (DV-26) and `v1-aw-loop-app`/`-part` (X14). **The 505's filled set: 333 of 333** (it was 319: the 14 portal programs, see *The added scope*). `o1f`: 107 of 107 readable (22 stopped, their frames have a `\|`, as before). Programs a set holds that the checkers refuse are refused as before (9 of the 979, 19 of `t1f`/`t2f`, 4 and 9 of the astra sets, 1 of `m1f`) |
| the reviewer's 12 sets and my 8, every runner, served and hydrated (`out/r5`) | `same` and `lower`: every program of every set. The findings' programs: 1 — `t1` 26 refused, `t1c` 18 of 18, `io2` 34 refused (33 mine and one for another rule) and 15 alike, `io3` 6 and 3, `b10io` 10 of 10; 2 — `f3b` 16 of 16 alike, `f3` 20 of 21; 3 — `pin` 5 of 6 alike; 4, 5 — `w4` 13 alike, `w4b` 4, `kids` 17 alike and 2 refused; 7 — `aw` 12 of 13, `aw2` 4 of 6, `t1b` 8 of 9; c — `m1` 8 alike. What still differs is listed under *Left* |
| scenarios (`scripts/quick`: both checkers and their parity, the interpreter, the oracle, both emitters, served and hydrated, the type pass, the crate's lowering and projection) | all; 7 new or changed: S-check-9, S-fail-9, S-hold-8, S-region-9, S-await-3 (new), S-check-8 (a variant gives markup now: with text it is accepted, and alike in every runner), S-module-50 and S-infer-8 (variants added) |
| `bench/run.mjs --check --strict`, `proposals/check.mjs` | as the scorecard; all verdicts as stated (the full ci below) |
| `examples/rx-packages`: `build.mjs`, `check.mjs` | 65 of 65 built; `check.json` unchanged byte for byte |
| `examples/rx-std`: `build.mjs`; `std/test/browser.mjs` | 13 built; 39 checks ok, none failed |
| `examples/rx-ui-sdk` | its sources build as `rx-packages/packages/ui-sdk` does (built); `build.mjs` here needs the UI SDK's own workspace beside it, which this worktree does not have: it compiled the four modules to the same JavaScript byte for byte (`dist/*.js` unchanged) and stopped at the declarations. `check/run.mjs` and `app/test.mjs` were not run |
| the runtime on npm (`runtime/npm.mjs`) | npm's solid-js is 2.0.4, outside `>2.0.4`; the test fails there (12 checks), as the range says |
| the full `scripts/ci`, uncached, with the Vite plugin fork (`SOLID_VITE_PLUGIN`), on the tree before this file's last edit | **48 of 48 passed**, nothing kept from before, no step skipped (478 s; `runtime-npm` is the new step) |

Strictness: nothing dropped. Raised: R-io-3d (finding 1), a view given to a prop typed a list, a record or a function
(finding 7), `STALE_NEXT_READ` in a declared action that launches (B10's item). Accepted again, each alike in every
runner: finding 5's programs, decision c's.

### Left, and said

- **A control reader that reads a held value and a source written during the hold** (`aw/if-await-t`, `aw2/if-plain-t`,
  `for-plain-t`): Solid holds the write, the interpreter shows it. Ours to fix in the interpreter; the first attempt
  broke S-ai2-search and S-app-users and was withdrawn.
- **R-io-3d's two open ends** (04): an expression closure kept in a record or a list and handed an io value by a fn
  that is only given both; a source that is written an io value. And what was open before: a prop or a context of a
  type that is not read, an io value given to JavaScript that calls it at once.
- **Children as a value across modules**: an exported component with no props type that uses its children as a value
  is refused (W4), with the message that asks for the type; only a component the module does not export is read with
  its callers.
- **Harness rows**: a scenario row that calls a module's fn, or an import's alias, by name is not found by the compiled
  harness (`t1/loc-in-handler`, `t1b/handler-oneline-fn`, `m1/both-paths`: "unbound area", "unbound inc2"). Not the
  language's; not fixed.
- **`f3/e-nested-errored`** (an `errored` inside an `errored`, a change beside the outer fallback): one instant —
  the interpreter shows the outer fallback an instant before compiled code does. Not in the review's list; not
  reduced.
- **`probes/x15`'s rows without a `try`**: every runner writes `n` and fails at the read; the compiled harness
  reports a row whose handler throws as an error, the interpreter's shows the frame. The harness's, as for `latest`.
- **`x6`, `x6b`**: the `ref` programs that differ are DV-28a (a nested region made in a later pass) and DV-27, each
  recorded; `pin/ref-asks` (a row's `ref` writes what a question reads) differs between the oracle and the emitters
  themselves at its last instant, not reduced. `eq/effect-store-input` (an effect whose input is a store, at the
  mount: the interpreter runs it an instant later) is older and not in the review's list: not fixed.
- **New Solid bugs**: none found. (DV-28b, DV-21, DV-22, DV-27 stand; their repros are where their memos say.)

## DV-21 closed: posture is the pass's (2026-11-27)

The user's decision: DV-21 is closed by following Solid, as F-3 was (DV-25). Solid closed solidjs/solid#4698 and #4699
not planned on 2026-11-06; the ruling they asked to build (#4695 decision 1, "posture is per read") is not what Solid
does, and the language now says what Solid does. Probes, logs and the census are outside the tree, in
`rx-fix.noindex/probes/dv21`, `dv21b`, `dv21rx`, `out/dv21`, `census2`.

### What Solid does (read at the pin, 50a4bfdde; the same on 2.0.4)

- **Pass-wide.** A node's verdict bit is set at the end of each pass from that pass's probes (`core.ts`, the config
  reset after `shadowSeatClose`: "a verdict reader is one only while it probes or reads a memo that does"). A pass that
  reads a held value plainly and then probes restarts as a reader ahead (`verdict.ts`, #4777: "its reads agree in
  either order"). So every held read of a pass that probes anywhere is served the screen, and the pass joins no hold
  (`seat.ts`, "D-25 pass-wide posture (S-49, S-50)", the expected/actual rows).
- **Carry-over, one pass.** The bit set by the last pass is the posture of the next pass from its start; at that
  pass's end it is set again from that pass's own probes (`seat.ts`, "D-25 carry-over (S-50)"). Probe `s50-inline`
  with a third write shows it ending: the second pass without a probe is the hold's work again (`m 2 k 1` at the
  `k := 2` instant, every runner).
- **Through an equation — not in the brief, found by the probes.** A pass that reads a memo whose bit is set reads
  ahead too (`core.ts` ~1905, the `_flags |= el._config & CONFIG_VERDICT` of a memo's read; a render effect re-run by
  one, `scheduler.ts` `laneDirty`). So the form the brief expected to give per-read results — the `latest` read in an
  equation of its own — gives Solid's frames, not the ruling's: `s49-split`, `s50-split`, `s27-split`, `view-split`
  are the same as their inline forms on the oracle and both emitters (and, after the change, the interpreter). Only
  two computations kept apart up to the screen give each read its own posture (`view-sep`, `eq-sep`, S-posture-1).
  This is followed (plain Solid's behaviour), and the advice says what does work.

### The change

| | before (98738e21) | now |
| --- | --- | --- |
| interpreter (`ref/src/runtime.ts`) | per read: a re-run of an *equation* that read its own probe's twin (`screenFor`) | a node's pass reads ahead when it probes (`latest`, `pending?`), reads a node whose last pass did, or its own last pass did (`lastProbes`, carried once per instant: `passInstant`); such a pass reads a held value as `committed` and takes no taint (`aheadOf`: a carried pass treats this instant's writes as held only where an open action holds the instant, since it is not settled again after the hold decision); a pass that probed after a plain held read runs again as a reader ahead, readers and `on` included; `onAhead` and the `loading` re-arm read the pass's posture |
| oracle, emitters, server | Solid's frames, recorded as DV-21 | unchanged (they are Solid); the four recorded rows are gone (oracle: 8 recorded divergences → 4) |
| scenarios | S-solid-27 v2 `x 1`, S-solid-49 `p1 c1`, S-solid-50 `m 2 k 0`, with `## Divergences (DV-21)` | Solid's frames, no divergence: `x 2`, `p1 [fallback]` (instants 3–4), `m 2 k 1`; S-solid-50 gets the one-pass variant; S-posture-1 (new): inline, own equation, kept apart, twin |
| spec | 04 R-11 "posture is per read", 05 H-6, H-7, the header, 00 V-12 | R-11 "posture is the pass's", with the history dependence and the reach through an equation; H-6, H-7, V-12, the 05 header; DV-21 a closed record like DV-25 (history kept); proposals/32 a section of its own; 99 the sixth advisory row |
| checkers | — | `PROBE_BESIDE_HELD_READ` (advice, rule R-11), both alike; nothing newly refused or accepted |

### The advice: `PROBE_BESIDE_HELD_READ`

A computation — an equation, or a reader (`{…}`, an attribute that is not a handler, an `if` condition, a `for` list,
`loading on`, `portal to`) — that

1. reads ahead: a `latest e` or `pending? e` outside closures and `peek`, or a plain read of a name whose rows hold
   `lane`; and
2. reads plainly (outside probes, closures, `peek`) a source or equation that can be held: a source an action's body
   writes with `:=`, a value whose rows hold `pending`, or an equation that reads such a value plainly;
3. not counting: a name the computation probes where the probe is always evaluated (not under a branch of `?:`, the
   right of `&&`/`||`/`??`, a `catch` answer) — `[pending? x, x]`; a name whose rows hold `lane` (its own computation
   is the one advised); a read under `pending? x ? … : e` (in `e`) or `pending? x || e` that can be held only through
   what `x` is held through (`bases`: the action-written sources and the values that await themselves).

Once per computation, on its line; the message names the probe, the read and why it can be held, says the program is
right, and says what to write for a per-read result (two computations apart up to the screen; for `on`, `on(filter)`).
Props, contexts and imports' values are not counted as holdable (the module cannot see their holds): a missed advice,
never a wrong one. The guard exemption (3, last clause) was added after the first sample: it flagged `examples/users.rx`'s
`status` (`pending? users ? "loading…" : …total…`, `total = len(users)`) and `examples/cart.rx`'s `disabled={pending? cart || count
=== 0}`, where the read is reached only once the probe said `false`, so no frame can differ.

### Census

Before = 98738e21 (`rx-fix.noindex/base98`, built on the same pin), after = this tree; `census2/run.mjs` as
"Outside review of 15db0404" ran it (`scripts/matrix.mjs` in chunks of 400): the interpreter, the oracle, both emitters,
both checkers alike, both lowerings, on both revisions; the filled sets served and hydrated in both emitters, on both
revisions this time.

| census | result |
| --- | --- |
| the review sets: 72 folders, 18,798 programs | **every verdict the same in every folder; nothing newly refused; no program every runner agrees on, before and after, shows something else.** `same` and `lower`: all, both revisions (but `op-o1f`'s 22 whose frames the harness cannot read, as before). No program of the sets has a DV-21 shape: their probes are in handlers (`let k = latest seq + 1`), or read props, view parameters and contexts, in a `{…}` of their own |
| served and hydrated: 24 folders, 6,185 programs | every verdict the same, both revisions |
| the advice over the review sets (the reference checker, every program and variant) | **0** of 18,776 files (15,461 programs accepted). Over the 238 scenarios: 6, all the DV-21 shapes and S-posture-1's (S-solid-27's variant, S-solid-49, S-solid-50 and its variant, S-posture-1's program and its own-equation variant) |
| `examples/`, `std/`, `bench/tasks` (1,670 `.rx`, `rxc check`) | 4, both checkers alike: `cart.rx:21` and `shop/main.rx:9` (`latest discount` beside `subtotal`, which a question and the cart feed), `cart.rx:71` (`orderError`, an action's write, behind `pending? cart`), `signup.rx:55` (`submitted`, an action's write, beside `valid`, which probes). Each names a value the module shows can be held, so none is false; in two of them the program happens to make no frame differ, which the row cannot see: in `cart.rx:71` the action that holds `orderError` also makes `pending? cart` true, and in `signup.rx:55` a held `submitted` is `false` on screen, so `submitted && …` is `false` either way. The first sample also flagged `users.rx`'s `status` and `cart.rx:70`; the guard clause removed them |
| probes (`probes/dv21`, `dv21b`: 22 programs × interpreter, oracle, both emitters, both servers) | all agree, after the interpreter change; before it, the four split forms differed (the interpreter alone) |
| scenarios (`scripts/quick`: both checkers and their parity, the interpreter, the oracle, both emitters, served and hydrated, the crate) | all; the oracle's recorded divergences 8 → 4 (DV-21's four rows) |
| `examples/rx-packages` `check.mjs` | `check.json` unchanged byte for byte; no advice row |
| the full `scripts/ci`, uncached, with the Vite plugin fork (`SOLID_VITE_PLUGIN`), on the tree before this file's last edit | **48 of 48 passed**, nothing kept from before, no step skipped (470 s) |

Strictness: nothing dropped, nothing refused anew; the change is frames of the interpreter (to Solid's) and one
advisory row.

### Left, and said

- The advice counts only what the module shows can be held. A prop, a context or an import's value is not counted
  (a missed advice, never a wrong one), and neither is a closure's read.
- `cart.rx:71`-like flags: the row cannot see that the action that holds the read also makes the probe true.
- Solid's own rule documents still say "S-49, S-50 ruled, not built"; the language follows the code and the closed
  issues. If Solid builds the ruling one day, DV-21 opens again the other way.

## The io gaps, the held control reader, and an author's findings (2026-11-27)

What a sceptic would push on before this is shown, and what a new author found building an app from the guide alone
(`rx-author.noindex/REPORT.md`, read only). Probes, logs and the census are outside the tree, in
`rx-fix.noindex/probes` (`gapa`, `gapb`, `gapx`, `refr`, `gwl`, `gwl2`, `asx`, `author`), `out` and `census3`. Both
checkers stay equal on every program below (`same`).

### The table

| | item | ruling | change | probes |
| --- | --- | --- | --- | --- |
| 1 | io gap A: an expression closure kept in a record or a list, handed an io value by a fn that is only given both (`all([(h) => h()], inc)`); the same closure reached by any form that is not read (`pick(cs)(inc)`, `cs.at(0)(inc)`, a row of a mapped list, across a module) | **R-io-3e: a second fact follows the value.** Where a value holds a *caller* — an expression closure or a fn that calls a path of what it is given — is read through every form `actionParts` reads, with the same `?` default; the path keeps what the caller calls (`0.render.!.go`). What a call hands on, no argument may hold as io where a caller it reaches calls it | both checkers alike: `actionParts`/`parts_of` in a second mode (`m2`), `calledPaths`/`called_paths` ask the scope around a body for the callers a callee holds, `ioGiven`/`io_given` checks what a call hands on (a fn, a closure the module writes, a callee no form says the inside of). The signature carries the fact (`{ 0.render.!.go: calls; … }`). 04 R-io-3e, 09 MO-9b, S-check-10 | `gapa`: 25 refused, each one throws `ACTION_CALLED_IN_OWNED_SCOPE` in the interpreter, the oracle and compiled code before the change (all were accepted); 8 accepted and alike. `gapx` (another module): 6 refused, 4 accepted |
| 2 | io gap B: a source that is written an io value, called while computing | **R-io-3f: a source holds what it is given.** Only its own block writes it (W-5), so the module shows every value: the initializer, each `:=` and `guess` (a function is applied, W-6), what a draft writes, what the module's calls give an action's parameter | both checkers: every write of a source is recorded in the walk; a source's facts are read once the walk is over (the memos are cleared before the deferred checks, and a row's or an item's facts are read then, not when its block is entered); a source is no longer opaque where every value it is given is the module's. An exported source's signature carries its parts. 04 R-io-3f, S-check-10 | `gapb`: 19 refused (17 threw in every runner before; two were a function written with `:=`, which is applied, W-6); 6 accepted and alike |
| 3 | an `if` condition or a `for` list that reads a held value and a source written during the hold (finding 7's leftover) | **Ours, in the interpreter: a control reader is a computation, not a display** (Solid's `<Show when>` and `<For each>` are memos). It is not served the committed value (H-3), so it waits with what it reads and the write joins the hold | `ref/src/runtime.ts`: the condition and the list are marked `control`, and D-3's serving skips them. Nothing else. The first attempt joined the write by hand after the read and broke S-ai2-search; this one changes what the read answers and breaks nothing. 05 H-3, S-hold-9 | `aw` 13 of 13 and `aw2` 7 of 7 alike in the interpreter, the oracle and both emitters (12 of 13, 4 of 6 before) |
| A | `refresh issues` where `issues = ans == null ? [] : ans` over `source ans = await … -> null`: accepted, re-asks nothing | **Refused, with the name to refresh.** AC-4 already said "any other target is `INVALID_REFRESH_TARGET`"; the checkers took every equation. Re-asking through the equation was not taken: Solid's `refresh` of a memo re-runs that memo, and which of several questions an equation reads it would re-ask is not the equation's to say | both checkers: an equation whose own expression asks nothing (no `await`, no context, no call the module's text does not show the inside of) is refused; the message names the questions it is computed from (`refresh ans`). 06 AC-4, guide (async §1, diagnostics), S-check-1 | `refr`: 4 refused, 3 accepted; the author's `refr.rx` |
| B | the fix `GUESS_WHILE_LOADING` suggests, `disabled={pending? detail}`, holds the whole click | **The suggestion changes; the cause is ours and is left, said.** Compiled code computes the changing attributes of one piece of markup in one render effect (Solid's JSX compiler merges them), so an attribute that probes makes its neighbours read ahead with it (R-11, the posture DV-21 closed on): beside `class={sel == it ? …}` a new selection waits and `loading on(sel)` shows no fallback. The interpreter and the oracle give each attribute a computation of its own, as the language says | both checkers: the message suggests the test where the click starts, `onClick={() => { if (!(pending? x)) { … } }}`, and that form is a cover of AC-3a (it was not: the check refused its own advice). Guide: the entry, its `after` program, and why `disabled={pending? x}` is for an element with no other changing attribute. The emitters are not changed: see *Left* | `gwl2`: the handler test accepted, the bare click refused. `gwl`: 3 of 6 differ (the interpreter and the oracle against both emitters), reduced: alone, or as a spread, the attribute agrees |
| C | `import { fetchIssues, Issue } from "./api.js"` with `Issue` written nowhere: a value import, `MISSING_EXPORT` in the bundle | **A name written nowhere is not imported**, as one written only in types is not (TypeScript leaves both out) | `typeOnly`/`type_only`, read by both emitters. 07 §1b | the author's shape compiles to a module with no import of `./api.js` |
| D | `x := e.target.value as T`: `ASSIGNMENT … .rx has no '='`; `pending? issues` outside a `loading` region: "a reader of …", and only the build says it | **`as` is not taken; the message says so.** An assertion claims a type no rule checked, and an expression carries no type (07 §2: types are text at declarations): taking it means type text in both expression grammars, both emitters and the projection, for a claim the checker cannot hold. **The build's mode is the build's**, and a tool is told it | both parsers' `hint` (a parse failure at `as`), both checkers (`as` unbound); `show` prints `pending? x`; `rx-tsc --rx-spa` and `"reactivescript": { "spa": true }` in the tsconfig make `rx-tsc` and the editor check as a client-only build does. 07 §1b, guide (language, diagnostics) | `asx` 3; the author's `cast.rx`, `pend.rx` |

### Gap A: why a second fact, and its one conservative arm

*Not taken: refusing every call of a function the checker cannot read with an argument that holds io* (ruled out in
"Outside review", finding 1: `col.render(row)` with handlers in the rows is table code). The fact makes that refusal
exact instead: the call is refused only where the callee's value holds a function that calls what it is given, at a
path the argument holds io. `render: (r) => r.label + "!"` calls nothing of `r`, so it is no caller, whatever the
rows hold and whatever form the columns went through (`cols.toReversed()`, a fn's result, an import).

*Decided.* (a) What a caller calls is kept in the path, so `(r) => r.label()` beside `{ label: f, go: inc }` is
accepted and `(r) => r.go()` refused. (b) A caller reached through a form that is not read (`?`) may be handed any
part of an argument: its called paths are matched against every end of the argument's paths, as R-io-3d's "may be
handed" was. (c) Handing on is transitive: a caller that is called may hand the other callers the call was given
whatever it was given. (d) A closure's own parameters hold nothing in the value's reading; what a call gives is added
there, as for io. (e) **The conservative arm:** a parameter nothing binds (a fn's; a closure's that no call beside it
gives a value), called with a value that holds io *by itself* — not another parameter — is refused where it is
written (`fn hand(f) => f(inc)`). Following it would need a third summary per fn (which paths of a parameter are
handed which io); its cost is measured below.

*Across modules.* An imported value's callers are its signature's (`calls` beside `io` in the parts). An imported
fn's `calls(…)` now includes what it gives to a caller of its own scope.

### Gap B: what a source is given

The source was "its declaration's to say" (R-io-3d (d)); but W-5 makes it the one reactive value whose every writer
the module shows. An updater's parameter is the source's value (read to a fixpoint; a write that keeps wrapping it,
`hs := p => [p]`, widens to "somewhere"). A function written without an updater is applied (W-6), so `h := inc`
gives the source what `inc` answers, and the type refuses it (TY-2): both readings are taken. An action's parameter
holds what the module's calls of the action give it; a call from outside the module (an exported action, a handler
prop) is that module's.

### Finding B: the same posture rule, in a unit the language does not have

`PROBE_BESIDE_HELD_READ` (DV-21 closed) advises on *a computation* that reads ahead and reads plainly a value that can
be held, and counts an attribute as a computation of its own — which it is in the interpreter and the oracle. In
compiled code the computation is wider: Solid's JSX compiler puts every changing attribute of one template in one
render effect (`_$effect(() => ({ e: class…, t: isPending(…) }), …)`), so `disabled={pending? detail}` on a button and
`class={sel == it ? "on" : "off"}` on its `<li>` are one pass, and the pass reads ahead: the row does not highlight and
the `loading on(sel)` region shows no fallback until the answer lands. It is the posture rule of R-11 exactly, applied
to a unit no program can name. `probes/gwl`: `busy`, `busy-lit`, `busy-wrap-lit` differ (interpreter and oracle
`12*wait`, both emitters `1*2one`); `busy-alone` (no other changing attribute) and `busy-spread` (the probe given as a
spread) agree. The advice did not fire, rightly by its own rule: `sel` is not a value that can be held.

*Decided now:* the checker stops leading authors there (the message, the guide's entry and its example), and the test
in the handler — which reads the verdict as it stands (R-12) and is no reader at all — is a cover of AC-3a.
*Not decided here:* which side gives. Either an attribute that reads ahead gets an effect of its own in both emitters
(a spread separates it from other elements' attributes but not from its own element's; an effect of its own needs a
runtime primitive in the three runtimes and a form for the server), or the element's attributes become one
computation in the language, the interpreter, the oracle and the advice. See *Left*.

### Census

Before = 64562a3b (`rx-fix.noindex/base98`, moved to it and built on the same pin), after = this tree. `census3/run.mjs`
as the two censuses above ran it (`scripts/matrix.mjs` in chunks of 400): the interpreter, the oracle, both emitters,
both checkers alike, both lowerings, on both revisions; the filled sets served and hydrated in both emitters, on both.
(The first run was cut after 22 chunks: the machine's `node` binary was overwritten by a process outside this work,
17:0x–17:11; it was run again from the chunks that had finished, none failed.)

| census | result |
| --- | --- |
| the review sets: 72 folders, 18,798 programs | **every verdict the same in every folder: nothing newly refused, nothing that agreed now differs, no program every runner agrees on shows something else.** `same` and `lower`: all, both revisions (but `op-o1f`'s 22 whose frames the harness cannot read, as before). So the conservative arm of R-io-3e (a parameter called with a value that holds io by itself), R-io-3f, and the `refresh` rule refuse no program of the sets |
| served and hydrated: 25 folders, 6,185 programs | every verdict the same, both revisions |
| the probe sets, before → after, six runners (`out/r6`): the reviewer's and mine of the two sections above (23 sets), and this section's seven | the 23: every verdict the same but `aw` 12 → 13 of 13 agree and `aw2` 5 → 7 of 7 (item 3). `gapa`: 24 differ → refused (25 refused, 8 agree). `gapb`: 17 differ → refused (19 refused, 5 agree; the one left, `ok-pure-fn-written`, writes a function with `:=`, which is applied, W-6: every runner fails "call of non-function", in its own words). `gapx`: 6 differ → refused, 4 agree. `gwl2`: the handler test accepted. `gwl`: 3 differ, as before (finding B). `same` and `lower`: every program, after |
| scenarios (`scripts/quick`) | all; new: S-check-10, S-hold-9; S-check-1 gets a variant |
| `examples/rx-packages` | `check.json` unchanged byte for byte. `build.mjs`: `p-upload` did not build **at 64562a3b already** (`STALE_NEXT_READ`, AC-1h in a declared action that launches, added in 98738e21, whose census reported 65 of 65 built before that rule). The refusal is right: `upload` read the committed `controllers` and would abort the upload before last; it reads `latest controllers` now, and every package builds |
| `bench/run.mjs --check --strict` (in the full ci) | as the scorecard: `bench/scorecard.txt` unchanged |
| the author's repros (`probes/author`) | `refr.rx` refused with the name to refresh; `pend.rx --spa` names `pending? issues`; `cast.rx` says `as`; an unused `Issue` import is not in the compiled module |
| the full `scripts/ci`, uncached, with the Vite plugin fork (`SOLID_VITE_PLUGIN`) | on the tree before this file's last edit: **48 of 48 passed**, nothing kept from before, no step skipped (421 s; 494 s on the run before the census) |

Strictness: nothing dropped. Raised: R-io-3e, R-io-3f, AC-4's equation that asks nothing. Accepted anew: the handler
test as a cover of AC-3a (it was refused, and is right on every runner).

### Left, and said

- **A probe among the changing attributes of one template** (finding B): compiled code differs from the interpreter
  and the oracle (`probes/gwl`). Ours, in both emitters or in the language's unit; not fixed. A prop that probes, read
  by a child beside another attribute, is the same case. Until then the guide says where `disabled={pending? x}` is
  safe, and the checker no longer suggests it.
- **R-io-3e's conservative arm**: a parameter nothing binds, called with a value that holds io by itself, is refused
  though its caller might give it a function that only keeps the value. No program of the sets, the examples, the
  bench or the packages is refused by it.
- **What is the declaration's, as before**: a prop or a context of a type that is not read, an io value given to
  JavaScript that calls it at once, a value JavaScript made that is written into a source.
- **`as`** is not in the language; the message says what to write. Taking it is a proposal of its own.
- **The build's mode**: the editor and `rx-tsc` check as a client-only build only where the tsconfig (or `--rx-spa`)
  says so; nothing reads Vite's configuration.
- **Not looked at** (the three unreduced differences of "Outside review"): `f3/e-nested-errored`,
  `eq/effect-store-input`; `pin/ref-asks` agrees on the six core runners here and was not read further.
- **New Solid bugs**: none found. Finding B is Solid's compiler doing what it documents (one effect per template).
- **Not ours, seen**: during the census the machine's `node` (mise 26.13.0) was a JSON size report for some minutes
  (`"mr: csr"`, `r-optimistic.js`, …), written by a process outside this work, and was a binary again at 17:11.

## Fix round after the hunts: an attribute that probes, and what the claims and apps hunts found (2026-11-27)

Decision B of "The io gaps…" (the user's: option 1), then the two hunts at 41142a46 (`rx-hunt.noindex/claims/REPORT.md`,
`rx-hunt.noindex/apps/REPORT.md`, read only). Their runners mostly agreed on the wrong behaviour, so each item has a
scenario that asserts the intended one. Probes and logs are outside the tree: `rx-fix.noindex/probes` (`gwl`, `gwl3`,
`gwl4`, `snr`, `rf`, `cat`, `cat2`, `lon`, `mut`, `h01`, `r1`, `r1m`, `c4`, `c7`, `c8`, `c9`, `fences.mjs`), `out/b`,
and the census in `census4`. The baseline is a worktree of 41142a46 (`rx-fix.noindex/base41`, built on the same pin).
Both checkers are equal on every program below (`same`), both emitters' modules are equal (`lower`).

### The table

| | item | ruling | change | scenario |
| --- | --- | --- | --- | --- |
| B | `disabled={pending? detail}` beside `class={sel == it …}`: compiled code held the click (Solid's JSX compiler computes one template's changing attributes in one effect, and the probe made the pass read ahead) | **R-11a: an attribute that reads ahead is a reader of its own in compiled code too** (the user's option 1) | both emitters: an attribute whose expression probes outside a closure and `peek`, or reads an equation, a source with a question or a fn whose expression does (`readsAhead`/`reads_ahead`), is `__rt.served(() => v)` where it was written and an entry of `__rt.own(ref, [name, () => v]…)`, the element's `ref`. The three runtimes: `own` makes one render effect per attribute **while the element is built** (Solid runs a ref as an effect's callback, where no primitive may be made — the first attempt, in the ref, threw `PRIMITIVE_IN_EFFECT_CALLBACK`), and sets it as a spread does (`assign`); a value that lands before the ref gives the element waits for it. `served` is the value on the server and nothing in the browser, so the page carries it and hydration keeps it (checked in Chromium, served `true` and `false`). Web's `effect` is transparent: no hydration id is taken. `GUESS_WHILE_LOADING` suggests `disabled={pending? x}` again (both checkers, guide) | S-posture-3 (`gwl` 6 of 6 and `gwl4` 8 of 8 agree on eight runners; 6 differed before) |
| C1, A4 | `ACTION_ANSWER_HELD`'s own suggested fix (`mint` reading `seq + 1`, then `send`) minted `a1` twice; so did `nextId = seq + 1` | **AC-1h reads through what the run calls and reads.** An action that settles as it returns writes in its caller's run (AC-1i), so the sources it writes computed from their own value are the caller's: each such action carries them (read to a fixpoint through the actions it calls), and a call adds them to the run wherever it stands (`add(bump())`). A read of an equation is a read of the sources it is computed from, at their paths (`b2 = s.b * 2` after `s.a := 1` is fine) | `infer.ts`/`infer.rs`: `staleOf`, `eqDeps`, `ownNextWrites`, `exprDeps`; the message says where (`(in mint, which this run calls)`, `(through nextId)`). The guide's `mint` reads `latest seq` | S-answer-2 (the `latest` form at run time, four refusals) |
| A6 | `count := count + 1; report(doubled)` sends the old `doubled` (STALE_OWN_READ misses the equation) | **Not refused: taken, then withdrawn.** Reading the equation as its sources (AC-1d) refused two correct Kobalte modules in `examples/rx-packages` (collapsible compares the new list with the old `picked`; radio reads `now` where it is the controlled prop): comparing with the value before a write, through an equation, is common and right | — | — |
| C2 | `refresh shown` over `shown = pick(ans)`; `refresh issues` over `source issues = ans == null ? [] : ans` | **Refused, naming `refresh ans`** (AC-4, as item A of the last round) | `asksItself`/`asks_in`: a call of a fn of the module asks where its body does; a parameter or a local of the body called there may be anything, and asks. A source with a question is read so **where nothing writes or guesses it** — over a write, `refresh` drops the override (S-store-4), which is what it is for there (the first version refused that too: a unit caught it) | S-refresh-catch |
| A3 | `refresh base` over `base = await f(id) catch (e) => 0` asked nothing, in compiled code and the oracle (`INVALID_REFRESH_TARGET`'s own "after"; a retry after a caught failure never recovered); the interpreter re-asked | **Ours, in the lowering**: the equation is an inner memo (the flight) read through a boundary; `refresh` re-ran the boundary | `catchMemo` takes the inner memo as its truth (`truthOf`, three runtimes, both emitters); the oracle's binding carries it | S-refresh-catch |
| C3, R3 | `source done = await f() -> "" catch (e) => ""` (STALE_CAPTURE's examples), `c ? 0 : (await f() catch …)`, a guess on an equation ending in `catch`: checked, then "`await` outside an equation's result position is not lowered yet" | **Lowered, every one**: only a plain equation's own result has the in-place form; every other caught await is hoisted and settled, as a nested one always was | `nonTailAwaits(…, rootCatch)` / `non_tail_awaits_in`, read by both emitters and the oracle (a question source, a guessed, keyed or deferred equation: `rootCatch = false`; a catch that is not the root: always). 19 shapes (`cat`) agree on eight runners, none compiled before; 16 more placements (`cat2`) all compile; every `rx after` fence of the guide that builds alone builds (`fences.mjs`; the rest are several modules or need a library's declarations) | S-catch-lowered |
| A1 | `loading on(id)` with `id = list[0]`: every re-ask of `list` (a poll, a quiet `refresh`) blanked the region in compiled code, though `id` did not change | **Solid's, deliberate, followed (H-6a)**: Solid's `Loading` documents "a source going pending" as a change of what `on` reads. The interpreter kept the content (AC-4's quiet substituted the old answer, so nothing downstream went pending) | `runtime.ts`: a region whose `on` reads, through what it is computed from, a `refresh` re-ask that is out (`reasked`, which outlives `quiet`) is armed, and a reader under it computed from that re-ask is caught. The guide: key the region on a value nothing re-asks | S-standing-write |
| A2 | `source id = list[0]` lost the user's pick on every re-ask that answered the same list; over a keyed list it stood | **ST-5a: a write stands until the question's value changes**, keyed or not (the guide's words, "resets when the server answer changes"); `refresh id` still drops it | interpreter (`overridden`, `lastAnswer`), oracle and `rt.ts`/`rt-web.ts` (`ref/compile/standing.ts`: the compute gives back the written value while the question's value is the one it had; a stream is its own) | S-standing-write |
| A5 | `fn sortedCopy(ys) => ys.sort(…)` over a source: accepted, the list shown unsorted | **W-1a through a fn**: a fn carries the parameters its body changes in place (a path of one, a name its body binds to one, another fn that does); a call giving one a reactive value is `MUTATION_IN_PLACE` | `mutatedParams`/`mutated_params`; a copy or a fresh array is accepted. A fn of another module is not read (its signature would carry it) | S-mutation-fn |
| C5 | `GUESS_WHILE_LOADING` missed a guess launched through another action | the click's bodies are the handler and every action reached by name from them | both checkers (the walk carries each body's scope) | S-guess-equation's new variant |
| R1 | two sibling `loading on(id)` regions over a source with a question refused (each `on(id)` counted outside the other) — correct code refused | a sibling region's own `on` over the same key re-arms with the same change: no outside read | both checkers | S-loading-siblings |
| C8 | `its => { ...its, name: n }`: a record to `rxc` and the build, four PARSE errors to `rx-tsc` | **the compiler's reading stands** (braces after `=>` are a block when they hold statements, a record otherwise); the editor's recovering parse kept what the failed block attempt noted | `parse.rs` drops the attempt's notes (a test); guide/language.md | — |
| R2 | computed keys `{ ...u, [r]: 0 }` are PARSE | **Not taken**: a key computed while the program runs is a field no rule can follow (paths, rows, io facts, the projection), and the change is a path write already (`guess unread[r] := 0`, accepted) | both parsers' `hint` says so, wherever the failure surfaces on the line; guide/language.md | — |
| C4 | a keyed equation torn by a filter switch during a guess, after one earlier add + refresh | **Solid's (DV-30, new)**; the interpreter's own tear (for a guess on any equation, even fresh) is ours: H-11's union was read for a source with a question only | `runtime.ts` (the union for any guessed node); spec/05 DV-30, `ref/oracle/repros/keyed-guess-refresh-tear.mjs` (plain signals; `fresh` holds) | S-guess-filter (oracle divergence at instants 6–8) |
| C6 | async.md: `pending? x` true while a refresh is out | the guide was wrong (AC-4: quiet) | guide | — |
| C7 | README's injected `./api` failed `vite build`'s type check (TS2307) | typed by an `api.d.ts` beside the module, which `rx-tsc` reads (checked: a typo in a field is TS2551) | README, guide/language.md | — |
| C9 | typing during a save launched at mount does not fire the effect until the save ends | **the language's, as Solid runs it**: the four runners hold the edit with the first save alike (`probes/c9`). Found beside it, left: the interpreter does not show the later saves' guesses that Solid shows (see *Left*) | — | — |
| docs | `createApp({ request })` with Node's request crashed inside Solid; a plain `Error` thrown on the server reaches the page as `Internal Server Error`; a control that submits a value still being checked | the server runtime refuses a non-Fetch `request`, saying how to make one; runtime/README says what crosses (declared classes) and why; reference.md: `disabled={pending? check}` | `rt-server.ts`, runtime/README, guide | — |

### Decided, and why

*B, where the effect is made.* Solid's compiled `ref` runs inside an effect's callback (`runRefCallback`), where making a
primitive throws in development. So `__rt.own(…)` makes its effects when it is evaluated — the JSX compiler hoists a
`ref` value into the render body (`var _ref$ = …`) — and returns the ref, which only records the element. The template's
own effect still sets the attribute from `__rt.served`, which is `undefined` in the browser: Solid's setters compare
with the previous value and leave it, so the served attribute survives hydration (checked with `disabled` served `true`).
A spread is not split (it is already an effect of its own), nor a handler. More attributes than Solid would count read
ahead (a read of an equation that probes only in a branch not taken) costs one effect; fewer would be wrong.

*C1 and A4, the counter's two hiding places.* The rule of AC-1h is about the read, and the run's reads include what an
action it calls reads while it settles in the run, and what an equation it reads is computed from. Both are read as the
direct form is (same paths, same exemptions: a probe, `peek`, a functional write that nothing beside it reads plainly).
AC-1d is not widened the same way: its read is this run's, and a run that compares its write with what an equation
showed before it (`next.length != picked.length`) is right — the rx-packages build refused two such modules, and the
widening was withdrawn. A6 stays a said gap.

*A1, followed and not bent.* It is not a bug: Solid lists "a source going pending" among what re-arms `on`, and its own
example says "a refetch of the same route keeps the page visible" only because the route does not go pending. The
interpreter is the language's model of Solid's rules (F-3), so it changes; the guide says how to keep the content.

*A2, the value's rule.* That a keyed list kept the pick was an accident of identity (its rows keep theirs, so nothing
recomputed). The guide's words are the rule, now for both.

*R2, not taken.* Every analysis that follows a value through a record keys it by name; a computed key would be `*` in
all of them, and refusals would follow from it in the checkers where the program is fine. The path write says the same
thing and every rule can follow it.

### Census

Before = 41142a46 (`rx-fix.noindex/base41`, built on the same pin), after = this tree with A6's widening still in
(withdrawn after: it refused nothing in the sets, so the verdicts stand). `census4/run.mjs` as `census3` ran it.

| census | result |
| --- | --- |
| the review sets: 72 folders, 18,798 programs; the filled ones served and hydrated in both emitters | **every verdict the same in all 97 matrices**: nothing newly refused, nothing that agreed now differs, no program every runner agrees on shows something else; `same` and `lower` as before (`op-o1f`'s 22 whose frames the harness cannot read, as before). The changes reach shapes the sets do not hold (the probes above) |
| the probe sets, before → after (`out/b`) | `gwl` 3 differ → 6 agree, `gwl4` 3 differ → 8 agree (R-11a); `snr` 7 accepted → refused (AC-1h; the `latest` forms, a functional write and a counter whose caller launches nothing stay accepted); `rf` 6 differ → agree, 3 → refused with the name to refresh; `cat` 19 not compiled → 19 agree on eight runners; `lon` 3 differ → agree (H-6a, A2); `mut` 4 → refused, 3 accepted alike; `r1m` refused → agree; `c4` 3 differ → 4 agree and DV-30 |
| `examples/rx-packages` | `check.json` unchanged byte for byte; `build.mjs`: every package builds (the A6 widening had refused Kobalte's collapsible and radio — withdrawn) |
| `bench/run.mjs --check --strict` (in the full ci) | `bench/scorecard.txt` unchanged |
| the full `scripts/ci`, uncached, with the Vite plugin fork (`SOLID_VITE_PLUGIN`) | first run 47 of 48: `leaks` — the app-level maps `refresh` reads (`resetOf`, and the catch boundaries now in `truthOf`) kept every unmounted instance; they are `WeakMap`s. Then **48 of 48 passed**, nothing kept from before, no step skipped (409 s); on the final tree (e22ff483, before this line): **48 of 48** (443 s) |

### Left, and said

- **A6**: a run's own write read through an equation reads the committed value, unrefused (withdrawn above).
- **A prop computed from a source and handed back through a child's handler** (`<Adder next={seq + 1} onAdd={n => {
  seq := n; add(n) }} />`, the apps hunt's `pk5`): AC-1h does not see that the child passes one prop to the other.
  Reading it needs a summary of what a component's handlers give its function props.
- **C9's neighbour**: `effect (draft) { save($0) }` with a guess in `save`, typed twice while the first save is out
  (`probes/c9`): the interpreter shows `ab/a`, `abc/a` where Solid (oracle, both emitters) shows `ab/ab`, `abc/abc` — the
  later saves' guesses. Not reduced.
- **`pending? (await f(x))`** written inline (`probes/cat2/pending`): the interpreter says `true` at the first load, Solid
  shows the region's fallback. An odd program; not reduced.
- **A probing prop read by a child's attribute beside another** (R-11a's limit): the child cannot see that the prop
  probes. Advice is the remedy there.
- **A fn of another module** that changes its parameter in place: its signature does not carry the parameters yet.
- **New Solid bug: DV-30** (`ref/oracle/repros/keyed-guess-refresh-tear.mjs`). The user's to file; nothing drafted.

## Pin moved to Solid main 510bb8d01 (2026-11-28)

`ref/SOLID_NEXT` moves from 50a4bfdde to 510bb8d01 (Solid main, nine commits). Built fresh at `rx-pin2.noindex/solid-next`
with `ref/scripts/solid-next.sh` (signals, solid, web, universal and their types; the native compiler, whose package
did not change, so `compiler/Cargo.toml`'s crate pin stays). Kobalte stays at 9c237a06, rebuilt against the new pin
(`rx-pin2.noindex/kobalte`: its tree links Solid by real path, so the old build would have put the old Solid beside the
new one). The old pin, `rx-pin.noindex/solid-next`, is untouched and was the "before" of every comparison below
(`rx-pin2.noindex/old/rs`: a worktree of 4f981418 built on it). Logs: `rx-pin2.noindex/logs`, census
`rx-pin2.noindex/census`.

| Solid commit | what | for us |
| --- | --- | --- |
| 510bb8d01 #5222 | keyed reconcile keeps a matched row's proxy when nothing subscribed (issue #5220) | **X1 fixed**: `ref/compile/keyed.ts` deleted, a keyed write is `reconcile(v, key)` again |
| f7b6b9c45 #5236 | a landed transaction stops being the flush's (issue #5233) | **DV-29 fixed** |
| cc4b6cf80 #5235 | a ref's read during hydration no longer rebuilds the served element (issue #5232) | **DV-28b fixed** (DV-28a, rendered, is Solid's rule and stays) |
| 91260dc2d #5225 | `Errored` draws its fallback in the shell when a nested `Loading` fails before it | **DV-26, half**: the before-shell case; the after-shell case stays open (#5237, issue #5223) |
| a3df43a7f #5244 | a cleanup's writes judged by the phase it belongs to (dev only) | a deliberate rule; one fix of ours in the UI SDK rewrite's JS bridge, below |
| e0f2ad46c, 01ecce025, bcbb86fbd, 34485971a | createRoot perf, dynamic spread effect names, a test gate, size records | nothing |

### Repros, old pin → new pin

Every file in `ref/oracle/repros` with each mode its header lists (`repros-{old,new}.txt`), the `ms` and optional-mode
ones by hand (`byhand.txt`, `dv26-{old,new}.txt`), and the drafts' repros for X1 and DV-28b (read only, run with each
checkout).

| DV | repro | 50a4bfdde | 510bb8d01 |
| --- | --- | --- | --- |
| X1 | `drafts/1-reconcile-kept-row/repro.mjs none` | rows made again 2 of 2 | **0 of 2: fixed** |
| DV-29 | `cleanup-action-write.mjs action` | `… set(false) T` | **`F T F T F`: fixed** |
| DV-28b | `drafts/5-…/minimal/run.mjs main` (+ `standalone/app.jsx`), `SOLID_CHECKOUT` | ref called twice, served node detached | **once, served node kept: fixed** (the ref reads the served value, rc.21's behaviour) |
| DV-26 | `w3-error-through-a-part.mjs part\|prop 1` (before the shell) | `<b></b>` | **`<p>bad: no</p>`: fixed** |
| DV-26 | the same, `ms` 200 (after the shell; what S-server-7 shows) | `<template id="100" e></template>` | **unchanged: open** |
| DV-30 | `keyed-guess-refresh-tear.mjs`, `dv30-refresh-then-guess.mjs` (new, below) | torn | **unchanged: open** (npm 2.0.4 too) |
| DV-19 store form | `dv19-latest-reask.mjs` | `latest=3` | unchanged (#5234 open, PR #5238) |
| DV-21, DV-22, DV-10, DV-27 and every fixed DV | their repros | as ruled / as recorded | unchanged |

### What we carried for them, and what was removed

- **X1**: `ref/compile/keyed.ts` (`keyedWrite`, the runtime's own pass that reconciled each kept row into its proxy) is
  deleted; `rt-web.ts`, `rt.ts` and the oracle's `lower.ts` call Solid's `reconcile(v, key)` for a write and for what
  an updater answers. S-store-kept-row passes in the oracle and compiled code; the same lowering on the old pin fails
  it (`made` twice at instants 1–3), so the scenario and `compiler/test/rows.mjs` hold Solid to it. proposals/32 and
  bug 45, the scenario's text and the runtime workflow's path list say so. The published runtime keeps its peer
  `>2.0.4`, which already leaves out 2.0.4 (which has X1); `runtime/npm.mjs` still finds 2.0.4 failing.
- **DV-29**: S-effect-cleanup-action's `oracle` row removed (every runner shows `Tt`); `examples/rx-packages`'
  `causes.json` loses its three DV-29 entries: Kobalte's popover, select and tooltip rewrites now agree with the
  originals at every step (`live.mjs`: 5/5, 6/6, 7/7, client and hydrated), and the rewrite's select test "controlled
  clear selection" passes (47 → 48 of 58). spec/05 DV-29 says fixed on main 510bb8d01, not in a release.
- **DV-28b**: S-server-8's two `hydrated` rows removed: hydrated is `a000bc12`, the language's frame (SC-4c). The
  `oracle` rows (DV-28a, a client render's order of passes) stay. spec/10, spec/02 SC-4c, spec/07, the scenario.
- **DV-26**: nothing removed — S-server-7's `server` row is the after-shell case, still open, and the census' served
  misses (`p3-err-aw-ifinner-app`) are the same. spec/10's memo says which half is fixed.
- No workaround in the language or the checkers existed for any of them (nothing was ever refused or bent for them).

### DV-30 reduced (the user's reduction, in this round)

`ref/oracle/repros/dv30-refresh-then-guess.mjs`: `createOptimisticStore(async () => call(filter()), [])` with no key,
one plain `refresh(todos)` that lands, then an action that guesses and awaits: `setFilter("open")` shows `open | a,z`
where H-11 says `all | a,z`. `norefresh` holds, `createOptimistic` holds, an unrelated write between the steps hides
it. Torn on 50a4bfdde, 510bb8d01 and npm 2.0.4 (run here). DV-30's title is no longer about a keyed store (spec/05,
S-guess-filter, the repros README); the scenario's `oracle` rows stay. Still the user's to file; nothing drafted.

### #5244 and the UI SDK rewrite: ours, fixed

`examples/rx-ui-sdk/app/test.mjs`: the rewrite 44 → 30 of 44 on the new pin (the original 44), every failure
`REACTIVE_WRITE_IN_OWNED_SCOPE` in tabs and dialogs; with Solid's links swapped back to 50a4bfdde, the same tree passes
44. The stack: the rewrite's JS bridge (`src/bridge.js` `binder`) let go of a part in an `onCleanup` of the part's
body; core's unregister (`registerPanel`'s return) sets its store, whose listener is the `.rx` part's (`listen`), which
writes `tick`. #5244 is deliberate and asked for by the maintainer: an `onCleanup` of a component or memo that writes
is owned, wherever teardown runs it; an effect's returned cleanup (or `onSettled(() => () => …)`) may write. The
original passes because its ticks are `ownedWrite` signals. So the bridge, which is JS, follows Solid: it lets go in
`onSettled`'s returned cleanup, and in `onCleanup` only for a part torn down before it settled. 44 of 44 on both pins;
`check/run.mjs`'s table unchanged. No `.rx` program meets it: the language lowers an effect's cleanup to Solid's
returned cleanup (S-effect-cleanup-action, EF-5), and every scenario runner and the census are unchanged.

### Census, old pin → new pin

| census | result |
| --- | --- |
| scenarios on the new pin (interpreter, oracle, compiled, served and hydrated) | before the records were removed: oracle and compiled 260 of 261, the one failure S-effect-cleanup-action's DV-29 row (Solid now right); served 261 of 261. After: as the full ci below |
| the review sets, `census/run.mjs` (as census4): 72 folders, 18,798 programs; the filled ones served and hydrated in both emitters; before = 4f981418 on 50a4bfdde, after = this tree on 510bb8d01 | **every verdict the same in all 97 matrices** (24,891 verdicts, "0 agree in both and show something else" in each), `same` and `lower` as before (`op-o1f`'s 22 as before); the served misses the same (DV-26's after-shell, X14) |
| `examples/rx-packages`: `build.mjs`, `run.mjs` both ways, `live.mjs`, `check.mjs` | builds; the tests by file the same but Kobalte select's rewrite 47 → 48 of 58 (DV-29); live: popover, select, tooltip agree (DV-29), slider's attributed timing step varied (2/5, its cause in `causes.json`), nothing unattributed; `check.json` unchanged |
| `examples/rx-std`: `build.mjs`, `run.sh`; `std/test/browser.mjs` | builds; as before; 39 of 39 |
| `examples/rx-ui-sdk`: `build.mjs`, `check/run.mjs`, `app/test.mjs` | builds; the check table unchanged; 44 of 44 both sides after the bridge fix (above) |
| the full `scripts/ci`, uncached, with the Vite plugin fork (all 14 cores) | first run 47 of 48: `spec-refs` (S-server-8 named DV-28's halves as ids no chapter defines; reworded). Then **48 of 48 passed**, nothing kept from before, no step skipped (600 s): oracle, compiled and served 261 of 261 each; `rows`, `bench --check --strict`, `proposals/check.mjs` pass; `runtime-npm`: npm 2.0.4 is outside `>2.0.4` and fails 24 checks of `test.mjs`, the same 24 as the last ci on 50a4bfdde, so the peer stays |

Nothing stricter dropped, nothing correct refused, neither checker changed; every runner agrees as before. The only
code change is a removal (X1's workaround) and the UI SDK bridge following #5244.

**Open on Solid's side** (nothing posted): DV-26's after-shell case (#5223, fix PR #5237 open); DV-30 (reduced here, the
user's to file); DV-19's store form (#5234, PR #5238); #5239 and #5240 (filed by the user; no scenario of ours meets
them); DV-21 and DV-22 rulings as recorded. Fixed on main and not in a release yet: X1, DV-29, DV-28b, DV-26's
before-shell case — 2.0.4 still has all four. No new Solid bug from the nine commits.

## The unreduced runner differences, and server functions in Vite (2026-11-28)

On 061fb6ca (pin: Solid main 510bb8d01). Two parts: the three differences "Outside review" left unreduced
(`f3/e-nested-errored`, `eq/effect-store-input`, `pin/ref-asks`), then the server hunt's findings
(rx-hunt.noindex/server/REPORT.md: A1–A4, C1, C3; B1 left, the user's decision). Probes, logs and the census are outside
the tree, in `rx-fix.noindex/probes/{red,red2,red3}`, `out/red`, `census5`, `hunt-a`.

### The three differences: each ours, none Solid's

- **`f3/e-nested-errored` — the interpreter (ours).** Reduced to one boundary (S-hold-10): `B` rejects while the change
  that asked it (`s := 2`) still waits for `A`, read in the same region. Every Solid runner stages the rejection with
  its frame and shows `2ERR` when `A` lands (H-12: "a held rejection is staged like a value and reveals with its
  frame"); the interpreter showed it an instant early. Its settle took a boundary whose fallback was only staged (the
  failure caught this pass, nothing committed) as "behind a shown error fallback" (H-4), so `A`'s pending read stopped
  holding the change in the next pass of the same instant. Fixed: behind a fallback means behind one that is the
  display (`erroredShowing` asks the committed fallback too, `ref/src/runtime.ts`). H-12 says so.
- **`eq/effect-store-input` — the comparison (ours, no runner wrong).** The oracle and both emitters make a row and the
  `(effect)` row after it one step (EF-8, `ref/oracle/run.ts`), so they report 4 frames where the interpreter reports 7;
  every frame they both report is equal (all six runners pass the probe with its frames written). `scripts/matrix.mjs`
  compared the lists without their instants. It now compares the instants every core runner reports (a passed one
  counts), and takes a server frame equal to the mount's (the interpreter's instant 0, before the effect) as agreeing.
- **`pin/ref-asks` — the oracle's harness (ours).** On the pin, `pin/ref-asks` agrees in all six runners (interpreter,
  oracle, both emitters, served and hydrated in both); its written frames were wrong. The difference is `x6b/ref-asks`'s
  form: its two `resolve A` rows land one flight twice. The oracle handed a plain tail `await`'s flight to Solid as the
  flight itself, an async iterable, so Solid took the second landing as a stream's (`a1`); compiled code and the
  interpreter take one answer (`a0`). A plain `await` has one answer (only `await*` streams, ST-6): the oracle now
  returns `flight.first` there, as compiled code's `__rt.awaited` does (`ref/oracle/lower.ts` `computeOf`). S-hold-11.

No Solid repro, no DV: none is Solid's.

### Server functions in Vite (the hunt's A1–A4)

- **A1, a server fn shipped to the browser (ours: the front end).** Solid's plugin runs its server-function pass only
  with `solid({ serverFunctions: true })`, and a front end is not told the plugin's options (npm 3.0.1 has no
  `context.resolve`). So each `server fn` body in a browser build now carries two references to files that do not
  exist, which the pass removes with the body: a worker URL (a build resolves it while it transforms the module, and
  fails there, before anything is written) and a dynamic import (the dev server refuses to serve the module). The
  missing file's name names the fn, its file and the option. A first try with a dynamic import alone failed the build
  only after `dist/client` was written, the body and the database module in it; a glob import only warned. Docs:
  README, guide/libraries.md (start mode with `serverFunctions: true`), compiler/README, spec/12 SF-7a.
  `examples/notes` (compiler/test/vite.mjs) turns the pass on: its calls are requests, its region shows their failure.
- **A2, a request ran in a borrowed app (ours: the runtime).** The body reads `globalThis.__rx_app`. It was set by
  whichever render last called a server fn, or never. Now the server runtime answers it per request (`serverApp`): the
  caller's app while a call in place is on the stack, else the request event's (Solid's handler runs each request in an
  event of its own, `pageApp` makes it its app). Outside both, nothing. In Vite's server build the body imports
  `serverApp` from `@reactivescript/runtime/server` itself, so a client-only app's server, which renders nothing, has
  the runtime. `ref/ssr/run.ts` no longer sets the global: it hands the request its app in the event, as an
  integration would. `runtime/test.mjs`: two concurrent requests each keep their own app across awaits; none outside.
- **A3, failures across the wire (ours: the runtime and both emitters).** `serverCall` passed only `.rx` classes:
  a JS class its `.d.rx` declares (`export error NotFound`) now crosses as itself (`markSendable`), and a server fn's
  body registers its module's declared JS classes (both emitters), so a request that renders nothing knows them. The
  dev-only miss of an `.rx` class by a typed `catch` was its wire id, `Name#<counter>`, a count per app of the classes
  made so far, which the two sides need not agree on. A module's error class is now known by its declaration, the
  module's package-relative path and its name (both loaders and both emitters). Two modules that would be named alike
  are refused (`DUPLICATE_WIRE_ID`, as for `.d.rx`); no program of the census meets it.
- **A4, a `Date` in a result (ours: the runtime).** `WIRE_VALUE` is now sent as it is and printed on the server, in a
  production build as in a development one (it was an anonymous 500, nothing logged). Not done: refusing it
  statically. The two checkers do not read TypeScript's types, and rx-tsc's projection would have to refuse a `Date`
  without refusing a value it cannot type. SF-6a says so.
- **C1, C3 (docs).** guide/libraries.md: `refresh` over a router `query` is answered by its cache; `revalidate(key)`
  asks again. runtime/README: what crosses, alike in dev and prod.
- **Test:** `compiler/test/server-fns.mjs` (ci step `server-fns`, and in the workflow), 25 checks. Start mode in the
  bench's workspace (npm's plugin 3.0.1), pass off: the build fails with the message and writes nothing for the
  browser, and the dev server refuses the module. Pass on: no body and no server-only data in the client's files. On a
  fresh server, a page reached by a link asks and acts over the wire. The JS and `.rx` classes reach typed boundaries
  and typed catches, served, over the wire, in production and under the dev server. A `Date` is named in both. A
  client-only app's server fn is answered under the dev server.

### Found, not decided

- **A typed boundary on its fallback when the failure changes class after a pending answer** (found by the test above,
  `probes/red3/nest-class.md`). `errored(e) { errored(e: NotFound) { errored(e: TooLong) { u } } }`, `u` NotFound, then
  a change whose answer makes it TooLong. The interpreter shows `TooLong` (R-f-4: the boundary re-decides). The oracle
  and both emitters keep the stale `NotFound: no user 9` until a value lands. The synchronous form agrees everywhere.
  Plain Solid (`ref/oracle/repros/dv31-rethrow-then-caught.mjs`, with modes for async, a later answer, `<Errored>` with
  the fallback's memo, a derived memo, three levels, the read in a render effect) recovers in every form tried. So it
  is not shown to be Solid's. The two lowerings that agree are separate code over the same Solid, and the difference is
  not reduced further. The test reaches `/e/long` from a page that shows no failure. (Decided in the next section: Solid's, DV-31.)
- **`runtime-resolve`'s "hoisted" dev server** misses its first click on a loaded machine (`button.counter` not found
  for 30 s right after load). On 061fb6ca itself 1 of 3 runs, the same with this tree's runtime, front end or binding
  swapped back. Not this change's, not fixed. (Fixed in the next section: the dev server's watcher.)

### Census and ci

| census | result |
| --- | --- |
| the review sets (`census5/run.mjs`, as census4): 72 folders, 18,798 programs, 6,185 served and hydrated in both emitters; before = 061fb6ca (`rx-fix.noindex/base061`), after = this tree | **every verdict the same in all 97 matrices** (agree 20,996, refused 3,729, differ 103, same error 82, stopped 63, not compiled 7, server differs 3, before and after alike); "0 agree in both and show something else" in each; `same` and `lower` as before (`op-o1f`'s 22 stopped) |
| the full `scripts/ci`, uncached, with the Vite plugin fork (8 cores: another agent's Chromium) | first run 47 of 49: `t-vite` (`examples/notes` without the pass, refused by A1: the test turns it on now) and `runtime-resolve` (the flake above). Then **49 of 49 passed**, nothing kept from before, no step skipped (656 s), `server-fns` among them |

Strictness: nothing dropped. Raised: a module with a `server fn` built without Solid's server-function pass fails
(it shipped its body). `DUPLICATE_WIRE_ID` covers a module's error classes (no program of the sets meets it). Nothing
correct newly refused (every census verdict as before). Both checkers changed alike (the module's wire id, in both
loaders), and every runner agrees as before on the sets. **New Solid bugs: none.**

## The nest-class difference is Solid's (DV-31), and runtime-resolve's flake is the watcher (2026-11-28)

Both items "found, not decided" in the section above.

- **Nested typed boundaries after a pending answer: Solid's, DV-31 (new, open).** The two lowerings agreed because
  both lower a typed boundary to the same plain Solid: `<Errored>`, whose fallback throws another class (R-f-4). The
  program was reduced over the test renderer with ReactiveScript taken out piece by piece, and it stayed stuck. It
  was stuck in plain `@solidjs/signals` once the inner boundary was made *inside* the outer one's content and handed
  out unread, as JSX nests `<Errored>`. `dv31-rethrow-then-caught.mjs` has that as `own`: `async own effect` is
  `STUCK` and `sync own effect`, `async effect` and `async own` are ok. The same on main 510bb8d01 and npm 2.0.4. The
  repro's earlier modes all read the inner boundary eagerly in the outer's content, which hides it: that was the
  ground for "not shown to be Solid's". The rule is unchanged: R-f-4 re-decides on a change of class, after a pending
  answer too (04 R-f-4 names S-fail-10). Not worked around. DV-7's old lowering (the failure handed out of the
  fallback, a memo around the boundary throwing it) would change every typed boundary's structure to hide one bug
  (solid-bugs rule: a DV and a memo). *Memo:* the user's to file. spec/05 DV-31, repros/README.
- **DV-31's cause, traced (re-checked on a second run).** In an instrumented copy of the pin's `dist/dev.js` (the
  pin untouched), the render effect that goes pending while the outer boundary shows its fallback is recorded at
  the outer boundary (D-38). Its `TooLong` is caught by the inner boundary, and the outer is never told. The outer's
  `prune` keeps any errored reader, even one whose error a boundary below it holds. So a pending phase anywhere in
  between is enough. The candidate fix is `caughtBelow`'s counterpart for errors (repros/README). On the patched
  copy, loaded through a resolve hook, the oracle runs S-fail-10 to its spec frames, and the other 263 scenarios are
  unchanged. That confirms the lowering is right and the bug is Solid's. (A first re-run here seemed to clear Solid:
  zsh does not split an unquoted `$a`, so `async own effect` reached the repro as one unknown mode.)
- **S-fail-10 (new)**: the three forms of the probe. Three levels with a pending answer (`Frames`), the same
  synchronously (`Variant: synchronous`, every runner agrees), and two typed levels only, the fetch's rejection
  answered at the `await` (`Variant: two typed boundaries`). It has `oracle` divergence rows at instants 3 and 4 of
  the pending forms. Interpreter, oracle, compiled (both emitters, `RX_CRATE=1`), served and hydrated (both
  emitters) and types pass it.
- **`runtime-resolve`'s flake: ours, the test's dev server watched the files it had just written.** With the dev
  server's log on (`RR_LOG=1`, kept), every failing run showed `vite.config.mjs changed, restarting server…` within
  ~250 ms of `listening`. Chokidar over macOS FSEvents reports each file of the project, written a moment before, as
  changed once it starts. A restart during the first render drops it: Vite's error overlay (`transport was
  disconnected, cannot call "fetchModule"`, now in the failure's message) covers the page and the click times out. A
  restart before the render passed, hence 1 in 3. `server.watch: null` in the test's dev server: nothing in it edits
  a file under a running server, and every check is the same. The first request's retry (5 × 1 s on `fetch failed`)
  hid the same restart: it is asked once now. Under 20 threads of CPU load: before, 4 of 5 runs failed (all
  `hoisted`, all the overlay); after, 10 of 10 passed.
