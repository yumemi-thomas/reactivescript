# S-await-3 — a run reads a value that has never had one (R-8a)

Rules exercised: R-8, R-8a, R-12, AC-7.

A compiled app cannot reach this read: its button is covered, inside the region that waits (R-8,
`UNGUARDED_SNAPSHOT`). A scenario's handler row can, before the first answer. The read fails at its statement, as
`latest` of it does: what the run wrote before stands, what follows does not run, and a `try` takes it.

## Program

```rx
export default component App() {
  source s := 1
  source got := ""
  source n := 0
  A = await fetch("a:" + s)
  <p>{got}:{n}</p>
  {loading fallback { <u>w</u> } { {errored fallback(e) { <b>E</b> } { <i>{A}</i><button onClick={() => { n := n + 1
    try { got := A + "!" } catch (e) { got := "not yet" } }}>b</button> }} }}
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `:0w` |
| 1 | handler `n := 1; try { got := A + "!" } catch (e) { got := "not yet" }` | `not yet:1w` |
| 2 | resolve "a:1" "a1" | `not yet:1a1b` |
| 3 | handler `n := 2; try { got := A + "!" } catch (e) { got := "not yet" }` | `a1!:2a1b` |
