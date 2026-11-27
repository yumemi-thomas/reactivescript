# S-solid-50 — an equation that probed on its last pass still reads ahead on the next (Solid S-50; D-25 carry-over)

Rules: H-3a, H-7, R-11.

## Program

```rx
export default component App() {
  source x := 0
  source k := 0
  source probe := true
  m = 1 + k + (probe ? (pending? x ? 1 : 0) : 0) + x
  action save() { try { x := 1; await fetch("save") } catch {} }

  <div><p>m {m}</p> <p>k {k}</p></div>
}
```

## Frames

| instant | action                              | frame       |
| ------- | ----------------------------------- | ----------- |
| 0       | mount                               | `m 1 k 0`   |
| 1       | handler `save()`                    | `m 2 k 0`   |
| 2       | handler `probe := false; k := 1`    | `m 2 k 1`   |
| 3       | resolve "save" 0                    | `m 3 k 1`   |

Instant 1: the pass probes `x` and reads it plainly; the plain read is the
screen's `0` and the probe is `true`, shown now (R-11; Solid S-27's memo
case). Instant 2: this pass probes nothing, but `m`'s last pass did, so this
pass is still a reader ahead (the carry-over, one pass): its plain read of
`x` is the screen's `0`, `m` joins no hold, and the instant that wrote `k`
commits now — `m` is `1 + 1 + 0 + 0`. The pass after it, which probes nothing
either, would be an ordinary reader of a held `x`. Instant 3: the hold
commits.

This is what Solid does (its verdict bit is set at a pass's end from that
pass's probes, so it lasts one pass). Solid's ruling of 2026-11-05 (#4695, S-50)
said the posture is never carried and the instant joins the hold (`m 2 k 0`);
it was never built, and #4698/#4699 were closed as not planned. The language
follows Solid (DV-21, closed 2026-11-27); the checkers give the advice
`PROBE_BESIDE_HELD_READ`. With the probe in an equation of its own (`busy =
pending? x`, `m = 1 + k + (probe ? (busy ? 1 : 0) : 0) + x`) the frames are
these, on every runner: a read of an equation whose pass read ahead reads
ahead like the probe itself, and `m` stops reading `busy` when `probe` turns
false, just as it stopped probing.

## Variant: the carry-over lasts one pass

```rx
export default component App() {
  source x := 0
  source k := 0
  source probe := true
  m = 1 + k + (probe ? (pending? x ? 1 : 0) : 0) + x
  action save() { try { x := 1; await fetch("save") } catch {} }

  <div><p>m {m}</p> <p>k {k}</p></div>
}
```

| instant | action                              | frame       |
| ------- | ----------------------------------- | ----------- |
| 0       | mount                               | `m 1 k 0`   |
| 1       | handler `save()`                    | `m 2 k 0`   |
| 2       | handler `probe := false; k := 1`    | `m 2 k 1`   |
| 3       | handler `k := 2`                    | `m 2 k 1`   |
| 4       | resolve "save" 0                    | `m 4 k 2`   |

Instant 3: `m`'s last pass (instant 2) probed nothing, so this pass is an
ordinary reader of the held `x`: `m` is the hold's work and the instant that
wrote `k := 2` joins the hold (H-3a). Instant 4: `1 + 2 + 0 + 1`.

