# 19 — A trailing optional value parameter of an `.rx` fn (design)

Not prototyped. Narrowed to one form.

<!-- check branch=PARSE upstream=PARSE -->
```rx
fn add(a: number, b?: number): number => a + (b ?? 3)
export default component App() { source a := 1
  <p>{add(a)}</p> }
```

Today the argument is written: `add(a, undefined)` passes both checkers and `rx-tsc`.

<!-- types branch=ok upstream=ok -->
```rx
fn add(a: number, b: number | undefined): number => a + (b ?? 3)
export default component App() { source a := 1
  <p>{add(a, undefined)}</p> }
```

**Proposal.** `b?: T`, for a **trailing value** parameter. A call may leave it out. In the body it is `T | undefined`.

**Not in it.** A default (`b: T = e`): what an omitted argument, an explicit `undefined`, and a `ref` whose value becomes `undefined` each mean is not specified. An optional `ref`. A rest parameter. An action's or a component's parameter.

**Evidence.** Of 192 surveyed primitives that are `.rx` with JavaScript beside, 85 have an optional parameter in their published types; at most 63 have no type parameter and one signature. The 63 and the 26 of [20](20-generic-fns.md) **include rest parameters, which this does
not implement** (13 of the 192 have one). No facade was rewritten.

**Gates for a prototype.** It removes a real facade line in one of the twelve packages (`media`, `keyboard` and `sortable` read an absent options record); a printed signature with `b?` reads back to the same verdicts (MO-9b); an omitted and an `undefined` argument are the same in `.rx` and from JavaScript.
