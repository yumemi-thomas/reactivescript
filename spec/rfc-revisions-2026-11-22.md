# RFC revisions after the third review (2026-11-22)

The text each RFC of the tracking issue (#37) takes for this round, as the
second review's notes were appended to the issues. The rules themselves
are in the spec; this is what changes in each proposal, and why.

## What the round decided

Three rounds answered the same four questions — where may a result with
held fields go (RFC 06), a library's draft (RFC 09), a `renders` value
(RFC 17, 18), a primitive's instance (RFC 14, 34) — with one analysis of
"what values may this expression hold", followed through aliases,
records, calls and closures. Each review found another way through it,
and a program it refused for nothing. That does not converge: `.rx` has
first-class functions and the checker reads no types, so the question
has no answer that is both sound and precise.

The spec's own stance is the stop (08: every static check is an error,
the checks are sound, an over-approximation that rejects some fine
programs and never admits a wrong one, modular, and silent about JS,
whose rows are its declaration's; README: the mistakes are "things the
compiler refuses, the way Rust refuses a borrow"). So each rule is now
one whose soundness is local, and the work is done when each gives the
guarantee it states, not when a review runs out of cases (08 CN-7, 09
MO-10k):

- a result with held fields and a draft are **not values**: the rule is
  on where their name is written, and a draft's reads are copies by
  compilation;
- a `renders` value and an instance are confined **by mention**: a value
  may hold a part of one when its expression mentions its name, unless
  what is written makes a primitive; every way out is where the check
  refuses it.

No *value* is tracked through the program's runs. What the analysis does
follow is *names*, through what is written: a name to the expression it
is bound to, a row to its list, a parameter to the arguments its calls
pass, a call to what its fn's body may return and to the closures its
callee's value may hold (the wording "no value is followed anywhere"
said less than that, and is corrected here and in 08 CN-7a, 09 MO-10k).
Each guarantee is shown by a test that puts the value through every way
an expression hands a value on, and every pair of them, into every way
out — in both checkers, and for drafts at run time against a library
that revokes its draft.

## After the fourth review: a closed set of operations for each kind

The fourth review accepted the local rules and found four programs they
admitted, each of which did at run time what its rule says cannot
happen. One mistake was under all four: the syntax around a JS method
call was read as evidence of what the method answers, keeps or calls.

| RFC | accepted, and wrong | the syntax that was trusted | now |
| --- | --- | --- | --- |
| 06 | `<Child v={q.valueOf()} />`, the child reading `.data`: the server's render threw | "the object of `.`": any member read of the result | what is read from the result is a field its declaration names; `valueOf`, `toJSON`, an undeclared field, `q[k]()` are `RESULT_AS_VALUE` |
| 09 | `d.items.forEach((row) => { kept.push(row) })`, `saved := d.items.values()`: read after the callback, "proxy revoked" | "a closure that names no draft keeps none"; "a method's answer is copied" (an iterator was not) | a method called on a draft is one of plain data's, by name; a callback given to one is written there and its parameters are places of the draft (read as copies); an iterator is run to its end and kept as one over copies; any other method is `DRAFT_ESCAPES` |
| 17 | `({ onSend: props.onSend, t: table }).onSend(table)`: the parent received the table | "a method of the value itself": a receiver that mentions it | a method keeps nothing only when `methods(…)` names it and it is called on the value's own name |
| 14, 34 | `box = { read: () => n }`, then `peek box.read()` kept and `createLabel(box.read())`: frozen | "a callee that is not a name calls nothing the checker can see" | a callee read out of a value may call any closure that value holds, and reads what each reads; a slot the expression names is that slot's closure alone |

So each kind has a closed set of operations (09 MO-10k's table, 08
CN-7d), and a method is one of them only on positive evidence of which
operation it is: the declared result type, `methods(…)`, or the name of
a method of plain data. `compiler/test/confined.mjs` keeps the four
programs: the verdict of both checkers, and what each does when it runs
(the copies read after the library took its draft back; the refused
reads shown throwing where no check looks).

The same evidence gives back what the strict reading cost:

- **A declared primitive leaves a `renders` value.** The declared result
  type is read a step at a time, so `table.label`, `table.getPageCount()`
  and the `row.id` of a row of `table.getRowModel().rows` are passed to a
  child or a callback with their types, where `str(…)` was needed.
- **A literal's own slot is that slot.** `createLabel([clock, 5][1])`
  reads `5` (it was refused as a read through the instance).
