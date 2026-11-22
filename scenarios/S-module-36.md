# S-module-36 — an accessor that waits or fails: `pending` and `fails(…)` before `ref`

Rules: MO-10l, MO-10d, MO-10b, MO-10f, R-f-5, CN-3d.

## Modules

```rx
-- module: ./fetch.d.rx
// the whole result is an accessor: reading it waits for the answer (it suspends into the nearest loading region) and
// throws the request's error (into the nearest errored one)
export pure fn createJson(url: string): pending fails(Error) ref { name: string }
```

```rx
-- module: ./stream.d.rx
// an item of a tuple
export pure fn createStream(want: boolean): [pending fails(Error) ref string | undefined, { stop: () => void }]
```

```rx
-- module: ./query.d.rx
// fields of a record: `data` waits and fails, `isFetching` is an accessor that does neither
export pure fn useQuery(ref options: { key: string }): { data: pending fails(Error) ref string[]; isFetching: ref boolean; refetch: () => void }
```

```rx
-- module: ./plain.d.rx
export pure fn createClock(): ref number
```

```rx
-- module: ./old.d.rx
// before a field that is no accessor: withdrawn 2026-11-23 (MO-10f, MO-8r)
export pure fn useQuery(): { data: pending fails(Error) string[] }
```

Solid promises nothing about an accessor (MO-10d): any read can hold, and
the checker asks nothing of a reader bound from a `ref` part. A
declaration may say more of one that does wait or fail where it is read —
`pending` and `fails(…)` before the `ref`, `.rx`'s own row words in the
place a row annotation has them. A reader bound from such a part is then
checked as a question's reader is: its failure needs a `catch` or an
`errored` region above each read (R-f-5), and in a client-only build its
first load a `loading` region (CN-3d). The words stand before a `ref`
part and nowhere else: the whole result, an item of its tuple, a field of
its record. Nothing changes at run time: the read is the same call.

## Program

```rx
import { createJson } from "./fetch.js"
import { createStream } from "./stream.js"
import { useQuery } from "./query.js"
import { createClock } from "./plain.js"
component Name(props: { name: string }) {
  <b>{props.name}</b>
}
export default component App() {
  user = createJson("/user")
  [stream, controls] = createStream(true)
  todos = useQuery({ key: "todos" })
  now = createClock()
  <p>{now} {todos.isFetching ? "refreshing" : ""}</p>
  errored fallback(e) { <p>failed: {e.message}</p> } {
    loading fallback { <p>loading…</p> } {
      <p>hello {user.name}, {stream ?? "no stream"}</p>
      <Name name={user.name} />
      <ul>{for t in todos.data { <li>{t}</li> }}</ul>
    }
  }
  <button onClick={() => { controls.stop() todos.refetch() }}>stop</button>
}
```

Accepted: every read of `user`, `stream` and `todos.data` is under the
`errored` and the `loading` region; `now` and `todos.isFetching` are
accessors that say nothing, and are read anywhere.

## Rejected variants

```rx
-- reject: UNHANDLED_FAILURE
import { createJson } from "./fetch.js"
export default component App() {
  user = createJson("/user")
  loading fallback { <p>loading…</p> } { <p>hello {user.name}</p> }
}
```

A read of `user` throws the request's error: with no `errored` above it,
R-f-5 refuses it, where a plain `ref` asked nothing.

```rx
-- reject: ASYNC_OUTSIDE_LOADING_BOUNDARY
-- spa
import { createJson } from "./fetch.js"
export default component App() {
  user = createJson("/user")
  errored fallback(e) { <p>failed</p> } { <p>hello {user.name}</p> }
}
```

In a client-only build its first load needs a `loading` region.

```rx
-- reject: UNHANDLED_FAILURE
import { createStream } from "./stream.js"
export default component App() {
  [stream, controls] = createStream(true)
  loading fallback { <p>asking</p> } { <p>{stream ?? "none"}</p> }
}
```

An item of a tuple carries its rows to the name bound from it.

```rx
-- reject: UNHANDLED_FAILURE
import { useQuery } from "./query.js"
export default component App() {
  { data } = useQuery({ key: "todos" })
  loading fallback { <p>loading…</p> } { <ul>{for t in data { <li>{t}</li> }}</ul> }
}
```

So does a field of a record.

```rx
-- reject: UNHANDLED_FAILURE
import { createJson } from "./fetch.js"
component Name(props: { name: string }) {
  <b>{props.name}</b>
}
export default component App() {
  user = createJson("/user")
  first = user.name
  loading fallback { <p>loading…</p> } { <Name name={first} /> }
}
```

An equation over the reader, and a prop given it, carry the rows on: the
read is where the child reads its prop.

```rx
-- reject: RESULT_AS_VALUE
import { useQuery } from "./query.js"
component List(props: { query: any }) {
  <p>list</p>
}
export default component App() {
  todos = useQuery({ key: "todos" })
  <List query={todos} />
}
```

A result with a part that waits or fails is read a part at a time, as one
with such fields was (MO-10f): passed whole, the part's rows would be lost
on the way. `<List todos={todos.data} />` passes the part, with its rows.

```rx
-- reject: PARSE
import { useQuery } from "./old.js"
export default component App() {
  <p>{useQuery ? "query" : ""}</p>
}
```

Before a field that is no accessor the words are refused by name: such a
field is handed out as a function by the app's own module, and declared
`pending fails(Error) ref T`.
