# S-await-2 — an `await` in what an instantiating fn answers

Rules exercised: R-1, 07 §3, RG-6a, E-9.

## Program

```rx
fn useUser(ref id: number): string { await fetch("user:" + id) }
fn useLabel(ref id: number, unit: string): string {
  source n := 1
  id > 1 ? (await fetch("a:" + id)) + unit : "none " + n
}
fn useSafe(ref id: number): string { await fetch("safe:" + id) catch (e) => "down" }
fn load(id: number) => fetch("load:" + id)
export default component App() {
  source id := 1
  user = useUser(id)
  label = useLabel(id, "kg")
  safe = useSafe(id)
  direct = await load(id)
  errored fallback(e) { <p>error</p> } { loading fallback { <p>loading</p> } { <p>{user} {label} {safe} {direct}</p> } }
}
```

The result of an instantiating fn is an equation in the caller's region (RG-6a), so its `await`s are that equation's. A
fn that declares nothing is lifted into the expression that calls it: it answers the promise, and the call is awaited.

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `loading` |
| 1 | resolve "user:1" "Ada" | `loading` |
| 2 | resolve "safe:1" "ok" | `loading` |
| 3 | resolve "load:1" "L" | `Ada none 1 ok L` |
| 4 | handler `id := 2` | `Ada none 1 ok L` |
| 5 | resolve "user:2" "Bob" | `Ada none 1 ok L` |
| 6 | resolve "a:2" "5" | `Ada none 1 ok L` |
| 7 | reject "safe:2" "x" | `Ada none 1 ok L` |
| 8 | resolve "load:2" "M" | `Bob 5kg down M` |

## Rejected variants

```rx
-- reject: AWAIT_IN_EXPRESSION
fn ask(id: number): string { await fetch("user:" + id) }
export default component App() {
  source id := 1
  user = ask(id)
  errored fallback(e) { <p>error</p> } { loading fallback { <p>loading</p> } { <p>{user}</p> } }
}
```

```rx
-- reject: AWAIT_IN_EXPRESSION
export default component App() {
  source ids: number[] := [1, 2]
  users = ids.map((id) => await fetch("user:" + id))
  errored fallback(e) { <p>error</p> } { loading fallback { <p>loading</p> } { <p>{users}</p> } }
}
```
