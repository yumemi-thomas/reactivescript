# S-infer-8 — a held write the next run computes from

Rules: AC-1h, AC-1, W-4, EF-8, AC-3.

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
    <button onClick={() => { let n = seq + 1; onFlush(() => { seq := n }); add(n) }}>{seq}:{cards}</button>
  }
}
```

A counter mints each new card's id, and the handler calls the action that
adds the card. The handler joins `add`'s change (AC-1), so a plain
`seq := n` would be held until `add` settles. Here the count should show
now, so the write gets its own instant with `onFlush` (EF-8): it commits
at once and the next click reads it. S-infer-9 keeps it held and reads it
with `latest`.

## Frames

| instant | action                    | frame        |
| ------- | ------------------------- | ------------ |
| 0       | mount                     | `0:`         |
| 1       | resolve "cards" "a"       | `0:a`        |
| 2       | handler `let n = seq + 1; onFlush(() => { seq := n }); add(n)` | `0:a/1`      |
| 3       | (flush)                   | `1:a/1`      |
| 4       | handler `let n = seq + 1; onFlush(() => { seq := n }); add(n)` | `1:a/1/2`    |
| 5       | (flush)                   | `2:a/1/2`    |
| 6       | resolve "add1" ""         | `2:a/1/2`    |
| 7       | resolve "add2" ""         | `2:a/1/2`    |

Two clicks before either answer mint two ids.

## Rejected variants

```rx
-- reject: STALE_NEXT_READ
export default component App() {
  source seq := 0
  source cards = await fetch("cards") -> ""
  action add(id: number) {
    guess cards := v => v + "/" + str(id)
    let r = await fetch("add" + str(id)) catch (e) => ""
    cards := v => v + "/" + str(id)
  }
  errored fallback(e) { <p>error</p> } {
    <button onClick={() => { let n = seq + 1; seq := n; add(n) }}>{seq}:{cards}</button>
  }
}
```

`seq := n` joins `add`'s change and is held until the card is answered.
Until then the next click reads the committed `seq` (`0`), mints `1`
again, and the board has two cards with one id. The checker can see the
write is computed from its own source (through `n`) and that the run calls
an action. A write that is not computed from its own source (a draft
cleared, a flag set) is not this check's. Either fix is accepted: this
one (`onFlush`) or reading `latest seq` (S-infer-9).

A declared action that launches one that waits holds its own writes with it (2026-11-27).

```rx
-- reject: STALE_NEXT_READ
export default component App() {
  source seq := 0
  source out := ""
  action save(v: number) { try { let r = await fetch("s:" + v); out := v2 => v2 + r } catch (e) { out := "x" } }
  action note() { let n = seq + 1; seq := n; save(n) }
  <button onClick={() => { note() }}>{seq} {out}</button>
}
```

```rx
-- reject: STALE_NEXT_READ
export default component App() {
  source page := 1
  action next() {
    page := page + 1
    let r = await fetch("p" + str(page + 1)) catch (e) => ""
  }
  <button onClick={() => { next() }}>{page}</button>
}
```

A declared action holds its writes until it settles, so a second click
while the first waits reads `page` as `1` and goes to `2` again.

```rx
-- reject: STALE_NEXT_READ
export default component App() {
  source seq := 0
  source cards := ""
  action add(id: number) {
    guess cards := v => v + "/" + str(id)
    let r = await fetch("add" + str(id)) catch (e) => ""
    cards := v => v + "/" + str(id)
  }
  <button onClick={() => { let n = seq + 1; seq := v => v + 1; add(n) }}>{seq}:{cards}</button>
}
```

The functional write counts right, but `n` was read from the committed
`seq`, so the second click still mints `1` again: a functional write
beside a plain read of its source in a held change is the same error.

```rx
-- reject: STALE_NEXT_READ
export default component App() {
  source seq := 0
  source cards := ""
  action add(ids: number[]) {
    for (const id of ids) {
      let r = await fetch("add" + str(id)) catch (e) => ""
      cards := v => v + "/" + r
    }
  }
  <button onClick={() => { let n = seq + 1; seq := n; add([n]) }}>{seq}:{cards}</button>
}
```

An action whose only `await` is in a loop's body waits as much as one that
awaits at its top: the handler's write joins its change, and the next
click reads the committed `seq` (both checkers took it, until 2026-11-26,
for an action that settles as it returns).

```rx
-- reject: STALE_NEXT_READ
export default component App() {
  source seq := 0
  source done := ""
  action save(id: number) {
    let r = await fetch(str(id)) catch (e) => ""
    done := r
  }
  action note(id: number) {
    save(id)
  }
  <button onClick={() => { let n = seq + 1; seq := n; note(n) }}>{seq}:{done}</button>
}
```

`note` never waits, but it launches `save`, which does, and the change it launches is the handler's too (AC-1, D-7):
an action outlasts its call when it launches one that does. Both checkers took `note` for one that settles as it
returns until 2026-11-27 (found re-checking B10, S-answer-1).

```rx
-- reject: STALE_NEXT_READ
export default component App() {
  source seq := 0
  source done := ""
  <button onClick={() => { let n = seq + 1; seq := n; action { let r = await fetch(str(n)) catch (e) => ""; done := r } }}>{seq}:{done}</button>
}
```

An inline `action { … }` that waits holds the handler's writes as a call of a declared one does (AC-1). Missed the
same way until 2026-11-27.