- **A draft's own method takes a callback.** `d.items.forEach((row) => {
  row.done := true })`, `d.items.find((row) => row.id == id)`,
  `d.items.sort((a, b) => a.n - b.n)` (a closure there was refused when it
  named the draft, and kept live rows when it did not).

*Now refused, was accepted.* The four programs above; `q.toJSON()`,
`q.hasOwnProperty("data")`, a field of a result with held fields that
its declaration leaves out (it read `undefined` at run time: the
compiled result has the declared fields only); `d.items.each(…)`,
`d.items.forEach(keep)`, `d.items.push.bind(d.items)`;
`table.setPage(table.rows)` without `methods(setPage)`; `fs = [() => n];
createLabel(fs[0]())`, `mk()()`.

**The loop (07 §5).** The spec said a loop visits the values its list
holds when it starts; the emitters compiled it to JavaScript's `for … of`
over the list itself, which reads as it goes, so a loop over a draft's
list that added to it was handed what it added (and one that always
added never ended). The spec's reading stands — it is the rule of every
run, that a run does not see what it writes — and the emitters now loop
over `[...e]`, as the interpreter did.

## Composition given back (the fourth review's other half)

The rules are local; what a program composes of them was not. Each of
these is a summary the checker now keeps, read from what is written or
from a declaration, never from what JS does:

| what a Solid app writes | was | the summary | now |
| --- | --- | --- | --- |
| the library's provider inside the app's own `Shell`, the router passed as a prop | `RENDERS_ESCAPES`: a prop cannot be named | a prop given on as it is to a prop that renders is one the component renders: in its summary and its signature (`router: renders provides(…)`) | the components are named at `<Shell router={router} />` and checked where `Shell` renders them (09 MO-11o) |
| a query passed down to a panel | `RESULT_AS_VALUE`: pass the field | a prop's type with the row words on its fields (`query: { data: pending fails(Error) T; … }`) is an interface that keeps them: in the signature, `takes(data pending fails(Error))` | the result is given whole to such a prop; the child's reads are checked as the result's are (09 MO-10f) |
| one store updater, shared by two handlers | `DRAFT_ESCAPES`: write the callback at the call | a closure whose name is written only as a draft-handing function's argument is that function's callback | `bump = (d) => { … }; setTodos(bump)` (09 MO-10i) |
| `<Pager pages={table.getPageCount()} />`, `props.onPick(row.id)` | `RENDERS_ESCAPES`: make a primitive, `str(…)` | the declared result type, read a step at a time | a part declared a primitive leaves, with its type (09 MO-11l) |
| formatters kept in a record | accepted, and frozen under `peek` | a callee read out of a value calls the closures that value holds | `SNAPSHOT_KEPT`, `SNAPSHOT_ARGUMENT`; the slot named by what is written stays precise (02 E-10) |
| `createLabel([clock, 5][1])` | `SNAPSHOT_ARGUMENT` | a literal's own slot is that slot | accepted |

With them: a record result with no accessor part is the library's own
object (it was a copy with a getter per declared field, on which the
library's methods ran and undeclared fields read `undefined`); a type a
`.d.rx` declares is not imported from the JS module as a value; a
declared fn whose result hands out drafts is a primitive, so its setter
is io.

## Mistakes the benchmark found unprotected

`bench/` (the representative tasks) asks of each job what a Solid user
gets wrong in it. Six were accepted and silent. Each is decided by the
spec's stance — a static check where the program text decides it; the
declaration's word where only the library knows; advice where the
program is correct; nothing at run time that Solid does not do:

| mistake | decision | rule |
| --- | --- | --- |
| a function kept in a record, read under a kept `peek`, by a value parameter or as a seed | **refused** | 02 E-10, E-5a (above) |
| `rows.push(2)` on a source; `props.items.sort()` | **refused**: `MUTATION_IN_PLACE` | 02 W-1a |
| the disposer a declared JS listener answers, dropped | **refused**: `DISPOSER_DROPPED`, on the declared type `() => void` | 02 EF-5a |
| two rows of a keyed list with one key | **refused** where the rows are written out (`DUPLICATE_KEY`); keys computed at run time are the data's, unreported, as in Solid | 06 ST-4d |
| independent questions awaited one after the other | **advice**, never an error: `ASYNC_WATERFALL` in the checker's `advice` list | 99, the advisory rows; 08 CN-1a |
| a `pure` JS call that answers differently on the server and in the browser | **out of the checker's scope**: `pure` is the one unchecked word (CN-5), and what only the browser knows is `client` JS, which is checked (SV-7b). Solid reports a structural mismatch and is silent on a text's; the language adds no run-time comparison | 10 SV-7c |

and three more the tasks turned up: a handler attribute given a call
(`onClick={save()}`, 02 SC-4), a method declared to answer nothing
called while the view computes (`table.nextPage()` in a view, 09
MO-10b), and a page a JS host renders with a failure nothing in it
handles (11 CP-4d, implemented).

## After the fifth review, and the benchmark made fair

The fifth review (an independent model, at `2f9baf7`) and the suite's own
rework (`bench/README.md`: probes moved out, the unwritable counted
apart, declarations measured, eleven tasks added) found the rules below
too narrow or too wide. Each change is a rule's own reading, not a case:

| what was found | decision | rule |
| --- | --- | --- |
| `pick = (o) => o.total(); createStamp(pick(fmt))` froze a value: a closure given a closure was read as its own body alone | **refused**: a call of a closure the checker can see calls what its body calls through each parameter, of what the argument holds | 02 E-10 (a closure given to a closure) |
| `(g: () => string) => g()` was a `PARSE` error | **accepted**: a closure's parameter may have a function type | 07 §3 |
| shadcn/ui's `<DataTablePagination table={table} />` was `RENDERS_ESCAPES` | **accepted** when the component keeps the prop; its signature says `keeps(table)` | 09 MO-11l (a component that keeps what it is given) |
| a disposer behind the library's own type name, a subscription object, a branch that drops it, another name that is dropped | **refused**: `DISPOSER_DROPPED` reads the type as declared and every path | 02 EF-5a |
| `ASYNC_WATERFALL` was given twice for one cause, and never for a loader as `rx-declare` drafts it (io) | **advice once** per question; an io fn awaited for its answer is a question, and the advice says what only `pure` rules out | 99, the advisory rows |

And the tasks' own reds, each decided by a rule it already had:

| mistake | decision | rule |
| --- | --- | --- |
| an action a context provides, called in a view or given to `onClick` called | **refused**: a function a context provides or a prop is given is read by its declared type | 09 MO-10b, 02 SC-4 |
| a mutation run, a cache invalidated, while the view computes | **refused**: a function field that answers a promise, not awaited in reactive scope, is io | 09 MO-10b |
| a guess in a handler that awaits nothing | **refused**: `GUESS_OUTSIDE_HOLD`, a run that starts nothing to wait for | 06 AC-3 |
| a guess written after the `await` | **advice**: `GUESS_AFTER_AWAIT` | 06 AC-3; 99 |
| the list a JS component hands its view, spliced | **refused**: `MUTATION_IN_PLACE` | 02 W-1a |
| `<Select.Listbox />` with no children | **accepted**: an optional render prop may be left out | 09 MO-11k |
| a row found in a draft, written through its local | **refused, said better**: the local is a copy; the message gives the two ways to write the row | 09 MO-10i |

*Considered and rejected: a callback keyed by a sibling.* A TanStack query
whose function reads a value its key does not name is asked once and
answered from the cache for every value after (`queryKey: ["todo"]`,
`queryFn: () => fetchTodo(props.id)`). Nothing in `.rx` is frozen — the
closure reads `props.id` when it is called — so no rule of the language is
broken; the library asks again only when the key changes. A declaration
word for it (`queryFn: keyed(queryKey) () => Promise<T>`) was proposed and
is rejected under the scope rule (08 CN-8): it would be one library's
cache contract written into the language, and TanStack's own ESLint rule
(`exhaustive-deps`) checks it. The variant is no longer one of
`bench/tasks/query-mutation`'s.

## RFC 06 — fields of a JS result that wait or fail

**Revised.** A result with field rows is read a field at a time. Its
name, and a path to a record of held fields, stand only as the object of
a field read, as another name given by an equation, or compared or
tested; anything else is the new `RESULT_AS_VALUE`. What travels is the
field, which carries its rows as any `.rx` value does (a prop, a
provision, an export).

*Guarantee.* In an accepted program a held field is read only by a path
written from a name bound to the result, and each such read is checked as
a question's reader; the compiled result reads each field where it is
read, so a read of one is no read of another.

*Why.* The second round counted a result "consumed whole" as a read of
every field, and followed it through aliases, records and closures. A
closure given to a component, a provision, an export read in another
module, and a source written from a handler each carried it past the
count, and the accepted programs threw in the server's render. The rule
is now about what can be written, so there is nothing to follow.

*Now refused, was accepted.* `<Child q={orig} />` (with boundaries above
it), `box = { q: orig }`, `get = () => orig`, `provide qctx = orig`,
`export q = useQuery(…)`, `saved := orig`, `let q = orig`. Pass or bind
the field. `orig == null`, `q = orig`, and a handler that reads a field
(`onPress={() => { n := orig.isFetching ? 1 : 2 }}`) are accepted.

*Also.* `pending` and `fails(…)` written where no record field takes
them — a tuple's part, a member of a union, a type argument — were
ignored without a word; they are a `PARSE` error in the `.d.rx`.

## RFC 09 — a library's drafts

**Revised.** A draft is a place, not a value.

1. Its name stands only in its own callback: not in a closure made
   there (a path's updater excepted, which is applied where it is
   written), and the callback has no `await`.
2. A read of it is a copy (`__rt.copy`), wherever its value could be
   kept; not where it goes straight back to the library (a value written
   to a path, the callback's result, an argument of the draft's own
   method).
3. The function that hands the draft is called by its own name, with
   the callback written in the call.

The loop the proposal lacked is the statement of 07 §5, which this round
adds: `for (const x of xs) { … }`. A turn of a loop over a path of the
draft is a place of the draft (`for (const t of d.items) { t.done :=
true }`).

*Guarantee.* In an accepted program, no value `.rx` holds after a draft
callback returns is the library's draft or a live part of it, and no
`.rx` code names the draft after its callback returned.

*Why.* A path read was taken for a copy, which a nested proxy is not
(`saved := d.sub`), and the draft was followed through locals, records
and calls to refuse storing it: a callee that is not a plain name, a
method's argument, an action that stores its argument, and a callback
that is not a literal each got through. Copying makes the claim true
instead of proving it, and refuses nothing that only reads.

*Now accepted, was refused.* `saved := d`, `saved := [d]`, `let alias =
d` captured by a later closure: each is a copy. *Now refused, was
accepted.* `let up = (d) => { … }; setTodos(up)`, `let set2 = setTodos`,
`<Row set={setTodos} />`, a store result held whole and passed, an
`await` in the callback, `let a = d; a.done := 1` (a copy's path), and
`[1, 2].forEach((x) => { d.done := d.done + x })` (the loop is the
statement).

## RFC 14 and RFC 34 — values that never change; a kept `peek`

**Revised.** An instance stays one where the checker knows what is done
to it: named, passed whole, a declared method called on its own name or
an alias's. Anything else read through a value that may be the instance
(by mention) is a read of what may change: a field, an index or a method
on a record or an array holding it, on what a call given it returns, on
a parameter of a closure handed it; and handing it to a function of
`.rx` the checker cannot see into. A closure reads when it is called:
calling the closure a name is bound to reads what its body reads.

*Guarantee.* An argument, or a kept `peek`, taken for made once reads no
field of a primitive's instance and calls no method its declaration does
not name, through any `.rx` expression.

*Why.* `keep(keep(clock)).now()`, `o.f(clock).now()`, `mk(clock)().now()`
and `map([clock], (c) => c.now())[0]` were accepted; and so was `f = ()
=> n; createLabel(f())` for any source `n`, which is E-10 itself: the
check read the names an argument reads and took a closure's name for a
constant.

*Now refused, was accepted.* `[clock][0].format()` (a declared method
through an element: name the instance), `w = [clock, 5]; createLabel(w[1])`.

## RFC 17 — `renders`

**Revised.** The bound value, and every value that may hold a part of
it (by mention), leaves the region it is bound in through none of the
ways out: a component's prop, a provision, an export, a source, a thrown
value, an argument of a call that may keep it. A fn, an action or a
named closure of this module is seen into: its parameter is what it is
given. A `pure` JS fn keeps nothing (`flexRender`). What is free to
leave is a primitive made of it, and a closure that gives nothing back.

*Guarantee.* In an accepted program no `.rx` code outside the region a
bare `renders` result is bound in holds that result or a value read out
of it, so whatever renders its components is beneath that region.

*Why.* The second round let a path read through: `held := table.rows`,
`<Rows rows={table.rows} />`, `<Grid table={{ rows: table.rows }} />`,
`{ rows } = table`, a row of `for t in [table]` — each carries the
components as well as the table does.

*Now refused, was accepted.* Those, and `<Tip text={row.name} />` (a
field of a row, for all the checker knows): pass `str(row.name)`. *Now
accepted, was refused.* `<Btn onPress={() => { table.nextPage() }} />`.

## RFC 18 — components that travel in values

**Revised.** What a `renders` prop is given is named by mention: every
name its value may come from is followed to the carrying calls it was
bound to, whatever is in between (a branch, a call, a closure's result).
A name whose value comes from where the checker cannot look — another
`.rx` module, a prop, a parameter, a source, a provision — is
`RENDERS_ESCAPES` at the prop.

*Guarantee.* Every component given to a `renders(later)` fn is checked
at each `renders` prop the program gives a value that may carry it, or
is `COMPONENT_AS_VALUE`; no `renders` prop is given a value that may
carry components the check did not name.

*Why.* The lookup followed names through members, calls, records and
arrays only: a router behind `?:` or a closure's result was rendered with
its components unchecked, and one from a prop or a source was not looked
at at all.

## A new proposal: the loop of imperative scope (07 §5)

Not one of the 35: RFC 09's revision needs it, and 07 §5 already named
it as missing. `for (const x of e) { … }` in imperative scope,
JavaScript's `for … of`: a statement, so its body is the run it is
written in — it may `await` in an action, `return` from the run, and
name a draft, none of which a closure handed to `forEach` can. The run's
checks read a loop as a body that may not run, run once, or run again
over what its last turn wrote. S-surface-10 (interpreter, oracle,
compiled, server, types).

## RFC 23 — types across the boundary

**Revised.** `./x.tsx`, `./x.mts` and `./x.cts` are declared as
`./x.jsx`, `./x.mjs` and `./x.cjs` are: by the file's whole name
(`x.tsx.d.rx`), then by `x.d.rx`. The checker read the first alone and
the tooling the second alone; both read one list now (`declaration_names`,
`beside.js`).

## RFC 25 — type-checking in the production build

**Revised.** A folder's listing counts, for the gate, what a type-check
could take: its folders, and the files of the kinds the project's
program holds. With `"include": ["**/*"]` a README, or the assets a
build writes under `dist/`, made every build start check again.

## RFC 32 — a declared JS error class crosses as itself

**Revised.** A class's identity is read from its declaration's own place
and nothing else: its named package and the path below, else the path
below the nearest `package.json` above it, else the file's name. It no
longer depends on the entry (nested unnamed scopes named a class
`web/err.d.rx#Gone` from one entry and `err.d.rx#Gone` from another).
Two declarations that would name a class alike in one program are
refused where they are loaded (`DUPLICATE_WIRE_ID`: name one of the
packages), where the second round let both be `err.d.rx#Gone`.

