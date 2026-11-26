# 21 — A question: does an equation in a fn's body make the fn instantiate?

**Taken (2026-11-26, the roadmap's L8, DECISION "Roadmap, track 1", step 6).** E-9's first reading, as prototyped here, with three answers to its questions: a type declared beside the names is no node either (3); `SNAPSHOT_KEPT` says *a lifted call* (2); what a fn answers to JavaScript is its row's — the one package whose row would have changed (`keyboard`'s `createKeyHold`) declares `ref key`, and a unit holds it (4). The marks below are this branch's since.

Upstream's text says two things. [Bug 22](bugs/22-equations-make-a-fn-instantiate.md) is the message. Prototyped, to learn what the first reading asks. The prototype is not in this tree, and it is **not published**: a local branch, `proto-locals` at a1c93632, on 9b765d9 (with the other two: `proto-all` at b29fa898). What is said of it was run there; the rule, the scenario and the `prototype=` verdicts are that branch's.

<!-- check prototype=ok branch=ok upstream=INSTANTIATION_NOT_BOUND -->
```rx
fn area(w: number, h: number): number { half = w / 2
  half * h }
export default component App() { source a := 1
  <p>{area(a, 2)}</p> }
```

- **E-9**: a call is an instantiation if the fn has a `ref` parameter, *"or whose body declares a source, effect, or region"*. An equation is none of these.
- **RG-6**: *"a call to a function with a `ref` parameter or a node-declaring body (E-9)"*. An equation may be a node.

Both checkers follow the second. If it is meant, E-9 should say *declares anything*, and the message *declares an equation*. A way today: `fn area(w, h) => ((half) => half * h)(w / 2)`.

## Prototype of the first reading

**What is read so** (E-9b). No `ref` parameter; only equations, none keyed or `deferred`, none a call that instantiates; nothing that awaits, reads `pre` or a context, drafts, or makes a style or a server fn. Every other body is as before (one that declares a type, too). A flag on the fn, set by the loader: which call instantiates is known once a module's imports are, through a source, a signature or a declaration.

**A `const` for each, in order, is not enough.** What was needed, and is the lowering:

- A name read in **one place, not in a closure**, stands there as its expression. That is the one-line form: demand (E-3), order (E-7), errors, what is tracked. It costs nothing.
- Any **other** name is read through `__rt.names`, which evaluates it when it is read, and once for the call *and the observer that reads it*. Two cases ask for the second half. Under `peek`, `latest` or `pending?` it is evaluated there, or `(peek h) + h` would lose the input. And when the call is over it is evaluated again, or a closure that was handed back would answer an old value.

<!-- frames prototype=pass branch=pass upstream=pass -->
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

<!-- frames prototype=pass branch=pass upstream=refused -->
```rx
source n := 1
fn fact(a: number): number { rest = fact(a - 1)
  a <= 1 ? 1 : a * rest }
fn late(a: number): number { h = n * a
  (peek h) + h }
export default component App() { <p onClick={() => { n := 2 }}>{fact(5)} {late(10)}</p> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `120 20` |
| 1 | handler `n := 2` | `120 40` |

**Shown** (S-locals-1, 34 bodies in a unit on both sides, all runners). And by rewriting: a copy of `ref/` named one to three subexpressions, at random, in every one-line fn of every scenario (about 190 names, 10 seeds). The interpreter, the oracle and the compiled code, with the first lowering and with the second forced for every name, gave **every frame of every scenario**. The verdicts were the same but for one rejected variant, where the checker does not follow a name of a name (`t = kit`, then `t.t.success()`): the same on `main`, in a component.

**Cost.** Lines that are not tests: about 200 in the crate (checker and loader 125, emitter 75), 49 in `ref/`'s checker and loader, 22 in its emitter, 19 each in the interpreter and the oracle, 33 in the runtimes (84 bytes, gzip). One rule, one clause in RG-6. A shared name costs about 50 ns a call (inlined: none; a memo run again: 650 ns from 560); read in a closure, about 5 ns a read.

**Changes.** Over 2,228 modules and programs of this tree and of upstream's: the first program here and bug 22's, and the code (not the frames) of `read`. No program of either tree binds such a call. But these **do change**:

1. A bound call is an equation, not a snapshot: `x = area(a, 2)` was `SNAPSHOT_ARGUMENT` and is accepted. And a correct program is refused:

<!-- check prototype=SNAPSHOT_KEPT branch=SNAPSHOT_KEPT upstream=ok -->
```rx
fn area(w: number, h: number): number { half = w / 2
  half * h }
export default component App() { source a := 1
  x = area(peek a, 2)
  <p onClick={() => { a := 2 }}>{x}</p> }
```

2. A package's fn answers JavaScript **the value**, where it answered an accessor (MO-13f). In silence: one of the twelve rewrites, `keyboard`'s `createKeyHold(key) { holding = upper(key) == held … }`, stopped being reactive for its TSX callers, and its tests did not see it. Upstream has no packages, so this is ours ([17](17-packages.md)).
3. A name is no node: a change that does not change it no longer stops there (E-6). Frames are the same; more is evaluated.
4. A module compiled so needs a runtime that has `names`. An older one throws `names is not a function`.

**What it did not give:** a primitive of the survey, or a facade's end. The survey's primitives: none by this alone, as stated. In the twelve rewrites it is the one of the three that moves code: `history`'s log, `pagination`'s arithmetic and `presence`'s machine are `.rx` (34 of 172 lines of JavaScript go, 15 of 97 of declarations; 36 lines of `.rx` come). Those 34 could be written today with a closure called at once.

**Questions.**

1. Which sentence is meant? (The prototype does not need a third.)
2. If E-9: is the change in 1 above the right one, or should `SNAPSHOT_KEPT` say *a lifted call* there?
3. A body that declares only a type, or a type beside its equations, is left as it is. By E-9 it is lifted too.
4. To JavaScript: is a fn that reads the module's state a value or an accessor? Today the body's form decides, and neither the source nor the types say which.

**Verdict.** It is sound, and E-9 can be implemented as it is written. It is the largest of the three, for a thing that has a way round, and it moves a boundary in silence (2). **Worth the question; not worth proposing as a change until it is answered.** The message (bug 22) should be fixed either way.
