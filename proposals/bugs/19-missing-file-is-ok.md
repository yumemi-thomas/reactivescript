# `rxc check` and `ref/check.ts` print `ok` for a file that is not there

A typo in a CI command passes.

<!-- check branch=MODULE_NOT_FOUND upstream=ok main=nofile.rx -->
```rx
export default component App() { <p>a</p> }
```

**On upstream (e650b85).** `nofile.rx: ok`, exit 0, from both.

**Spec.** MO-6a: a path that does not resolve is `MODULE_NOT_FOUND`.

**Cause.** A file that cannot be read is an empty module.

**Fix in this branch.** 06d20d9, b254527 (a folder named `x.rx` too).

**Test.** Units in `ref/units.ts` and `compiler/tests`.