*Now refused, was accepted.* Two unnamed `{"type":"module"}` scopes,
each declaring an error class of the same name in a file of the same
name, imported by one program (they were told apart by the folder the
build started in).

## Also

`ref/check.ts` and `ref/model.ts` read a folder named `x.rx` as no
module (`MODULE_NOT_FOUND`, as the crate), not as a read error.

## After the coverage suite (2026-11-23): two rules made true at run time

The benchmark's second measure — every package of four libraries, used
once (`bench/coverage/`) — changed no check and one thing the compiled
program does, in two parts (09 MO-10a, 03 RG-6b):

| what a Solid app writes | was | now |
| --- | --- | --- |
| `online = createConnectivitySignal()`, then markup, server-rendered | hydrated with every key after the primitive one off (`Hydration key miss`): the library returns early on the server and calls `onSettled` in the browser, and what a primitive made was the component's own | the primitive is called in an owner of its own (RG-6a's nested region): one child of the component on both sides |
| `audio = createAudio("a.mp3")`, `fs = createFullscreen(el)` | Solid's `STRICT_READ_UNTRACKED` in development, against the app's component: the argument was an equation even when a constant, and the library reads it once while it is made | a constant `ref` argument is the plain accessor; the call is untracked, as a call made once is |

Neither is a check, and neither adds to what Solid does at run time: an
owner and `untrack` are Solid's own, placed where the language already
said the call's region is. Both emitters emit it (`__rt.inst`), and the
crate's lowering is held to `ref/`'s as before.

