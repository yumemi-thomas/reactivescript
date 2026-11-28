# S-hold-8 — a ref of an element made under a hold (SC-4c)

Rules exercised: SC-4c, H-4.

An element a held change makes is made with the hold's values and shows with it: its `ref` reads those values, and what
it writes is the hold's (Solid's rule: solidjs/solid#4767, kept by #5110).

## Program

```rx
export default component App() {
  source s := 1
  source seen := -1
  A = await fetch("a:" + s)
  <div><p>{seen}</p>{errored fallback(e) { <p>error</p> } { <u>{A}</u>{if s > 1 { <i ref={(e: Element) => { seen := s }}>x</i> }} }}</div>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `` |
| 1 | resolve "a:1" "a1" | `-1a1` |
| 2 | handler `s := 2` | `-1a1` |
| 3 | resolve "a:2" "a2" | `2a2x` |
