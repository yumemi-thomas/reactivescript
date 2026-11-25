# 26 — A view a component is given is only shown

Two sentences of the rules say different things of a component's children, and each runner follows a different one.

- **RG-4c**: *`children` is a view value evaluated in the* caller's *region: its readers are the caller's, its lifetime is the caller's, and the child only decides where it is placed.*
- **08**, of the provision check: *children passed to a component are owned where it reads them, so they see its provisions.*

The interpreter has the second. Compiled code and the oracle make the content where it is read, as Solid does, and look a `use` in it up from where it is *written*. So the plainest program of a provider is wrong compiled ([33](bugs/33-use-in-children.md)), an `await` in content is asked above what the component provides ([36](bugs/36-await-by-a-childs-context.md)), and three fixes each moved a program the runners agreed on, because a second reading (a snapshot, a context's value, a record) had to stay the caller's. Prototyped on a local branch (`proto-children-rule`, not published).

<!-- frames branch=pass upstream=fail says-upstream="no provision for toggle" -->
```rx
context toggle: { pressed: boolean }
component Toggle(props: { children: View }) {
  source lit := false
  provide toggle = { pressed: lit }
  <button onClick={() => { lit := !lit }}>{props.children}</button>
}
export default component App() {
  <Toggle>{(use toggle).pressed ? "on" : "off"}</Toggle>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `off` |
| 1 | handler `lit := true` | `on` |

## What changes in programs that run today

Stated first, because an earlier version of this page said "none that agreed is now different", and that was false: it
had compared whether the runners agree *within* a revision, not what they show *across* the two. Compared across
(54571c1d before, this branch after; interpreter, oracle, both emitters, then the server and hydration in both emitters):

| programs | agreed before and after | of those, show something else now |
| --- | --- | --- |
| 1,147 generated (`w/mkamb.py`) | 359 | **63** |
| 979 written for the review's findings (`w/mkg1.py`: bindings and types, "was it given", a view given on) | 696 | **188** |
| 635 of the earlier reviews | 218 | 1 |
| 3,802 of the independent review | 913 | 65 (the 63 above, which it copied, and 2) |

Every one is in one of seven classes. Each is what the rule says; none was found that it does not say. "Real" counts the
components of upstream's tree (632), PR #1's (1,243) and the UI SDK rewrite (1,146) that have the shape, read by the
parser (`w/census2.mts`): props typed by JavaScript are not seen by it.

| class | before | now | why the rule wants it | generated | real |
| --- | --- | --- | --- | --- | --- |
| a view shown at two places, one under a provision of its own; the content reads the context in an argument, an element or a condition (`<L v={use c} />`) | `outout` | `outin` | each place that shows it has its own, and reads what is provided there (rule 1). Before, a `use` written bare in content was read where shown and one in an argument where written | 16 + 4 | 0 components show a view twice |
| a view given on as an argument, `<Q part={p.children} />`, to a component that provides | `out` | `in` | the same: it is shown in `Q`, under what `Q` provides | 16 + 24 | 0 give one on as an argument |
| the props spread to a component with no content written, `<Q {...p} />` | nothing, or the word `undefined` | the children | a spread gives every prop, the children among them (rule 2, "given on"). Before, the empty application overwrote them with none | 31 + 32 + 1 | 0 |
| asked of a view that was not given: `if p.children`, `p.children ?? "none"`, `!p.children`, an effect over it | given (the children always were: an empty list) | not given | the question is whether something was written | 49 + 1 | 3 components ask (bug 41's two pages and S-context-3, which were written about this) |
| asked of content that was given | the content is made to answer (its effects run once more) | nothing is made | "nothing is made to answer it" | 24 | the same 3 |
| a view that was not given, shown | the word `undefined` | nothing | a view that is not there shows nothing | 31 | not counted apart (0 components give a named view on) |
| **asked of an argument that is written and is no literal, whose value is `""`, `0` or `undefined`** (`part={s}`, `part={0 + 0}`, a loop's item) | not given (the value was read) | given | whether one was given does not read the argument: it may be a view given on, which reading would make. A literal (`part=""`, `part={undefined}`) still answers by what it is | 28 | 0 ask a named view |

The last is the one that costs something: before, an argument's *value* answered. It is the price of never making a view
to ask of it, and no program of the three trees asks it.

What is newly **refused** though every runner agreed before: 233 of the 1,147 (a view through a context 66, a snapshot
78, an effect 30, a handler 31, a closure 14, a record 14; none real, see "Against"), 13 of the 979 (`pre` of a view, a
view compared, a snapshot; and five whose `<div>` is given on as an argument into a `<p>`, which the browser's parser
moved on hydration: the content model now follows a named view where it is shown; a sixth, spread, since), 14 of the 635 and 716 of the 3,802
(`VIEW_NOT_SHOWN`, the review's set being written around snapshots, contexts and records).

## Proposal

1. **A view given to a component is a block of the caller's names, owned where it is shown.** Each place that shows it has its own, made there and disposed with it. What it reads from contexts, what it waits on and fails with are that place's. (08's sentence; Solid's JSX children; what a `view (s) { … }` of [25](25-views.md) already is.)
2. **A component only shows it.** A prop *declared* `View` where the type is read (written out, a type of the module, one imported from `.rx`), the children or one of another name, under the names bound to it (a parameter, a loop's item or an inner block's equation of the same spelling is another name; children declared `number` are a number), is
   - shown, `{props.children}`, also `props.children ?? e` and `c ? props.children : e`;
   - given on, as another component's content or as its argument typed `View` (to one whose declared type is a value's, `count: number`, it is refused), or in a spread of the props to a component;
   - named by a projection of the props (`{ children } = props`, `x = props.children`, a rest);
   - asked for: `if props.children`, `!props.children`, `props.children != undefined`, also through a name, a choice or `||`. That is whether something was written for it: content between the tags; an argument that is no literal nothing (its value is not read); what a spread or a rest hands on. A literal is the value it is (`part=""`, `{0}`, `{false}`, `{undefined}` were not given; `!= undefined` and `??` ask only that). Nothing is made to answer it. A view given on is written: an argument does not hand on whether its giver was given one; a spread does.

   What JavaScript gives: a getter (JSX content) was given, and is not read; a value answers as JavaScript does, which is what Solid's `props.children ? … : …` answers: `undefined`, `null`, `false`, `0`, `""` no, `[]` yes (`compiler/test/js-host.mjs`, production, in the browser and on the server).

   An argument's expression is a value of the caller: `<Q title={use c} />` reads what is provided where it is written, under every runner. Only content, and a `view name (…) { … }`, is a block of the place that shows it.

   Read as a value it is `VIEW_NOT_SHOWN`: kept by `peek`, a source or `pre`, carried by a context, read by an effect or a handler, answered by a closure, held in a record or a list, given to a fn; every arm of a choice and a seed is checked. The message gives the form that is accepted for the one it found.
3. Nothing is added: no word to make a view once and hold it.

RG-4c's first sentence is replaced; 08's stands.

Shown twice is made twice, and what is hidden is disposed:

<!-- frames branch=pass upstream=fail -->
```rx
context c: string = "out"
component Seen() { source n := 0
  effect () { log("made") }
  <u>{use c}{n}</u> }
component Twice(p: { children: View }) { source on := true
  provide c = "in"
  <b>{p.children}</b>{if on { provide c = "deep"
    <i>{p.children}</i> }} }
export default component App() { <Twice><Seen />{use c}</Twice> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `in0indeep0deep` | log(made); log(made) |
| 1 | handler `on := false` | `in0in` | |
| 2 | handler `on := true` | `in0indeep0deep` | log(made) |

Asked for, content is not made. On upstream the `if` makes it, and makes it again to show it: the program below fails there, on the server and after hydration (run on `origin/main` e650b851 by `proposals/check.mjs --upstream`, as every mark of this page):

<!-- frames branch=pass upstream=fail runner=ssr -->
```rx
component Opt(p: { children?: View }) { {if p.children { <div>{p.children}</div> } else { <i>none</i> }} }
component Made() { effect () { log("made") }
  <b>x</b> }
export default component App() { <Opt><Made /></Opt><Opt /> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `xnone` | log(made) |

<!-- check branch=VIEW_NOT_SHOWN upstream=ok -->
```rx
context c: string = "out"
component P(p: { children: View }) { provide c = "in"
  source x := peek(p.children)
  <i>{x}</i> }
export default component App() { <P>{use c}</P> }
```

## Evidence

**What programs do with children.** Every `.rx` file and `rx` block: upstream's 744 programs name a component's children in 29, each time to place them. PR #1's base: 132 of 1,896, all placed but S-context-3 (a projection, a default, `if children`, `header ?? "-"`: kept by 2) and three pages written to show the fault. The twelve packages: placed, and `keyed`'s `props.children(…)`, a function type, which is not a `View`. The UI SDK rewrite: placed, and `viewOf(props.children, now)`, a function or plain content, which is [25](25-views.md). Solid TSX (7,113 files of other people's apps and libraries, a regex census): of 2,134 reads of `x.children`, 68% placed; about 50 passed lazily to a provider's helper (shown under it); 112 called or tested by `typeof` (25); 69 defaults and 53 tests (2's "asked for"); about 20 memos and 60 `children(() => …)` in 3 libraries, to ask or to tell a function from content without making it twice; 8 inspected; no effect on children.

**Runners** (interpreter, oracle, both emitters; then the server and hydration in both emitters for what is accepted):

| programs | before (54571c1d) | with this |
| --- | --- | --- |
| 1,147 generated (37 ways to show children × 15 forms of content × a default or a provision above) | 375 refused, 592 agree, 175 accepted and different, 5 on which all throw alike | 346 refused, 800 agree, 1 on which all throw alike (`provide c = use c` with nothing above: the check does not look above a provision, as before) |
| … served and hydrated | not run | 800 of 800, in both emitters |
| 979 written for the review's findings (100 of bindings and types; 495 of "was it given": 15 ways to ask × 17 ways to give × the children or a named view; 384 of a view given on: 6 things content asks of its place × 8 ways to give it on × 6 places that show it) | 143 refused, 709 agree, 115 different, 12 alike in error | 157 refused, 822 agree, none different; both checkers say the same of all 979 and the emitters lower them alike; served and hydrated 822 of 822, in both emitters |
| 635 of the earlier reviews | 308 refused, 234 agree, 85 different or not compiled, 8 alike in error | 267 refused, 328 agree, 30 different or not compiled, 2 that differ on the server only (a portal, a hidden row: the same on 54571c1d and on PR #1), 8 alike |
| 3,802 of the independent review (three runners before) | 1,590 refused, 1,629 agree, 583 different or not compiled | 2,163 refused, 1,532 agree, 62 different or not compiled, 45 alike in error; 716 that agreed are refused, each `VIEW_NOT_SHOWN` |

What the agreeing ones *show*, before and after, is the first section of this page.

Of the 346 refused, 106 were accepted and different before, 7 were refused already (5 a `CONTEXT_NOT_FOUND`), and **233 showed the same in every runner before**: a view through a context (66), a snapshot (78), an effect (30), a handler (31), a closure (14), a record (14). They agreed on the caller's reading of a single mount; shown twice, or hidden and shown, a record and a list are made once compiled and at each place in the interpreter (6 of 134 probes written for it).

What is still different on some runner was read program by program (DECISION.md): 40 of the 59 of the independent review's set show exactly what they showed before; the others were refused or not compiled before and are a handler of a scenario's table that the harness evaluates (5), the interpreter not waiting for a pending attribute (2), the oracle's `[null]` for a portal's items and its functional path write (2), a fn that reads a context given as a value and called in content, which the interpreter refuses at run time (7; so on PR #1 with the reference's emitter), a ref callback (1), a closure as children that is also shown ([34](bugs/34-closure-as-a-child.md)). None is of this rule.

No program of this tree, of the benchmark or of the guide changes verdict but the two scenarios that held the old reading (S-context-4, S-context-5, rewritten). Of the twelve packages and the UI SDK rewrite (47 files), two lines of the UI SDK's dialog change: `viewOf(props.children)` of children declared `View`, written `{props.children}`; its suite (44), its leak gates (5) and its table of mistakes (12) are as before.

**The rule is of a prop declared `View` where the checker reads the type** (written out, a type of the module, one imported from `.rx`). What a type of JavaScript hides is as it was, as in 25: the UI SDK's `import("./bridge.js").ToggleProps` and its `viewOf(props.children, now)` are untouched, and a snapshot there is still accepted.

**Cost at run time**: 1,000 rows with content, mount / reverse / change all: 1.4 / 0.8 / 0.6 ms before and after; rows that ask `if props.children`: 2.9 / 1.0 / 1.4 before, 2.2 / 0.9 / 0.8 after. The module: 23 bytes more of 1,492.

## What is refused, and what is written instead

Each runs in every runner (S-context-5).

| was | is |
| --- | --- |
| `provide k = props.children`, shown by a component the provider applies | `<Z part={props.children} />`, `{q.part}` |
| `f = () => props.children`, `{f()}` | `{props.children}`, or an argument typed `View` |
| `r = { header: …, footer: … }` | a view of each name: `{view header () { … }}`, `<p.header />` (25) |
| `{[props.children, "!"]}` | `{props.children}!` |
| `effect (props.children) { … }` | `effect (props.children != undefined) { … }` |
| a handler that reads it to show it | a source the handler writes, `{if open { {props.children} }}` |
| `source x := peek(props.children)`, `{x}` | `{props.children}` |

`pre` of a view (what it was an instant ago) and a view given to a prop whose declared type is a value's (`count: number`) are refused as well; neither was found in a program.

**One has no form that keeps the caller's program.** A view carried by a context to a part that the *caller* places: Kobalte's `Select`, `Combobox` and `Pagination` give the item's view to the root and show it in a part written among the children. Two forms run, and each changes that API: the root shows its own list, or the part is given the view (S-context-5's last variants but one). The UI SDK has none; its 47 reads in a nested function and 37 in a record are forwarding getters, which is "given on".

**One is lost: whether content *resolves* empty.** Kobalte's `DateField` and `TimeField` segments resolve their children (`children(() => props.children)`) and show a fallback text when the result is empty, also when content was written and came to nothing. "Was it given" answers whether content was written, not what it comes to, and nothing in `.rx` resolves a view to look at it. The segment's fallback has to be a prop of its own (the caller says it), or the component stays JavaScript. That is two more components of the same library whose behaviour a rewrite changes.

The counts of this section are of spellings of `children` (a regex census): they cannot say how many libraries carry a *named* renderer by a context, nor rule out more losses of this kind.

TanStack's `MatchRoute` shows a function child whether or not the route matches and plain content only on a match. As two props, a named view and plain children, neither is made to know which was given (S-context-5's last variant). As one `View | ((s) => View)` it cannot be written: nothing asks which kind was given.

## A wider rule that was tried, and is not proposed yet

*A view is an opaque value: it may be held (a context, a record, a list, a closure's answer) and can only finally be shown, each showing an instance.* Run with the refusal lifted, on 134 programs made for it (held 8 ways; shown once, twice, under a toggle, in rows; a component with state, a `use`, an `await`; no default; no boundary):

- carried by a context, answered by a closure: the runners agree on all, shown twice and toggled as well, and the checkers refuse each program whose provision or boundary is not above the place that shows it;
- a record, a list: different in 6 (made once compiled, at each place in the interpreter);
- the checkers place a carried view at the application, not where it is shown: sound for "is there a provision, a boundary above", since what is above the application is above every place beneath it, and it refuses a correct program whose provision is the carrier's own.

It is a widening: every program this proposal accepts only shows, and means the same under it. What it needs before it can be proposed: a record and a list that hold a view compiled field by field (a getter); a closure's answer followed through calls, which no syntactic rule sees (a handler may call it); the walk extended over fns and module level for `use k` of a context declared `View`; for a view with a parameter, an application through what a context gives (`<s.item … />`) and its placement in both checkers. The first step that pays is the context alone, declared `View` or a function giving one: it is what Kobalte's three families need.

## How it composes with 25

A `View` is the view that asks nothing; `(s: T) => View` is one with a parameter. `{props.children}` and `<props.children a={e} />` are the same act. So 25 loses a case and a rule:

- its rule 3 (plain content beside a view "is a view that asks nothing, owned where it is shown") is this proposal, of all content;
- "it is named nowhere else" is `VIEW_NOT_SHOWN`'s list, with one exception fewer to learn;
- `if props.children` of `View | ((s) => View)`, refused in 25 because the question would have made the content, can be accepted: asking makes nothing now. Not done here.

- what was learned for a `View` holds for a view with a parameter and is not yet applied to it: 25's "named nowhere else" (`otherMention`) is still by spelling, where `viewUses` follows bindings and declared types. One walk would do, and should be the second.

"Was it given" is the same question in both: of a view with a parameter, `if props.cell` is whether a function was given (25); of a `View`, whether something was written. Neither reads or makes what it asks of.

## Cost

| | |
| --- | --- |
| rules | RG-4c's sentence replaced; one diagnostic in, one out (`AMBIGUOUS_CONTEXT`) |
| code removed | the crate's gate on awaits (92 lines), the ambiguity check (33), and what it inferred: `around`, `above`, `apart(…)` in a printed signature (an old one is still read), `onlyShown`, `kidUses` (174 lines of the crate, 69 of `ref/`) |
| code | crate +835 −336, `ref/` +453 −135 against 54571c1d (26,853 → 27,352 and 11,989 → 12,307 lines): the walk that finds a view read as a value, by binding and by declared type, with its messages; content emitted as a block; "was it given"; a named view's placement |
| runtime | three helpers the compiled module calls (`__rt.given`, `__rt.opt`, `__rt.v`): a release raises compiler and runtime together (both 0.3.1 today; nothing is released from this branch) |
| a reader learns | a view is shown; each place has its own |

## Against

- 233 generated programs that showed the same everywhere are refused, and a library that carries a view by a context to a part its caller places has to change its API.
- A snapshot of content has no form. Solid has `children()` for it; no `.rx` program asked.
- Content shown at two places is made twice, where RG-4c promised one. That is Solid's behaviour, and the reason TSX authors reach for `children()`.
- "Was it given" is whether something was written: `<P>{cond ? x : undefined}</P>` was given, and so is `<Q part={s} />` whatever `s` holds, where before the argument's value answered (the last class of the first section). A view given on as an argument is written: whether its giver was given one is not handed on, where Solid reads the value and knows. A spread hands it on.
- What content *resolves* to cannot be asked (Kobalte's `DateField`, `TimeField`).
- "Each place has its own" is of what `.rx` writes and of what JavaScript gives as a getter. A JavaScript host that gives one made DOM node gives one node: shown at two places it is at the second, as in Solid.
- A lone `{e}` with no `use` or `await` in it stays a plain value, so that a closure given as children is the function it is (34): two forms of content in the emitters.
- A fn that reads a context, given as a value and called in content, is refused by the interpreter at run time and run by the others (older than this; the removed gate kept the crate from compiling it).

## What upstream must accept

That 08's sentence is the rule and RG-4c's first sentence goes: a component's content is owned where it is shown, each place its own, and a component can do nothing with it but show it. If RG-4c's caller is meant instead, `provide` has to say what it is for: every component that provides to its content reads the other way today.