## After the fifth round's open ends (2026-11-23): four decisions

Recorded in 09 MO-8r (*Settled*), MO-11t and MO-12e, and in
`rfc-declaration-types-2026-11-22.md` (*A sixth round*). What each changed
for a program:

| what a Solid app writes | was | now |
| --- | --- | --- |
| `<Key each={rows} by="id" fallback={<li>none</li>}>`, `<ClientOnly fallback={<p>…</p>}>` | no spelling: `COMPONENT_AS_VALUE` for a component, and a string where a string would do | a component of the app's with no props, given by name: `fallback={Nobody}` is the component applied there (MO-11t) |
| a hook of the app's own around a library's (`useTodos = () => useQuery(…)`), outside the provider | accepted: a module of the app's own could not name the library's context | `CONTEXT_NOT_FOUND`: `export context queryClient from "@tanstack/solid-query"` and `uses(queryClient)` in the wrapper's declaration (MO-12e) |
| `todos = useQuery(…)`, `{todos.data}` under no `errored` region (RFC 06, below) | `UNHANDLED_FAILURE`, by `data: pending fails(Error) T` on the library's row | accepted: the form was one library's and is withdrawn; `data` is an accessor through a module of the app's own, and an accessor asks for no region |
| a table's cell component that reads the app's context; the table kept in a source (RFC 17, below) | the first accepted, the second `RENDERS_ESCAPES`, by `renders` on the adapter's row | the first `CONTEXT_NOT_FOUND` (a cell is checked under a root of its own), the second accepted: the form was one library's and is withdrawn |

