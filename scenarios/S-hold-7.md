# S-hold-7 — a write beside a shown error fallback shows at once; a `catch` answer still holds (Solid F-3, E1)

Rules: H-4, H-12, D-41, R-f-4.

## Program

```rx
export default component App() {
  source s := 1
  A = await fetch("a:" + s)

  <div><p>{s} {pending? A}</p>{errored fallback(e) { <i>X</i> } {
    {if A == "a5" { <i>yes</i> } else { <i>{A}</i> }}
  }}</div>
}
```

## Frames

| instant | action              | frame        |
| ------- | ------------------- | ------------ |
| 0       | mount               | ``           |
| 1       | resolve A "a1"      | `1 falsea1`  |
| 2       | handler `s := 2`    | `1 truea1`   |
| 3       | reject A "e2"       | `2 falseX`   |
| 4       | handler `s := 5`    | `5 trueX`    |
| 5       | resolve A "a5"      | `5 falseyes` |

Instants 2–3: the question is asked of the change and its reader is the
display, so the change holds until the answer — an error, which reveals with
`2` (an error is an answer, H-12). Instant 4: the `if` condition that asks
again is behind the error fallback, which holds nothing (H-4; Solid F-3,
pinned by its test E1 "a write publishes beside a shown error fallback"):
`5` shows at once beside the old fallback, with the question in flight
(`pending? A` is `true`). The fallback stays until an answer replaces the
error (D-41). Until 2026-11-26 the interpreter held this change: a control
reader behind the fallback still counted what it had been served.

## Variant: a catch's answer is a value, and its reader holds

```rx
export default component App() {
  source s := 1

  <div><p>{s}</p><i>{(await fetch("c:" + s) catch (e) => "none") + "!"}</i></div>
}
```

| instant | action                | frame    |
| ------- | --------------------- | -------- |
| 1       | resolve "c:1" "c1"    | `1c1!`   |
| 2       | handler `s := 2`      | `1c1!`   |
| 3       | reject "c:2" "e2"     | `2none!` |
| 4       | handler `s := 5`      | `2none!` |
| 5       | resolve "c:5" "c5"    | `5c5!`   |

Instant 3: the rejection is the answer `none` (R-f-4), and the change reveals
with it. Instant 4: that answer is not a fallback, so its reader is the
display and the next question holds the change until it answers, as any
reader's would (H-4). Until 2026-11-26 the oracle and both emitters lowered a
`catch` that is not an equation's result as an error boundary whose fallback
is the catch's value; Solid then released the reader (F-3) and showed `5none!`
at instant 4 (DV-25). Every `await` a `catch` takes is now settled where it is
awaited, as the equation's result form always was.
