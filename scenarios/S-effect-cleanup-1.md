# S-effect-cleanup-1 — an input computed again to the same value keeps what the block set up

Rules exercised: EF-2, EF-5, O-2.

## Program

```rx
export default component App() {
  source x := 1
  source name := "a"
  source rows: { n: number }[] := [{ n: 1 }]
  source shown := true
  effect (x > 0) { log("on", $0); return () => { log("off", $0) } }
  if (shown) { <Watch x={x} name={name} rows={rows} /> }
}
component Watch(props: { x: number; name: string; rows: { n: number }[] }) {
  effect (props.x > 1, props.name, { n: len(props.rows) }, props.rows[0].n % 2) { log("in"); return () => { log("out") } }
  <b>{props.x}</b>
}
```

Instants 1 and 2 compute every input again to the value the blocks last received: neither block runs, so neither cleanup
does (EF-5: before the *next run of the block*, or when its region ends). Instant 3 changes one input of the second
effect, and 5 another: its cleanup, then its block. Instant 6 ends its region with a pass that fired nothing just before
it (4): the cleanup is still there to run. Instant 8 is the first effect's own change.

## Frames

| instant | action | frame | effect |
| ------- | ------ | ----- | ------ |
| 0 | mount | `1` | `log(on, true); log(in)` |
| 1 | handler `rows[0].n := 3` | `1` | |
| 2 | handler `rows := [{ n: 5 }]` | `1` | |
| 3 | handler `x := 2` | `2` | `log(out); log(in)` |
| 4 | handler `x := 3` | `3` | |
| 5 | handler `name := "b"` | `3` | `log(out); log(in)` |
| 6 | handler `x := 4` | `4` | |
| 7 | handler `shown := false` | `` | `log(out)` |
| 8 | handler `x := 5` | `` | |
| 9 | handler `x := 0` | `` | `log(off, true); log(on, false)` |
| 10 | handler `x := -1` | `` | |
| 11 | handler `x := 1` | `` | `log(off, false); log(on, true)` |

Found by rewriting solid-primitives in `.rx` (2026-11-24): the compiled effect lost its listener where the interpreter
kept it. Solid's effect runs the cleanup whenever its compute answers a new value, and an effect of several inputs
answers a new list; the pass that fires nothing handed none back.

## Variant: what is set up, on screen

The count is what the block has set up and not undone; the browser runs it too.

```rx
export default component App() {
  source x := 1
  source live := 0
  effect (x > 0) { live := n => n + 1; return () => { live := n => n - 1 } }
  <b>{x} {live}</b>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `1 0` |
| 1 | (effect) | `1 1` |
| 2 | handler `x := 2` | `2 1` |
| 3 | handler `x := 3` | `3 1` |
