# S-catch-snapshot — a read in a handler is a snapshot: the committed value while a question is out, and a failure it can catch

Rules exercised: R-8, R-f-4, R-f-6, R-f-7, AC-4, AC-7.

## Program

```rx
export default component App() {
  source ans = await fetch("a") -> 0
  source seen := 0
  action reload() { try { await fetch("save"); refresh ans } catch (e) {} }
  action note(d: number) { try { seen := ans + d } catch (e) { seen := -1 } }
  errored fallback { <p>err seen {seen}</p> } { <p>{ans} seen {seen}</p> }
}
```

In an action (or any handler) every read is a snapshot (R-8): an equation
with a new question out reads its committed value, and a failed one throws
its failure there (R-f-7), which the action catches (R-f-6, AC-7). Instant
4: the action's `refresh` is out, and `note`'s read of `ans` is `2`, what
the screen shows. Instant 6: the answer failed, so the read throws and the
handler's `catch` writes `-1`.

Found by the eval board (r15prep, `catch-read-in-handler-during-refresh.rx`):
the compiled read built a fresh error boundary at each read, which in a
handler had no committed value while the refresh was out, so the click
threw `NotReadyError` and was lost. Since 2026-11-19 a `catch` follows only
an `await` (R-f-4); the rejected variant below was this scenario's first
program.

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `0 seen 0` |
| 1 | resolve "a" 2 | `2 seen 0` |
| 2 | handler `note(0)` | `2 seen 2` |
| 3 | handler `reload()` | `2 seen 2` |
| 4 | resolve "save" 0 | `2 seen 2` |
| 5 | handler `note(1)` | `2 seen 3` |
| 6 | reject ans "down" | `err seen 3` |
| 7 | handler `note(0)` | `err seen -1` |

## Rejected variants

```rx
-- reject: CATCH_NOT_ON_AWAIT
export default component App() {
  source ans = await fetch("a") -> 0
  fn cur() => ans catch (e) => -1
  source seen := 0
  action note(d: number) { seen := cur() + d }
  errored fallback { <p>err</p> } { <p>{ans} seen {seen}</p> }
}
```

R-f-4: a `catch` follows an `await`. A handler that reads a failed value
catches it in its own `try`.
