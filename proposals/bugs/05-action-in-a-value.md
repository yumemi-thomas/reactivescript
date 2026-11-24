# An action handed back by a fn can be called in a view

The action is a field of a record. Called by its own name it is refused; called as a field, it is accepted and throws.

<!-- check branch=ACTION_CALLED_IN_OWNED_SCOPE upstream=ok -->
```rx
fn mk() {
  source n := 0
  action set(v: number) { n := v }
  { n: n, set: set }
}
export default component App() {
  m = mk()
  <p>{m.set(2)}</p>
}
```

A tuple's item, the same:

<!-- check branch=ACTION_CALLED_IN_OWNED_SCOPE upstream=ok -->
```rx
fn mk() {
  source n := 0
  action set(v: number) { n := v }
  [n, set]
}
export default component App() {
  [n, set] = mk()
  <p>{set(2)}</p>
}
```

Through a record of the caller's own:

<!-- check branch=ACTION_CALLED_IN_OWNED_SCOPE upstream=ok -->
```rx
fn mk() {
  source n := 0
  action set(v: number) { n := v }
  { set: set }
}
export default component App() {
  m = mk()
  box = { nested: m }
  <p>{box.nested.set(1)}</p>
}
```

**Not fixed, on both trees:** an action given by name to JavaScript that calls it at once, while a view computes. It halts, loudly (`ACTION_CALLED_IN_OWNED_SCOPE`). A checker that refused an action there would refuse every deferred callback (`useMutation({ onSuccess: finish })`).

<!-- check branch=ok upstream=ok -->
```rx
import { read } from "./kit.js"
export default component App() {
  source n := 0
  action go() { n := 1 }
  <p>{read(go)}</p>
}
-- file: ./kit.d.rx
export pure fn read(cb: () => void): number
```

**On upstream (e650b85).** Both checkers accept. Run: `[ACTION_CALLED_IN_OWNED_SCOPE] Calling an action inside an owned scope (component, computation) is not allowed`, and the reactive system halts. The same holds through another module (run).

**Spec.** R-io-3: an `io` value is called in an io scope only. R-io-2: an action is io.

**Cause.** The checkers give a fn's result no row for its parts.

**Fix in this branch.** aae73ab: the checkers know which parts of a fn's result are actions, through names, fns and modules. A printed signature says them (`: { set: io }`, MO-9b). A call in a handler is accepted as before.

**Test.** S-action-5.
