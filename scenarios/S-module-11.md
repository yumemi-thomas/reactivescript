# S-module-11 — a JS result's fields that hold and fail: a query's `data`

Rules: MO-10f, MO-10b, MO-10d, MO-12, R-f-5, CN-3d.

## Modules

```rx
-- module: ./query.d.rx
// a query library's hook: the result is a store, and reading its `data` waits for the first answer (it suspends into the
// nearest loading region) and throws the query's error (into the nearest errored one)
export context queryClient
export component QueryClientProvider(props: { client: any; children?: View }) provides(queryClient)
export pure fn makeClient(): any instantiates
export pure fn useQuery(ref options: { queryKey: any[]; queryFn: () => Promise<any> }): { data: pending fails(Error) any; isFetching: boolean } uses(queryClient)
```

```rx
-- module: ./thing.d.rx
// a result whose rows are on a nested field: `q.result.data`, or `r.data` with `r = q.result`
export pure fn useThing(): { result: { data: pending fails(Error) any; at: number }; status: string }
```

```rx
-- module: ./api.d.rx
export pure fn fetchTodos(): Promise<string[]>
```

`pending` and `fails(…)` on a field of a declared result say what a read of
that field does: `todos.data` is read as a question's reader is (MO-10d),
so it may hold, and it can fail with `Error`. The rest of the result is a
value whose fields track (MO-10b): `todos.isFetching` neither holds nor
fails. A part bound from such a field (`{ data } = useQuery(…)`) is a
reader with the same rows. Nothing changes at run time: `todos.data` is the
same property read.

## Program

```rx
import { QueryClientProvider, makeClient, useQuery } from "./query.js"
import { fetchTodos } from "./api.js"

component Todos() {
  todos = useQuery({ queryKey: ["todos"], queryFn: fetchTodos })
  <ul>{for t in todos.data { <li>{t}</li> }}</ul>
  <small>{todos.isFetching ? "refreshing" : ""}</small>
}

export default component App() {
  client = makeClient()
  <QueryClientProvider client={client}>
    {errored fallback(e) { <p>failed: {e.message}</p> } {
      {loading fallback { <p>loading…</p> } { <Todos /> }}
    }}
  </QueryClientProvider>
}
```

Accepted: `todos.data`'s `Error` is discharged by the `errored` above it,
and its first load is held by the `loading` region (in a client-only build,
CN-3d asks for that region; without it the crate's `check --spa` refuses
the program with `ASYNC_OUTSIDE_LOADING_BOUNDARY`).

## Rejected variants

```rx
-- reject: UNHANDLED_FAILURE
import { QueryClientProvider, makeClient, useQuery } from "./query.js"
import { fetchTodos } from "./api.js"
component Todos() {
  todos = useQuery({ queryKey: ["todos"], queryFn: fetchTodos })
  <ul>{for t in todos.data { <li>{t}</li> }}</ul>
}
export default component App() {
  client = makeClient()
  <QueryClientProvider client={client}>
    {loading fallback { <p>loading…</p> } { <Todos /> }}
  </QueryClientProvider>
}
```

A read of `todos.data` throws the query's error: with no `errored` above
it, R-f-5 refuses it, where before MO-10f the checker saw a plain value.

```rx
-- reject: UNHANDLED_FAILURE
import { QueryClientProvider, makeClient, useQuery } from "./query.js"
import { fetchTodos } from "./api.js"
component Todos() {
  { data } = useQuery({ queryKey: ["todos"], queryFn: fetchTodos })
  <ul>{for t in data { <li>{t}</li> }}</ul>
}
export default component App() {
  client = makeClient()
  <QueryClientProvider client={client}>
    {loading fallback { <p>loading…</p> } { <Todos /> }}
  </QueryClientProvider>
}
```

A part bound from the field carries its rows.

```rx
-- reject: CONTEXT_NOT_FOUND
import { useQuery } from "./query.js"
import { fetchTodos } from "./api.js"
component Todos() {
  todos = useQuery({ queryKey: ["todos"], queryFn: fetchTodos })
  <ul>{for t in todos.data catch (e) => [] { <li>{t}</li> }}</ul>
}
export default component App() {
  <Todos />
}
```

The hook still needs its provider (MO-12b); a `catch` on the read
discharges the field's failure where it is read.

```rx
-- reject: UNHANDLED_FAILURE
import { useThing } from "./thing.js"
export default component App() {
  q = useThing()
  <p>{q.result.data} {q.result.at} {q.status}</p>
}
```

The rows are kept by the field's path (`result.data`): a read of it, at any
depth, can fail; its siblings cannot.

```rx
-- reject: UNHANDLED_FAILURE
import { useThing } from "./thing.js"
export default component App() {
  q = useThing()
  r = q.result
  <p>{r.data}</p>
}
```

A record part bound from the result keeps its fields' rows.

```rx
-- reject: ASYNC_OUTSIDE_LOADING_BOUNDARY
-- spa
import { QueryClientProvider, makeClient, useQuery } from "./query.js"
import { fetchTodos } from "./api.js"
component Todos() {
  todos = useQuery({ queryKey: ["todos"], queryFn: fetchTodos })
  <ul>{for t in todos.data { <li>{t}</li> }}</ul>
}
export default component App() {
  client = makeClient()
  <QueryClientProvider client={client}>
    {errored fallback(e) { <p>failed: {e.message}</p> } { <Todos /> }}
  </QueryClientProvider>
}
```

In a client-only build (`-- spa`, CN-3d) the first load waits on
`todos.data`, and with no `loading` above it nothing would show until it
answers.


