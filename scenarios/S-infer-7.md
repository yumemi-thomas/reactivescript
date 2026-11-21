# S-infer-7 — after the `await`, an answer takes only what is the server's

Rules: AC-1g, AC-1e, W-6, ST-5a.

## Program

```rx
export default component App() {
  source rows = await fetch("rows") -> ""
  action save(id: number, t: string) {
    guess rows := v => v + "/" + t + "…"
    let r = await fetch(t) catch (e) => ""
    rows := v => v + "/" + r
  }

  errored fallback(e) { <p>error</p> } {
    <button onClick={() => { save(1, "b") }}>{rows}</button>
  }
}
```

## Frames

| instant | action                    | frame     |
| ------- | ------------------------- | --------- |
| 0       | mount                     | ``        |
| 1       | resolve "rows" "a"        | `a`       |
| 2       | handler `save(1, "b")`    | `a/b…`    |
| 3       | resolve "b" "B"           | `a/B`     |

`rows` is the server's answer (a source with a question, ST-5a). After the
`await`, the action writes into it what the server answered (`r`) onto the
answer as it stands at the write (W-6). The arguments `id` and `t` are what
the user asked for; the guess before the `await` is the change's own
picture.

## Rejected variants

```rx
-- reject: STALE_CAPTURE
export default component App() {
  source rows = await fetch("rows") -> "" catch (e) => ""
  action keep(row: { id: number; title: string }) {
    let r = await fetch("move") catch (e) => ""
    rows := v => [...v, row]
  }
  <button onClick={() => { keep({ id: 1, title: "a" }) }}>go</button>
}
```

`row` is a row as the handler saw it on screen. By the time the server
answers, another write may have changed it (a rename accepted meanwhile), and
this writes the old row back into the answer. The functional write does not
help (AC-1e's fix): the closure runs at the write, but `row` was fixed at the
click. Found by the AI eval's round 15: a move wrote the card it was given,
and a rename accepted while the move was out was lost.

```rx
-- reject: STALE_CAPTURE
export default component App() {
  source rows = await fetch("rows") -> "" catch (e) => ""
  action dup(i: number) {
    let first = rows[i]
    let r = await fetch("dup") catch (e) => ""
    rows := v => [first, ...v]
  }
  <button onClick={() => { dup(0) }}>go</button>
}
```

Through a local, too: `first` is read from `rows` before the `await`. A
position or a count worked out from the screen before the `await` is the same
(round 15: a move wrote its card back into the column it was in at the click,
after an earlier move of it had been declined, so the card showed twice).

```rx
-- reject: STALE_CAPTURE
export default component App() {
  source todo = await fetch("todo") -> "" catch (e) => ""
  source done = await fetch("done") -> "" catch (e) => ""
  action finish(id: number) {
    let r = await fetch("move") catch (e) => ""
    let row = todo
    done := v => v + row
  }
  <button onClick={() => { finish(1) }}>{todo} {done}</button>
}
```

Read after the `await`, too: `row` is `todo` as it is committed now, which
is not the server's answer to this write. Another action's accepted write to
`todo` may be held with this one (a shared list, H-11), so the read misses it
and the copy puts the old row into `done` (round 15's probe: a rename accepted
while two moves of the card were out was lost when the moves landed). A
move's answer says only where the card went: re-ask both lists.
