# S-hold-9 — an `if` condition and a `for` list are computations of a hold (H-3)

Rules: H-3, H-4, H-8, D-3, D-4.

A `{…}` reader that reads a held value is served the committed one, and shows a write of its own instant at once. An
`if` condition or a `for` list is a computation (Solid's `<Show when>` and `<For each>` are memos): it is not served, so
a write it reads while the value it also reads is held joins that hold, everywhere it is read.

## Program

```rx
export default component App() {
  source s := 1
  source t := 0
  a = await fetch("c:" + s)
  <div><p>{s} {t}</p>{errored fallback(e) { <p>ERR</p> } { <i>{if a + t !== "" { <b>y{t}</b> }}</i> }}</div>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `` |
| 1 | resolve "c:1" "v1" | `1 0y0` |
| 2 | handler `s := 2` | `1 0y0` |
| 3 | handler `t := 5` | `1 0y0` |
| 4 | resolve "c:2" "v2" | `2 5y5` |
| 5 | handler `t := 6` | `2 6y6` |

## Variant: a `for` list

```rx
export default component App() {
  source s := 1
  source t := 0
  a = await fetch("c:" + s)
  <div><p>{s} {t}</p>{errored fallback(e) { <p>ERR</p> } { <i>{for q in [a + t] { <b>{q}</b> }}</i> }}</div>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `` |
| 1 | resolve "c:1" "v1" | `1 0v10` |
| 2 | handler `s := 2` | `1 0v10` |
| 3 | handler `t := 5` | `1 0v10` |
| 4 | resolve "c:2" "v2" | `2 5v25` |
| 5 | handler `t := 6` | `2 6v26` |

## Variant: a `{…}` reader is served

```rx
export default component App() {
  source s := 1
  source t := 0
  a = await fetch("c:" + s)
  <div><p>{s} {t}</p>{errored fallback(e) { <p>ERR</p> } { <b>{a + t}</b> }}</div>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `` |
| 1 | resolve "c:1" "v1" | `1 0v10` |
| 2 | handler `s := 2` | `1 0v10` |
| 3 | handler `t := 5` | `1 5v15` |
| 4 | resolve "c:2" "v2" | `2 5v25` |
| 5 | handler `t := 6` | `2 6v26` |