RFC 06 and RFC 17 below describe rules that held from 2026-11-22 to
2026-11-23 for declarations; what they say of an `.rx` prop typed with
field rows (RFC 06) still holds. RFC 18's words (`renders(later)`, a
prop's `renders`, `nests(… under …)`, `outlet`) are one library's too,
and are to be withdrawn in a change of their own (done the same day:
the next section).

## After the sixth round (2026-11-23): the bar applied to the end

Recorded in 09 MO-8r (*Settled*), MO-10l and MO-11r, and in
`rfc-declaration-types-2026-11-22.md` (*A seventh round*). What each
changed for a program:

| what a Solid app writes | was | now |
| --- | --- | --- |
| a TanStack Router tree in `.rx`: `createRoute({ getParentRoute, component })`, `createRouter({ routeTree })`, `<RouterProvider router={router} />`, a page at its layout's `<Outlet />` (RFC 18) | accepted, by `renders(later)`, a prop's `renders`, `nests(component under parent)` and `outlet` on the library's rows | the four words are refused by name: one library wrote them. A page given to `createRoute` is checked under a root of its own, so a router hook in it is `CONTEXT_NOT_FOUND`. The tree is written as records for a factory of the app's own, declared `Component provides(router) nests(children in component)`, and a layout renders `props.children`: accepted, with the same checks |
| `<Link to="/peeple/$id">` in such an app | a type error, from TanStack's registered router | accepted: the made router has no value to register. **Given up** |
| the router given to the app's frame as a prop and passed on (`<Shell router={router} />`) | accepted, the prop given on being one the frame renders; `RENDERS_ESCAPES` for a router from a source, a parameter or another module | the made router is a component, applied among the frame's children (`<Shell><AppRouter /></Shell>`); `RENDERS_ESCAPES` no longer exists |
| `user = createJson(url)` over solid-use's `fetch().json()`, `{user.name}` under no `errored` region; `events.data` of `createSSE` under none | accepted: an accessor asks for no region | `UNHANDLED_FAILURE` where the row says `pending fails(Error) ref` (MO-10l), and `ASYNC_OUTSIDE_LOADING_BOUNDARY` in a client-only build with no `loading` region. A plain `ref` is accepted as before |
| `todos = useQuery(…)` through a hook of the app's own, `{todos.data}` under no `errored` region (RFC 06) | accepted since the field words were withdrawn | `UNHANDLED_FAILURE` again: the hook's row says `data: pending fails(Error) ref T`; the result passed whole is `RESULT_AS_VALUE` again |
| `createPagination({ prevContent: <span>‹</span> })`; a table cell that reads the app's context | no spelling; `CONTEXT_NOT_FOUND` | the same, decided: one library asks for each |

