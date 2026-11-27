# S-posture-1 — a probe makes its whole computation read ahead, and what reads it (R-11; Solid D-25, followed)

Rules: R-11, H-6, H-7.

A computation that probes reads every held value as the screen shows it and
joins no hold, whatever each read says alone; so does a computation that
reads an equation that probes. Here one reader probes `n` and reads `k`,
both written by one action that waits: `k` is the screen's `0` while the
probe is `true`. The checkers say so (`PROBE_BESIDE_HELD_READ`, advice: the
program is accepted).

## Program

```rx
export default component App() {
  source n := 0
  source k := 0
  action save() { try { n := 5; k := 1; await fetch("save") } catch {} }

  <div><p>{str(pending? n) + "," + str(k)}</p></div>
}
```

## Frames

| instant | action            | frame     |
| ------- | ----------------- | --------- |
| 0       | mount             | `false,0` |
| 1       | handler `save()`  | `true,0`  |
| 2       | resolve "save" 0  | `false,1` |

## Variant: the probe in an equation of its own

```rx
export default component App() {
  source n := 0
  source k := 0
  busy = pending? n
  action save() { try { n := 5; k := 1; await fetch("save") } catch {} }

  <div><p>{str(busy) + "," + str(k)}</p></div>
}
```

| instant | action            | frame     |
| ------- | ----------------- | --------- |
| 0       | mount             | `false,0` |
| 1       | handler `save()`  | `true,0`  |
| 2       | resolve "save" 0  | `false,1` |

The same frames: the reader reads `busy`, an equation whose pass reads
ahead, so the reader reads ahead too (Solid: "a verdict reader is one while
it probes or reads a memo that does"). Moving the probe into an equation
changes nothing; the advice is given here too.

## Variant: the two reads kept apart up to the screen

```rx
export default component App() {
  source n := 0
  source k := 0
  busy = pending? n
  x = 1 + k
  action save() { try { n := 5; k := 1; await fetch("save") } catch {} }

  <div><p>x {x}</p> <p>{busy ? "busy" : "idle"}</p></div>
}
```

| instant | action            | frame         |
| ------- | ----------------- | ------------- |
| 0       | mount             | `x 1 idle`    |
| 1       | handler `save()`  | `x 1 busy`    |
| 2       | resolve "save" 0  | `x 2 idle`    |

Each read keeps its own posture: `x` reads `k` plainly and waits for the
action's change; the probe shows `busy` now. No advice. This is what the
advice says to write when `k` should wait.

## Variant: a twin is one answer either way

```rx
export default component App() {
  source n := 0
  action save() { try { n := 5; await fetch("save") } catch {} }

  <div><p>{str(pending? n) + "," + str(n)}</p></div>
}
```

| instant | action            | frame     |
| ------- | ----------------- | --------- |
| 0       | mount             | `false,0` |
| 1       | handler `save()`  | `true,0`  |
| 2       | resolve "save" 0  | `false,5` |

A plain read of the name the same computation probes, where the probe is
always evaluated, is the screen's under either reading of the rule (R-11,
Solid S-27): no advice.

## Accepted variants

```rx
-- accept: advice PROBE_BESIDE_HELD_READ
export default component App() {
  source n := 0
  source k := 0
  action save() { try { n := 5; k := 1; await fetch("save") } catch {} }
  <div><p>{str(pending? n) + "," + str(k)}</p></div>
}
```

```rx
-- accept: advice PROBE_BESIDE_HELD_READ
export default component App() {
  source n := 0
  source k := 0
  busy = pending? n
  x = 1 + k + (busy ? 1 : 0)
  action save() { try { n := 5; k := 1; await fetch("save") } catch {} }
  <div><p>x {x}</p></div>
}
```

```rx
-- accept: advice PROBE_BESIDE_HELD_READ
import pure { load } from "./api"
export default component App() {
  source id := 1
  source m := 0
  item = await load(id)
  label = str(latest m) + "," + item
  errored fallback(e) { <p>error</p> } { loading fallback { <p>…</p> } { <p>{label}</p> } }
  <button onClick={() => { m := m + 1; id := id + 1 }}>go</button>
}
```

```rx
-- accept: advice PROBE_BESIDE_HELD_READ
export default component App() {
  source x := 0
  source k := 0
  source probe := true
  m = 1 + k + (probe ? (pending? x ? 1 : 0) : 0) + x
  action save() { try { x := 1; await fetch("save") } catch {} }
  <div><p>m {m}</p> <p>k {k}</p></div>
}
```
