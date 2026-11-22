# S-module-35 — a module of the app's own that wraps a library's hook names the library's context (`export context c from "…"`)

Rules: MO-12e, MO-12a, MO-12b, MO-12c, MO-8r, MO-10c.

## Modules

```rx
-- module: ./rx-types/@demo/query.d.rx
// the library, as the project declares it: a provider, and a hook that reads what it provides
export context client
export component ClientProvider(props: { children?: View }) provides(client)
export pure fn useQuery(key: string): { data: string; status: string } uses(client)
```

```rx
-- module: ./todos.d.rx
// the app's own module over the library (MO-8r's second way): a hook that calls the library's hook, with the
// result's waiting field handed out as an accessor
export context client from "@demo/query"
export pure fn useTodos(): { data: ref string; status: ref string } uses(client)
```

```rx
-- module: ./frame.d.rx
// and one that renders the library's provider around what it is given
export context client from "@demo/query"
export component Frame(props: { children?: View }) provides(client)
```

```rx
-- module: ./chain.d.rx
// a module over a module over the library names the same context
export context client from "./todos.js"
export pure fn useCount(): ref number uses(client)
```

```rx
-- module: ./typo.d.rx
// a context the library has not
export context klient from "@demo/query"
export pure fn useTypo(): ref number uses(klient)
```

```rx
-- module: ./nowhere.d.rx
// a module with no declaration
export context client from "@demo/none"
export pure fn useNowhere(): ref number uses(client)
```

What one package does that no word says is written in a few lines of the
app's own JavaScript, declared in the words there are (MO-8r). A wrapper
around a library's hook still needs the library's provider above it, and
its declaration says so in the word a hook has, `uses(…)`. A JS context
is named only by the file that declares it (MO-12a), so the wrapper's file
says whose context it means: `export context client from "@demo/query"`
is the context `client` of the declaration an import of `@demo/query`
finds, under that declaration's key. The library's own provider then
discharges the wrapper's hook, and the wrapper's provider the library's
hook.

## Program

```rx
import { ClientProvider, useQuery } from "@demo/query"
import { useTodos } from "./todos.js"
import { Frame } from "./frame.js"
import { useCount } from "./chain.js"
component Todos() {
  todos = useTodos()
  n = useCount()
  <p>{todos.status}: {todos.data} ({n})</p>
}
component Raw() {
  q = useQuery("raw")
  <p>{q.status}</p>
}
export default component App() {
  <ClientProvider><Todos /></ClientProvider>
  <Frame><Raw /><Todos /></Frame>
}
```

Accepted.

## Rejected variants

```rx
-- reject: CONTEXT_NOT_FOUND
import { useTodos } from "./todos.js"
component Todos() {
  todos = useTodos()
  <p>{todos.status}</p>
}
export default component App() {
  <Todos />
}
```

The wrapper's hook outside the library's provider: refused where it is
written, as the library's own hook is.

```rx
-- reject: CONTEXT_NOT_FOUND
import { ClientProvider } from "@demo/query"
import { useCount } from "./chain.js"
component Count() {
  n = useCount()
  <p>{n}</p>
}
export default component App() {
  <ClientProvider><p>none</p></ClientProvider>
  <Count />
}
```

```rx
-- reject: NOT_EXPORTED
import { useTypo } from "./typo.js"
component Count() {
  n = useTypo()
  <p>{n}</p>
}
export default component App() {
  <Count />
}
```

The module named must declare the context: a name it has not is no
context.

```rx
-- reject: NOT_EXPORTED
import { useNowhere } from "./nowhere.js"
component Count() {
  n = useNowhere()
  <p>{n}</p>
}
export default component App() {
  <Count />
}
```

And a module with no declaration declares none.
