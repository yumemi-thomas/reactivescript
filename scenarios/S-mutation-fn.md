# S-mutation-fn — a fn that changes its parameter in place, given a source's value, is MUTATION_IN_PLACE

Rules: W-1a, E-9.

Found by the apps hunt at 41142a46: `fn sortedCopy(ys) => ys.sort(…)` over a source compiled, and the page showed the
list unsorted on both sides (Solid's store refused the change in place outside its setter, silently in production).
`xs.sort()` written where `xs` is read was refused already; through a fn it was not. A fn of the module now carries the
parameters its body changes in place — directly, through a name it binds to a path of one, or through another fn — and
a call that gives one the value of a source, an equation or a prop is refused. A copy, or a fresh array, is not.

## Program

```rx
fn sortedCopy(ys: number[]): number[] => ys.sort((a, b) => a - b)
export default component App() {
  source xs := [3, 1, 2]
  sorted = sortedCopy([...xs])
  <p>{xs.join(",")} / {sorted.join(",")}</p>
}
```

## Frames

| instant | action | frame           |
| ------- | ------ | --------------- |
| 0       | mount  | `3,1,2 / 1,2,3` |

## Rejected variants

```rx
-- reject: MUTATION_IN_PLACE
fn sortedCopy(ys: number[]): number[] => ys.sort((a, b) => a - b)
export default component App() {
  source xs := [3, 1, 2]
  sorted = sortedCopy(xs)
  <p>{xs.join(",")} / {sorted.join(",")}</p>
}
```

```rx
-- reject: MUTATION_IN_PLACE
fn inner(zs: number[]): number[] => zs.reverse()
fn sortedCopy(ys: number[]): number[] => inner(ys)
export default component App() {
  source xs := [3, 1, 2]
  sorted = sortedCopy(xs)
  <p>{sorted.join(",")}</p>
}
```
