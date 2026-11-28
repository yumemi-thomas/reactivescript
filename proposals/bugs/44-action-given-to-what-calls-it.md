# An action given by name to what calls it at once is accepted

Written as a closure it is refused; by its name it is not. A list's method:

<!-- check branch=ACTION_CALLED_IN_OWNED_SCOPE upstream=ok -->
```rx
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  y = [1, 2].map(inc)
  <p>{len(y)}</p>
}
```

A fn of the module that calls its parameter:

<!-- check branch=ACTION_CALLED_IN_OWNED_SCOPE upstream=ok -->
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

**Fixed on `rx-best` (2026-11-26), for what is known to call now.** In reactive scope, an action or an `io` value given by name is read as its closure where the callee calls it while the call runs: the language's own methods and functions that call what they are given (`map`, `filter`, `some`, `every`, `find`, `reduce`, `forEach`, `flatMap`, `toSorted`, `replace`), and a fn of the module whose body calls that parameter (by its name, or by giving it to one of those; outside any closure, or in a closure given to one of those). What may keep it is as it was: a JavaScript import, a prop, a record, a fn that hands it back. The count that decided it (`spec/archive/mo8j-action-by-name-2026-11-26.md` on `rx-gen`): as an argument of any call the rule refuses no program of either tree or of the benchmark, but would refuse correct ones that are not there (`preventDefault(save)`, `createCallback(save)`); kept to these callees it refuses none of them. S-check-4; 120 programs.

**Left open on `rx-best`.** A fn of *another* module that calls its parameter (the printed signature does not say so), a parameter handed on to a second fn, an action reached through a record or a list (`[inc].map(g => g())`). For JavaScript, this branch's generator no longer writes `pure` on a fn that runs a function it finds in its argument, so such a call is refused as an undeclared one is (09 MO-8j; `tooling/rx-language-server/test/words/cases.json`). The first three are now refused: the checkers follow "a value that holds io" into lists, records, closure parameters, `for` rows and the fns that call a path of their parameter (a fixpoint, and across modules by the signature's `calls(…)`), 04 R-io-3, S-check-6. Still open: an io value inside a value whose type is not read, and one given to JavaScript that calls it at once (bugs/05).
