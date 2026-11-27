# S-standing-write — a write over a source with a question stands until the question's value changes

Rules: ST-5, AC-4, H-6, H-6a.

Found by the apps hunt at 41142a46: `source id = list[0]` over a polled list lost the user's pick on every poll that
answered the same list, though the guide says the layer "resets when the server answer changes"; over a keyed list it
was kept (the rows keep their identity, so nothing recomputed). A write now stands until the question's own value
changes, keyed or not; `refresh id` still drops it (AC-4). And `loading on(id)` re-arms while what `id` is computed from is
re-asked (H-6a, Solid's `Loading`: a value `on` reads going pending is a change), so the region shows its fallback over
the data until the answer lands — though `id` does not change.

## Program

```rx
export default component App() {
  list = await fetch("list")
  source id = list[0]
  data = await fetch("d" + id)
  <button onClick={() => { refresh list }}>r</button>
  errored fallback(e) { <p>error</p> } {
    {loading fallback { <p>first</p> } {
      {loading on(id) fallback { <p>wait</p> } { <p>{data}</p> }}
    }}
  }
}
```

## Frames

| instant | action                              | frame   |
| ------- | ----------------------------------- | ------- |
| 0       | mount                               | `rwait` |
| 1       | resolve "list" ["a", "b"]           | `rwait` |
| 2       | resolve "da" "A"                    | `rA`    |
| 3       | handler `id := "b"`                 | `rwait` |
| 4       | resolve "db" "B"                    | `rB`    |
| 5       | handler `refresh list`              | `rwait` |
| 6       | resolve "list" ["a", "b"]           | `rB`    |
| 7       | handler `refresh list`              | `rwait` |
| 8       | resolve "list" ["c", "b"]           | `rwait` |
| 9       | resolve "dc" "C"                    | `rC`    |

Instant 6: the same answer, and the pick stands. Instant 8: a new answer, and the layer takes it. `refresh id` drops
the write (AC-4, S-store-4).
