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

**Test.** `compiler/test/js-host.mjs`. (`rx-lib`, which upstream does not have, did not ship a module imported for its types alone: fixed, in the same test.)
