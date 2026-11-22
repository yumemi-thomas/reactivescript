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

*Proposed, not ruled: a callback keyed by a sibling.* A TanStack query whose
function reads a value its key does not name is asked once and answered
from the cache for every value after (`queryKey: ["todo"]`, `queryFn: ()
=> fetchTodo(props.id)`). Nothing in `.rx` is frozen — the closure reads
`props.id` when it is called — so no rule of the language is broken; the
library asks again only when the key changes. A declaration could say
so: `queryFn: keyed(queryKey) () => Promise<T>`, read as "every changing
value this closure reads is named in that field of the same record", a
static check at the call (the names a closure reads outside `peek`
against the names the key mentions, MO-10k's way). It is one word for
TanStack Query, SWR-shaped caches and a router's `loaderDeps`. Until it
is ruled, `bench/tasks/query-mutation` keeps the variant red, with this
as its reason.

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

## Limits that remain, and why they are inside the goal

- **Declarations are trusted** (CN-5): `pure`, `draft`, the field rows,
  `renders`, `methods(…)`. `rx-verify` checks them by running.
- **`__rt.copy` copies arrays, plain objects, Maps and Sets.** A library
  whose draft hands out live instances of its own classes is outside
  what `draft` says.
- **A JS fn declared `pure` that keeps or hands on its argument** breaks
  the `renders` guarantee as it breaks every other use of `pure`.
- **Precision.** A part of a `renders` value that its declaration does
  not type as a primitive needs `str(…)` or an operator to leave; an
  element read out of a named array holding an instance is a read
  through it. These are CN-3a's rejections of fine programs, each with
  its way round in the language.
- **`draft` means plain data.** A draft whose objects carry their own
  methods under the names of an Array's, or that hands out instances of
  its own classes, is outside what the word says.
- **Identity.** A copy of a draft's object is not `==` the object: use it
  as data. Inside the draft's own methods the draft's objects are passed
  as they are (`d.items.indexOf(d.current)`).
