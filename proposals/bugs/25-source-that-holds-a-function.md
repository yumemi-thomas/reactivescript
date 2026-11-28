# A source that begins as a function is a derived signal

<!-- frames branch=pass upstream=fail -->
```rx
export default component App() {
  source f := () => "one"
  <p>{f()}</p>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `one` |
| 1 | handler `f := was => () => was() + "!"` | `one!` |

The interpreter and the spec agree. Both emitters and the oracle do not, in the browser and on the server.

**On upstream (e650b85).** `v$f(...) is not a function`: the source holds `"one"`.

**Spec.** V-1: a source holds a value, and a function is one. W-6: a *write* applies the function it is given, whatever the source holds. So another function is written `f := () => g`.

**Cause.** The runtime calls `createSignal(init)`. Of a function, that is Solid's derived signal.

**Fix in this branch.** A source whose first value is a function (known only when it runs) is a signal of a box. On the server it is the value. No other source changes. It was not made a derived signal `() => init`: a held write can derive that again and lose what was written, and it takes a hydration id.

**The types said the wrong thing.** `f := () => "two"` was accepted: `() => "two"` is a `() => string`. It is applied, and the source then holds `"two"`. It is refused now, as by Solid's `Setter`:

<!-- types branch=TS2322 upstream=ok -->
```rx
type F = () => string
export default component App() {
  source f: F := () => "one"
  <button onClick={() => { f := () => "two" }}>{f()}</button>
}
```

A program of S-check-3 had this mistake (`held := onShortcut(…)` called what it meant to keep).

**Places that were checked** and are right: equations, `pre`, `peek`, `latest`, `deferred`, effects, props, contexts, records, lists, keyed lists, question sources, guesses, holds, `ref` and value parameters, parts of an instantiation, module sources, hydration.

**Not changed, and known.** At a path the type is as before (a path may be a draft's). A draft's path (ST-3a) keeps a function where a source's applies it, in every runner. `{f}`, a function where text is expected, shows nothing in the interpreter and is called by Solid as a view.

**Test.** S-function-source.
