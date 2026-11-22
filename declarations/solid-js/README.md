# @rx-types/solid-js

The declaration of `solid-js` 2.0 for ReactiveScript (`spec/09-modules.md`, MO-8k): the rows the checker reads when an
`.rx` module imports from Solid itself.

```sh
npm i -D @rx-types/solid-js
```

```rx
import { createStore } from "solid-js"

export default component App() {
  [todos, setTodos] = createStore<{ items: string[] }>({ items: [] })
  <button onClick={() => { setTodos((d) => { d.items.push("milk") }) }}>{len(todos.items)}</button>
}
```

It is found as an `@types` package is: `node_modules/@rx-types/solid-js/index.d.rx`, after a project's own
`rx-types/solid-js.d.rx` (which replaces it) and before a draft generated from the package's types. `rx-tsc` checks
it against Solid's own types (TY-6), and its `//@ for solid-js ^2.0.0` pin refuses another major.

Most of `solid-js` is not declared here because it is the language: a source is a signal, an equation a memo,
`effect` an effect, `draft(…)` a projection, `guess` an optimistic write, `peek` is `untrack`. What is declared is
what a program still imports: `createStore` (its setter's callback is given the store's draft), `snapshot`, `merge`,
`omit` and `flush`.
