# 25 — A view a component shows with what it knows

RG-4c sends content that is *created more than once, or conditionally owned* to *a function prop instead, which is ordinary*. No `.rx` function makes markup, so the rule names a form that cannot be written. Every piece of one exists: MO-11k's `view (s) { … }`, a component's application, TypeScript's function type. This puts them together. Prototyped on a local branch (`proto-children`, not published).

<!-- frames branch=pass upstream=fail -->
```rx
component Toggle(props: { children: (s: { pressed: boolean }) => View }) {
  source lit := false
  <button onClick={() => { lit := !lit }}><props.children pressed={lit} /></button>
}
export default component App() {
  source mark := "!"
  <Toggle>{view (s) { {if s.pressed { <b>On{mark}</b> } else { <i>Off{mark}</i> }} }}</Toggle>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `Off!` |
| 1 | handler `lit := true` | `On!` |
| 2 | handler `mark := "?"` | `On?` |

## Proposal

1. A prop declared `(s: T) => View` or `() => View` may be shown, `<props.f a={e} … />`, in the component's own view, at any number of places. It is then named nowhere else there: not read, called, stored, passed, spread. Two exceptions: `if props.f { … }`, under which an optional one is shown, and a projection that leaves it out of a rest (`{ children: none, ...rest } = props`).
2. It is given as one `{view (s) { … }}`, for a prop of another name `{view cell (s) { … }}`: a block of the caller's names, owned where it is shown. `s` is its props: `s.a` is live, never written.
3. Children declared `View | ((s: T) => View)` are given plain content as well: a view that asks nothing. It is owned where it is shown, so a `use` and an `await` in it are of that place.
4. An argument is checked as read where the view is shown, for what it waits on and fails with: none of that crosses a signature.
5. What the view stores where it outlives it (O-3) is nothing the component's closures hold.
6. A spread on the application gives no view: one that may hold the field is refused, unless the record as it is written or its type says it does not (`{ cell: none, ...rest } = x` takes it out).
7. The types are read through the names of the module and of the `.rx` modules it imports; the printed signature holds what they stand for.

A component so typed that does not show it this way is as it was. The tag is refused today, so no accepted program is in reach.

**An application, not a call.** A call is a reader: it makes the view again at each change (4 elements for 3 presses, measured for [24](24-view-functions.md)). Here nothing is made again; state in the view is kept:

<!-- frames branch=pass upstream=fail -->
```rx
component T(props: { children: (s: { n: number }) => View }) {
  source n := 0
  <p><props.children n={n} /></p>
}
export default component App() {
  <T>{view (s) { source own := 0
    effect () { log("made") }
    <b>{s.n}{own}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `00` | log(made) |
| 1 | handler `own := 5` | `05` | |
| 2 | handler `n := 1` | `15` | |

**A list that owns its loop, with a typed row.** Over a context this is `any` (24):

<!-- types branch=TS2339 upstream=PARSE -->
```rx
component List(props: { rows: { id: number; name: string }[]; row: (r: { item: { id: number; name: string } }) => View; children?: View }) {
  <ul>{for x in props.rows { <li><props.row item={x} /></li> }}</ul>
}
export default component App() {
  <List rows={[{ id: 1, name: "a" }]}>{view row (r) { <b>{r.item.nmae}</b> }}</List>
}
```

An argument left out is told, of an optional view and of one that takes plain content as of any:

<!-- types branch=TS2322 upstream=PARSE+TS2604 -->
```rx
component T(props: { children?: View | ((s: { n: number }) => View) }) { <props.children /> }
export default component App() { <T>{view (s) { {s.n + 1} }}</T> }
```

<!-- types branch=TS2322 upstream=TS2322 -->
```rx
component T(props: { cell?: (s: { n: number }) => View }) { {if props.cell { <props.cell {...{ n: "x" }} /> }} }
export default component App() { <T /> }
```

A *generic* row needs type parameters on a component; [20](20-generic-fns.md) has them on fns alone. They compose and were not built together.

**Stored, forwarded, called: refused.** `<Inner>{view (s) { <props.children n={s.n} /> }}</Inner>` forwards.

<!-- check branch=VIEW_FN_MISPLACED upstream=PARSE -->
```rx
context c: any
component T(props: { children: (s: { n: number }) => View }) {
  provide c = props.children
  <props.children n={1} />
}
export default component App() { <T>{view (s) { <b>{s.n}</b> }}</T> }
```

<!-- check branch=REGION_ESCAPE upstream=PARSE -->
```rx
component T(props: { children: (s: { go: () => number }) => View }) {
  source n := 1
  <props.children go={() => n} />
}
export default component App() {
  source kept := null
  <T>{view (s) { <b onClick={() => { kept := { f: s.go } }}>x</b> }}</T>
}
```

## Evidence

| | |
| --- | --- |
| UI SDK's Toggle and trigger, rewritten with it | 2 of its 3 refused correct lines accepted (the third is a `ref` on a component: another matter); its 12 mistakes caught; 44 of 44 of its suite, 5 of 5 leak gates, its Playwright specs as before the rewrite (548 pass; the 2 that fail fail there too, run here) |
| Kobalte's `Select.Value` and `as`, TanStack Router's `Link`, `MatchRoute`, `Await` | written and run (S-view-6), as they are used: a function or plain content |
| programs run in both checkers, the interpreter, the oracle, both emitters, the server and hydration | 104 tables right, 22 programs accepted, 171 refused (S-view-3 to S-view-7) |
| programs of this tree and upstream's that change verdict, projection or code | 0 of 1,170 (one message's words; the printed signature of 34 says what an exported type stands for) |

A view is a block, so what is hard for plain children is right by what exists: a `use` in it reads where it is shown ([33](bugs/33-use-in-children.md)), an `await` in it is asked there ([36](bugs/36-await-by-a-childs-context.md)). Plain children of other components are as they were.

## Cost

| | |
| --- | --- |
| rules | one paragraph of RG-4c; `view`, `value(…)` and `f-at` in a printed signature |
| code | 845 lines added and 67 removed in the crate, 416 and 79 in `ref/`, 6 of them in the runtimes (bugs 34, 38 and 39 included) |
| check | 798 programs in 0.19 s, before and after |
| 1,000 rows, production, one run (2d2b37ff): mount / reverse / change all | a plain `for` 5.1 / 0.8 / 0.6 ms; a view 6.6 / 0.9 / 0.4; a child reading a context 8.2 / 0.8 / 1.2 |
| the module, minified (2d2b37ff) | 1,227; 1,402; 1,538 bytes |
| a reader learns | a tag that begins with a small letter |

## Against

- `props.f` is a value everywhere but for a view: the rule that it is named nowhere else is a refusal to learn.
- An argument is asked for a boundary in the component though the view has its own (cautious).
- Where plain content is taken as well, a JavaScript function of no parameter is a thunk, as Solid's JSX has it: the runtime tells a view by its length (`(s = {}) => …` has none). A `.rx` view has one always. Where a view alone is taken, any function is one.
- Children that may be plain are not asked for (`props.children ?? default`): a JavaScript host's would be made twice.
- A spread of what nothing is known of (`any`, what a call answers) is refused on a component with an optional named view.
- A change of the function itself (a JavaScript caller's `cond() ? f : g`) makes the view again.
- Under a type of JavaScript (an import from `.js`, `.d.ts`), of a union, or that names itself, an array changed in place through `s` (W-1a) is not seen, as it is not for a component's props.
- A view shown among the children of a component that takes a snapshot of them, or carries them by a context, is owned as a component applied there is: at that component, where the interpreter has the place it is written. Upstream has it of `<I><Q /></I>`.
- Plain children handed on into a view component (`<M>{props.children}</M>`) are the plain children they were: [33](bugs/33-use-in-children.md) is of them.

## What upstream must accept

That RG-4c's function prop makes markup, by `view`, and is applied. If it is to be called instead, this is not it. MO-11k's `view` for JavaScript components stands alone either way.

**With [26](26-children-are-shown.md)** (`proto-children-rule`): rule 3 is of all content, not of children declared `View | ((s: T) => View)` alone; "named nowhere else" is 26's list; and `if props.children` of such children could be accepted, since asking makes nothing there. What 26 does not give is a view carried by a context to a part the caller places (Kobalte's `Select`): with a parameter it needs an application through what a context gives, and its placement in both checkers.
