# S-guess-writable-2 — A guess over a writable store: per key, and whole

Rules exercised: AC-3 (guess over a `:=` source, path targets), ST-1,
ST-2c, H-2; Solid `createOptimisticStore(() => truth)` over `createStore(v)`.

## Program

```rx
export default component App() {
  source rows := [{ id: 1, t: "A" }, { id: 2, t: "B" }]
  action rename(i, t) {
    try { guess rows[i].t := t; let r = await fetch("save"); rows[i].t := r } catch {}
  }
  action drop(id) {
    try { guess rows := rs => filter(rs, r => r.id != id); await fetch("del"); rows := rs => filter(rs, r => r.id != id) } catch {}
  }

  <ul>{for r in rows { <li>{r.t}</li> }}</ul>
}
```

The store's truth is its plain writes; a guess lays over it per key
(`rows[i].t`) or whole (`rows := rs => …`) until the action's hold commits.

## Frames

| instant | action                  | frame |
| ------- | ----------------------- | ----- |
| 0       | mount                   | `AB`  |
| 1       | handler `rename(0, "X")`| `XB`  |
| 2       | resolve "save" "Y"      | `YB`  |
| 3       | handler `drop(1)`       | `B`   |
| 4       | resolve "del" 0         | `B`   |

Instant 2: the server's answer `Y` is the plain write; it lands with the
hold, and the guess `X` ends with it. Instant 3: a whole guess removes the
row at once; instant 4: the plain write removes it from the truth, so the
end of the guess changes nothing.

## Variant: the save fails — the path guess reverts

| instant | action                  | frame |
| ------- | ----------------------- | ----- |
| 2       | reject "save" "boom"    | `AB`  |

## Variant: the delete fails — the row comes back

| instant | action                  | frame |
| ------- | ----------------------- | ----- |
| 4       | reject "del" "boom"     | `YB`  |
