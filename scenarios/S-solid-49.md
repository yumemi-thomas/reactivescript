# S-solid-49 — a mixed `on`: a probe makes the whole `on` pass read ahead, and the re-arm shows now (Solid S-49; D-17, D-25)

Rules: H-6, H-7, R-11.

## Program

```rx
export default component App() {
  source id := 1
  source filter := 0
  product = await fetch("p:" + id)
  comments = await fetch("c:" + id)
  action go() { try { id := 2; filter := 1; await fetch("go") } catch {} }

  errored fallback(e) { <p>error: {e.message}</p> } {
    <div><span>{product}</span> {loading on([latest id, filter]) fallback { <p>[fallback]</p> } { <span>{comments}</span> }}</div>
  }
}
```

## Frames

| instant | action                | frame            |
| ------- | --------------------- | ---------------- |
| 0       | mount                 | ``               |
| 1       | resolve product "p1"  | `p1 [fallback]`  |
| 2       | resolve comments "c1" | `p1 c1`          |
| 3       | handler `go()`        | `p1 [fallback]`  |
| 4       | resolve "go" 0        | `p1 [fallback]`  |
| 5       | resolve product "p2"  | `p2 [fallback]`  |
| 6       | resolve comments "c2" | `p2 c2`          |

Instant 3: the `on` pass probes `id` (`latest id`), so the whole pass reads
ahead: its plain read of `filter`, which the action holds, is the screen's,
the pass joins no hold, and the re-arm shows its fallback now beside the held
`p1` (R-11, H-6). This is Solid's rule as Solid runs it (D-25, pass-wide
posture). Instant 5: the hold commits and the content comes back with `p2`.

Solid's ruling of 2026-11-05 (#4695 decision 1, S-49) said this pass was the
hold's work and the re-arm waited (`p1 c1` at instants 3–4); Solid never built
it and closed #4698/#4699 as not planned on 2026-11-06. The language follows
what Solid does (DV-21, closed 2026-11-27). The checkers give the advice
`PROBE_BESIDE_HELD_READ`; `on(filter)` is the re-arm that waits for the
change (S-solid-48). `lid = latest id` with `on([lid, filter])` re-arms now
too: the `on` pass reads an equation that reads ahead (S-posture-1).
