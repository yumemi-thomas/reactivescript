# S-module-11 — a query whose `data` waits: an accessor, from a module of the app's own

Rules: MO-10d, MO-10b, MO-8r, MO-10c, MO-12e, 04 CN-4a, R-f-5, CN-3d.

## Modules

```rx
-- module: ./rx-types/@demo/query.d.rx
// a query library: the client's provider, and a hook whose result is a store — reading its `data` waits for the first
// answer and throws the query's error. Its row here says what the types say: a record of plain fields
export context queryClient
export component QueryClientProvider(props: { client: any; children?: View }) provides(queryClient)
export pure fn makeClient(): any instantiates
```

```rx
-- module: ./query.d.rx
// query.js, the app's own: `useQuery` over the library's, each field handed out as a function
//   export const useQuery = o => { const q = lib.useQuery(o); return { data: () => q.data, isFetching: () => q.isFetching, refetch: () => q.refetch() }; }
export context queryClient from "@demo/query"
export pure fn useQuery(ref options: { queryKey: any[]; queryFn: () => Promise<any> }): { data: ref any; isFetching: ref boolean; refetch: () => Promise<unknown> } uses(queryClient)
```

```rx
-- module: ./old.d.rx
// as it was written until 2026-11-23
export pure fn useQuery(ref options: { queryKey: any[]; queryFn: () => Promise<any> }): { data: pending fails(Error) any; isFetching: boolean }
```

```rx
-- module: ./api.d.rx
export pure fn fetchTodos(): Promise<string[]>
```

What a library hands back that waits or throws where it is read is an
accessor to `.rx` (`ref T`, MO-10b): a reader, whose every read may hold
(MO-10d), which is all Solid says of an accessor. One library hands back a
store whose plain field does that instead (a query's `data`). Until
2026-11-23 a declaration could say so on the field, `{ data: pending
fails(Error) T }` (MO-10f), and the checker then asked for a `loading` and
an `errored` region above each read; one library wrote it, and it is
withdrawn (MO-8r). The store is handed out by a few lines of the app's own
JavaScript, a function a field, declared `ref`: its reads are then what
every library's waiting value is. The wrapper names the library's context
(MO-12e), so its hook is still refused outside the provider.

## Program

```rx
import { QueryClientProvider, makeClient } from "@demo/query"
import { useQuery } from "./query.js"
import { fetchTodos } from "./api.js"

component List(props: { items: string[] }) {
  <ul>{for t in props.items { <li>{t}</li> }}</ul>
}
component Todos() {
  todos = useQuery({ queryKey: ["todos"], queryFn: fetchTodos })
  <List items={todos.data} />
  <small>{todos.isFetching ? "refreshing" : ""}</small>
  <button onClick={() => { todos.refetch() }}>again</button>
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

Accepted. The regions are the app's to write: nothing in the declaration
asks for them.

## Rejected variants

```rx
-- reject: CONTEXT_NOT_FOUND
import { useQuery } from "./query.js"
import { fetchTodos } from "./api.js"
export default component App() {
  todos = useQuery({ queryKey: ["todos"], queryFn: fetchTodos })
  <p>{len(todos.data)}</p>
}
```

The wrapper's hook with no client above it.

```rx
-- reject: INSTANTIATION_NOT_BOUND
import { QueryClientProvider, makeClient } from "@demo/query"
import { useQuery } from "./query.js"
import { fetchTodos } from "./api.js"
component Todos() {
  <p>{len(useQuery({ queryKey: ["todos"], queryFn: fetchTodos }).data)}</p>
}
export default component App() {
  client = makeClient()
  <QueryClientProvider client={client}><Todos /></QueryClientProvider>
}
```

The query is made once, where it is bound (MO-10a).

```rx
-- reject: IO_IN_REACTIVE
import { QueryClientProvider, makeClient } from "@demo/query"
import { useQuery } from "./query.js"
import { fetchTodos } from "./api.js"
component Todos() {
  todos = useQuery({ queryKey: ["todos"], queryFn: fetchTodos })
  <p>{todos.refetch()}</p>
}
export default component App() {
  client = makeClient()
  <QueryClientProvider client={client}><Todos /></QueryClientProvider>
}
```

`refetch` answers a promise: it starts work, and is called from a handler
(MO-10b).

```rx
-- reject: PARSE
import { useQuery } from "./old.js"
import { fetchTodos } from "./api.js"
export default component App() {
  todos = useQuery({ queryKey: ["todos"], queryFn: fetchTodos })
  <p>{len(todos.data)}</p>
}
```

`pending` and `fails(…)` on a declared result's field are refused by name,
with what says it now.

The row words are `.rx`'s own before a type (04 CN-4a), and an `.rx`
component may still write them on a field of a prop's type: the prop is
then read a field at a time, each read checked where it is.

```rx
-- reject: UNHANDLED_FAILURE
component Panel(props: { query: { data: pending fails(Error) string[]; status: string } }) {
  <p>{props.query.status}: {len(props.query.data)}</p>
}
export default component App() {
  <Panel query={{ data: ["milk"], status: "success" }} />
}
```

```rx
-- reject: RESULT_AS_VALUE
component Count(props: { of: any }) {
  <b>{len(props.of.data)}</b>
}
component Panel(props: { query: { data: pending fails(Error) string[]; status: string } }) {
  {errored fallback(e) { <p>failed</p> } { <Count of={props.query} /> }}
}
export default component App() {
  <Panel query={{ data: ["milk"], status: "success" }} />
}
```

```rx
-- accept
component Count(props: { of: string[] }) {
  <b>{len(props.of)}</b>
}
component Panel(props: { query: { data: pending fails(Error) string[]; status: string } }) {
  <p>{props.query.status}</p>
  {errored fallback(e) { <p>failed</p> } { <Count of={props.query.data} /> }}
}
export default component App() {
  <Panel query={{ data: ["milk"], status: "success" }} />
}
```
