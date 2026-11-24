# An effect loses its listener when an input is computed to the same value

The input `x > 0` is computed again and is still `true`. The block does not run, which is right. Its cleanup does run, which is not.

<!-- frames branch=pass upstream=fail -->
```rx
export default component App() {
  source x := 1
  source live := 0
  effect (x > 0) { live := n => n + 1; return () => { live := n => n - 1 } }
  <b>{x} {live}</b>
}
```

| instant | action | frame |
| ------- | ------- | ------- |
| 0 | mount | `1 0` |
| 1 | (effect) | `1 1` |
| 2 | handler `x := 2` | `2 1` |

The control: where the input changes, the cleanup and the block both run, on both trees. Disposal is the third case to pin.

<!-- frames branch=pass upstream=pass -->
```rx
export default component App() {
  source n := 1
  effect (n > 0) {
    log("start", $0)
    return () => { log("stop", $0) }
  }
  <p>{n}</p>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `1` | `log(start, true)` |
| 1 | handler `n := 0` | `0` | `log(stop, true); log(start, false)` |

**On upstream (e650b85).** `expected '2 1', got '2 0'`: what the block set up is gone, and nothing sets it up again. The interpreter is right; the oracle and the compiled code are both wrong, so the runners agreed.

**Spec.** EF-5: the cleanup runs before the block's next run, or when its region ends. EF-2: the block runs when an input's value changes.

**Cause.** Solid's effect runs the cleanup whenever its compute answers a new value. The compute answers a fresh array of inputs, and the early return of the apply hands back no cleanup (`ref/compile/rt-web.ts`, `rt.ts`, `ref/oracle/lower.ts`).

**Fix in this branch.** 1de0feb: the cleanup is kept by the effect, and run before the next run or at the region's end.

**Test.** S-effect-cleanup-1. Found by rewriting solid-primitives' `createPresence` in `.rx`: an item never finished leaving.
