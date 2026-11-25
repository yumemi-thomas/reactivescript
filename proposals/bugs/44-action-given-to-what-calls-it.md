# An action given by name to what calls it at once is accepted

Written as a closure it is refused; by its name it is not. A list's method:

<!-- check branch=ok upstream=ok -->
```rx
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  y = [1, 2].map(inc)
  <p>{len(y)}</p>
}
```

A fn of the module that calls its parameter:

<!-- check branch=ok upstream=ok -->
```rx
fn ap(f) => f()
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  y = ap(inc)
  <p>{y}</p>
}
```

The closure:

<!-- check branch=ACTION_CALLED_IN_OWNED_SCOPE upstream=ACTION_CALLED_IN_OWNED_SCOPE -->
```rx
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  y = [1, 2].map(() => inc())
  <p>{len(y)}</p>
}
```

**Spec.** R-io-3: an `io` value is called in an io scope only; carrying it is no call, and "its type carries the row".

**Cause.** The checkers do not know that a parameter is called. JavaScript is bug 05's last program: an action given there may be called later, and refusing it would refuse correct code. These two are known to call now.

**Not fixed here.** For JavaScript, this branch's generator no longer writes `pure` on a fn that runs a function it finds in its argument, so such a call is refused as an undeclared one is (09 MO-8j; `tooling/rx-language-server/test/infer-called.js`).
