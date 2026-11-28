# S-hold-10 — an error staged under a hold waits for its frame's other answers

Rules: H-12, H-4, H-2.

## Program

```rx
export default component App() {
  source s := 1
  A = await fetch("a:" + s)
  B = await fetch("b:" + s)
  <p>{s}</p>{errored fallback(e) { <p>ERR</p> } { <b>{B}</b><i>{A}</i> }}
}
```

## Frames

| instant | action               | frame   |
| ------- | -------------------- | ------- |
| 0       | mount                | ``      |
| 1       | resolve "a:1" "v1"   | ``      |
| 2       | resolve "b:1" "w1"   | `1w1v1` |
| 3       | handler `s := 2`     | `1w1v1` |
| 4       | reject "b:2" "x"     | `1w1v1` |
| 5       | resolve "a:2" "v2"   | `2ERR`  |

Instant 4: `B`'s rejection is an answer, staged like a value (H-12): the
change `s := 2` still waits for `A`, read in the same region, so the frame
stays. The fallback the rejection will show is not on the screen yet, so `A`
is not behind it (H-4 speaks of a fallback that is the display): its pending
read still holds the change. Instant 5: one frame — the input, the fallback.
The interpreter showed `2ERR` at instant 4, an instant before every Solid
runner (found by the review's `f3/e-nested-errored`, an `errored` inside an
`errored`; reduced to this one boundary).
