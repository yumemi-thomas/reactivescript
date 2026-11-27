# S-affects-projection — `affects` on a keyed equation or a draft marks it, not what it reads

Rules exercised: AC-5, ST-3, ST-4, H-9.

## Program

```rx
export default component App() {
  source src := [{ id: 1, city: "Paris" }]
  view key id = src.map(r => ({ id: r.id, city: r.city }))
  source err := "none"
  action go() { try { affects view; await fetch("x") } catch (e) { err := e.message } }
  <p>{str(pending? src)} {str(pending? view)} {view[0].city} {err}</p>
}
```

`affects view` declares that the work in flight changes `view` (AC-5): `pending? view` is true until the action ends.
`src`, which `view` reads, is not what was declared, and stays `false` — as Solid rules since #4906 for a derived
store ("`affects()` on a source store is no longer true because a derived view of it has a pending edit").

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `false false Paris none` |
| 1 | handler `go()` | `false true Paris none` |
| 2 | resolve "x" 1 | `false false Paris none` |

## Variant: a draft

```rx
export default component App() {
  source id := 1
  sel = draft(pre sel -> {}) { d[str(pre id -> 0)] := false; d[str(id)] := true }
  source err := "none"
  action go() { try { affects sel; await fetch("x") } catch (e) { err := e.message } }
  <p>{str(pending? id)} {str(pending? sel)} {sel["1"] ? "1" : "-"} {err}</p>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `false false 1 none` |
| 1 | handler `go()` | `false true 1 none` |
| 2 | resolve "x" 1 | `false false 1 none` |

Found while checking #4906's `affects()` change (2026-11-27): the interpreter showed these frames, and the oracle and
both emitters threw at `affects view` (the action's `catch` took Solid's error: an equation's accessor wraps its
projection, and Solid's `affects` takes the store, #50) — the same on Solid 30e7805eb and 50a4bfdde.
