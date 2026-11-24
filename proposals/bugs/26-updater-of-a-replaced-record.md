# An updater is given the last record, not what the source holds

<!-- frames branch=pass upstream=fail -->
```rx
export default component App() {
  source user: { n: number } | null := { n: 1 }
  <p>{user ? user.n : "-"}</p>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `1` |
| 1 | handler `user := null` | `-` |
| 2 | handler `user := u => u ? u : { n: 9 }` | `9` |
| 3 | handler `user := u => null` | `-` |

**On upstream (e650b85).** `1` at 2, and `1` at 3: `user := u => null` does nothing.

**Spec.** W-6: the function is applied to the slot *as it stands*, and its result is written.

**Cause.** A source that begins as a record is a store behind a signal (ST-1). An updater went to the store, which still had the old record; and Solid's store setter ignores an answer that is no object.

**Fix in this branch.** The updater is given the signal's value where that is not the store; an answer that is no object is written to the signal.

**Not changed, and known.** With a *guess* on such a source, a `null` (written or guessed) is not shown: the optimistic store cannot hold it, and the write throws. Loud for a write; a guess of `null` is lost in silence.

**Test.** S-function-source.
