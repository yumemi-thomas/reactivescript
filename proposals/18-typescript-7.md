# 18 — Note: type checking with a native TypeScript 7

Not a proposal. It records what stands in the way.

**What was tried.** The language server, `rx-tsc`, the draft's check and the check of a declaration against its module run on
tsrs 7.1.0-beta.tsrs5, a port of TypeScript 7.1 beta (`rx-tsc --version`, run). Upstream is on TypeScript 6.0.3 through Volar.
Reading a library's types for a draft stays on TypeScript 6 in process: it makes over a million calls for a large package.

**The regression that blocks it.** TypeScript 7.1 beta refuses a correct program that 6.0.3 accepts (microsoft/TypeScript 64673; the
fix, 64307, was not merged when recorded):

```ts
declare function f<T>(v: T): T extends any[] ? T[number] : NonNullable<T>;
const g: <T>(v: T) => T extends any[] ? T[number] : NonNullable<T> = f;
```

A value of a generic function type that writes a conditional over its own type parameter is not assignable to the same type. A
declaration's rows are written as instances of their type, which relate. An app's own code is not.

`node tooling/rx-language-server/test/checker.js` (15 checks, run at a349e48) holds the regression: it fails when it is gone.

**Other differences.** Options TypeScript 7 removed (`baseUrl`, `node10`, `ES5`) are errors. Two messages have other codes. One task
of 37 and no scenario of 245 changed its output (record in `spec/archive/ts7-tsrs-2026-11-24.md`, not re-run).

**What it gives.** `rx-tsc` over the 37 tasks: 64 s of CPU to 13 s (record, not re-run).

**What to do.** Nothing, until the regression is fixed in a release. tsrs is a beta by one author; the pin is exact.
