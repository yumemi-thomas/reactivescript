# S-surface-11 — `a<b>(c)` of values is a comparison

Rules: 07 §3.

`a<b>(c)`, `f(a<b, c>(d))` and `a<1>(c)` can be read as type arguments. They
are comparisons where every name between the brackets is a value's, as they
are with no type arguments in the language. `one<Row>(…)` is a call: `Row` is
no value.

## Program

```rx
type Row = { n: any }
fn own(a: any, b: any, c: any) => a<b>(c)
fn both(x: any, y: any) => x && y
fn two(a: any, b: any, c: any, d: any) => both(a<b, c>(d))
fn path(a: any, r: Row, c: any) => a<r.n>(c)
fn one(r: any) => r.n
export default component App() {
  source n: any := 1
  source xs: any := [2]
  <p>{own(n, 2, 0) ? "y" : "n"}{two(n, 2, 3, 0) ? "y" : "n"}{path(n, { n: 2 }, 0) ? "y" : "n"}{n<2>(0) ? "y" : "n"}{for x in xs { <b>{n<x>(0) ? "y" : "n"}</b> }}</p>
}
```

## Frames

| instant | action           | frame   |
| ------- | ---------------- | ------- |
| 0       | mount            | `yyyyy` |
| 1       | handler `n := 5` | `nnnnn` |
