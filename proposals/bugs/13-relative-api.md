# `../api` and `./lib/api` are taken for the injected API

The file is not read, and the call is a request of the app's injected API.

<!-- app branch=ok upstream=ok says-branch="load as w$load" says-upstream="__rt.api(" -->
```rx
import pure { load } from "../api"
export default component App() { <p>{load(5)}</p> }
```

**On upstream (e650b85).** `rxc app` writes `const v$load = __rt.api("load")` and no import.

**Spec.** MO-8c: the one exception is `./api`.

**Cause.** The emitters ask whether the specifier ends with `/api` (`compiler/src/emit.rs:284` and `:699`, `ref/compile/emit.ts:250`, `ref/src/runtime.ts:190`).

**Fix in this branch.** a349e48: `./api`, that spelling alone.

**Test.** `runtime/test.mjs`.

**Beside it.** An app given no `api` never answers a call of `./api`, in silence, and `log(…)` writes to a list only the tests read (`ref/compile/rt-web.ts:149-155`, read, not run). In this branch a development build says the first once an import, and prints the second (a349e48).
