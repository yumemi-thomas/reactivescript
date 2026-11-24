# Proposals

This branch is a prototype, and evidence. It is not meant to be merged. Each file here is one decision that can be taken alone,
or a bug of `main` with its smallest program. Nothing here has been sent or opened as an issue.

- **Upstream** is `main` at e650b85. **This branch** is measured at a349e48. Both use Solid 30e7805eb.
- The spec of this branch (`spec/`) is the prototype's, not a proposal's text. The diary is in `spec/archive/`.

## Run the evidence

```sh
node proposals/check.mjs                        # every marked program, on this branch: both checkers, the compiled code, rx-tsc, the tools
node proposals/check.mjs --upstream <folder>    # … and on an exported, built upstream
node proposals/words.mjs                        # each word taken off the benchmark's declarations (20 s; after bench/run.mjs)
node proposals/survey.mjs                       # the solid-primitives survey, counted again
node bench/run.mjs --check                      # the benchmark, held in CI
```

The folder: `git archive e650b85 | tar -x -C <folder>`; then in it `cargo build --release` and `cargo build --lib --release --target
wasm32-unknown-unknown` in `compiler/`; `npm ci && npm run build` in `runtime/`; `npm ci` in `tooling/rx-language-server/`; and
`ref/node_modules` as this repository's. A verdict is stated in a comment above each program, and compared. Bug 15 needs
Playwright's Chromium.

## The bar for a word

A word or a form is in the notation only if, without it, a correct Solid program that people commonly write cannot be written, or a
mistake Solid programs really make cannot be refused, **for more than one library** (releases on npm that accept `solid-js ^2`). One
package's rule is said without a word: leave the function undeclared, a small JS module of the app's own, or the library's types. Where
a proposal does not meet the bar by its own numbers, it says so (06, 08).

## Bugs of `main` (21, and one question)

Each was run on e650b85. In the order of what they cost a user.

| | |
| --- | --- |
| accepted, and wrong when run | [03](bugs/03-effect-loses-cleanup.md) effect's cleanup · [04](bugs/04-effect-over-a-list.md) effect over a list · [08](bugs/08-pre-of-a-list.md) `pre` of a list · [18](bugs/18-keyed-list-replaced-by-position.md) keyed list · [17](bugs/17-write-a-function-to-a-path.md) function to a path · [15](bugs/15-server-text-escaped-twice.md) server text · [07](bugs/07-fn-provides-to-its-caller.md) `provide` in a fn · [01](bugs/01-builtin-named-imports.md) builtin-named imports · [02](bugs/02-unimported-fetch-fail.md) `fetch`, `fail` · [13](bugs/13-relative-api.md) `../api` · [05](bugs/05-action-in-a-value.md) an action in a value |
| correct, and refused | [06](bugs/06-fn-reads-a-context.md) a fn that reads a context · [12](bugs/12-unguarded-snapshot-crate.md) `UNGUARDED_SNAPSHOT` (crate) · [16](bugs/16-component-without-props.md) no props is `any` · [11](bugs/11-record-and-function-types.md) record and function types |
| accepted, and not compiled | [09](bugs/09-pre-of-a-ref-parameter.md) `pre` of a `ref` · [10](bugs/10-await-as-a-result.md) `await` as a result |
| tests and tools | [14](bugs/14-scenario-sections-unread.md) unread sections · [19](bugs/19-missing-file-is-ok.md) missing file is ok · [20](bugs/20-custom-element-with-a-dot.md) `<my-kit.card>` (ref) · [21](bugs/21-messages.md) two messages |
| a question | [22](bugs/22-equations-make-a-fn-instantiate.md) E-9 and RG-6 disagree |

## Proposals

Ordered by what upstream would most likely want first. *Evidence* is said of the decision, not of the code.

