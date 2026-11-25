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
