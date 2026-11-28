# An effect whose input holds a list misses the list's writes

An effect over a list itself runs. One whose input is a record or a tuple that holds the list does not.

<!-- frames branch=pass upstream=fail -->
```rx
export default component App() {
  source tags: string[] := []
  source n := 0
  effect ({ tags: tags, n: n }) { log(str($0.tags)) }
  <p>{n}</p>
}
```

| instant | action | frame | effect |
| ------- | ------- | ------- | ------- |
| 0 | mount | `0` | `log([])` |
| 1 | handler `tags := ["A"]` | `0` | `log(["A"])` |

A list given directly as the input (`effect (tags)`) is right on both trees: what is missed is a store held inside a record.

**On upstream (e650b85).** `expected effects [log(["A"])], got []`. The effect never runs again. The reference's interpreter misses the second write of the same list.

**Spec.** EF-2: the block runs when the value of an input changes.

**Cause.** A structured source is one store whose root a write replaces in place. The record holds the same store object before and after, and reading the record reads no property of it.

**Fix in this branch.** f9ab9ba: an effect's compute reads a store its input holds whole.

**Test.** S-effect-store-3.
