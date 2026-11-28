# S-refresh-catch — `refresh` of an equation whose failure is caught where it is awaited re-asks it

Rules: AC-4, R-f-4, R-f-4a.

Found by the apps hunt at 41142a46: `INVALID_REFRESH_TARGET`'s own "after" program (`base = await fetchNum(id) catch
(e) => 0` and `refresh base`) asked nothing on the click, in compiled code and in the oracle, so a retry after a caught
failure stayed on the caught answer for good. The equation lowers to an inner memo (the flight) read through a
boundary that computes the caught answer (R-f-4a); `refresh` re-ran the boundary. It re-asks the inner memo now.

## Program

```rx
export default component App() {
  source id := 1
  base = await fetch("n" + str(id)) catch (e) => 0
  errored fallback(e) { <p>bad</p> } {
  {loading fallback { <p>first</p> } {
  <button onClick={() => { refresh base }}>{base}</button>
  }}
  }
}
```

## Frames

| instant | action                   | frame   |
| ------- | ------------------------ | ------- |
| 0       | mount                    | `first` |
| 1       | reject "n1" "down"       | `0`     |
| 2       | handler `refresh base`   | `0`     |
| 3       | resolve "n1" 6           | `6`     |

## Variant: a first paint and a caught answer of its own

```rx
export default component App() {
  source id := 1
  base = await fetch("n" + str(id)) -> 0 catch (e) => -1
  errored fallback(e) { <p>bad</p> } {
  {loading fallback { <p>first</p> } {
  <button onClick={() => { refresh base }}>{base}</button>
  }}
  }
}
```

| instant | action                   | frame |
| ------- | ------------------------ | ----- |
| 0       | mount                    | `0`   |
| 1       | reject "n1" "down"       | `-1`  |
| 2       | handler `refresh base`   | `-1`  |
| 3       | resolve "n1" 6           | `6`   |

## Rejected variants

```rx
-- reject: INVALID_REFRESH_TARGET
export default component App() {
  ans = await fetch("a")
  fn pick(x) => x
  shown = pick(ans)
  errored fallback(e) { <p>bad</p> } {
  {loading fallback { <p>first</p> } {
  <button onClick={() => { refresh shown }}>{shown}</button>
  }}
  }
}
```

`pick`'s body asks nothing: the message names `refresh ans`.

```rx
-- reject: INVALID_REFRESH_TARGET
export default component App() {
  source ans = await fetch("a") -> 0
  source issues = ans == 0 ? 1 : ans
  <button onClick={() => { refresh issues }}>{issues}</button>
}
```
