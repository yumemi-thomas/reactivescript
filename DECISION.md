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