```rx
-- reject: UNHANDLED_FAILURE
import { QueryClientProvider, makeClient, useQuery } from "./query.js"
import { fetchTodos } from "./api.js"
component Todos() {
  todos = useQuery({ queryKey: ["todos"], queryFn: fetchTodos })
  <ul>{for t in todos["data"] { <li>{t}</li> }}</ul>
}
export default component App() {
  client = makeClient()
  <QueryClientProvider client={client}>
    {loading fallback { <p>loading…</p> } { <Todos /> }}
  </QueryClientProvider>
}
```

The field's rows do not depend on how the read is spelled: `todos["data"]`
is `todos.data`.

```rx
-- reject: ASYNC_OUTSIDE_LOADING_BOUNDARY
-- spa
import { QueryClientProvider, makeClient, useQuery } from "./query.js"
import { fetchTodos } from "./api.js"
component Todos() {
  todos = useQuery({ queryKey: ["todos"], queryFn: fetchTodos })
  <ul>{for t in todos["data"] { <li>{t}</li> }}</ul>
}
export default component App() {
  client = makeClient()
  <QueryClientProvider client={client}>
    {errored fallback(e) { <p>failed: {e.message}</p> } { <Todos /> }}
  </QueryClientProvider>
}
```

It holds too.

```rx
-- reject: UNHANDLED_FAILURE
import { QueryClientProvider, makeClient, useQuery } from "./query.js"
import { fetchTodos } from "./api.js"
component Todos() {
  todos = useQuery({ queryKey: ["todos"], queryFn: fetchTodos })
  key = "data"
  <ul>{for t in todos[key] { <li>{t}</li> }}</ul>
}
export default component App() {
  client = makeClient()
  <QueryClientProvider client={client}>
    {loading fallback { <p>loading…</p> } { <Todos /> }}
  </QueryClientProvider>
}
```

A key the checker cannot name may be any field of the result, so the read
has every field's rows at that depth: here `data`'s.

```rx
-- reject: ASYNC_OUTSIDE_LOADING_BOUNDARY
-- spa
import { QueryClientProvider, makeClient, useQuery } from "./query.js"
import { fetchTodos } from "./api.js"
component Todos() {
  todos = useQuery({ queryKey: ["todos"], queryFn: fetchTodos })
  key = "data"
  <ul>{for t in todos[key] { <li>{t}</li> }}</ul>
}
export default component App() {
  client = makeClient()
  <QueryClientProvider client={client}>
    {errored fallback(e) { <p>failed: {e.message}</p> } { <Todos /> }}
  </QueryClientProvider>
}
```

```rx
-- reject: UNHANDLED_FAILURE
import { useThing } from "./thing.js"
export default component App() {
  q = useThing()
  <p>{q["result"]["data"]}</p>
}
```

```rx
-- reject: UNHANDLED_FAILURE
import { useThing } from "./thing.js"
export default component App() {
  q = useThing()
  k = "result"
  r = q[k]
  <p>{r["data"]}</p>
}
```

An alias of a part named by a dynamic key keeps the rows of every part it
may be.

```rx
-- reject: UNHANDLED_FAILURE
import { useThing } from "./thing.js"
export default component App() {
  orig = useThing()
  q = orig
  <p>{q["result"]["data"]}</p>
}
```

An alias of the result is the result: it keeps its shape and its fields'
rows.

```rx
-- reject: ASYNC_OUTSIDE_LOADING_BOUNDARY
-- spa
import { QueryClientProvider, makeClient, useQuery } from "./query.js"
import { fetchTodos } from "./api.js"
component Todos() {
  orig = useQuery({ queryKey: ["todos"], queryFn: fetchTodos })
  todos = orig
  <ul>{for t in todos.data { <li>{t}</li> }}</ul>
}
export default component App() {
  client = makeClient()
  <QueryClientProvider client={client}>
    {errored fallback(e) { <p>failed: {e.message}</p> } { <Todos /> }}
  </QueryClientProvider>
}
```

A spread reads every field of what it spreads: `q`'s value is made by reading `result.data` (revised 2026-11-21 after review),

```rx
-- reject: UNHANDLED_FAILURE
import { useThing } from "./thing.js"
export default component App() {
  orig = useThing()
  q = { ...orig }
  <p>{q.status}</p>
}
```

and so does showing the result whole,

```rx
-- reject: UNHANDLED_FAILURE
import { useThing } from "./thing.js"
export default component App() {
  orig = useThing()
  <p>{orig}</p>
}
```

A field read through a record that holds the result is a read of that field,

```rx
-- reject: UNHANDLED_FAILURE
import { useThing } from "./thing.js"
export default component App() {
  orig = useThing()
  box = { q: orig }
  <p>{box.q.result.data}</p>
}
```

and through what a closure returns.

```rx
-- reject: UNHANDLED_FAILURE
import { useThing } from "./thing.js"
export default component App() {
  orig = useThing()
  get = () => orig
  q = get()
  <p>{q.result.data}</p>
}
```

```rx
-- reject: UNHANDLED_FAILURE
import { useThing } from "./thing.js"
component Child(props: { q: any }) {
  <p>{props.q.status}</p>
}
export default component App() {
  orig = useThing()
  <Child q={orig} />
}
```

A component given the result whole may read any field of it: its reads
carry every held field's failures.

```rx
-- accept
import { useThing } from "./thing.js"
export default component App() {
  orig = useThing()
  q = orig
  box = { q: orig }
  <p>{q.status} {box.q.result.at} {orig.status}</p>
}
```

Moved — an alias, a record that holds it — the result is not read: only
the fields read are (`status`, `result.at`), and they neither hold nor
fail. The compiled result reads each field where it is read (a getter
per field), so the program does what the checker counts.
