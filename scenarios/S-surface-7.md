# S-surface-7 — a `<…>` that is not a type is a comparison

Rules: 07 §3.

A call may carry TypeScript type arguments, `createStore<Todos>(…)`: a
balanced `<…>` right after a name or member and right before `(`. What is
between the brackets must be able to be a type, as TypeScript decides it:
`b && c` is not one (no type has `&&`, `||`, `==`, `!=`, `<=`, `>=`, `*`,
`/`, `%`, `!`, `^` or `~`), so `a<b && c>(d)` is two comparisons, `(a < b)
&& (c > d)`, not `a` called with type arguments `b && c`. Outside brackets
a type has no `+` either, no `-` but a negative number's, no `=` but an
arrow's, no call, and no `?` but a conditional type's (after `extends`):
`a<b ? c : d>(d)` is `a < b ? c : (d > d)`. The list must be types from end
to end, as TypeScript's own type grammar reads them; inside brackets as well
as outside: `b[c+1]` is an index with an addition in it, not an indexed
access type, so `a<b[c+1]>(d)` is `(a < b[c + 1]) > d`.

## Program

```rx
export default component App() {
  source a := 1
  b = 2
  c = 3
  d = 0
  x = a<b && c>(d)
  y = a<b ? c : d>(d)
  <p>{x ? "both" : "not both"} {y ? "c" : "none"}</p>
}
```

## Frames

| instant | action              | frame           |
| ------- | ------------------- | --------------- |
| 0       | mount               | `both c`        |
| 1       | handler `a := 5`    | `not both none` |

Instant 0: `1 < 2` and `3 > 0`. Instant 1: `5 < 2` is false. Read as type
arguments, `x` and `y` would have been `a` called with `d`.

## Rejected variants

```rx
-- types: TS2365
export default component App() {
  source a := 1
  e = [0, 2]
  c = 3
  d = 0
  z = a<e[c-2]>(d)
  <p>{z ? "less" : "more"}</p>
}
```

`a<e[c-2]>(d)` is `(a < e[c - 2]) > d` for TypeScript too: it refuses
comparing the `boolean` with a number (TS2365), where a call of `a` would
have been TS2349. The compiler reads it the same way (`v$a() <
v$e()?.[v$c() - 2] > v$d()`), not as `a` called with `e[c-2]` as a type.
