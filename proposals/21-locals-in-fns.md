# 21 — A question: does an equation in a fn's body make the fn instantiate?

No change is proposed. Upstream's text says two things, and one ruling is needed. [Bug 22](bugs/22-equations-make-a-fn-instantiate.md) is the message.

<!-- check branch=INSTANTIATION_NOT_BOUND upstream=INSTANTIATION_NOT_BOUND -->
```rx
fn area(w: number, h: number): number { half = w / 2
  half * h }
export default component App() { source a := 1
  <p>{area(a, 2)}</p> }
```

- **E-9**: a call is an instantiation if the fn has a `ref` parameter, *"or whose body declares a source, effect, or region"*. An equation is none of these.
- **RG-6**: *"a call to a function with a `ref` parameter or a node-declaring body (E-9)"*. An equation may be a node.

Both checkers follow the second. A type declared in the body instantiates too, by the same code.

**If E-9 is meant**, these must hold of any implementation, and a `const` for each equation does not give them:

- **E-7**: the order of equations is irrelevant. This renders `9` on both trees today, where the fn instantiates:

<!-- frames branch=pass upstream=pass -->
```rx
fn read(a: number) { b = c + 1
  c = a * 2
  b }
export default component App() { n = read(4)
  <p>{n}</p> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `9` |

- **E-3**: an equation nothing reaches is not evaluated. An unused local that would throw does not.
- Frames of the programs that bind such a call today stay: a bound call changes from a snapshot of its arguments to a lifted call.

**If RG-6 is meant**, E-9's sentence should say *declares anything*, and the message *declares an equation*.

**Evidence that it matters.** Weak: of 11 functions in the twelve rewrites that name a local, 3 need nothing else that `.rx` lacks. A way today:

<!-- check branch=ok upstream=ok -->
```rx
fn area(w, h) => ((half) => half * h)(w / 2)
export default component App() { source a := 1
  <p>{area(a, 2)}</p> }
```