RFC 18 below describes a rule that held from 2026-11-19 to 2026-11-23.
RFC 17's confinement, kept in the checkers for RFC 18's values after
`renders` alone was withdrawn, is deleted with them.

## After the seventh round (2026-11-23): what a JS host renders

Recorded in 09 MO-14, 11 CP-4d and `rfc-declaration-types-2026-11-22.md`
(*An eighth round*). What changed for a program:

| what a Solid app writes | was | now |
| --- | --- | --- |
| a file-routed TanStack app: TSX route files that hand `.rx` components to their routes, a root layout in `.rx` with the `errored` and `loading` regions, pages that call `useParams({ from })` | a whole-program build refused it (each component a JS host renders is checked under a root of its own, 11 CP-4d); a per-module build accepted it and checked nothing above a page | accepted where `host.d.rx` says what the router does: `provides(router) nests(children in component) = <tree>` (09 MO-14); the layout's region removed is `UNHANDLED_FAILURE`, on the declaration |
| `<Link to="/peeple/$id">` in such an app's `.rx` | — (the factory of 09 MO-8r had given the registered types up) | a type error again: the generated route tree registers the router |
| `.rx` files in a routes directory (`filesystem-routing` with `@solidjs/router`), each file's default component its page | refused in any build: a default component was a mounted view | the route file is imported as its page (`?rx-page`), and a module the host declaration imports has no mounted view |
| a router hook in an exported component the host's view does not name | `CONTEXT_NOT_FOUND` in a whole-program build | the same: only what the view names is credited |
| a region or a provision an `.rx` entry puts around a JS router's component | not credited to the pages | the same, and said: the view is the host's own |

(The last row was decided the other way in the next round: below.)

## After the eighth round (2026-11-23): the limits it left

Recorded in 09 MO-14f, MO-14e, MO-11i and MO-1c, and
`rfc-declaration-types-2026-11-22.md` (*A ninth round*). What changed for
a program:

| what a Solid app writes | was | now |
| --- | --- | --- |
| an `.rx` entry that provides a context (or holds a region) around a JS router's component, read by a page | `CONTEXT_NOT_FOUND` (`ASYNC_OUTSIDE_LOADING_BOUNDARY`, `UNHANDLED_FAILURE`) on a correct program: nothing the entry has was credited | accepted: `host.d.rx` names the entry's component, with the host's records as its children, and imports the router's component from its JS module (MO-14f) |
| a TanStack layout that renders `<Outlet />` | accepted, its pages checked under nothing — with every region removed too | its pages are checked where it applies the outlet, once `host.d.rx` imports it; without the import, `NESTED_NOT_RENDERED` |
| a layout that forgets `{props.children}` (a factory's tree, a host's view) | accepted: its routes never show | `NESTED_NOT_RENDERED` |
| a router hook in the `.rx` entry, above the router's component | `CONTEXT_NOT_FOUND` | the same: the router's context is the applied component's to provide, by its own row |
| `rx-tsc --rx-strict` on a project under a `host.d.rx` | the declaration passed over | its view and its imports from JavaScript are `UNVERIFIED_ROW` until `rx-verify --record` holds them |
| a module imported for a function, whose default component relies on its caller's region | refused where no one renders it | accepted; the default component is checked where it is applied (MO-1c) |
| an `.rx` file as a TanStack route file | not picked up | the same: the generator has no option for it (recorded, not filed) |

## After the ninth round (2026-11-24): a component a library renders later

