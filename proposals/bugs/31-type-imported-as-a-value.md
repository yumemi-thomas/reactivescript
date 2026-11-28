# A type imported from JavaScript is imported when the module runs

<!-- app branch=ok upstream=ok says-upstream="T as w$T" -->
```rx
import { T } from "./types.js"
export default component App() {
  x: T = { a: 1 }
  <p>{x.a}</p>
}
-- file: ./types.js
export {};
-- file: ./types.d.ts
export type T = { a: number };
```

**On upstream (e650b85).** Both checkers accept. The module does not load: `./types.js` exports no `T`.

**Spec.** 07 §2: a type is TypeScript's. There is no `import type`, and TypeScript leaves out what is imported for types alone.

**Cause.** A name whose `.d.rx` row is a type is left out. A name with no row is imported.

**Fix in this branch.** A name that stands in types and nowhere else in its module is not imported. In both emitters.

**What remains** (2026-11-25): the import stays where the name is not written at all, where it is also a record's key, a member or a local, and where it stands in a call's type arguments alone. Such a module compiles, and loads only if the module has the name. TypeScript leaves each of them out.

<!-- app branch=ok upstream=ok says-branch="T as w$T" -->
```rx
import { T } from "./types.js"
export default component App() {
  x = { T: 1 }
  y: T = { a: x.T }
  <p>{y.a}</p>
}
-- file: ./types.js
export {};
-- file: ./types.d.ts
export type T = { a: number };
```

**Test.** `compiler/test/js-host.mjs`. (`rx-lib`, which upstream does not have, did not ship a module imported for its types alone: fixed, in the same test.)
