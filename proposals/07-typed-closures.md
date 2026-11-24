# 07 — A type on a closure's parameter

Needs nothing.

<!-- check branch=ok upstream=PARSE says-upstream="expected ')' near ': number) => x + 1" -->
```rx
export default component App() {
  inc = (x: number) => x + 1
  <p>{inc(1)}</p>
}
```

Under `strict`, TypeScript says of an untyped one that it is `any`:

<!-- types branch=TS7006 upstream=TS7006 -->
```rx
export default component App() {
  inc = (x) => x + 1
  <p>{inc(1)}</p>
}
```

**Proposal.** `(x: T, y: U) => …`, TypeScript's text (07 §2), as on a fn. The checker reads none of it. No result type.

**Evidence.** Closures given to libraries in the benchmark's tasks (`(e: KeyboardEvent) => …`); not counted.

**Cost.** Small in both parsers (9a8a7c9). `(a: b) => c` after `?` in a conditional is read as TypeScript reads it.

**Compatibility.** A parse error upstream. The conditionals and closures upstream accepts parse alike: the 305 `.rx` modules of its repository, and a set written for it (`scenarios/S-surface-6`, `S-surface-10`).

**Prototype.** 07 §3. S-surface-6.
