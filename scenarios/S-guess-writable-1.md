# S-guess-writable-1 — A guess over a writable signal: the action's own write is its truth

Rules exercised: AC-3 (guess over a `:=` source), AC-1, ST-5a, H-2; Solid
`createOptimistic(() => truth())` over `createSignal(v)`.

## Program

```rx
export default component App() {
  source name := "Ann"
  source saving := false
  action rename(n) {
    try { guess name := n; guess saving := true; let r = await fetch("save:" + n); name := r } catch {}
  }

  <p>{name}{saving ? " …" : ""}</p>
}
```

`name` has no question: its truth is whatever is written to it plainly. The
guess shows while the action runs; the plain write after the `await` is the
action's change and lands when the hold commits, at which point the guess
ends and the truth shows. `saving` is never written plainly, so its guess is
a "while it runs" flag that reverts to `false`.

## Frames

| instant | action                      | frame     |
| ------- | --------------------------- | --------- |
| 0       | mount                       | `Ann`     |
| 1       | handler `rename("Bob")`     | `Bob …`   |
| 2       | resolve "save:Bob" "BOB"    | `BOB`     |

Instant 1: both guesses show at once. Instant 2: the body writes the
server's answer and returns; the hold commits as one frame — `name`'s
truth is `BOB`, both guesses end.

## Variant: the save fails — the guesses revert

| instant | action                      | frame     |
| ------- | --------------------------- | --------- |
| 2       | reject "save:Bob" "boom"    | `Ann`     |

Nothing wrote the truth, so `name` reverts to `Ann` and `saving` to `false`.
