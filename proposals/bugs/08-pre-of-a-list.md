# `pre` of a list is the live list

What `pre` keeps of a list changes afterwards, or is never set.

<!-- frames branch=pass upstream=fail -->
```rx
export default component App() {
  source keys: string[] := []
  before = pre keys -> ["none"]
  <p>{str(before)}</p>
}
```

| instant | action | frame |
| ------- | ------- | ------- |
| 0 | mount | `["none"]` |
| 1 | handler `keys := ["A"]` | `[]` |
| 2 | handler `keys := ["A", "B"]` | `["A"]` |

<!-- frames branch=pass upstream=fail -->
```rx
export default component App() {
  source keys: string[] := []
  sequence: string[][] = [...(pre sequence -> []), keys]
  <p>{str(sequence)}</p>
}
```

| instant | action | frame |
| ------- | ------- | ------- |
| 0 | mount | `[[]]` |
| 1 | handler `keys := ["A"]` | `[[],["A"]]` |
| 2 | handler `keys := ["A", "B"]` | `[[],["A"],["A","B"]]` |

A path write is a change as well, and is another fault: nothing observes it. It was wrong on both trees until this round, in the interpreter too.

<!-- frames branch=pass upstream=fail -->
```rx
export default component App() {
  source value := { outer: { n: 1 } }
  old = pre value -> { outer: { n: 0 } }
  <p>{old.outer.n}</p>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `0` |
| 1 | handler `value.outer.n := 2` | `1` |
| 2 | handler `value.outer.n := 3` | `2` |

**On upstream (e650b85).** First program: `["none"]` at every instant. Second: `[["A"]]`, then `[["A","B"]]`. The interpreter appends twice in each instant, so it is wrong in another way.

**Spec.** C-2: `pre x` is x's value before its last change.

**Cause.** As bug 04: the root of a structured source is one store, replaced in place. What `pre` keeps is that store.

**Fix in this branch.** f9ab9ba: what is kept is a copy of the root (`__rt.kept`). The interpreter computes an equation over its own last value once an instant. Copying costs the length of the list at each change, for an equation that uses `pre` alone.

**Test.** S-pre-1, S-pre-2. For the path write (7068a05, and the browser runtime in the commit after 12ce308): what is kept is read whole and copied, and what has not changed since is handed out as the store's own value (a row of `pre rows` is the row). `pre` of a name for a *part* of a store (`x = value.outer; pre x`) still misses it. (Known gap.)
