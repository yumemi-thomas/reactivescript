# S-catch-lowered — an `await … catch` the checker accepts is lowered wherever it stands

Rules: R-f-4, R-f-4a, R-1, ST-5, AC-3.

Found by the claims hunt and the apps hunt at 41142a46: `STALE_CAPTURE`'s own examples (`source done = await
fetchDone() -> "" catch (e) => ""`), a caught await in an `if` arm of an equation, and a guess on an equation ending in
`catch` passed `rxc check` and the editor, and the build stopped with a compiler-internal message ("`await` outside an
equation's result position is not lowered yet"). Only a plain equation's own result had a lowering in place (an inner
memo, read through a boundary); every other caught await is now hoisted and settled where it is awaited, as a nested
one always was, and the reader computes the answer (R-f-4a).

## Program

```rx
export default component App() {
  source id := 1
  source base = await fetch("n" + str(id)) catch (e) => 0
  errored fallback(e) { <p>bad</p> } {
  {loading fallback { <p>first</p> } {
  <button onClick={() => { base := base + 10 }}>{base}</button>
  }}
  }
}
```

## Frames

| instant | action                      | frame   |
| ------- | --------------------------- | ------- |
| 0       | mount                       | `first` |
| 1       | reject "n1" "down"          | `0`     |
| 2       | handler `base := base + 10` | `10`    |
| 3       | handler `refresh base`      | `10`    |
| 4       | resolve "n1" 6              | `6`     |

A source with a question whose answer is caught: the caught answer is its value, a write lays over it, and `refresh`
re-asks the flight and drops the write (AC-4).

## Variant: a caught await in an arm of an equation

```rx
export default component App() {
  source id := 1
  base = id == 0 ? 0 : (await fetch("n" + str(id)) catch (e) => -1)
  errored fallback(e) { <p>bad</p> } {
  {loading fallback { <p>first</p> } {
  <button onClick={() => { id := id + 1 }}>{base}</button>
  }}
  }
}
```

| instant | action              | frame   |
| ------- | ------------------- | ------- |
| 0       | mount               | `first` |
| 1       | reject "n1" "down"  | `-1`    |
| 2       | handler `id := 2`   | `-1`    |
| 3       | resolve "n2" 6      | `6`     |

## Variant: a guess over an equation ending in `catch`

```rx
export default component App() {
  source id := 1
  base = await fetch("n" + str(id)) catch (e) => 0
  action bump() { guess base := b => b + 100; try { await fetch("g") } catch (e) {} }
  errored fallback(e) { <p>bad</p> } {
  {loading fallback { <p>first</p> } {
  <button onClick={() => { bump() }}>{base}</button>
  }}
  }
}
```

| instant | action              | frame   |
| ------- | ------------------- | ------- |
| 0       | mount               | `first` |
| 1       | resolve "n1" 5      | `5`     |
| 2       | handler `bump()`    | `105`   |
| 3       | resolve "g" 0       | `5`     |
