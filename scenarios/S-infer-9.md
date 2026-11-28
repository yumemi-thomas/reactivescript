# S-infer-9 — a held write the next run builds on: `latest`

Rules: AC-1h, AC-1, H-9, W-4.

## Program

```rx
export default component App() {
  source seq := 0
  source cards = await fetch("cards") -> ""
  action add(id: number) {
    guess cards := v => v + "/" + str(id)
    let r = await fetch("add" + str(id)) catch (e) => ""
    cards := v => v + "/" + str(id)
  }

  errored fallback(e) { <p>error</p> } {
    <button onClick={() => { let n = latest seq + 1; seq := n; add(n) }}>{seq}:{cards}</button>
  }
}
```

A counter mints each new card's id beside the action that adds the card.
The handler joins `add`'s change (AC-1), so `seq := n` waits with it: the
screen keeps `0` until the cards are answered. `latest seq` reads the
value the held write moves `seq` toward (R-9), so the second click mints
`2`, not `1` again. The two writes of `seq` tangle the two adds into one
hold (D-8), which commits when both are answered. Solid's setter function
form does the same for a plain increment (`seq := v => v + 1`, W-6); this
run needs the value, so it reads it. S-infer-8 is the same counter
written to show now.

## Frames

| instant | action                    | frame        |
| ------- | ------------------------- | ------------ |
| 0       | mount                     | `0:`         |
| 1       | resolve "cards" "a"       | `0:a`        |
| 2       | handler `let n = latest seq + 1; seq := n; add(n)` | `0:a/1`      |
| 3       | handler `let n = latest seq + 1; seq := n; add(n)` | `0:a/1/2`    |
| 4       | resolve "add1" ""         | `0:a/1/2`    |
| 5       | resolve "add2" ""         | `2:a/1/2`    |

Until this was written, the interpreter read `latest` in imperative scope
as the committed value; Solid and the spec (R-9) read the held one.
