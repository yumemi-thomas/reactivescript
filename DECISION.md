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
