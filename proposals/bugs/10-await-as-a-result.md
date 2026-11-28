# `await` as what a fn answers is accepted and does not compile

A fn that names the await first (`r = await …`, then `r`) compiles. The same without the name does not.

<!-- frames branch=pass upstream=refused -->
```rx
import pure { fetch } from "./prelude"
fn useUser(ref id: number): string { await fetch("user:" + id) }
export default component App() {
  source id := 1
  user = useUser(id)
  errored fallback(e) { <p>error</p> } { loading fallback { <p>loading</p> } { <p>{user}</p> } }
}
```

| instant | action | frame |
| ------- | ------- | ------- |
| 0 | mount | `loading` |
| 1 | resolve "user:1" "Ada" | `Ada` |

In a closure of reactive scope it has no meaning, and is accepted:

<!-- check branch=AWAIT_IN_EXPRESSION upstream=ok -->
```rx
import pure { ask } from "./ask.js"
export default component App() {
  source ids: number[] := [1, 2]
  users = ids.map((id) => await ask(id))
  errored fallback(e) { <p>error</p> } { loading fallback { <p>loading</p> } { <p>{str(users)}</p> } }
}
```

**On upstream (e650b85).** Both checkers accept both. The first: `` not compiled — `await` outside an equation's result position is not lowered yet ``.

**Spec.** R-1; RG-6a: the result of an instantiating fn is an equation of the caller's region, so its `await` is that equation's.

**Cause.** The lowering knows `await` in an equation's right side only. The check that refuses it elsewhere does not look into closures or fn bodies.

**Fix in this branch.** 1debe04: an instantiating fn's result is lowered as the equation it is. In a fn that declares nothing, and in a closure of reactive scope, it is `AWAIT_IN_EXPRESSION`, with the line and what to write.

**Test.** S-await-2.
