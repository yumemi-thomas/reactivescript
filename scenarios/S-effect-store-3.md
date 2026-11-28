# S-effect-store-3 — an effect's input that holds a list changes when the list does

Rules exercised: EF-2, ST-2a.

## Program

```rx
export default component App() {
  source tags: string[] := []
  source n := 0
  pair = [tags, n]
  effect ({ tags: tags, n: n }) { log("rec", $0) }
  effect (tags) { log("list", $0) }
  effect (pair) { log("pair", $0) }
  <p>{str(pair)}</p>
}
```

An input is compared as a value (EF-2), and a store it holds — in a record, or in a list an equation makes — is part of
that value. A write of the whole list, and one of an item, change it; an equal one does not.

## Frames

| instant | action | frame | effect |
| ------- | ------ | ----- | ------ |
| 0 | mount | `[[],0]` | `log(rec, {"tags":[],"n":0}); log(list, []); log(pair, [[],0])` |
| 1 | handler `tags := ["A"]` | `[["A"],0]` | `log(rec, {"tags":["A"],"n":0}); log(list, ["A"]); log(pair, [["A"],0])` |
| 2 | handler `tags[0] := "Z"` | `[["Z"],0]` | `log(rec, {"tags":["Z"],"n":0}); log(list, ["Z"]); log(pair, [["Z"],0])` |
| 3 | handler `tags := ["Z"]` | `[["Z"],0]` | |
| 4 | handler `n := 1` | `[["Z"],1]` | `log(rec, {"tags":["Z"],"n":1}); log(pair, [["Z"],1])` |
