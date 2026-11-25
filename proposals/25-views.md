# 25 — A view a component shows with what it knows

RG-4c sends content that is *created more than once, or conditionally owned* to *a function prop instead, which is ordinary*. No `.rx` function makes markup, so the rule names a form that cannot be written. Every piece of one exists: MO-11k's `view (s) { … }`, a component's application, TypeScript's function type. This puts them together. Prototyped on a local branch (`proto-children`, not published).

<!-- frames branch=pass upstream=refused -->
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
3. Children declared `View | ((s: T) => View)` are given plain content as well, shown as it is.
4. An argument is checked as read where the view is shown, for what it waits on and fails with: none of that crosses a signature.
5. What the view stores where it outlives it (O-3) is nothing the component's closures hold.

A component so typed that does not show it this way is as it was. The tag is refused today, so no accepted program is in reach.

**An application, not a call.** A call is a reader: it makes the view again at each change (4 elements for 3 presses, measured for [24](24-view-functions.md)). Here nothing is made again; state in the view is kept:

<!-- frames branch=pass upstream=refused -->
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

<!-- types branch=TS2339 upstream=UNKNOWN_COMPONENT+VIEW_FN_MISPLACED -->
```rx
component List(props: { rows: { id: number; name: string }[]; row: (r: { item: { id: number; name: string } }) => View; children?: View }) {
  <ul>{for x in props.rows { <li><props.row item={x} /></li> }}</ul>
}
export default component App() {
  <List rows={[{ id: 1, name: "a" }]}>{view row (r) { <b>{r.item.nmae}</b> }}</List>
}
```

A *generic* row needs type parameters on a component; [20](20-generic-fns.md) has them on fns alone. They compose and were not built together.

**Stored, forwarded, called: refused.** `<Inner>{view (s) { <props.children n={s.n} /> }}</Inner>` forwards.

<!-- check branch=VIEW_FN_MISPLACED upstream=UNKNOWN_COMPONENT -->
```rx
context c: any
component T(props: { children: (s: { n: number }) => View }) {
  provide c = props.children
  <props.children n={1} />
}
export default component App() { <T>{view (s) { <b>{s.n}</b> }}</T> }
```

<!-- check branch=REGION_ESCAPE upstream=UNKNOWN_COMPONENT+VIEW_FN_MISPLACED -->
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
| UI SDK's Toggle and trigger, rewritten with it | 2 of its 3 refused correct lines accepted (the third is a `ref` on a component: another matter); its 12 mistakes caught; 44 of 44 of its suite, 5 of 5 leak gates, its Playwright specs as before the rewrite (548 pass; the 2 that fail fail there too) |
| Kobalte's `Select.Value` and `as`, TanStack Router's `Link`, `MatchRoute`, `Await` | written and run (S-view-6), as they are used: a function or plain content |
| programs run in both checkers, the interpreter, the oracle, both emitters, the server and hydration | 105 right, 171 refused (S-view-3 to S-view-6) |
| programs of this tree and upstream's that change verdict, projection or code | 0 of 1,170 (one message's words) |

A view is a block, so what is hard for plain children is right by what exists: a `use` in it reads where it is shown ([33](bugs/33-use-in-children.md)), an `await` in it is asked there ([36](bugs/36-await-by-a-childs-context.md)).

## Cost

| | |
| --- | --- |
| rules | one paragraph of RG-4c; `view`, `value(…)` and `f-at` in a printed signature |
| code | about 560 lines in the crate, 430 in `ref/`, one function in the runtime (bug 33, bug 37's gate included) |
| check | 798 programs in 0.19 s, before and after |
| 1,000 rows, production, one run: mount / reverse / change all | a plain `for` 5.1 / 0.8 / 0.6 ms; a view 6.6 / 0.9 / 0.4; a child reading a context 8.2 / 0.8 / 1.2 |
| the module, minified | 1,227; 1,402; 1,538 bytes |
| a reader learns | a tag that begins with a small letter |

## Against

- `props.f` is a value everywhere but for a view: the rule that it is named nowhere else is a refusal to learn.
- An argument is asked for a boundary in the component though the view has its own (cautious).
- A JavaScript function of no parameter is a thunk, as Solid's JSX has it: the runtime tells a view by its length. A `.rx` view has one always.
- A change of the function itself (a JavaScript caller's `cond() ? f : g`) makes the view again.
- In the printed signature a parameter's type is kept only where it is written out; under a name, an array changed in place (W-1a) is not seen across a package.

## What upstream must accept

That RG-4c's function prop makes markup, by `view`, and is applied. If it is to be called instead, this is not it. MO-11k's `view` for JavaScript components stands alone either way.
