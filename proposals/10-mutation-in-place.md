# 10 — An array changed in place

Needs nothing. W-1a (proposed id).

## Problem

<!-- check branch=MUTATION_IN_PLACE upstream=ok -->
```rx
export default component App() {
  source xs: number[] := [3, 1]
  <button onClick={() => { xs.push(4) }}>{len(xs)}</button>
}
```

Run on upstream, the click leaves `2`:

<!-- frames branch=refused upstream=fail says-upstream="STORE_WRITE_OUTSIDE_SETTER" -->
```rx
export default component App() {
  source xs: number[] := [3, 1]
  <button onClick={() => { xs.push(4) }}>{len(xs)}</button>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `2` |
| 1 | handler `xs.push(4)` | `3` |

## Proposal

`MUTATION_IN_PLACE`: an `Array`'s mutating method called on the value of a source, an equation, a prop, a provision or a row, **where the program itself says the value is an
array**: a type (`string[]`), a list written out, a call that answers one (`filter`, `map`, `slice`). Else it is let be. The method's name alone is not enough; the first version of this check refused these two:

<!-- frames branch=pass upstream=pass -->
```rx
export default component App() {
  router = { push: (x) => x + "!" }
  <p>{router.push("ok")}</p>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `ok!` |

<!-- check branch=ok upstream=ok -->
```rx
component Link(props: { router: { push: (to: string) => string } }) {
  <button onClick={() => { log(props.router.push("/a")) }}>go</button>
}
export default component App() { <Link router={{ push: (to) => to }} /> }
```

## Evidence

Four benchmark tasks have a variant, and one more lost its own with the narrowing (Formisch's `list.items.splice(…)`, whose type the program does not write). No count of real programs.

## Cost

98 lines in the crate and 47 in `ref/src` with the second row of [11](11-advice.md) (3202a8d), and the narrowing of 7068a05, about as much again.

## Not seen

A mutation through a helper; an array whose type is an imported or aliased name, unless a list is written; what a render prop is given.

## Prototype

S-check-3.
