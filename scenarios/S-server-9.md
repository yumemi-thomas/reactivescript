# S-server-9 — a `ref` writes a structured source while a served page is taken over

Rules exercised: SV-3, SC-4, 07 §4, ST-1; DV-27.

A `ref` writes in the pass that makes its element, so its write is in the frame that shows the element (07 §4). An
atomic source written so is shown when a served page is taken over, as when the page is rendered. A source whose value
is an array or a record (a store behind its slot, ST-1) is shown the same way: here `2`, then `3` after a click, hydrated or not. (DV-27, a Solid bug: until
Solid main 50a4bfdde the hydrated page kept the server's `1` until the next change of the store; fixed there,
probably by #4906, which runs stores on the thin engine.)

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

## DV-27 (fixed on Solid main 50a4bfdde, probably #4906)

Recorded until the pin moved to 50a4bfdde: the hydrated page showed `ab1/5` at instant 0 — the `ref`'s write of `n`
and not that of `els`, which was in the store (the click showed `3`). The same with the source replaced by Solid's own
`createStore` (`ref/oracle/repros/dv27-hydrate`, which shows `2/2/5` hydrated at 50a4bfdde and `1/2/5` at 30e7805eb).
Nothing in the language changed for it; the divergence row is removed, so the hydrated frame is checked as written.
