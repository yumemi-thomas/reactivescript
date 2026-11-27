# S-loading-siblings — two sibling `loading on(id)` regions over a source with a question are accepted

Rules: CN-3e, H-6.

Found by the apps hunt at 41142a46: two sibling regions keyed on `id`, a source with a question, were refused
(`LOADING_ON_OUTSIDE_HOLD`, each region's `on(id)` counted as a read outside the other); with `source id := 1` the same
shape was accepted — it is the diagnostic's own "after" program. Refusing correct code is the worst error. A sibling
region's own `on` over the same key re-arms with the same change and holds nothing of the other's.

## Program

```rx
export default component App() {
  list = await fetch("list")
  source id = list[0]
  data = await fetch("d" + str(id))
  errored fallback(e) { <p>error</p> } {
    {loading fallback { <p>first</p> } {
      <button onClick={() => { id := id + 1 }}>n</button>
      {loading on(id) fallback { <i>s1</i> } { <p>{data}</p> }}
      {loading on(id) fallback { <i>s2</i> } { <p>{data + 1}</p> }}
    }}
  }
}
```

## Frames

| instant | action                  | frame    |
| ------- | ----------------------- | -------- |
| 0       | mount                   | `ns1s2`  |
| 1       | resolve "list" [1, 2]   | `ns1s2`  |
| 2       | resolve "d1" 10         | `n1011`  |
| 3       | handler `id := 2`       | `ns1s2`  |
| 4       | resolve "d2" 20         | `n2021`  |
