# 99 — Diagnostics, binned

**Status: DRAFT.** Solid 2.0's diagnostic table
(`documentation/solid-2.0/08-dev-diagnostics.md`, quick reference) with each
code assigned to one bin. The first bin is the grammar; the second is the
checker; the third stays runtime attribution. Codes keep Solid's names so a
compile-time error and the dev-mode runtime error mean the same thing.

Bins:

- **U — Unwritable.** The grammar has no position for the program. Parse or
  scope error. Cites the rule that removes the position.
- **S — Static.** A query over the static graph (inputs, regions, lanes).
  Compile error or warning.
- **R — Runtime.** Timing, data-dependent, or cross-module-dynamic. Stays in
  the runtime's attribution engine unchanged.
- **S/R** — static within a module, runtime across component boundaries where
  the edge is dynamic (a prop getter, `dynamic()`).

| Code                              | Bin | Rule / note                                                        |
| --------------------------------- | --- | ------------------------------------------------------------------ |
| `REACTIVE_WRITE_IN_OWNED_SCOPE`   | U   | W-2: reactive scope has no statement position                      |
| `ACTION_CALLED_IN_OWNED_SCOPE`    | S   | R-io-3: an action called in reactive scope (an io import: `IO_IN_REACTIVE`) |
| `IO_IN_FN` (new)                  | S   | R-io-2: a `fn` body that is `io`                                   |
| `ASYNC_STORE_SETTER`              | U   | ST: a draft block is synchronous by grammar                        |
| `STRICT_READ_UNTRACKED`           | U   | E-4/E-5: the only snapshots are initializers and `peek`            |
| `UNTRACKED_READ_AFTER_AWAIT`      | U   | R-pending: inputs are static; no tracking window                   |
| `PENDING_ASYNC_UNTRACKED_READ`    | S   | 04 R-8: `UNGUARDED_SNAPSHOT` (new): a handler's snapshot of a value with no committed value or a failure row, neither handled (`-> v`, `try`/`catch`) nor covered (`disabled` reading it, or inside its `loading` and `errored` regions) |
| `PENDING_ASYNC_FORBIDDEN_SCOPE`   | S   | same                                                               |
| `OPTIMISTIC_WRITE_WHILE_LOADING`, `OPTIMISTIC_WRITE_BEFORE_LOAD` | S | 06 AC-3a: `GUESS_WHILE_LOADING` (new; `guess` for `optimistic`, as in 07 decision 18), a guess a click can make while its value loads a new question or its first one, from an element not covered |
| `PRIMITIVE_IN_FORBIDDEN_SCOPE`    | U   | SC-2: declarations do not occur in imperative scope                |
| `PRIMITIVE_IN_EFFECT_CALLBACK`    | U   | same                                                               |
| `CLEANUP_IN_FORBIDDEN_SCOPE`      | U   | EF-5: cleanup is the apply block's return                          |
| `MISSING_EFFECT_FN`               | U   | EF-1: an effect is two halves by grammar                           |
| `SYNC_NODE_RECEIVED_ASYNC`        | U   | R-pending: the row says                                            |
| `FLUSH_IN_EFFECT_CALLBACK`        | U   | W-3: no API to split an instant                                    |
| `NO_OWNER_EFFECT`                 | U   | O: every declaration has a region                                  |
| `NO_OWNER_CLEANUP`                | U   | same                                                               |
| `NO_OWNER_BOUNDARY`               | U   | same                                                               |
| `RUN_WITH_DISPOSED_OWNER`         | S   | O-3: its static form is `REGION_ESCAPE`; the runtime error stays the JS-boundary backstop (CN-3b) |
| `SETTLED_CLEANUP_UNOWNED`         | S   | EF-7: an `onSettled` callback that returns a cleanup (EF-5's shapes); `effect () { … }` is the owned form (EF-4) |
| `ON_FLUSH_IN_OWNED_SCOPE`         | S   | EF-8: `onFlush` in reactive scope is `IO_IN_REACTIVE`, an error (Solid: a dev warning) |
| `SNAPSHOT_ARGUMENT` (new)         | S   | E-10: reactive argument to a value parameter at an instantiation       |
| `SNAPSHOT_INITIALIZER` (new)      | S   | E-4 / DV-6: a source initializer reads a reactive value outside `peek(…)` |
| `SNAPSHOT_KEPT` (new)             | S   | E-5a: a `peek` kept where it is read (an equation, a provision, a view, an argument) of a value that changes |
| `INVALID_REFRESH_TARGET`          | S   | `refresh` requires a source with a question (V-9)                  |
| `INVALID_AFFECTS_TARGET`          | S   | same                                                               |
| `LOADING_ON_OUTSIDE_HOLD`         | S/R | H: a reader of the `on` data outside the boundary; S within a component (08 CN-3e), R through a prop |
| `ASYNC_OUTSIDE_LOADING_BOUNDARY`  | S/R | H: a pending reader with no armed boundary on its path; S only in a client-only build, for a first load (08 CN-3d) |
| `EFFECT_WRITES_OWN_SOURCE`        | S   | C-3: an error (ruled 2026-10-23); closures the apply creates are exempt |
| `EFFECT_RELAY_TEAR`               | –   | advisory (below): C-3a, an apply's own write of a source declared beside the effect, computed from reactive values |
| `ASYNC_WATERFALL`                 | S   | R-pending: `await` whose inputs depend on another `await`          |
| `SILENT_HOLD` (structural form)   | S/R | H-9: a write whose cone contains no probe; timing form stays R     |
| `HUGE_FAN_IN`, `WIDE_SCOPE_DEPS`  | S   | counts on the static graph                                         |
| `HUGE_FAN_OUT`                    | S/R | static within module                                               |
| `DYNAMIC_ASYNC_COMPONENT`         | S   | R-pending on a component-typed value                               |
| `LONG_HOLD`                       | R   | timing                                                             |
| `FALLBACK_FLASH`                  | R   | timing                                                             |
| `STACKED_HOLDS`                   | R   | timing                                                             |
| `ABANDONED_FLIGHTS`               | R   | timing                                                             |
| `UNTRACKED_ASYNC_HANDLER`         | R   | timing; the structural half (no write before `await`, no `action`) is S |
| `HOT_SCOPE_*`                     | R   | profiling                                                          |
| `WASTED_RECOMPUTE`                | R   | data-dependent                                                     |
| `UNSTABLE_MEMO_OUTPUT`            | R   | data-dependent (partly S once ST decides structured equality)      |
| `UNSTABLE_LIST_IDENTITY`          | S   | ST: key is on the type; unkeyed `for` over records is a diagnostic |
| `IMMUTABLE_UPDATE_IN_STORE`       | U   | ST: a structured equation is a delta over `pre`, not a replaced container |
| `GUESS_REVERTED`                  | R   | data-dependent                                                     |
| `GRAPH_GROWTH`                    | R   | profiling                                                          |
| `REACTIVITY_HALTED`               | R   | an error escaping every boundary                                   |
| `INVARIANT_VIOLATION`             | R   | runtime internal                                                   |
| `SETTLE_WALK_UNINITIALIZED_SOURCE`| U   | E-4: every source has an initializer                               |
| `SERVER_WRITE`                    | S   | 12 SF-4: a write in a server function's body (anywhere else a write is imperative scope, which the server never runs, SV-2) |
| `SSR_*`, `HEAD_*`, `LATE_HEADER_WRITE`, `FRAME_MARKER_CORRUPTED`, `LAZY_ASSET_UNMAPPED`, `PRELOAD_DESCRIPTOR_INVALID` | R | server/transport; out of scope for the language |
| `UNRECOGNIZED_INSERT_VALUE`       | R   | 13 TY-3b: Solid's `JSX.Element` takes any object, so a record shown by mistake is a run-time finding, as in Solid |
| `UNSCOPED_HOLE_ALLOCATED_IDS`     | R   | hydration                                                          |
| `HYDRATION_MISMATCH`              | R   | 10 SV-3c: a `pure` JS function computed differently on server and client; SV-7 narrows it to an assertion that lied |
| `LOWERCASE_EVENT_ATTRIBUTE`       | U   | X: handlers are a grammar form                                     |

## Codes the checker adds

`ref/src/check.ts` (08) reports these, each with the rule it enforces. Where
Solid has no code for the shape (its runtime cannot see it), the code is new.
Every row has a rejected variant in `scenarios/S-check-1.md` or the scenario
named.

| Code                              | Bin | Rule  | Scenario |
| --------------------------------- | --- | ----- | -------- |
| `DUPLICATE_DECLARATION`           | S   | E-7   | S-check-1 |
| `SHADOWED_IMPORT` (new)           | S   | MO-1d; 09 MO-8t (2026-11-25): any second binding — a parameter, a local, a loop's variable — of an import whose methods have rows of their own, reported on the import's line | S-module-1, S-module-42 |
| `CYCLE`                           | S   | C-1 (CN-3a: union of branches; only an equation's own `pre` breaks it; a provision of itself, RG-7b) | S-check-1, S-core-1, S-context-9, S-context-11 |
| `PRE_OF_NON_REACTIVE`             | S   | C-2   | S-check-1 |
| `UNBOUND`                         | S   | lexical scope (a component sees its declaration site, RG-7a; `props` of a component that declares none, RG-4b) | S-check-1 |
| `ARGUMENT_COUNT` (new)            | S   | AC-1f: a call of a declared action with another number of arguments than its parameters | S-check-1 |
| `UNKNOWN_COMPONENT`, `COMPONENT_AS_VALUE` | S | RG-4a; MO-11a, MO-11c, MO-11f for JS components and factories; MO-11q, `<wardic.div>` where wardic is a name of the module (a member component is applied through a name with a capital) is `UNKNOWN_COMPONENT`; MO-11s, a component given to JS that says nothing of where it renders it, is checked under a root of its own; MO-11c (2026-11-24), a component in a record or an array given to a JS component's prop whose type holds one is a value there, and so is one in a record or an array bound to a name where every mention of the name is such a prop (2026-11-25: read elsewhere, exported or given to none, the binding is `COMPONENT_AS_VALUE`) | S-check-1, S-region-5, S-module-5, S-module-6, S-module-24, S-module-27, S-module-39 |
| `VIEW_FN_EXPECTED`, `VIEW_FN_MISPLACED` | S | MO-11k (render props), RG-4c (a view an `.rx` component shows) | S-module-14, S-view-3 to S-view-7 |
| `NESTED_NOT_RENDERED` (new, 2026-11-23) | S | 09 MO-11i, MO-14f: a component a record nests others in (a factory's tree, a host declaration's view) renders none of its children — no `{props.children}`, no component the host renders through, itself or through the `.rx` components it applies (2026-11-25) | S-module-38, S-module-40 |
| `INSTANTIATION_NOT_BOUND`         | S   | E-9 / RG-6 | S-region-6 |
| `SNAPSHOT_ARGUMENT`               | S   | E-10  | S-region-6 |
| `SNAPSHOT_INITIALIZER`            | S   | E-4 / DV-6 | S-surface-1 |
| `SNAPSHOT_KEPT`                   | S   | E-5a  | S-surface-6, S-surface-8 |
| `IO_IN_REACTIVE`                  | S   | IO-2 / R-io-3; 09 MO-8t (2026-11-25): a method whose row says `fn`, a method with no row whose declared type answers nothing or a promise (a declared value's too), a method of an io import; 02 SC-4b (2026-11-26): a handler the component is given, called in reactive scope | S-surface-1, S-module-42, S-view-10 |
| `ACTION_CALLED_IN_OWNED_SCOPE`    | S   | IO-2 / R-io-3; SC-4b: a handler the component is given, carried in a value or given to what calls it | S-check-1, S-view-10 |
| `IO_IN_FN`                        | S   | R-io-2 | S-check-1 |
| `REACTIVE_WRITE_IN_OWNED_SCOPE`   | U/S | W-2 (a statement position) / SC-3 (a statement-bodied closure in reactive scope) | S-core-1, S-check-1 |
| `REF_READS_REF_WRITE` (new, 2026-11-26) | S | 02 SC-4c: a `ref` reads (in its body, an action it calls, a closure it gives a method that calls it at once, or through an equation) a source another `ref` of the module writes, or one it writes itself in each row of a `for` below the source — Solid calls the `ref`s of one pass in an order that differs rendered and hydrated | S-server-8 |
| `WRITE_TO_NON_SOURCE`             | S   | W-1   | S-core-1, S-check-1 |
| `DRAFT_WRITE_OUTSIDE_DRAFT`       | S   | ST-3a | S-store-2 |
| `DRAFT_ESCAPES` (new)             | S   | 09 MO-10i: a library's draft is a place — named only in its own callback (not in a closure made there, nor after an `await`), handed only to a closure written at its setter's call, by a setter that is called by its own name | S-module-25 |
| `RESULT_AS_VALUE` (new)           | S   | 09 MO-10f: a prop whose type says which of its fields hold or fail is read a field at a time, never used as a value; 09 MO-10l: so is a JS result with a `ref` part that waits or fails (the same on a declared JS result's plain field is withdrawn, 09 MO-8r) | S-module-11, S-module-36 |
| `ASYNC_STORE_SETTER`              | S   | ST-3b | S-check-1 |
| `GUESS_OUTSIDE_HOLD`         | S   | AC-3 (an `effect`'s apply block: never an action, AC-1b; an action that starts nothing its guess would wait for, 2026-11-22) | S-check-1, S-infer-1 |
| `HELD_WRITE`                      | S   | AC-1c | S-infer-2 |
| `STALE_OWN_READ`                  | S   | AC-1d | S-infer-5 |
| `STALE_WRITE_BACK`                | S   | AC-1e | S-infer-6 |
| `STALE_CAPTURE`                   | S   | AC-1g | S-infer-7 |
| `STALE_NEXT_READ`                 | S   | AC-1h | S-infer-8 |
| `GUESS_ON_DEFERRED`          | S   | AC-3 / ST-5c (a deferred equation lags its truth, V-16) | S-guess-equation |
| `GUESS_WHILE_LOADING`        | S   | AC-3a (Solid's `OPTIMISTIC_WRITE_WHILE_LOADING`, at compile time) | S-guess-equation, check.rs unit test |
| `INVALID_REFRESH_TARGET`, `INVALID_AFFECTS_TARGET` | S | AC-4, AC-5 | S-check-1 |
| `REGION_ESCAPE`                   | S   | O-3, O-3a, O-3b | S-check-1 (seven shapes), S-module-1 |
| `UNSTABLE_LIST_IDENTITY`          | S   | ST-4b (narrow form: `map` into fresh records, unkeyed) | S-store-3 |
| `VIEW_NOT_SHOWN` (proposed, 2026-11-25) | S | RG-4c: a view a component is given (its children, a prop typed `View`) read as a value — kept by `peek` or a source, carried by a context, read by an effect or a handler, answered by a closure, held in a record or a list, given to a fn, kept by `pre`, given on to a prop whose declared type is a value's or a type parameter's (07 §2); children declared a type parameter. A view is a prop declared `View` where the type is read, under the names bound to it. It is shown, given on, named by a projection, or asked for (proposals/26). Also a context that holds a view (`context item: View`) read as a value, exported, or given what is no view of its type (proposals/27) | S-context-4, S-context-5, S-context-6, S-context-7, S-context-8 |
| `CONTEXT_NOT_FOUND`               | S   | RG-7b (over the static application tree; a context with a default is always found); MO-12b for a JS hook; MO-11u, for a component given to a fn declared `renders(H)`: on the line of the call, where no provision is above some application of H in the program | S-check-1, S-region-7, S-ai-feed, S-context-1, S-module-7, S-module-22 |
| `ROW_NARROWER_THAN_INFERRED`      | S   | CN-4a (checked only where a row is written); R-f-9 for `fails(…)` | S-check-1, S-fail-1 |
| `EFFECT_WRITES_OWN_SOURCE`        | S   | C-3 (directly or through equations; not closures the apply creates) | S-check-2 |
| `UNHANDLED_FAILURE`               | S   | R-f-5 / CN-6a (over the static application tree; props where read, children where rendered); MO-11u, for a component given to a fn declared `renders(H)`, above every application of H | S-fail-1, S-fail-2, S-module-22 |
| `CATCH_NOT_ON_AWAIT` (new)        | S   | R-f-4: a `catch` after anything but an `await` (a failed value is shown by an `errored` region where it is read; 2026-11-19) | S-fail-1, S-catch-snapshot |
| `UNCAUGHT_ACTION_FAILURE`         | S   | R-f-6 / CN-6a (incl. a prop the action reads, checked at each application) | S-action-1, S-fail-2 |
| `NOT_AN_ERROR_CLASS`              | S   | R-f-1 | S-fail-1 |
| `WRITE_TO_NON_SOURCE` (MO-2)      | S   | MO-2a: an imported source is read-only | S-module-1 |
| `IMPORT_ROW_MISMATCH`             | S   | MO-4a: `pure` / `fails` on an `.rx` import | S-module-1 |
| `MODULE_CYCLE`                    | S   | MO-5  | S-module-1 |
| `MUTATION_IN_PLACE` (new)         | S   | 02 W-1a: an Array's mutating method on an array that is the value of a source, an equation, a prop, a provision or a row (Solid: a signal's array pushed to, a store written outside its setter — silent, or a dev warning) | guide/diagnostics.md, `bench/tasks/source-mutation` |
| `DISPOSER_DROPPED` (new)          | –   | advisory (below): 02 EF-5a, a declared JS call whose result is `() => void`, dropped | guide/diagnostics.md, `bench/tasks/listener-cleanup` |
| `DUPLICATE_KEY` (new)             | S/R | 06 ST-4d: two rows of a keyed list written with one key (S); keys computed at run time are the data's (R: named on the console by the runtime in a development build, since 2026-11-24; unreported in production, as in Solid) | guide/diagnostics.md, `bench/tasks/duplicate-keys` |
| `HOST_VIEW_STALE` (new)           | tools | 09 MO-14g: a host declaration derived from the router's tree (`//@ routes`) that has fallen behind it — refused by `rx-tsc`, `rx-verify` and a build; the dev server writes it again. Not a checker's diagnostic: the checkers read no router's file (08 CN-8) | guide/diagnostics.md, `bench/tasks/router-rx-routes`, `file-routes`, `start-mode` |
| `DUPLICATE_WIRE_ID` (new)         | S   | 10 SV-5a: two declared error classes, in packages with no name, that would cross to the client under one identity (refused where the declarations are loaded) | `a_wire_id_does_not_depend_on_the_entry_and_two_classes_never_share_one` (crate, `ref/units.ts`) |
| `NOT_EXPORTED`, `MODULE_NOT_FOUND` | S  | MO-6a; MO-12a for an undeclared JS context | S-module-1, S-module-7 |
| `NOT_A_CONTEXT`, `CONTEXT_AS_VALUE` | S | RG-7a | S-context-1 |
| `SOURCE_CONTEXT`, `WRITE_TO_NON_SOURCE` (O-4) | S | O-4: a context is read beneath its provision; `context x: source T` withdrawn (RG-7c, 2026-10-31) | S-context-1 |
| `ROW_NARROWER_THAN_INFERRED` (RG-7e) | S | a provision wider than its context's declared rows | S-context-1 |
| `SERVER_CAPTURE`                  | S   | 12 SF-3: a server function names reactive state (by kind; through the fns it calls) | S-sf-1 |
| `SERVER_WRITE`                    | S   | 12 SF-4 | S-sf-1 |
| `SERVER_ONLY`, `CLIENT_IN_SERVER` | S   | 12 SF-5a, SF-5c | S-sf-1 |
| `CLIENT_QUESTION_UNHELD`          | S   | 10 SV-7b: a client question's reader with no `loading` above it on some path (Solid: `ASYNC_OUTSIDE_LOADING_BOUNDARY`, at run time) | S-server-3 |
| `CLIENT_NOT_AWAITED`              | S   | 12 SF-5b | S-server-3 |
| `STYLE_PLACEMENT`                 | S   | 07 CSS-1: a `<style>` off its view's top level, or a second one | S-surface-2 |
| `UNTIL_PREDICATE`                 | S   | 06 AC-6: `until`'s argument is not a predicate `() => e` | S-action-2 |
| `HOOK_CALLBACK` (new)             | S   | 02 EF-7, EF-8: `onSettled`'s or `onFlush`'s argument is not a closure `() => { … }` | S-flush-1 |
| `SETTLED_CLEANUP_UNOWNED`, `IO_IN_REACTIVE` (EF-7, EF-8) | S | an `onSettled` callback returning a cleanup; either hook called in reactive scope | S-settled-1, S-flush-1 |
| `AWAIT_IN_EXPRESSION` (new)       | S   | 06 AC-1: an `await` inside an expression of imperative scope — a run suspends only at a statement (`await e`, `let v = await e`, either with a `catch`); 06 ST-5a: an `await` in the seed of a plain source, `source x := await …` (write `source x = …`, 2026-11-26) | S-await-1, S-check-5 |
| `GENERIC_CONTEXT` (new)           | S   | 03 RG-7a: a context's type is a generic function type (`context c: <T>(p: { item: T }) => View`) | S-check-5 |
| `TOP_LEVEL_MARKUP`                | S   | 09 MO-1c: markup at a module's top level — the view is `export default component App` | every scenario |
| `CONTENT_MODEL`                   | S   | 10 SV-7d: nesting the HTML parser restructures, across templates (component roots, branches, placed children) | S-server-4 |
| `IMPORT_ROW_MISMATCH` (SF-5)      | S   | `server`/`client` on an import that a `.d.rx` declares otherwise | S-sf-1 |
| `WIRE_VALUE`                      | S/R | 12 SF-6a: at compile time where the types are known (13 TY-5a), else at run time | S-sf-1, S-types-1 |
| `MISSING_AWAIT` (new)             | S   | 04 R-1a: an equation whose value may be a promise or a stream, which Solid's memo would consume; write `await e` (13 TY-5b) | S-types-1 |
| `TSnnnn`                          | S   | 13 TY-1: TypeScript's errors over the projection, on `.rx` lines | S-types-1 |

## The advisory rows (ruled 2026-10-23, in part)

(2026-11-22: the advisory tool's first row exists. The checker returns
`advice` beside its diagnostics — `rxc check` prints `advice CODE …`
lines and `--json` an `advice` list, `ref/check.ts` the same, and the
two are compared as the diagnostics are. `ASYNC_WATERFALL`: in one
imperative run, an `await` of a question written after another's,
reading nothing bound since that one — the second waits for the first
for nothing; ask both and await them together, or make each an equation,
which Solid asks side by side. A *question* is a declared JS fn awaited
for what it answers: a `pure` one, or an io one whose answer the
statement binds (`let user = await loadUser(7)` — the row `rx-declare`
drafts for a loader is io, and a declaration nobody reviewed is no
reason to be silent). An io call awaited for nothing (`await save(a);
await notify(b)`) is a command, and anything else awaited (a promise in
a local) is unknown: each is a point of order — nothing after it is
held up by what came before it, since it may need what the command did.
The advice is given once for a question, on its own statement (a
statement has its line): it names the first question before it whose
answer it does not read, and a question told to move holds up none of
those after it (`a; b; c(a)` is one advice, on `b`). Where either fn is
io the advice says what it cannot know: that one may need what the
other did, which only a `pure` declaration rules out. S-await-1,
`bench/tasks/sequential-awaits`, the unit
`a_waterfall_is_advised_once_for_each_question`.
The second row, `SNAPSHOT_IN_EFFECT` (02 EF-1): an apply block's own
statement reads a changing value its effect does not take as an input —
once per effect, on the statement. S-check-2, `bench/tasks/effect-derived`.
The third row, `GUESS_AFTER_AWAIT` (06 AC-3): an action's first guess
written after a statement-level `await` — the guess is ahead of nothing,
and shows once that has answered — once per action, on the guess.
`bench/tasks/optimistic-todo`. `EFFECT_RELAY_TEAR` (02 C-3a) and
`DISPOSER_DROPPED` (02 EF-5a) are the fourth and the fifth.)

Under CN-1a there is no warning tier, so an S row is a compile error or it
is not a diagnostic. `ASYNC_WATERFALL`, `HUGE_FAN_IN`, `HUGE_FAN_OUT`,
`WIDE_SCOPE_DEPS`, `SILENT_HOLD` (structural) and `UNTRACKED_ASYNC_HANDLER` (structural half) are **not errors** — they
are performance and shape advice about correct programs — and move to a
separate advisory tool that reads the same static graph and never fails a
build (the rustc/clippy split). `EFFECT_WRITES_OWN_SOURCE` is an error
(C-3); `EFFECT_RELAY_TEAR` (an effect copying one source into another — an
equation written the long way, with a one-instant tear, but also how a
source is synced into a JS-owned one) stays advisory (02 C-3a). `DYNAMIC_ASYNC_COMPONENT` is a type question for the type layer (13);
`UNRECOGNIZED_INSERT_VALUE` stays Solid's, at run time (13 TY-3b). `LOADING_ON_OUTSIDE_HOLD` was one; since 2026-10-30 (Ryan) it is an error, 08 CN-3e: the old content stays up with no sign of the wait, a silent hold, which is a defect, not advice. (`SERVER_WRITE` was one; 12 SF-4 makes it a row rule.)

## Parse errors that name a habit

Not Solid codes: a parse error (U by construction) whose line reads like JavaScript, React or Solid carries the code of
the habit and the `.rx` it most likely meant, appended to the parser's own message (`hint` in `ref/src/parse.ts` and
`compiler/src/parse.rs`; scenario S-parse-hints). Any other parse error is `PARSE`. Every code, here and above, has a
section with a fix in `guide/diagnostics.md`, and the compiler's tests check its examples.

| Code         | What it looks like                                       |
| ------------ | -------------------------------------------------------- |
| `JS_LOCAL`   | `const` / `let` / `var` in a component or at top level   |
| `JS_FUNCTION`| `function f() { … }`                                     |
| `JS_RETURN`  | `return <div>…</div>` in a component                     |
| `JS_API`     | `createSignal(…)`, `useState(…)`, … on a failing line, or `[a, b] = createStore(…)` when the module does not import that name (an imported one is its declared JS fn, 09 MO-10i) |
| `ASSIGNMENT` | `x = …`, `x += …`, `x++` where a write `x := …` was meant (W-1) |
| `REACTIVE_WRITE_IN_OWNED_SCOPE` | `() => x := …`: the arrow needs a braced body (W-2, SC-3) |

## Counting

| bin | codes |
| --- | ----- |
| U   | 21    |
| S   | 13    |
| S/R | 5     |
| R   | 17 (+ the SSR family) |

The U and S rows are the language's claim. Every one needs a scenario in
`scenarios/` whose verdict is "rejected", and an error message written for a
reader who will fix the program without running it.
