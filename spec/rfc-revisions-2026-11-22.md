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

No value is followed anywhere. Each guarantee is shown by a test that
puts the value through every way an expression hands a value on, and
every pair of them, into every way out — in both checkers, and for
drafts at run time against a library that revokes its draft.

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
- **Precision.** A primitive read out of a `renders` value needs `str(…)`
  or an operator to leave; a result with held fields cannot be passed to
  a child, only its fields; an element read out of a literal holding an
  instance is a read through it. These are CN-3a's rejections of fine
  programs, each with its way round in the language.
- **Identity.** A copy of a draft's object is not `==` the object: use it
  as data. Inside the draft's own methods the draft's objects are passed
  as they are (`d.items.indexOf(d.current)`).
