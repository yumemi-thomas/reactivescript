# S-latest-reask — `latest` of a shown guess keeps the guess after a re-ask lands under it

Rules exercised: R-12, H-7, H-11, AC-3, AC-4, ST-4.

## Program

```rx
export default component App() {
  source rows key id = await fetch("l")
  action close(id) { try { guess rows := rows.filter(r => r.id != id); await fetch("close"); refresh rows } catch (e) {} }
  errored fallback(e) { <p>error</p> } { loading fallback { <p>loading</p> } { <p>{rows.length} / {(latest rows).length}</p> } }
}
```

A re-ask of the list from outside the action (instant 3) lands under the pending guess (instant 4). It answers the
guess's own question and differs from the guess, so it corrects the graph now (H-11, D-34): derivations re-derive from
the truth. But the slot still displays the guess, and `latest rows` answers what the slot displays: the guess, until
the hold commits (H-11; Solid D-22 and D-34, decision 3 of solidjs/solid#4695). The write landing (instant 5) ends the
body with the action's `refresh rows` in flight, so nothing commits yet (D-34); the re-ask's answer commits it all
(instant 6).

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `loading` |
| 1 | resolve "l" [{"id":1},{"id":2},{"id":3}] | `3 / 3` |
| 2 | handler `close(1)` | `2 / 2` |
| 3 | handler `refresh rows` | `2 / 2` |
| 4 | resolve "l" [{"id":1},{"id":2},{"id":3}] | `2 / 2` |
| 5 | resolve "close" 0 | `2 / 2` |
| 6 | resolve "l" [{"id":2},{"id":3}] | `2 / 2` |

## Variant: the outside answer changes the truth

The same program. The outside re-ask brings a row the guess did not see (instant 4): the graph is corrected, the screen
and `latest rows` keep the guess, and the closed row does not come back when the write lands under the action's
refresh (instant 5). The re-ask's answer commits the server's list (instant 6).

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `loading` |
| 1 | resolve "l" [{"id":1},{"id":2},{"id":3}] | `3 / 3` |
| 2 | handler `close(1)` | `2 / 2` |
| 3 | handler `refresh rows` | `2 / 2` |
| 4 | resolve "l" [{"id":1},{"id":2},{"id":3},{"id":4}] | `2 / 2` |
| 5 | resolve "close" 0 | `2 / 2` |
| 6 | resolve "l" [{"id":2},{"id":3},{"id":4}] | `3 / 3` |
