# S-server-9 — a `ref` writes a structured source while a served page is taken over

Rules exercised: SV-3, SC-4, 07 §4, ST-1; DV-27.

A `ref` writes in the pass that makes its element, so its write is in the frame that shows the element (07 §4). An
atomic source written so is shown when a served page is taken over, as when the page is rendered. A source whose value
is an array or a record (a store behind its slot, ST-1) is written — the next change shows it — but the hydrated page
keeps the server's text until then (DV-27): here `1` where the browser alone shows `2`, then `3` after a click in both.

## Program

```rx
export default component App() {
  source els := [0]
  source n := 0
  <p ref={(e: Element) => { els := [...els, 1]; n := 5 }}>a</p>
  <button onClick={() => { els := [...els, 9] }}>b</button>
  <i>{els.length}/{n}</i>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `ab2/5` |
| 1 | handler `els := [...els, 9]` | `ab3/5` |

## Server frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `ab1/0` |

## Divergences (DV-27)

- hydrated "Frames" instant 0: `ab1/5`

The hydrated page shows the `ref`'s write of `n` and not that of `els`, which is in the store (the click shows `3`).
The same with the source replaced by Solid's own `createStore` in the compiled module
(`ref/oracle/repros/dv27-store-written-while-hydrating.mjs`); a signal holding the array is shown.
