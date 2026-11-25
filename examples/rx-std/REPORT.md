# The twelve packages and the UI SDK bridge on a shared module: less JavaScript beside `.rx`

On a4cba8ef. No language rule, checker, compiler or tool is changed: only `std/` and the packages. `python3 classify.py <packages of rx-primitives-2>` counts the kinds.

## Measured before building

Helpers 172: browser calls 38, globals in an expression 22, hydration 6, imports 10, locals and loops 30, plain expressions 18, nodes and closures with state 35, value-or-accessor 2, plain JavaScript users import 11.
Facade 198 (pagination's and resize-observer's split by pattern, so approximate): result's shape 63, options 31, imports and re-exports 41, plain JavaScript API 24, signals handed out 11, contexts 10, browser calls 10, server answers 7, value-or-accessor 1.
Declarations 97: 59 `.d.ts`, 38 `.d.rx`.

- A shared module: at most 69 of the helpers' lines and 10 of the facade's, with their declarations. Built.
- No `.d.rx` for one's own JavaScript: **41 of the 97 lines go with nothing built** — a module needs one of `.d.ts` and `.d.rx`, not both (types come from the `.d.rx` where there is no `.d.ts`, 13 TY-4b; an import with no `.d.rx` is io, `pure` on the import, callbacks unchecked, R-io-4).
  Of the 56 left a generated declaration would remove 14 (history, form-control, if their types said `Accessor`), and 0 of UI SDK's: no code proves `handler` on `own`'s fields nor `pure` on `partOf`. Not built.
  It would also accept wrong programs: for `f(x) { x.items.forEach(g => g()) }` the draft says `pure`, and `y = f({ items: [inc] })` with an action `inc`, refused undeclared, is accepted by both checkers.

## After

| package | `.rx` | helpers | facade | declarations |
| --- | --- | --- | --- | --- |
| controlled-props | 46→50 | 6→0 | 20 | 1→0 |
| form-control | 33→41 | 13→4 | 20 | 15→2 |
| history | 22→29 | 19→5 | 3 | 16→1 |
| keyboard | 18→29 | 21→1 | 17 | 8→0 |
| keyed | 19→23 | 4→0 | 2 | 4→0 |
| media | 26→29 | 16→0 | 21 | 10→0 |
| pagination | 13→18 | 9→0 | 54 | 3→0 |
| presence | 42→53 | 18→2 | 1 | 10→2 |
| resize-observer | 24→28 | 12→0 | 34→39 | 12→0 |
| sortable | 11 | 11 | 8 | 1 |
| storage | 17→19 | 12→3 | 1 | 10→2 |
| timer | 28→29 | 31→30 | 17 | 7→3 |
| **total** | 299→359 | 172→56 | 198→203 | 97→11 |

Tests as before, package by package (166 jsdom, 29 server), and 11 of 12 mistakes; size in an app within 80 bytes gzip. UI SDK (`../rx-std-ui`): JavaScript 117→115, `.d.rx` 51→45, `.d.ts` 63→41; 44/44 in Chromium. Its upstream specs and leak gates were not run again.

Of the 116 helper lines gone, about 48 (locals, plain expressions) needed no module: nested conditionals and small fns are enough.

## What JavaScript is left

Helpers, 56: a timer's clock with state of its own 30 (timer); comparators users import 11 (sortable); Solid nodes made or functions handing out closures 10 (history 5, form-control 4, presence `bound` 1); a storage, used by one package 3; a frame after a forced layout 1 (presence); a re-export 1 (keyboard).
Facade, 203: result's shape 63, imports and re-exports 41, options and optional parameters 31, plain JavaScript API 29, signals handed out 11, contexts to JavaScript 10, browser calls for TSX users 10, server answers 7, value-or-accessor 1.

## Found

1. A drafted `pure` on a fn that calls functions held in its argument (above). `@solid-primitives/timer`'s `makeTimer(fn, delay, timer)` is drafted `pure` too.
2. `source x := await client() -> v` passes both checkers and `rx-lib` refuses it: "`await` outside an equation's result position". `source x = await …` builds.
3. An awaited `client` read that cannot fail carries `fails(Error)`: its correct callers are refused.
4. A `.rx` fn cannot call `client` JavaScript for its value (`CLIENT_NOT_AWAITED`), though SF-5c says the row is inferred upward.
5. A type imported from a module with no `.d.rx` (`./types.js`, types alone) stays a value import: `rx-lib` refuses the package.
6. `x != null` is true of `undefined` (`==` is by value): a helper moved from JavaScript changes in silence. Two tests caught it here.
7. A record written as an equation is handed to JavaScript part by part; written as a fn's result it is one value. One test suite caught it.
8. The tree-sitter grammar has no type predicate as a result (`x is any[]`), which the crate reads: `is` answers `boolean`.
