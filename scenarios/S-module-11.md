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
export pure fn useQuery(ref options: { queryKey: any[]; queryFn: () => Promise<any> }): { data: holds fails(Error) any; isFetching: boolean } uses(queryClient)
```

```rx
-- module: ./api.d.rx
export pure fn fetchTodos(): Promise<string[]>
```

`holds` and `fails(…)` on a field of a declared result say what a read of
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