| | changes | evidence | needs |
| --- | --- | --- | --- |
| [01](01-component-rows.md) component rows | a JS component is applied from `.rx` | strong: 132 rows, nine libraries; nothing works without | – |
| [02](02-context-rows.md) context rows | a hook outside its provider is refused | strong: 25 mistakes, six libraries | 01 |
| [03](03-rows-for-typed-apis.md) typed APIs | optional, type and rest parameters, values, methods, props by type | strong for the first three; methods: 9 mistakes, four libraries | – |
| [04](04-where-a-declaration-is-found.md) places and types | `rx-types/`, and a row held to the library's types | strong: 159 declarations of packages that ship none | – |
| [09](09-silent-mistakes.md) five silent mistakes | five checks | medium: each is wrong when run; one found in upstream's own eval programs | – |
| [05](05-handler.md) `handler` | a closure given to JS may write | medium: 26 programs use it; an action works today | – |
| [07](07-placement.md) placement | components as values; `nests`; `renders(H)` | `nests` strong (40 mistakes); `renders(H)` medium, and dear | 01, 02 |
| [12](12-file-routers.md) file routers | `host.d.rx`, `.rx` route files | strong for the declaration (two routers, 71 mistakes); the fork is TanStack's to take | 01, 02, 07 |
| [10](10-generated-declarations.md) generated declarations | a package with none gets one | strong: 5,111 rows, 10,967 programs, none newly refused; dear | 04 |
| [11](11-rx-verify.md) rx-verify | a row is run | medium: 0 mismatches of 350 claims; needs probes | 04 |
| [13](13-packages-in-rx.md) packages | `.rx` packages; a fn's parts | medium: 12 packages' own tests; small demand shown | – |
| [14](14-optional-parameters.md) optional parameters | of an `.rx` fn | medium: at most 63 of 192; design only | 13 |
| [16](16-generic-fns.md) generic fns | of an `.rx` fn | medium: at most 23 of 192, 26 more with 14; design only | 13 |
| [06](06-accessors-that-wait.md) `pending`, `fails` before `ref` | a library's accessor may wait | weak to medium: 13 mistakes, all rows in apps' own modules | – |
| [15](15-locals-in-pure-fns.md) locals in pure fns | read E-9 as written | weak for libraries; strong that the spec disagrees with itself | – |
| [17](17-small-forms.md) small forms | `for … of`; typed closure parameters | weak: no count | – |
| [08](08-draft.md) `draft` | a store's setter in `.rx` | weak: one library, two programs, the dearest change | – |
| [18](18-typescript-7.md) TypeScript 7 | nothing: a note | blocked by a regression | – |
| [19](19-what-not-to-do.md) what not to do | nothing: dead ends | – | – |

## Cost, all of it together

`git diff --shortstat e650b85 a349e48 -- compiler/src ref/src`: 15,140 lines added, 829 removed, in 31 files. `rxc check
examples/shop/main.rx`: 4.4 ms to 5.0 (median of 30); `ref/check.ts` on it: 119 to 142 (median of 5). Lines in a proposal are those
its commits added when they landed; later commits changed some.

**Verdicts.** Over the 305 `.rx` modules of upstream's repository, 259 have the same diagnostics from both `rxc check`s, and 46 not: 38 get
more `UNBOUND` (an unimported `fetch` or `fail`; each was refused already), 5 `EFFECT_RELAY_TEAR` (2 of them, one program, were accepted),
3 more of a `CATCH_NOT_ON_AWAIT` they had. All 46 are under `eval/results`.

## Dropped, and why

- *A row for a default export*: upstream's checkers already accept a row named `default`.
- *`catches(…)` on a declared prop*: no declaration the benchmark keeps has it.
- *Result fields that wait, on a plain field; overload rows; route words*: withdrawn ([19](19-what-not-to-do.md)).
- *A dev server that evaluates a module twice* (5622782, ef2869e): a real bug when it was found, with Vite 8 and this branch's plugin. It was not run
  on upstream's plugin, so it is not listed.
- *An error class's wire id* (SV-5a): it concerns declared JS classes that cross to the client, which upstream does not do.

## Claims corrected

Found false, or too strong, while these documents were checked. The old text is in `spec/archive/`, `CHANGELOG.md` and commit messages.

1. *An import named as a built-in is dropped.* From JavaScript and `./api`. From an `.rx` module it never was.
2. *`handler`: the program cannot be written without it.* An action's name is accepted upstream in the same place.
3. *`pending`/`fails` before `ref` meets the bar for several libraries.* All six rows are in apps' own modules, and no correct program
   needs them.
4. *`draft` meets the bar.* One library (Solid) has the callback form.
5. *106 optional, 51 generic, 95 value-or-accessor* of 192 primitives. From the published types: 97, 58, 88.
6. *Locals in pure fns are most of the rewrites' JavaScript.* Of 11 functions with a local, 3 need nothing else.
7. *A fn that declares an equation instantiates, by E-9.* E-9 says otherwise; RG-6 may say so.
8. *Two accepted sections of scenarios never ran.* True, and they were this branch's, not upstream's. Upstream's file had a table of
   three predictions.
9. *`EFFECT_RELAY_TEAR` was an advisory row made an error.* Upstream's 99 lists it, and no checker of upstream reports it.

## Not re-run

Draft times and sizes of `@ui-sdk/solid` and `@wardic/solid`; TypeScript 6 against tsrs; the count of false words found in drafts; the survey's
reading of sources (its classes); package sizes and facade lines of the twelve rewrites; rx-verify over whole drafts. `bench/run.mjs` and the
suites were not run by hand: CI ran them at a349e48, and its records are quoted.
