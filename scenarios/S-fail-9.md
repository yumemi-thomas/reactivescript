# S-fail-9 — a catch's answer is an expression of its reader (R-f-4a)

Rules exercised: R-f-4, R-f-4a, H-4.

`alt` reads its sources where the `await` is read, as the rest of the expression does: a write to one after the rejection
shows. The `await` is settled to the failure it caught; the reader computes the answer.

## Program

```rx
export default component App() {
  source s := 1
  source t := 0
  x = await fetch("d:" + s) catch (e) => "no" + t
  <div><p>{s} {t}</p><i>{await fetch("c:" + s) catch (e) => "none" + t}</i><b>{x}</b></div>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `` |
| 1 | reject "c:1" "e1" | `` |
| 2 | reject "d:1" "e2" | `1 0none0no0` |
| 3 | handler `t := 5` | `1 5none5no5` |
