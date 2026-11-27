# S-await-3 — a run reads a value that has never had one (R-8a)

Rules exercised: R-8, R-8a, R-12, AC-7.

A button outside the region that waits can be pressed before the first answer. The read fails at its statement, as
`latest` of it does: what the run wrote before stands, what follows does not run, and a `try` takes it.

## Program

```rx
export default component App() {
  source s := 1
  source got := ""
  source n := 0
  A = await fetch("a:" + s)
  <button onClick={() => { n := n + 1
    try { got := A + "!" } catch (e) { got := "not yet" } }}>b</button>
  <p>{got}:{n}</p>
  {loading fallback { <u>w</u> } { {errored fallback(e) { <b>E</b> } { <i>{A}</i> }} }}
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `b:0w` |
| 1 | handler `n := 1; try { got := A + "!" } catch (e) { got := "not yet" }` | `bnot yet:1w` |
| 2 | resolve "a:1" "a1" | `bnot yet:1a1` |
| 3 | handler `n := 2; try { got := A + "!" } catch (e) { got := "not yet" }` | `ba1!:2a1` |
