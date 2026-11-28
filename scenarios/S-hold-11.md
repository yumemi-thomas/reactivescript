# S-hold-11 — a plain `await` takes one answer of its flight

Rules: R-1, ST-6, H-12.

## Program

```rx
export default component App() {
  source s := 0
  A = await fetch("a:" + s)
  {errored fallback(e) { <p>E</p> } { <p>{A}</p> }}
}
```

## Frames

| instant | action             | frame |
| ------- | ------------------ | ----- |
| 0       | mount              | ``    |
| 1       | resolve A "a0"     | `a0`  |
| 2       | resolve A "a1"     | `a0`  |
| 3       | handler `s := 1`   | `a0`  |
| 4       | resolve A "b1"     | `b1`  |

Instant 2: `A`'s question has landed; a second landing of the same flight is
a stream's, which only `await*` takes (ST-6). The oracle handed a tail
`await`'s flight to Solid as the stream itself, so it showed `a1` where
compiled code and the interpreter show `a0` (found by the review's
`x6b/ref-asks`, whose two `resolve A` rows land one flight).
