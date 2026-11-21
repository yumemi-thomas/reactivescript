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

## The result is read a field at a time (ruled 2026-11-22)

A result whose fields hold or fail is not a value the program holds: it is
read a field at a time, by a path from the name it is bound to (MO-10f).
That is what makes the check above complete. Every read of a held field is
written as a path the checker sees, so there is no other way to `data` — a
closure that returns the result, a prop, a provision, an export or a source
that holds it would each be one, and each is `RESULT_AS_VALUE`. What
travels is the field, which carries its rows as any `.rx` value does.

Spread, it is read whole:

```rx
-- reject: RESULT_AS_VALUE
import { useThing } from "./thing.js"
export default component App() {
  orig = useThing()
  q = { ...orig }
  <p>{q.status}</p>
}
```

and so it is shown,

```rx
-- reject: RESULT_AS_VALUE
import { useThing } from "./thing.js"
export default component App() {
  orig = useThing()
  <p>{orig}</p>
}
```

held in a record,

```rx
-- reject: RESULT_AS_VALUE
import { useThing } from "./thing.js"
export default component App() {
  orig = useThing()
  box = { q: orig }
  <p>{box.q.result.data}</p>
}
```

returned by a closure,

```rx
-- reject: RESULT_AS_VALUE
import { useThing } from "./thing.js"
export default component App() {
  orig = useThing()
  get = () => orig
  q = get()
  <p>{q.result.data}</p>
}
```

or passed to a component. On the other side of each of these the field
would be read where no check could see that it holds and fails: `props.q`
is a value like any other to `Child`, whatever boundary `Child` has.

```rx
-- reject: RESULT_AS_VALUE
import { useThing } from "./thing.js"
component Child(props: { q: any }) {
  <p>{props.q.status}</p>
}
export default component App() {
  orig = useThing()
  <Child q={orig} />
}
```

A closure given to a component is a way out too (the component calls it and
reads the field), and so are a provision, a write to a source from a
handler, a call, and an export — the result's name, a part of it that is a
record of held fields (`q.result`), or a fn that gives it. A module's
signature carries an equation's rows, not its fields'.

```rx
-- reject: RESULT_AS_VALUE
import { useThing } from "./thing.js"
component Kid(props: { get: () => any }) {
  {errored fallback(e) { <p>failed</p> } { <p>{props.get().status}</p> }}
}
export default component App() {
  orig = useThing()
  <Kid get={() => orig} />
}
```

```rx
-- reject: RESULT_AS_VALUE
import { useThing } from "./thing.js"
context qctx: any
component Reader() {
  q = use qctx
  <p>{q.status}</p>
}
export default component App() {
  orig = useThing()
  provide qctx = orig
  <Reader />
}
```

```rx
-- reject: RESULT_AS_VALUE
import { useThing } from "./thing.js"
export default component App() {
  source saved: any := null
  orig = useThing()
  <button onClick={() => { saved := orig }}>keep</button>
  <p>{saved == null ? "none" : saved.status}</p>
}
```

```rx
-- reject: RESULT_AS_VALUE
import { useThing } from "./thing.js"
fn statusOf(q) { q.status }
export default component App() {
  orig = useThing()
  <p>{statusOf(orig)}</p>
}
```

```rx
-- reject: RESULT_AS_VALUE
import { useThing } from "./thing.js"
export default component App() {
  orig = useThing()
  <p>{orig.status}</p>
  <ul>{for q in [orig] { <li>{q.status}</li> }}</ul>
}
```

```rx
-- reject: RESULT_AS_VALUE
import { useThing } from "./thing.js"
export thing = useThing()
export default component App() {
  <p>{thing.status}</p>
}
```

```rx
-- reject: RESULT_AS_VALUE
import { useThing } from "./thing.js"
thing = useThing()
export fn getThing() { thing }
export default component App() {
  <p>{thing.status}</p>
}
```

```rx
-- reject: RESULT_AS_VALUE
import { useThing } from "./thing.js"
component Child(props: { r: any }) {
  <p>{props.r.at}</p>
}
export default component App() {
  q = useThing()
  <Child r={q.result} />
}
```

The rest of a destructuring is the result without the fields named beside
it: it is a value only when every field that holds or fails is named.

```rx
-- reject: RESULT_AS_VALUE
import { QueryClientProvider, makeClient, useQuery } from "./query.js"
import { fetchTodos } from "./api.js"
component Todos() {
  { isFetching, ...rest } = useQuery({ queryKey: ["todos"], queryFn: fetchTodos })
  <small>{isFetching ? "refreshing" : ""} {rest.data}</small>
}
export default component App() {
  client = makeClient()
  <QueryClientProvider client={client}>
    {errored fallback(e) { <p>failed</p> } { <Todos /> }}
  </QueryClientProvider>
}
```

What is not a use of its value is accepted: another name for it (an
equation), a part of it that is a record (`r = q.result`), a comparison, a
test, and the fields themselves, wherever they go — to a component (the prop
carries the field's rows to where it is read), into a handler, or to a
source.

```rx
-- accept
import { useThing } from "./thing.js"
component Btn(props: { onPress: () => void; label: string }) {
  <button onClick={() => { props.onPress() }}>{props.label}</button>
}
component Shown(props: { data: any; at: number }) {
  <p>{props.data} at {props.at}</p>
}
export default component App() {
  source n := 0
  source saved: any := null
  orig = useThing()
  q = orig
  r = q.result
  <p>{q.status} {r.at} {orig.status} {orig == null ? "none" : "some"} {orig && orig.status}</p>
  <Btn label="again" onPress={() => { n := orig.status == "idle" ? 1 : 2 }} />
  {if orig { <small>{orig.result.at}</small> }}
  {errored fallback(e) { <p>failed</p> } {
    <Shown data={orig.result.data} at={r.at} />
    <button onClick={() => { try { saved := r.data } catch (e) { saved := null } }}>keep</button>
  }}
}
```

The compiled result reads each field where it is read (a getter per
field), so `q.status` and `r.at` read no `data`: the program does what the
checker counts.

```rx
-- accept
import { QueryClientProvider, makeClient, useQuery } from "./query.js"
import { fetchTodos } from "./api.js"
component Todos() {
  { data, ...rest } = useQuery({ queryKey: ["todos"], queryFn: fetchTodos })
  <small>{rest.isFetching ? "refreshing" : ""}</small>
  {errored fallback(e) { <p>failed</p> } { <ul>{for t in data { <li>{t}</li> }}</ul> }}
}
export default component App() {
  client = makeClient()
  <QueryClientProvider client={client}><Todos /></QueryClientProvider>
}
```

`rest` holds no field that holds or fails: `data` is named beside it.

The words are a record field's. A tuple's part that holds is an accessor
(`ref T`, MO-10b), and a result that may be absent, or sits inside another
type, has no field the checker could follow: a row word written there is
refused where it is declared, not ignored.

```rx
-- module: ./pair.d.rx
export pure fn usePair(): [pending fails(Error) any, boolean]
```

```rx
-- reject: PARSE
import { usePair } from "./pair.js"
export default component App() {
  [a, b] = usePair()
  <p>{b}</p>
}
```
