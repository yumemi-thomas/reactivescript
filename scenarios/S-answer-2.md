# S-answer-2 — a counter minted by an action that answers, or read through an equation, is the caller's stale read

Rules: AC-1h, AC-1i, AC-1d.

Found by the claims hunt and the apps hunt at 41142a46: `ACTION_ANSWER_HELD`'s own suggested fix (`mint` reading
`seq + 1`, then `send`) sent `a1` twice for two quick clicks, and so did a counter read through an equation
(`nextId = seq + 1`). An action that settles as it returns writes in its caller's run (AC-1i), so a caller that
launches an action that waits holds `mint`'s write too; an equation read in a run is its sources as committed. With
`latest seq` the second click builds on the first while both sends are out.

## Program

```rx
export default component App() {
  source seq := 0
  source sent := ""
  action mint(): number {
    let n = latest seq + 1
    seq := n
    return n
  }
  action send(t: string) {
    let r = await fetch(t) catch (e) => ""
    sent := v => v + r
  }
  <button onClick={() => { let id = mint(); send("a" + str(id)) }}>{seq}:{sent}</button>
}
```

## Frames

| instant | action                                             | frame    |
| ------- | -------------------------------------------------- | -------- |
| 0       | mount                                              | `0:`     |
| 1       | handler `let id = mint(); send("a" + str(id))`     | `0:`     |
| 2       | handler `let id = mint(); send("a" + str(id))`     | `0:`     |
| 3       | resolve "a1" "x"                                   | `0:`     |
| 4       | resolve "a2" "y"                                   | `2:xy`   |

Both flights are `a1` and `a2`: the second click read `latest seq`, the value the first click's held write moves it
toward.

## Rejected variants

the counter read plainly in the action that answers:

```rx
-- reject: STALE_NEXT_READ
export default component App() {
  source seq := 0
  source sent := ""
  action mint(): number {
    let n = seq + 1
    seq := n
    return n
  }
  action send(t: string) {
    let r = await fetch(t) catch (e) => ""
    sent := r
  }
  <button onClick={() => { let id = mint(); send("a" + str(id)) }}>{seq}:{sent}</button>
}
```

The message names `mint` (`seq := … (in mint, which this run calls) is computed from seq`).

an action that answers, given as an argument:

```rx
-- reject: STALE_NEXT_READ
export default component App() {
  source seq := 0
  source sent := ""
  action bump(): number {
    seq := seq + 1
    return 0
  }
  action send(t: string) {
    let r = await fetch(t) catch (e) => ""
    sent := r
  }
  <button onClick={() => { send("a" + str(bump())) }}>{seq}:{sent}</button>
}
```

a plain action that settles, called by another:

```rx
-- reject: STALE_NEXT_READ
export default component App() {
  source seq := 0
  source sent := ""
  action bump() { seq := seq + 1 }
  action bump2() { bump() }
  action send(t: string) {
    let r = await fetch(t) catch (e) => ""
    sent := r
  }
  <button onClick={() => { bump2(); send("x") }}>{seq}:{sent}</button>
}
```

the counter read through an equation:

```rx
-- reject: STALE_NEXT_READ
export default component App() {
  source seq := 0
  source sent := ""
  nextId = seq + 1
  action send(t: string) {
    let r = await fetch(t) catch (e) => ""
    sent := r
  }
  <button onClick={() => { let n = nextId; seq := n; send("item" + str(n)) }}>{seq}:{sent}</button>
}
```

the run's own write read through an equation (AC-1d):

```rx
-- reject: STALE_OWN_READ
export default component App() {
  source count := 1
  doubled = count * 2
  <button onClick={() => { count := count + 1; log("doubled " + str(doubled)) }}>{count}</button>
}
```

It would log `doubled 2`. Reading `doubled` before the write, or a key of a source the run did not write
(`s.a := 1; log(b2)` with `b2 = s.b * 2`), is accepted. A functional write in the action that answers (`seq := v => v +
1`) reads nothing now and is accepted too; so is a counter in `mint` whose caller launches nothing that waits.
