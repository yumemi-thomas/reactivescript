# An import named as one of the language's functions is dropped

`len`, `str`, `sum`, `map`, `filter`, `every`, `indexOf`, `log`, `fetch` and `fail` are functions, not syntax. A JS import of one of these names is replaced by the language's.

<!-- app branch=ok upstream=ok says-branch="import { len as w$len }" says-upstream="const v$len = __B.len" -->
```rx
import pure { len } from "./lib.js"
export default component App() { <p>{len("abc")}</p> }
```

`./api`, the injected API, the same:

<!-- frames branch=pass upstream=fail -->
```rx
import pure { every } from "./api"
export default component App() {
  a = await every("k")
  errored fallback(e) { <p>error</p> } { loading fallback { <p>loading</p> } { <p>{a}</p> } }
}
```

| instant | action | frame |
| ------- | ------- | ------- |
| 0 | mount | `loading` |
| 1 | resolve "every:k" "asked" | `asked` |

And the projection, so TypeScript refuses a correct call:

<!-- types branch=ok upstream=TS2345 -->
```rx
import pure { filter } from "./lib"
export default component App() { <p>{filter("a", 3)}</p> }
-- file: ./lib.ts
export const filter = (s: string, n: number): string => s.repeat(n);
```

Both spellings matter: `import pure { len as size }` is dropped too (the imported name decides there), and `import pure { custom as len }` keeps its import on both trees. An `.rx` import of such a name is kept.

<!-- app branch=ok upstream=ok says-branch="len as w$size" says-upstream="v$size = __B.len" -->
```rx
import pure { len as size } from "./kit.js"
export default component App() { <p>{size("x")}</p> }
```

<!-- app branch=ok upstream=ok says-branch="custom as w$len" says-upstream="custom as w$len" -->
```rx
import pure { custom as len } from "./kit.js"
export default component App() { <p>{len("x")}</p> }
```

**On upstream (e650b85).** Both checkers accept. `rxc app` writes `const v$len = __B.len` and no import. The second program shows `error` at instant 0. The third is TS2345. An import from an `.rx` module is right (`import { sum } from "./own.rx"`, run).

**Spec.** MO-8c: a JS import stays an ES import. MO-1d forbids shadowing an import; it does not name these functions.

**Cause.** The emitters, the runtime and the projection look the imported name up in the table of built-ins before they look at the binding (`ref/compile/emit.ts:250`, `ref/src/runtime.ts:190`, `compiler/src/emit.rs`).

**Fix in this branch.** a147e65: one question, *is this name bound here?*, in `compiler/src/names.rs` and `ref/src/names.ts`, asked by the checkers, the emitters, the projection and the interpreter. It also makes `import { latest }` (and `peek`, `throw`, `await`) a parse error: a word that begins an expression was accepted as a name and then read as the form.

**Test.** S-module-45; `compiler/test/names.mjs` holds every such name under every kind of binding.
