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

## Proposal

1. **A view given to a component is a block of the caller's names, owned where it is shown.** Each place that shows it has its own, made there and disposed with it. What it reads from contexts, what it waits on and fails with are that place's. (08's sentence; Solid's JSX children; what a `view (s) { … }` of [25](25-views.md) already is.)
2. **A component only shows it.** A prop typed `View`, the children or one of another name, is
   - shown, `{props.children}`, also `props.children ?? e` and `c ? props.children : e`;
   - given on, as another component's content or argument, or in a spread of the props;
   - named by a projection of the props (`{ children } = props`, `x = props.children`, a rest);
   - asked for: `if props.children`, `!props.children`, `props.children != undefined`. That is whether content was written. Nothing is made to answer it.

   Read as a value it is `VIEW_NOT_SHOWN`: kept by `peek` or a source, carried by a context, read by an effect or a handler, answered by a closure, held in a record or a list, given to a fn. The message gives the form that is accepted for the one it found.
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

Asked for, content is not made (on upstream the `if` makes it, and makes it again to show it: a hydration key miss with an element in it):

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
| 1,147 generated (37 ways to show children × 15 forms of content × a default or a provision above; the 1,116 of bugs/33 and one receiver added since) | 375 refused, 592 agree, 180 accepted and different | 346 refused, 800 agree, 1 on which all throw alike (`provide c = use c` with nothing above: the check does not look above a provision, as before) |
| … served and hydrated | not run | 800 of 800 |
| 635 of the earlier reviews | 308 refused, 234 agree, 85 different or not compiled, 8 on which all fail alike | 267 refused, 328 agree, 31 different or not compiled, 9 alike; none that agreed is now different |

Of the 346 refused, 106 were accepted and different before, 7 were refused already (5 a `CONTEXT_NOT_FOUND`), and **233 showed the same in every runner before**: a view through a context (66), a snapshot (78), an effect (30), a handler (31), a closure (14), a record (14). They agreed on the caller's reading of a single mount; shown twice, or hidden and shown, a record and a list are made once compiled and at each place in the interpreter (6 of 134 probes written for it).

What is still different is older and not of children: the oracle prints a portal's and a list's items as `[null]`; the interpreter does not wait for a pending attribute; a closure as children that is also shown ([34](bugs/34-closure-as-a-child.md)).

No program of this tree, of upstream's, of the benchmark or of the guide changes verdict but the two scenarios that held the old reading (S-context-4, S-context-5, rewritten).

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

**One has no form that keeps the caller's program.** A view carried by a context to a part that the *caller* places: Kobalte's `Select`, `Combobox` and `Pagination` give the item's view to the root and show it in a part written among the children. Two forms run, and each changes that API: the root shows its own list, or the part is given the view (S-context-5's last variants but one). The UI SDK has none; its 47 reads in a nested function and 37 in a record are forwarding getters, which is "given on".

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

In the prototype the two rules still have their own code (`otherMention`, `viewUses`); one walk would do.

## Cost

| | |
| --- | --- |
| rules | RG-4c's sentence replaced; one diagnostic in, one out (`AMBIGUOUS_CONTEXT`) |
| code removed | the crate's gate on awaits (92 lines); the ambiguity check is dead in both checkers (with `apart(…)` in a printed signature, about 150 lines, not yet deleted) |
| code added | the walk that finds a view read as a value, twice (about 110 lines of `ref/`, 290 of the crate); content emitted as a block, and "was it given" (about 60 lines in each emitter, 25 in the oracle, 15 in the interpreter, 6 in each runtime) |
| a reader learns | a view is shown; each place has its own |

## Against

- 233 generated programs that showed the same everywhere are refused, and a library that carries a view by a context to a part its caller places has to change its API.
- A snapshot of content has no form. Solid has `children()` for it; no `.rx` program asked.
- Content shown at two places is made twice, where RG-4c promised one. That is Solid's behaviour, and the reason TSX authors reach for `children()`.
- "Was it given" is whether content was written: `<P>{cond ? x : undefined}</P>` was given. From a JavaScript host that passes a proxy without descriptors, the content is read to answer.
- A lone `{e}` with no `use` or `await` in it stays a plain value, so that a closure given as children is the function it is (34): two forms of content in the emitters.
- The checkers still place a view given on as an argument by the old chains; no program was found on which that is wrong.

## What upstream must accept

That 08's sentence is the rule and RG-4c's first sentence goes: a component's content is owned where it is shown, each place its own, and a component can do nothing with it but show it. If RG-4c's caller is meant instead, `provide` has to say what it is for: every component that provides to its content reads the other way today.