Recorded in 09 MO-11u, MO-11c, MO-11s, MO-8r and DV-24, 13 TY-3d, and
`rfc-declaration-types-2026-11-22.md` (*A tenth round*). What changed for
a program:

| what a Solid app writes | was | now |
| --- | --- | --- |
| a toast component that reads the app's context, shown from a handler and rendered by the library's toaster (`solid-sonner`, Kobalte) | `CONTEXT_NOT_FOUND` on a correct program: the component was checked under a root of its own | accepted where the context is above the toaster: the fn's row says `renders(Toaster)`, and the component is checked among its children, at every place the program applies it (MO-11u) |
| the same toast, with the provision above the call and not above the toaster | refused, for the wrong reason (nothing was credited) | `CONTEXT_NOT_FOUND`, on the line of the call, naming the fn and the component |
| TanStack Router's code-based routes written in `.rx` (`createRoute({ component: Person })`), a page that calls `useParams` | `CONTEXT_NOT_FOUND`: the route tree had to be given to a factory of the app's own, which gave up the registered route types | accepted beneath `<RouterProvider>`, with the route types registered (`bench/tasks/router-code-routes`); a layout's own regions are not credited to its pages (the word places them side by side) |
| a table cell that reads the app's context | no form (decided 2026-11-23): the cell took what it needed as props | accepted: the adapter exports a `<FlexRender>` component, as TanStack Table 9 does, and `createTable`'s row names it |
| `<Markdown builtins={{ Heading: Heading }}>` (`solid-marked`), a record or a list of components in a prop | `COMPONENT_AS_VALUE` | each component is checked as applied beneath the component it is given to (MO-11c) |
| `toast(Saved)` where the library's type asks for a function of nothing, `Saved` a component with no props | TS2345: a component was `(props: any) => …` | accepted: a component that declares no props is a function of nothing (TY-3d) |
| a JS component that mounts what its `Component` prop is given later, into a root of its own | accepted by the checker and by `rx-verify` | the checker is unchanged (DV-24 is the declaration's claim); `rx-verify` runs the claim against a scene and reports the mismatch, and strict mode asks for it |
| a library fn that calls the component it is given with no owner | not known to anyone | reported by `rx-verify` where a scene shows it; MO-11s no longer claims to cover it |
| a served page whose text has a `<` or an `&` | escaped twice until the browser took the page over | escaped once (S-server-5) |
| a component whose children a JS library gives as a list of strings | shown as the list, `["text"]` | shown as the text |

`renders` alone, `renders(later)`, a prop's `renders`, `nests(component
under parent)`, `outlet` and `renders(root, …)` are refused by name as
before. `RENDERS_ESCAPES` is no diagnostic.

## After the tenth round (2026-11-24): the router's own tree, and the words a wrapper already has

Recorded in 09 MO-14g, MO-8s, MO-11u, MO-13b and MO-14 (*The native
shape*), 11 CP-4b and CP-4d, 06 ST-4d, 10 SV-7c, and
`rfc-declaration-types-2026-11-22.md` (*An eleventh round*). What changed
for a program:

| what a Solid app writes | was | now |
| --- | --- | --- |
| `host.d.rx` for a file-based router | written by hand: the imports, the nesting, the router's own components; a route file added later was checked under nothing, or under its old layout, in silence | derived from the router's tree (`rx-declare --host --routes`, `//@ routes` on its first line); fallen behind, it is `HOST_VIEW_STALE` in `rx-tsc`, `rx-verify` and a build, and the dev server writes it again |
| the probe beside it | restated the routes | is handed them (`scene(rx, h, routes)`) |
| a TanStack route file | TSX that hands the route an `.rx` component | the same with the generator as released; an `.rx` file that is the route's component with the fork's `routeComponentExtensions` |
| server rendering with file routes on Solid 2 | TanStack Start; "SolidStart is not on Solid 2" | Solid's start mode (`solid({ start, ssr: true })`) with `filesystem-routing`: an `.rx` root (through one line of `App.ts`) and `.rx` route files, served, streamed, hydrated |
| an edit of a route file under the dev server | the page read `no provision` for a context the app's entry provides, until the server was restarted | shown; a module the dev server serves twice is one module |
| rows added to a keyed list with a key it has, computed by a click | nothing said, in development or production | named on the console in a development build |
| what only the browser knows declared `pure`, and rendered | nothing said by the checkers, by the build or by hydration | the same of those three; `rx-verify` runs the fn with a window and without one, and reports the row |
| `router.d.rx`, `query.d.rx`, a toaster's module: the declaration of a small module over a library | every word by hand (6 to 21 words) | `rx-declare ./module` drafts it: the words are the library rows' (MO-8s) |
| a project's declaration of a router | the library's whole draft, 296 rows | `rx-declare <package> --only <exports>`: 28 rows |
| a package whose signature names a library through its own `rx-types/` | built "ok", and wrong in every app | refused by `rx-lib` |

## Limits that remain, and why they are inside the goal

