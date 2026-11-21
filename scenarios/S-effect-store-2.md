# S-effect-store-2 — an effect on a store follows the store back from an error

Rules exercised: EF-1, EF-2, E-12, ST-4, AC-4.

## Program

```rx
export default component App() {
  source rows key id = await fetch("l")
  effect (rows) { log($0) }
  errored fallback(e) { <p>error</p> } { loading fallback { <p>loading</p> } { <b>{len(rows)}</b> } }
}
```

A failed answer doesn't fire the apply (instant 3, EF-2a): the failure shows in the region that reads it. The next
answer (instant 5) is a store again, and the apply runs with it.

## Frames

| instant | action | frame | effect |
| ------- | ------ | ----- | ------ |
| 0 | mount | `loading` | |
| 1 | resolve "l" [{"id":1},{"id":3},{"id":4}] | `3` | `log([{"id":1},{"id":3},{"id":4}])` |
| 2 | handler `refresh rows` | `3` | |
| 3 | reject "l" "down" | `error` | |
| 4 | handler `refresh rows` | `error` | |
| 5 | resolve "l" [{"id":1},{"id":4}] | `2` | `log([{"id":1},{"id":4}])` |

Found by the timing fuzzer (round 10, r7-chain3-rx-2 seed 27): an app reported the open list's length to its tab from
`effect (filter, issues catch (e) => null)`; after a failed answer the tab kept its last count with three rows on
screen at rest. The `catch` lowered to an error boundary around the read, and the read of a store returned the store
without reading any of its keys, so once the boundary had caught the failure nothing it tracked changed again. An
effect input that is a store now enters whole, as a snapshot (S-effect-store-1); since 2026-11-19 a `catch` follows
only an `await` (R-f-4). Since then the apply also skips a failure (EF-2a, 2026-11-19: an app copying a list's
ids into a source wrote the error value there and crashed on `ids.indexOf`); the next answer fires it.

## Variant: the first answer fails

| instant | action | frame | effect |
| ------- | ------ | ----- | ------ |
| 1 | reject "l" "down" | `error` | |
| 2 | handler `refresh rows` | `error` | |
| 3 | resolve "l" [{"id":1},{"id":4}] | `2` | `log([{"id":1},{"id":4}])` |
