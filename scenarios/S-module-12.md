# S-module-12 — callbacks into JS: a declared function-typed parameter takes an imperative closure

Rules: MO-10g, W-2, SC-3, R-io-3, MO-8.

## Modules

```rx
-- module: ./query.d.rx
// a mutation hook whose options carry callbacks, and a helper that takes one directly
export pure fn useMutation(ref options: { mutationFn: (v: string) => Promise<string>; onSuccess?: () => void; retry: number }): any instantiates
export pure fn onIdle(run: () => void): any instantiates
```

```rx
-- module: ./api.d.rx
export fn addTodo(text: string): Promise<string>
```

A closure created in reactive scope is a pure function (SC-3), so a
statement-bodied one is `REACTIVE_WRITE_IN_OWNED_SCOPE` (W-2). Where a
declaration says a parameter, or a field of a record parameter, is a
function, the library calls it later, as the DOM calls a handler: a closure
passed there is checked as a handler's is, in imperative scope (MO-10g). The
declaration is the statement that it is a callback, so nothing else
loosens: a statement closure anywhere else is still refused.

## Program

```rx
import { useMutation, onIdle } from "./query.js"
import { addTodo } from "./api.js"

export default component App() {
  source saved := 0
  source idle := false
  add = useMutation({ mutationFn: addTodo, onSuccess: () => { saved := saved + 1 }, retry: 0 })
  watcher = onIdle(() => { idle := true })
  <button onClick={() => { add.mutate("milk") }}>add</button>
  <p>{saved} {idle}</p>
}
```

Accepted: `onSuccess` and `run` are declared function types, so their
closures write sources as a handler's would.

## Rejected variants

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
import { useMutation } from "./query.js"
import { addTodo } from "./api.js"
export default component App() {
  source saved := 0
  add = useMutation({ mutationFn: addTodo, retry: () => { saved := 1; 0 } })
  <p>{saved}</p>
}
```

`retry` is declared a `number`: a statement closure there is a reactive
scope's, and refused.

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
export default component App() {
  source saved := 0
  shown = [1, 2].map(n => { saved := n; n })
  <p>{shown}</p>
}
```

A closure handed to anything but a declared callback is still pure.
