# S-guess-filter — a filter switch while a guess on an equation is out holds with the guess's action

Rules exercised: H-11, AC-3, ST-4; DV-30.

Found by the claims hunt at 41142a46 (guide/async.md §3's shape: `issues key id = await fetchIssues(filter)` with
guesses and a filter). The switch joins the hold of the guess it reads under (H-11, Solid D-34): the screen stays on
the old filter with the guessed list until the action ends. The interpreter tore for a guess on any equation (the rule
was read for a source with a question only); it holds now. Solid tears once a refresh of the optimistic store has
landed (DV-30, below; here the first add's), keyed or not; on a fresh store it holds (the variant).

## Program

```rx
export default component App() {
  source filter := "all"
  todos key id = await fetch(filter)
  action add(id: string) {
    guess todos := ts => [...ts, { id: id }]
    try { await fetch("add" + id); refresh todos } catch (e) { log(e) }
  }
  <p>{filter}/</p>
  {errored fallback(e) { <p>err</p> } { {loading fallback { <p>l</p> } { <p>{todos.map(x => x.id).join(",")}</p> }} }}
}
```

## Frames

| instant | action                                    | frame       |
| ------- | ----------------------------------------- | ----------- |
| 0       | mount                                     | `all/l`     |
| 1       | resolve "all" [{"id":"a"}]                | `all/a`     |
| 2       | handler `add("x")`                        | `all/a,x`   |
| 3       | resolve "addx" "ok"                       | `all/a,x`   |
| 4       | resolve "all" [{"id":"a"},{"id":"x"}]     | `all/a,x`   |
| 5       | handler `add("z")`                        | `all/a,x,z` |
| 6       | handler `filter := "open"`                | `all/a,x,z` |
| 7       | resolve "open" [{"id":"o"}]               | `all/a,x,z` |
| 8       | resolve "addz" "ok"                       | `all/a,x,z` |
| 9       | resolve "open" [{"id":"o"},{"id":"z"}]    | `open/o,z`  |

## Variant: on a fresh store

```rx
export default component App() {
  source filter := "all"
  todos key id = await fetch(filter)
  action add(id: string) {
    guess todos := ts => [...ts, { id: id }]
    try { await fetch("add" + id); refresh todos } catch (e) { log(e) }
  }
  <p>{filter}/</p>
  {errored fallback(e) { <p>err</p> } { {loading fallback { <p>l</p> } { <p>{todos.map(x => x.id).join(",")}</p> }} }}
}
```

| instant | action                                    | frame     |
| ------- | ----------------------------------------- | --------- |
| 0       | mount                                     | `all/l`   |
| 1       | resolve "all" [{"id":"a"}]                | `all/a`   |
| 2       | handler `add("z")`                        | `all/a,z` |
| 3       | handler `filter := "open"`                | `all/a,z` |
| 4       | resolve "open" [{"id":"o"}]               | `all/a,z` |
| 5       | resolve "addz" "ok"                       | `all/a,z` |
| 6       | resolve "open" [{"id":"o"},{"id":"z"}]    | `open/o,z`|

## Divergences (DV-30)

- oracle "Frames" instant 6: `open/a,x,z`
- oracle "Frames" instant 7: `open/a,x,z`
- oracle "Frames" instant 8: `open/a,x,z`

Solid (main 50a4bfdde and 510bb8d01, npm 2.0.4): a `createOptimisticStore(fn, [])` (keyed or not) over which a refresh
has landed — here the first add's — tears on the next guess: a write the guess's readers read joins no hold, and the
filter's reader shows `open` beside the old answer with the guess for as long as the action is out. Plain Solid:
`ref/oracle/repros/dv30-refresh-then-guess.mjs` (reduced: no key, one plain refresh; `norefresh` holds) and
`keyed-guess-refresh-tear.mjs` (the first form; `fresh` holds); spec/05 DV-30.