- **`renders(H)` places a fn's components side by side beneath H**
  (09 MO-11u). A layout's own regions are not credited to the pages its
  outlet renders: the word names a place, and a tree's nesting is a
  factory's or a host declaration's to say. The check errs on the strict
  side. (Asked again and decided 2026-11-24, with the program run: the
  nesting of code-based routes is in one library's values, which CN-8
  keeps out of the checker. A host declaration has it, now derived.)
- **H is one component, of the same declaration.** A library whose fn
  hands its components to one of two components (a toaster per region,
  chosen by an option) is checked at every application of the one the
  row names, and not at the other's. A library that renders through a
  function the app calls, not a component, exports a component for it
  or is left to MO-11s.
- **A row's place is the declaration's word**, as every row is:
  `rx-verify` holds `renders(H)`, a factory's placement and a
  component's `Component` props to a scene, and reports a component the
  library calls with no owner; nothing in a build runs the library.
- **A method of a library's object has no row** (Kobalte's
  `toaster.show`, sonner's `toast.custom`): a component given to one
  is `COMPONENT_AS_VALUE`, and the app hands the method out as a
  function from a module of its own. (Decided 2026-11-24, both run: the
  word would be true of Kobalte's and false of sonner's, which calls its
  function with no owner — one library. The module's declaration is
  drafted whole, MO-8s.)
- **A record of components is read in the literal the prop is given**
  (MO-11c): one built elsewhere and passed by name is
  `COMPONENT_AS_VALUE` where it is written.
- **A package written in `.rx` cannot name another package's host** in
  its signature (MO-13b, as a context): the app shows the toast, or
  mounts the toaster. (Decided 2026-11-24: no library writes it. A
  package that named one through its own `rx-types/` was built in
  silence; `rx-lib` refuses it now.)

- **A host declaration written by hand is trusted** (09 MO-14e), as
  every `.d.rx` is. One that names the router's tree (`//@ routes`,
  MO-14g) is that tree's, and refused when it falls behind — for the
  three sources the tools read (TanStack's generated tree, a
  `filesystem-routing` directory with that package's default nesting, a
  JSON tree). A custom `toPath` in the Vite config is not read; such a
  project writes the JSON, or the declaration. Which component a layout
  renders its pages through is still said by the reader for the router
  it knows (TanStack's `<Outlet />`), and `rx-verify` runs it.
- **The checkers read no router** (08 CN-8): `HOST_VIEW_STALE` is the
  tools'. `rxc check` alone, on a declaration that has fallen behind,
  checks what the declaration says.
- **A component the host renders through is applied in the view of the
  component its record names** (MO-14f). One applied for it by another
  `.rx` component in between is refused (`NESTED_NOT_RENDERED`), with the
  way round in the language: that component takes it as its children.
- **A TanStack route file is TSX, with the router as released.** Its
  generator reads route files as JavaScript; the option that admits an
  `.rx` file is a fork's (`routeComponentExtensions`), built against and
  not upstream. A route with a loader or search validation is a TS route
  file either way.
- **Solid's start mode takes its root from a TS or JSX file**: an `.rx`
  root is handed over in one line of `src/App.ts`.
- **A module of the app's own takes a library's words by its shape**
  (MO-8s): exported again, rendered alone, made by a factory, called at
  the top of a hook, read by a field. A module that does the same thing
  another way — the provider inside a fragment, the hook in a helper —
  takes nothing, and its declaration is written by hand as before.
- **A duplicate key computed at run time is reported in development
  only** (06 ST-4d), and not refused; **a `pure` fn that differs between
  the server and the browser is `rx-verify`'s to find** (10 SV-7c), with
  the arguments its probe gives and on the machine it runs on. Hydration
  says nothing of a text that differs; that comparison is Solid's to
  add.

- **Declarations are trusted** (CN-5): `pure`, `draft`, `handler`,
  `uses(…)`. `rx-verify` checks them by running.
- **`__rt.copy` copies arrays, plain objects, Maps and Sets.** A library
  whose draft hands out live instances of its own classes is outside
  what `draft` says.
- **A JS fn declared `pure` that keeps or hands on its argument** breaks
  what `pure` says wherever it is used (the `renders` guarantee it also
  broke is gone with the word, 2026-11-23).
- **Precision.** An element read out of a named array holding an
  instance is a read through it: CN-3a's rejection of a fine program,
  with its way round in the language. (A part of a `renders` value that
  needed `str(…)` to leave was another until 2026-11-23.)
- **An accessor's rows are the declaration's word** (MO-10l): one that
  waits and whose row says only `ref` asks for no region, as every
  accessor did before. `rx-verify` points it out; nothing infers it.
- **`draft` means plain data.** A draft whose objects carry their own
  methods under the names of an Array's, or that hands out instances of
  its own classes, is outside what the word says.
- **Identity.** A copy of a draft's object is not `==` the object: use it
  as data. Inside the draft's own methods the draft's objects are passed
  as they are (`d.items.indexOf(d.current)`).
