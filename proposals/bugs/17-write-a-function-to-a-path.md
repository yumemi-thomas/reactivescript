# A functional write to a path stores the function

`x := v => …` applies the function. `x.n := v => …` stores it.

<!-- frames branch=pass upstream=fail -->
```rx
export default component App() {
  source cart := { n: 1, name: "a" }
  <p>{cart.n} {cart.name}</p>
}
```

| instant | action | frame |
| ------- | ------- | ------- |
| 0 | mount | `1 a` |
| 1 | handler `cart.n := v => v + 1` | `2 a` |

**On upstream (e650b85).** The next read throws: `Cannot read properties of undefined (reading 'map')`.

**Spec.** W-6: `x := f` with `f` a function applies it. ST-3: a path of a structured source is written as a name is.

**Cause.** The runtime's path write sets what it is given.

**Fix in this branch.** f4e7d3c.

**Test.** S-check-3; `bench/tasks/keyed-edits`.
