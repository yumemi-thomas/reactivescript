# A record or a function type is not read as a fn's result or a parameter's

These are types as TypeScript writes them. A name for the type (`type F = …`) is accepted in each place.

<!-- types branch=ok upstream=TS1005+TS1138 -->
```rx
fn mk(a: number): () => number => () => a
export default component App() { <p>{mk(1)()}</p> }
```

<!-- check branch=ok upstream=PARSE -->
```rx
fn mk(a: number): { n: number } { { n: a } }
export default component App() { <p>{mk(1).n}</p> }
```

<!-- check branch=ok upstream=PARSE -->
```rx
fn twice(f: (x: number) => number, a: number): number => f(f(a))
export default component App() { <p>{twice((x) => x + 1, 1)}</p> }
```

**On upstream (e650b85).** The first is accepted by both checkers and projects to text that is not TypeScript (TS1005, TS1138). The second and third are `PARSE`.

**Spec.** 07 §2: a type annotation is TypeScript's text.

**Cause.** A fn's result type ends at the first `{` or `=>`, and a parameter's at the first `=>`.

**Fix in this branch.** 411d6ea: a type is read as a type, wherever one is written (a source's and an equation's too). A printed signature keeps one line for each export.

**Test.** S-types-2.
