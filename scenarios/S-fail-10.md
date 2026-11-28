# S-fail-10 — nested typed boundaries hand over when the failure changes class after a pending answer

Rules exercised: R-f-4, H-12; DV-31.

Found by the server hunt (`probes/red3/nest-class`). Three boundaries nest: an untyped one, a `NotFound` one, a
`TooLong` one around the reader. The value fails with `NotFound` (the answer is `null`), which passes the `TooLong`
boundary to the `NotFound` one. A change asks again (held: an `errored` region on its fallback stays there while
the content is pending, Solid D-41), and the new answer fails with `TooLong`: the failure changed class, so the
`NotFound` boundary re-decides and the `TooLong` one, nearer the reader, shows it (R-f-4). Solid keeps the stale
`NotFound` fallback until a value lands (DV-31, below); without the pending answer it hands over (the variant
"synchronous").

## Program

```rx
error NotFound(id) => `no user ${id}`
error TooLong(n) => `too long: ${n}`
source id := "9"
u0 = await fetch("u:" + id)
u = u0 == null ? throw NotFound(id) : id == "long" ? throw TooLong(42) : u0

export default component App() {
  <p>#{id}</p>
  errored fallback(e) { <p>other: {e.message}</p> } {
    errored fallback(e: NotFound) { <p>NotFound: {e.message}</p> } {
      errored fallback(e: TooLong) { <p>TooLong n={e.n}: {e.message}</p> } {
        <p>user {u.name}</p>
      }
    }
  }
}
```

## Frames

| instant | action                            | frame                              |
| ------- | --------------------------------- | ---------------------------------- |
| 0       | mount                             | ``                                 |
| 1       | resolve "u:9" null                | `#9NotFound: no user 9`            |
| 2       | handler `id := "long"`            | `#longNotFound: no user 9`         |
| 3       | resolve "u:long" { name: "L" }    | `#longTooLong n=42: too long: 42`  |
| 4       | handler `id := "1"`               | `#1TooLong n=42: too long: 42`     |
| 5       | resolve "u:1" { name: "Ann" }     | `#1user Ann`                       |

Instant 2: the change shows at once beside the fallback, which stays while the answer is out (H-4, D-41). Instant 3:
`TooLong` passes nothing — the inner boundary takes it, and the `NotFound` boundary, whose content now has a value,
leaves its fallback. Instant 4: the same hold, now on the inner fallback. Instant 5: a value replaces the error.

## Variant: synchronous

```rx
error NotFound(id) => `no user ${id}`
error TooLong(n) => `too long: ${n}`
source id := "9"
u0 = id == "9" ? null : { name: "x" }
u = u0 == null ? throw NotFound(id) : id == "long" ? throw TooLong(42) : u0

export default component App() {
  <p>#{id}</p>
  errored fallback(e) { <p>other: {e.message}</p> } {
    errored fallback(e: NotFound) { <p>NotFound: {e.message}</p> } {
      errored fallback(e: TooLong) { <p>TooLong n={e.n}: {e.message}</p> } {
        <p>user {u.name}</p>
      }
    }
  }
}
```

| instant | action                    | frame                              |
| ------- | ------------------------- | ---------------------------------- |
| 0       | mount                     | `#9NotFound: no user 9`            |
| 1       | handler `id := "long"`    | `#longTooLong n=42: too long: 42`  |
| 2       | handler `id := "1"`       | `#1user x`                         |

The same change of class with no answer pending: every runner hands over.

## Variant: two typed boundaries

```rx
error NotFound(id) => `no user ${id}`
error TooLong(n) => `too long: ${n}`
source id := "9"
u0 = await fetch("u:" + id) catch (e) => null
u = u0 == null ? throw NotFound(id) : id == "long" ? throw TooLong(42) : u0

export default component App() {
  <p>#{id}</p>
  errored fallback(e: NotFound) { <p>NotFound: {e.message}</p> } {
    errored fallback(e: TooLong) { <p>TooLong n={e.n}: {e.message}</p> } {
      <p>user {u.name}</p>
    }
  }
}
```

| instant | action                            | frame                              |
| ------- | --------------------------------- | ---------------------------------- |
| 0       | mount                             | ``                                 |
| 1       | resolve "u:9" null                | `#9NotFound: no user 9`            |
| 2       | handler `id := "long"`            | `#longNotFound: no user 9`         |
| 3       | resolve "u:long" { name: "L" }    | `#longTooLong n=42: too long: 42`  |
| 4       | handler `id := "1"`               | `#1TooLong n=42: too long: 42`     |
| 5       | resolve "u:1" { name: "Ann" }     | `#1user Ann`                       |

No untyped boundary: the fetch's rejection is an answer at the `await` (R-f-4), so the two typed boundaries
discharge everything that can reach the reader. The outer one is the top of the hand-over, as above.

## Divergences (DV-31)

- oracle "Frames" instant 3: `#longNotFound: no user 9`
- oracle "Frames" instant 4: `#1NotFound: no user 9`
- oracle "Variant: two typed boundaries" instant 3: `#longNotFound: no user 9`
- oracle "Variant: two typed boundaries" instant 4: `#1NotFound: no user 9`

Solid (main 510bb8d01, npm 2.0.4): an error boundary that took a failure rethrown by an inner boundary's fallback does
not leave its fallback when, after a pending answer, the failure changes to a class the inner boundary takes — when
the inner boundary is made inside the outer one's content and handed out unread (as JSX nests `<Errored>`), and the
failing read is a render effect's (as `insert` reads). The `NotFound` fallback stays until a value lands. Plain
Solid: `ref/oracle/repros/dv31-rethrow-then-caught.mjs async own effect` (`STUCK`; `sync own effect` and `async
effect` hand over); spec/05 DV-31.
