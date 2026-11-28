# S-guess-writable-3 — A guess and a plain write on one store with a question

Rules exercised: AC-3 (path targets), ST-5, ST-5a, ST-4, AC-4, H-2; Solid
`createOptimisticStore(() => truth)` over `createStore(fn)`.

## Program

```rx
export default component App() {
  source todos key id = await fetch("todos")
  action rename(i, t) {
    try { guess todos[i].t := t; let r = await fetch("save"); todos[i].t := r } catch {}
  }

  errored fallback(e) { <p>error</p> } {
    {loading fallback { <p>loading</p> } {
      <ul>{for x in todos { <li>{x.t}</li> }}</ul>
      <button onClick={() => { refresh todos }}>{pending? todos ? "p" : "."}</button>
    }}
  }
}
```

`todos` has a question; the action guesses one key and, once the server
answers, writes that key plainly (ST-5a: a plain write overrides the
question's answer until it is asked again). The guess lives over that truth.

## Frames

| instant | action                                                       | frame     |
| ------- | ------------------------------------------------------------ | --------- |
| 0       | mount                                                        | `loading` |
| 1       | resolve todos [{ id: 1, t: "A" }, { id: 2, t: "B" }]         | `AB.`     |
| 2       | handler `rename(0, "X")`                                     | `XB.`     |
| 3       | resolve "save" "Y"                                           | `YB.`     |
| 4       | handler `refresh todos`                                      | `YB.`     |
| 5       | resolve todos [{ id: 1, t: "Z" }, { id: 2, t: "B" }]         | `ZB.`     |

Instant 3: the plain write lands with the hold and the guess ends with it.
Instant 4: a re-ask from a handler keeps showing what is there (AC-4); its
answer replaces the written key (instant 5).

## Variant: the save fails — the guess reverts to the answer

| instant | action                  | frame |
| ------- | ----------------------- | ----- |
| 3       | reject "save" "boom"    | `AB.` |
