# The reference lowers `<my-kit.card>` as a member

A custom element's name may hold a dot. The crate is right; the reference's emitter is not.

<!-- frames branch=pass upstream=fail runner=ref-compiled -->
```rx
export default component App() { <my-kit.card>x</my-kit.card> }
```

| instant | action | frame |
| ------- | ------- | ------- |
| 0 | mount | `x` |

**On upstream (e650b85).** `my is not defined`. The crate's code and the interpreter show `x`.

**Spec.** 07 §4: *JSX elements are verbatim*. (The narrower sentence this report had is not in upstream's §4.)

**Cause.** The reference's emitter hands the dotted name to TypeScript's JSX, which reads a member.

**Fix in this branch.** a349e48.

**Test.** A unit in `ref/units.ts`.
