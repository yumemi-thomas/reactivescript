# 02 — Core: the synchronous calculus

**Status: DRAFT.** The fragment with no async, no holds, no structured values,
no regions beyond "a program is one region." It is the part that rests on
proven ground (Lustre's equations and `pre`; Adapton's demand-driven
consistency) and it must be closed — rules fixed, `ref/` passing
`scenarios/S-core-*` — before `05-holds.md` opens.

Everything later in the spec is an extension of this document. Nothing later
may contradict a rule here; a case that seems to need that is a proposed change
to this file, raised as a scenario.

---

## 1. Abstract syntax

Concrete syntax is `07-surface.md`, decided last. All examples in `spec/` and
`scenarios/` use this form.

```
Program   ::= RBlock                          -- the program is a reactive block

RBlock    ::= Decl* Markup*                   -- declarations, then the block's view (V-5); no keyword
                                              -- (markup begins at '<', '{', 'if', 'for'; a declaration at a keyword or 'x =')

Decl      ::= source x := Expr                -- V-1; ':=' assigns now — a snapshot (E-4)
            | x = Expr                        -- V-2, equation
            | effect (Expr*) Block            -- V-3; compute exprs ‖ apply block
            | deferred x = Expr               -- V-16; declared lag (05 H-1)
            | fn f (Param*) => Expr           -- pure function (E-9)
            | fn f (Param*) { Decl* ; Expr }  -- function with a body: decls then a value
            | component C (props) RBlock      -- RG-4: a function from props to a region with a view
            | error C (x*) [=> Expr]          -- R-f-1: an error class; the expression is its message
Param     ::= x | ref x                       -- E-9: value or ref parameter

Expr      ::= lit | x | op(Expr*) | f(Expr*)  -- pure
            | pre x | pre x -> Expr            -- x's value before its last change; with initial (C-2, C-2a)
            | peek Expr                       -- snapshot read (V-11)
            | Expr ? Expr : Expr
            | Expr . field | Expr [ Expr ]    -- projections (full treatment: 06-stores)
            | fn (x*) => Expr                 -- pure function value
            | { Decl* ; Expr }                -- reactive block: local declarations, then value
            | throw Expr                      -- R-f-3: the value is the error (E-12)
            | await Expr catch (x [: C|…]) => Expr  -- R-f-4: a rejection of those classes becomes the answer

Markup    ::= Element | Control                  -- at block level, control forms are bare
Element   ::= <tag attr={Expr}*> (Element | text | {Expr} | {Control})* </tag>
            | <C attr={Expr}*> Markup* </C>      -- RG-4a: component application (C capitalised)
Control   ::= if Expr RBlock else RBlock         -- each branch is a reactive block (region)
            | for x in Expr RBlock               -- each row is a reactive block; keyed form: 06-stores
            | loading [on(Expr)] fallback { Markup* } RBlock    -- 05 H-5/H-6
            | errored fallback [(x [: C|…])] { Markup* } RBlock   -- 05 H-12; typed: R-f-4
                                              -- inside an element, text is literal: control forms are braced,
                                              -- `{if c { … }}`, the way JSX braces `{cond && …}` (found by ref/: S-hold-1)

Block     ::= Stmt*                            -- imperative scope (SC-2)
Stmt      ::= x := Expr                        -- write to a source
            | let y = Expr | y := Expr         -- imperative locals
            | Expr                             -- call for effect
            | if Expr Block else Block | while Expr Block
            | try Block catch (x [: C|…]) Block finally Block | throw Expr   -- AC-7, R-f-6: imperative failure
            | fn-decl, return, …               -- ordinary JS statements
```

Function application `f(e…)` covers both language functions and FFI imports;
`04-rows.md` separates them. In core, every function is pure.

## 2. Scopes (summary of 01-scopes)

- **SC-1 Reactive scope.** Program top level, equation initializers, reactive
  blocks, compute expressions of effects, and views. Contains declarations and
  expressions only. Has no statement position.
- **SC-2 Imperative scope.** Apply blocks and event handlers. Ordinary JS
  statements. Writes are legal only here. Every read of a reactive value here
  is a snapshot of the committed state; no `peek` is needed or allowed.
- **SC-3 Lexical inheritance.** A closure created in a scope is in that scope.
  A `fn` value created in reactive scope is a pure function; a closure created
  in an apply block or handler is imperative and may write.
  *A statement closure in a record or a list (2026-11-26, B3).* One written as
  a field of a record literal or an item of a list literal, in reactive
  scope, is imperative and an `io` value, as an action written beside and
  named there is (`attrs = { onKeyDown: (e) => { … } }` for `action down(e)
  { … }` and `{ onKeyDown: down }`): it is carried freely — through names,
  spreads, a context, a view's argument, a fn's result — and called where an
  `io` value may be (04 R-io-3; called while the view computes it is
  `ACTION_CALLED_IN_OWNED_SCOPE`, through what holds it too). It ends only
  where a handler is taken: an `on…` attribute or `ref` of an element, by
  name or by a spread's field; a handler prop of a component (SC-4b); a
  parameter, or a record's field, a JavaScript declaration says `handler`
  (09 MO-10g). Given anywhere else — a plain attribute or prop, a spread's
  field that is none, an argument of JavaScript not marked `handler`, which
  may call it while it computes — it is `REACTIVE_WRITE_IN_OWNED_SCOPE`, as
  one written there is. S-check-7.
- **SC-4 Handler positions.** An event attribute in a view (`on*={…}`) takes an
  imperative function. An arrow literal written there is imperative scope
  regardless of the enclosing view; a named function there must be `io` or
  pure. The event is the function's parameter. An arrow there, as anywhere
  in imperative scope, is a plain run or an action by its body (06 AC-1b).
  *A handler is passed, not called (2026-11-22).* The attribute takes a
  function; `onClick={save()}` calls `save` while the view computes and
  hands the event what it answered. Where what is called is io — an
  action, an io import, a setter a library handed back, a method its
  declaration says answers nothing — the call is refused there
  (`ACTION_CALLED_IN_OWNED_SCOPE`, `IO_IN_REACTIVE`), on an element and on
  a component's handler prop, in the arms of a condition too, with the
  closure it meant: `onClick={() => { save() }}`. A function a context
  provides or a prop is given is read by its declared type, as a
  method of a JS result is (09 MO-10b, 2026-11-22): `onClick={c.add(id)}`
  with `context cart: { add: (id: string) => void }`. A call of a pure fn that
  answers a handler (`onClick={pick(id)}`) is an expression like any
  other.
- **SC-4b A handler a component is given (2026-11-26).** A component written
  in `.rx` is given `on…` props, and `ref`, as an element is: an arrow literal
  there is imperative scope (SC-4, 07 §4). Inside the component such a prop
  (`props.onPick`, `props.ref`; the same read off a destructuring, a rest or a
  copy of its props) is **io, as an action is**: it is given on — to an
  element, to another component's handler — or called from imperative scope.
  Called in reactive scope, by its name (`IO_IN_REACTIVE`), carried in a
  record or an array of the component, or given to what calls it while the
  call runs (`ACTION_CALLED_IN_OWNED_SCOPE`, R-io-3, 09 MO-8j), it is
  refused: where the component is applied its closure may write, and
  would write while the view computes. A prop of such a name whose type, as
  written, answers a value (`onFormat: (n: number) => string`) is no
  handler but a function the component calls for what it answers: a
  closure given to it is pure (SC-3), and the component's printed
  signature says `pure` of it.
  A JavaScript component is what its declaration says (09 MO-10g):
  `handler` on the prop's type; with no declaration, `ref` is no handler.
  S-view-10.

---

## 3. Static rules

### E — Equations

- **E-1 (Equation rule).** In reactive scope, `x = e` declares `x` as the
  equation `e` over its free reactive variables. `x` has no statement position
  and is never a write target.
- **E-2 (Lifting).** Every expression in reactive scope denotes an equation. A
  constant is an equation with no inputs. `op(e₁…eₙ)` and `f(e₁…eₙ)` for pure
  `f` are equations whose inputs are the union of their arguments' inputs.
- **E-3 (Demand).** An equation's body is evaluated only when a reader, an
  effect's compute half, or another demanded equation reaches it in the current
  instant. Unreached equations have no observable cost or effect.
- **E-4 (Initializer is an assignment).** A source is declared with `:=`:
  `source x := e` assigns `x` the value of `e` once, in the instant the
  declaration is reached, and `e`'s inputs do not become inputs of `x`. The
  operator carries the meaning: `=` is always an equation (holds for all
  time), `:=` is always "assign the current value now" — once in a
  declaration, on every execution in imperative scope. There is no implicit
  snapshot anywhere; the other explicit one is `peek`. `source x = e` is
  a source with a standing question (06-stores ST-5).
  **Ruled 2026-10-23 (DV-6):** an initializer that reads a reactive value
  is a compile error (`SNAPSHOT_INITIALIZER`, bin S) unless the snapshot is
  written as one: `source email := peek(form.email)`. The text then shows
  what happens — `peek` is the snapshot read (E-5) — and an edit buffer
  seeded from the form is written exactly that way (examples/ai/wizard.rx).
  A reactive argument to a value parameter is the same shape at a call
  (E-10).
- **E-5 (peek).** `peek e`, in reactive scope only, evaluates `e` against the
  values of the pass it runs in and contributes no inputs to the enclosing
  equation. A region instantiated by a change sees that change's answers:
  a component mounted by the frame in which its data lands seeds from that
  data (`source draft := peek(props.initial.name)`). (Refined 2026-10-24,
  found by S-ai2-settings: the first text said "the committed state", which
  seeded the draft from the failure the change was replacing; Solid's
  `untrack` reads the current values, and so does `ref/` now. Imperative
  reads still see σ, H-10.) It has
  no meaning in imperative scope, where every read is already a snapshot
  (SC-2). `peek e` of an equation nothing demands evaluates it from scratch
  (P-3) without making it part of the frame: it stays undemanded for E-8/P-6.
  (Solid: `untrack` on a lazy memo.)
- **E-5a (A kept peek of what changes).** (Proposed 2026-11-20.) A `peek` is
  *kept* when the expression it is in is kept and read again: an equation, a
  provision or a context's default, what a view reads (a `{…}`, an attribute,
  an `if` condition, a `for` list), a component's argument, a `ref` argument.
  A source's seed (E-4) and a value argument (E-10) are snapshots by rule, an
  effect's compute half runs its apply, and a closure reads when it is
  called: none is kept. A kept `peek e` whose expression reads nothing else
  that changes freezes it, and if `e` can change — a source written,
  guessed, refreshed or affected; something that awaits; a `ref` parameter;
  a JS reader or a field declared to hold (MO-10b, MO-10f); a field read
  through the instance a declared primitive made (`peek size.width`), or an
  equation bound to one, since the instance never changes but its fields
  track (MO-10b); a field read through a `for` row (`peek r.x`) whose list
  can change, since the row is a constant (RG-2b) whose fields are written
  by path or reconciled by key (ST-4a) while it lives (both revised
  2026-11-21 after review; the row itself, `peek r`, and a method called
  on an instance, which reads no field, stay constant; S-surface-8) —
  every reader keeps the first value. That is a compile error (`SNAPSHOT_KEPT`, bin S):
  drop the `peek` to read it live, or name the snapshot, `source saved :=
  peek e`. When the rest of the expression changes the `peek` is a sample
  (`n * 2 + peek n`) and is accepted. Writes to a source are always in its
  own module (MO-2) and a context is read-only beneath its provision (RG-7c),
  so what only another module can tell is a prop's arguments, a context's
  provisions and an `.rx` import. Checked one module at a time (the default)
  each of those can change; checked as the whole program (`--whole-program`)
  they change when an application, a provision or the export passes
  something that does (a least fixpoint over all modules). The whole-program
  check assumes JS applies the entry's exported components, the
  components passed to it as values, and the exported components of every
  module a JS host imports with `?rx-lib` (CP-4d; `--host m.rx`, which the
  Vite plugin's `rx({ wholeProgram: true })` finds by scanning the
  project's JS and TS modules and single-file components (`.vue`,
  `.svelte`, `.astro`, `.mdx`) for such imports, however spelled (an import,
  a re-export, a dynamic import or a `require`, in any quotes, with
  `rx-lib` anywhere among the query's parameters: whatever the plugin
  compiles as a library), each resolved as the bundle resolves it:
  by Vite itself where Solid's plugin hands front ends its resolver
  (`context.resolve`, every plugin's `resolveId`), else relative, through
  the aliases given as `rx({ alias })`, the same object as Vite's
  `resolve.alias`, and tsconfig.json's `paths`; one that names no file is
  reported, and a change to the hosts re-checks the build; Vite's answers
  are kept per plugin, since another configuration in the same process may
  resolve the same import elsewhere, and a host is matched under every name
  the checker may key its module by: hosts and modules are matched by their
  real paths, so a linked root, folder or file is one module, and the scan
  follows linked folders, a relative import resolved from where its file
  really is, as Node and Vite resolve it; the scan covers the Vite root,
  and a host beyond it, another app's page or a server's entry, is counted
  when `rx({ hostRoots: ["../site"] })` names its folder or file, its
  imports resolved relatively, then by its own project's tsconfig.json
  `paths`, then as this build does, revised 2026-11-21 after review; a host
  nowhere named is not seen),
  whose props can change, and nothing else;
  a module known only by its signature (MO-9) is not seen. It is opt-in:
  builds and the editor check one module at a time unless asked. (Solid:
  `untrack(data)` in a memo with no other source, or `<Ctx
  value={untrack(data)}>`, which `createContext`'s provider reads once
  anyway.) S-surface-6.
- **E-6 (Equality cuts).** An equation whose re-evaluation yields a value equal
  to its previous value has not changed: it is not part of the instant's cone
  from that point on, its dependents are not re-evaluated through it, and
  effects over it do not run. Equality for atomic values is `Object.is`.
  Equality for structured values is per path (06-stores); there is no
  per-equation override. "Notify even if unchanged" is not a thing an
  equation can ask for — a re-ask is quiet (V-9, H-9).
- **E-7 (Equations are a system).** Within a reactive block the order of
  equation declarations is irrelevant; an equation may be used before the line
  that declares it. Only sources (their initializers, E-4) and effects (EF)
  keep declaration order. Each name is declared once. C-1 rejects cycles.
- **E-8 (Undemanded equations retain nothing).** An equation not demanded in
  an instant has no value in that frame: no cached value for E-6 and no `pre`
  (P-6). When next demanded it is evaluated from scratch and counts as changed.
  Its *region* (03) is unaffected; this is about state, not lifetime.
- **E-9 (Parameters: value or ref).** A `fn` parameter is a *value* parameter
  by default; `ref x` declares a *ref* parameter, which denotes an equation
  inside the body. A call with only value parameters is **lifted** (E-2): it
  is an equation over its arguments' inputs and re-evaluates with them. A call
  to a function with any `ref` parameter, or whose body declares a source,
  effect, or region, or reads a context (`use`, 03 RG-7b), is an
  **instantiation** (03 RG-6): it happens once at the call site. In an instantiation, value arguments are snapshots (E-4) and ref
  arguments are passed as equations.
- **E-9a (Optional parameter).** (Proposed 2026-11-25.) A value parameter may
  be written `b?: T`, after every required parameter; it is `T | undefined`
  in the body. A call may leave it out: `f(a)` is `f(a, undefined)`, in a
  lifted call and in an instantiation, from `.rx` and from JavaScript. A
  `ref` parameter may be optional too (2026-11-26; it was refused): given,
  it follows its argument; left out, it reads `undefined`, as one whose
  argument is `undefined` does. There is no default and no rest.
  S-optional-1.
- **E-11 (Lazy conditional).** In `c ? a : b` as an expression, only
  the selected arm is demanded; the equation's inputs are `c`'s plus the
  selected arm's, and change as `c` changes. The unselected arm is neither
  evaluated nor an input.
- **E-12 (Errors are values).** An equation whose evaluation throws has an
  *error value* in the frame. An equation or reader reaching an errored input
  is errored. There is no `try` statement in reactive scope: an error becomes
  fallback content at an `errored` boundary (03 RG-5, 05), and a rejection
  becomes an answer through `await e catch (x: C) => alt` (04 R-f-4); which classes may reach a reader is its
  `fails` row, and every one must be discharged (04 R-f). (Solid F-12.) An
  error in an apply block is imperative and ordinary.
- **E-10 (Snapshot arguments).** At an instantiation, a value parameter
  receives a snapshot. Passing a *reactive* expression to a value parameter
  is therefore a silent loss of reactivity and is a diagnostic at the call
  site (`SNAPSHOT_ARGUMENT`, bin S) — not an error, because "options read
  once" is legitimate. The check lives at the call site because that is where
  both facts are known: the parameter's kind and the argument's reactivity.
  (First drafted as a rejection inside the function body; `ref/` S-region-6
  showed that rejects `counter(n, 10)`, the legitimate case.) An equation
  bound to what a declared primitive made, its value result (09 MO-10b), is
  made once and never changes, so reading it in an argument loses nothing
  and is no diagnostic (proposed 2026-11-19: `createRouter({ routeTree:
  rootRoute })`, S-module-22); a reader (`ref`) still is.
  A method called on the instance is another matter (revised 2026-11-21
  after review): a stable receiver says nothing of what a method gives
  back, so it is read as a call whose answer may change, and the
  argument is `SNAPSHOT_ARGUMENT` (S-module-22); E-5a reads it the same
  way, so a kept `peek inst.m()` is `SNAPSHOT_KEPT` (S-module-20). Where
  the method makes its value once (`rootRoute.addChildren([…])`), the
  argument says so, as for any value read once: `createRouter({
  routeTree: peek rootRoute.addChildren([…]) })`. (A declaration could
  name such a method, `methods(addChildren)`, and the call then needed no
  `peek`: withdrawn 2026-11-22, 09 MO-8r.)
  **What counts as reading through the instance (ruled 2026-11-22).** The
  instance stays one where the checker knows what is done to it: named
  and passed whole.
  Anything else that reads through a value that *may be* the instance is
  a read of what may change, and which values may be it is 09 MO-10k's
  rule, by mention, with no value followed: a field read, an index or a
  method call on an expression that mentions the instance — a record or
  an array holding it (`w = [clock]`, then `w[0].now()` and
  `w[0].format()` too: the checker does not read a name's value to know
  which slot is the instance), what a call given it returns, however it is called
  (`keep(keep(clock)).now()`, `o.f(clock).now()`, `mk(clock)().now()`,
  `[].concat([clock])[0].now()`), a parameter of a closure handed it
  (`map([clock], (c) => c.now())`) — and handing it to a function of
  `.rx` the checker cannot see into (an `.rx` fn, a prop, a closure held
  in a record: `o.read(clock)`). A JS fn, or a method of a JS import,
  takes it whole, which is the exemption. And a closure reads when it is called (E-5a), which is also
  here: a call of a closure written at the call, or of the closure a
  name is bound to, reads what its body reads, so `f = () => clock.now()`
  then `createLabel(f())`, and `f = () => n` for a written source `n`,
  are snapshots, as `peek f()` kept is `SNAPSHOT_KEPT` (the earlier
  rule looked at the names an argument reads and took a closure's name
  for a constant).
  **A closure kept in a value (closed 2026-11-22).** The same holds
  wherever the closure is kept: a call whose callee is read out of a
  value — `box.read()`, `fs[0]()`, `mk()()` — may call any closure that
  value holds, by mention (every closure written in its expression and
  in the closures those return, and in the values its names are bound
  to), and reads what each of them reads: `box = { read: () => n }`,
  then `peek box.read()` kept is `SNAPSHOT_KEPT` and `createLabel(
  box.read())` is `SNAPSHOT_ARGUMENT` (the fourth review: a closure in a
  record lost what its body reads, and the value was frozen). Where what
  is written names the slot, the call is of that slot's closure alone:
  a field of a record literal, an index of an array literal, through
  the equations and locals that name it (neither is ever written), so
  `box = { read: () => n, unit: () => "items" }` leaves
  `createLabel(box.unit())` a constant. A method of a JS value — an
  import, the instance — is not a closure of `.rx`: what it answers is
  the rule above. And a slot of a literal written where it is read is
  that slot, for a value as for a closure: `createLabel([clock, 5][1])`
  reads `5`, not through the instance (`w = [clock, 5]; w[1]` is still a
  read through `w`: only what the expression itself says).
  **A closure given to a closure (2026-11-22, after the review).** A
  closure the checker can see is called with arguments, and may call
  what they hold: `pick = (o) => o.total()`, then
  `createStamp(pick(fmt))` with `fmt = { total: () => n }`, froze `n` —
  the call was read as `pick`'s body alone, in which `o` names nothing.
  So a call of a closure the checker can see also calls, for each of its
  parameters, what the body calls through it: the closure in that slot
  of the argument where what is written says which (`o.total()` and a
  record literal with a `total`; `g()` and the closure `g` is given),
  else any closure the argument holds, by mention; any closure the
  argument holds when the parameter is handed on (`inner(o)`), kept in a
  local, a record or an array, written, looped over, or called through
  a computed slot; and the closures held by what the body gives a
  closure it calls through a parameter (`apply = (g) => g(fmt)`). A
  parameter only read into a primitive (an operand, a template's part, a
  test), dropped, or answered as the closure's value calls nothing here:
  whoever calls what is answered is read where it is called, by mention.
  `SNAPSHOT_ARGUMENT`, `SNAPSHOT_KEPT` and E-5a's "changes" read it the
  same way (S-region-6). *Guarantee:* an argument, or a kept `peek`, that the
  checker takes for made once reads no field of a primitive's instance
  and calls no method of it, through any `.rx`
  expression. S-module-20.
  The word changes nothing at run time
  and nothing of the result's shape. The instance is the object passed
  whole, whether its declared result is a value or a record of parts.
  So is a field read through such an instance, or an equation bound to one
  (`w = size.width`), since a primitive's fields track (MO-10b), revised
  2026-11-21 after review: only the instance passed whole, or a method
  called on it, which reads no field, is exempt (S-module-20).
  So is a field read through a `for` row (`counter(r.x)`), revised
  2026-11-21 after review: the row is a constant (RG-2b), so its name was
  passed over, but its fields are written by path or reconciled by key
  while it lives (ST-4a). The row passed whole reads no field. The two
  snapshots that are meant say so and are no diagnostic: a source's seed
  (`source draft := r.x`, E-4) and `peek r.x` in the argument
  (S-surface-9).
  So is an equation that never changes (proposed 2026-11-19): one that
  awaits nothing, reads no context, and reads only pure JS imports,
  components, error classes and such equations — a validation schema built
  at module level, `schema = object({ email: pipe(string(), isEmail()) })`,
  passed to `createForm({ schema })`. An `.rx` `fn` may read a source, so a
  call of one is not constant; a schema that reads a source is still a
  snapshot (`examples/formisch`).

### W — Writes

- **W-1 (Write position).** `x := e` as a statement is legal only in
  imperative scope (SC-2) and only when `x` is a source (V-1); as a
  declaration (`source x := e`) it is the initializer (E-4). An equation, a `peek`, a function
  parameter, or an imperative local written with `:=` is a plain local, not a
  source.
- **W-1a (Nothing is changed in place) — 2026-11-22.** A write is the
  only change of a value `.rx` holds: it is what tells the readers. An
  Array's method that changes it in place — `push`, `pop`, `shift`,
  `unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin` — called on
  the value of a source, an equation, a prop, a provision, a row of one
  (a `for`'s, a loop's), the value a functional write is given (`rows :=
  rs => rs.reverse()`), or a local that names a path of one (`let first =
  rows[0]`) is `MUTATION_IN_PLACE` (bin S), in either scope, where the value
  is an array by what the program writes (revised 2026-11-24): a type
  (`rows: Row[]`), a list, a call that answers one (`filter`, `slice`). A
  record's own `push` (`router.push("/a")`) is a method of its own, and a
  value nothing says is an array is let be. `rows.push(x)`
  in a handler changes the array and no reader hears of it;
  `props.items.sort()` in an equation reorders the parent's source under
  it. This is Solid's own trap (a signal's array pushed to, a store
  written outside its setter, a memo's value sorted), made a refusal. The
  ways through are the language's: a write (`rows := rs => [...rs, x]`),
  and the methods that answer a copy (`toSorted`, `toReversed`,
  `toSpliced`, `slice`, a spread). What the code made itself is its own
  to change (`let xs = [...rows]; xs.push(x)`), a library's draft is
  changed by its methods (09 MO-10i), and a JS instance's methods are its
  declaration's.
- **W-2 (No writes in reactive scope).** Reactive scope has no statement
  position; a bare `x := e` there (without `source`) is a parse error, not a
  semantic one.
- **W-3 (Instant).** All writes performed by one imperative run — one handler
  invocation, one apply block, one resumed continuation — form one instant
  (V-6). An action's body, declared or inferred (06 AC-1b), is one change
  across its continuations (AC-1). There is no API to split or merge instants from inside a run:
  `onFlush` (EF-8) does not split one, it schedules another run. A
  run whose writes all equal their slots' values (E-6) changes nothing and
  opens no instant (ruled with DV-5, 2026-10-23: the earlier "an equal
  write still opens an instant" existed only for the frame-indexed `pre`).
- **W-4 (Visibility).** A write is not visible to any read, in any scope, until
  its instant commits. Within the run that wrote it, `x` still reads the
  committed value. (Restates Solid F-10 for the synchronous case.) So a
  read of a source the run's own change has written is a compile error
  (`STALE_OWN_READ`, 06 AC-1d): it could only mean the write.
- **W-5 (Writer scope).** A source is written only through its own name, by
  imperative code in its declaring region or a region nested in it. Props,
  parameters, contexts and imports are read-only; the owner passes an action
  to let other code write. (Full rule: 03-regions O-4, ruled 2026-10-31.)
- **W-6 (Functional writes).** [ruled 2026-10-22] `x := f`, with `f` a
  function, writes the result of applying `f` to the slot *as it stands at
  the instant* — after the writes before it in the same instant — rather
  than to σ. Writes to one slot from several imperative runs in one
  instant therefore compose in run order; value writes still replace. A
  path target applies `f` to the path's value. A function is applied
  whatever the slot holds: one that holds a function, as it may from its
  initializer on, is written another with `x := () => f`, and
  `x := f` is refused by its type (TY-2; S-function-source). Solid: the setter's updater
  form, `setX(f)`. (Found by S-region-7: two fields registering with their
  form in the same instant each read σ and the second value write erased
  the first.)

### IO — Effectful functions

- **IO-1 (One-way taint).** `io` is a row the compiler infers: a function
  is `io` iff its body writes a source, calls an `io` function, or calls a
  value whose type carries `io`. Taint only rises. `fn` is pure by
  definition (an `io` body in a `fn` is a compile error); `action` is `io`.
- **IO-2 (Call position).** An `io` value may be called only in imperative
  scope. Calling one in reactive scope is a compile error (the write rule,
  W-1, cannot be bypassed through a call). Carrying it is not calling it.
- **IO-3 (FFI).** Every JS import is `io`. `import pure { f }` is the one
  assertion that lowers taint; it is the trust boundary and is unchecked
  for JS. There is no `io` keyword. (Full rules: 04-rows R-io-1..4.)

(The other rows — `pending`, `lane` — and inference: 04-rows.)

### C — Causality

- **C-1 (No instantaneous cycle).** The input relation over equations, taken
  within one instant, must be acyclic. A program with a cycle `x → … → x` not
  broken by `pre` is rejected. *(2026-11-25)* So are provisions of one region
  (RG-7b) each using the next where it stands, the last the first (`provide c =
  use c`), read by a view with no name between: what is above is read above, and
  provided in a block below.
- **C-2 (pre).** [ruled 2026-10-23, DV-5: Solid's] `pre x` denotes the value
  `x` had **before its most recent change** — not in the previous frame.
  An unrelated write, equal or not, does not move it; it moves in the same
  instant as the change it precedes (S-core-1 instant 1: `2 prev 0`). Before
  `x`'s first change it is `undefined`. Two cases:
  - inside `x`'s own equation, `pre x` is `x`'s current value — the one this
    recompute replaces (Solid: the memo's `prev` argument). It contributes
    no dependency, which is how a cycle is broken (C-1).
  - of another node `y`, `pre y` is an **input of `y`**: it demands `y`
    (so `y` stays evaluated while something reads `pre y`, S-core-1
    variant instant 5: `prev 14`) and it is an instantaneous edge — `a =
    pre b; b = a + 1` is a cycle (C-1). Lowering: a companion memo carrying
    (current, previous).
  (The first draft, frame-indexed `pre`, moved on unrelated instants —
  S-core-1's old `prev 2` at an equal write — and could not be lowered
  without a frame clock.)
  *What is kept (2026-11-24).* The value is the one `x` had, and what an
  equation builds on its own last value (`[...(pre seen -> []), tags]`)
  holds the values it was made of: a write of `tags` replaces its root
  (ST-2a) and changes no list kept before it. Solid writes a store's root
  where it stands, so what is kept of a whole source or projection — an
  item, a field, an argument beside `pre self`, a companion's last value —
  is a copy of its root (`__rt.kept`, 11). What is below the root keeps its
  identity. One instant replaces `x` once, however often it is computed
  there. `pre` is of any equation or source, a `ref` parameter and an
  import included; of `props`, name the field.
- **C-2a (Initial value).** `pre x -> e` is `pre x` where that is defined and
  `e` otherwise. `pre x` has type `T | undefined`; `pre x -> e` with `e : T`
  has type `T`. This is the only way to discharge the `undefined`; there is no
  implicit default. (Solid's `(prev = v) => …` default parameter is this form
  attached to the operator instead of to the consumer's signature.)
- **C-3 (An apply does not feed its own compute).** [ruled 2026-10-23] An
  apply block whose own statements write a source that its compute half
  reads — directly or through the equations it reads — is a compile error
  (`EFFECT_WRITES_OWN_SOURCE`, bin S): it is a loop across instants that
  either never settles or settles after showing a wrong frame, and every
  converging form has a direct spelling — an equation (`clamped = …`), a
  source with a question (`source selected = …`, ST-5), or the write moved
  to the event that changed the inputs. Writes in closures the apply
  creates — a timer, a listener, its cleanup — are later events and stay
  legal (a clock, a poller); writes through a provision are not visible to
  the checker and are the runtime's. (S-check-2.)
- **C-3a (State is not derived through an apply) — 2026-11-22.** An apply
  block's own statement that writes a source declared in the effect's own
  block, with a value or a path computed from reactive values, is advice
  (`EFFECT_RELAY_TEAR`, 99; an error from 2026-11-22 to 2026-11-24, against
  99's ruling that it stays advisory). "Computed from reactive
  values" is read off the write, and only what is written counts: the
  expression reads `$n` (what the effect fired for), a source, an
  equation or a prop — an input read by its name too — directly, through
  operators, pure calls and an updater's body (`x := v => v + $0`), or
  through a local bound to such an expression. Two programs are under it,
  and they are one mistake:
  - the value reads what the effect does not take as an input (`effect ()
    { total := qty * price }`): the block runs when its inputs change —
    with none, once — so the source is computed from the others as they
    were then and never follows them. It is E-4's snapshot (`source total
    := qty * price` is `SNAPSHOT_INITIALIZER`) written as a statement;
  - the value reads only what the effect fired for (`effect (qty, price)
    { total := $0 * $1 }`, `effect (n) { history := [...history, $0] }`):
    an equation written the long way. The apply runs after the instant
    that changed its inputs has been observed (§4), so one frame shows the
    new input beside the old source (H-1 says the screen is one consistent
    frame; this one is not), every reader of the source runs twice, and
    the server, which runs no apply block (10 SV-2a), never computes it:
    the page is served with the seed.
  Every such value has a direct spelling, so nothing is lost by refusing
  it: an equation (`total = qty * price`); a source with a question where
  it is also written by hand (`source draft = props.initial`, ST-5: a
  layer that re-derives when its question changes); `pre` where it builds
  on its own last value (`history = [...(pre history -> []), n]`, C-2);
  the write moved to the event that changed the inputs.
  What stays an apply's to write is what is not derived: a constant (`if
  ($0 > 10) { warned := true }`: the condition is control, the value is
  not computed); the target's own value (`visits := visits + 1`); what an
  `io` call answers (`width := measure($0)`: the page as it is, a JS
  module's state — Solid's "the effect measures the DOM" case); a reading
  said to be taken once (`saved := peek(draft)`, `width :=
  peek($0.offsetWidth)`: E-5's word, in the one imperative position where
  a snapshot is not what was meant by default); every write of a closure
  the apply creates (a listener, a timer: later events, as in C-3); and
  a source of an outer block (a component's effect that registers with,
  or reports to, state its module or its parent declares: that source has
  other writers, and no equation written beside the effect could stand
  for it — an apply is how a value is sent somewhere else, async.md §6).
  A write C-3 already refuses is reported once, as C-3's. Writes through
  an action or a provision are not seen, as in C-3. Solid reports the
  same at run time, graph-proven, as a warning (`EFFECT_RELAY_TEAR`: "it
  is derived state kept one flush late … make it a memo").
  (S-check-2; `bench/tasks/effect-derived`, `projection-selection`.)

### EF — Effects

- **EF-1 (Split).** `effect (e₁…eₙ) B`: each `eᵢ` is an equation (E-2); `B` is
  imperative scope and receives the values of `e₁…eₙ` by position as `$0…$n`
  (07 §5). Reads of reactive names inside `B` are snapshots of the committed
  state (SC-2), so the parameters are how `B` sees the values it fired for.
  A changing value that `B`'s own statements read and the effect does not
  take as an input is read as it stood when `B` last ran, and `B` is not
  run again when it changes. That is the split's meaning (Solid: the
  apply half does not track), so it is no error — but it is also how a
  dependency is forgotten (`effect () { setTitle(total) }`), so the
  checker says it as advice, once per effect (`SNAPSHOT_IN_EFFECT`, 99
  the advisory rows): name the value as an input, or say the snapshot is
  meant, `peek(x)`. Where the value read is written into a source, it is
  C-3a's.
- **EF-2 (When).** `B` runs in an instant iff at least one `eᵢ`'s value
  differs from the value `B` last received for it, or it is the instant in
  which the effect was declared. A value that was pending and lands equal to
  the last received value is not a change (ruled 2026-10-23 with the oracle:
  Solid's effect compares values; E-8's "absent counts as changed" governs
  readers, not applies). It runs after every equation the instant reaches
  has settled (§4). An `eᵢ` that derives from a guess or a lane value
  (H-7, H-11) fires with the lane's reveal — now, not at the hold's commit —
  and again when the guess reverts (S-ai-feed instant 4; both runners).
  A store is part of the value that holds it (2026-11-24): an input
  `{ tags: tags, n: n }`, or an equation that makes one, changes when the
  list does, by a write of the whole or of an item (S-effect-store-3).
- **EF-2a (A failure doesn't fire).** [2026-11-19, from Ryan's rule that a failure
  is shown where it's read] An instant in which some `eᵢ` is an error (E-12) does
  not run `B`: the failure is shown by the region that reads it (R-f-5), and an
  apply has nothing to show it with. The next instant in which every `eᵢ` has a
  value runs `B`, even if the values equal the last ones it received. Lowered as
  Solid's `createEffect` with an `error` arm that only forgets the last value.
- **EF-3 (Once, completely).** `B` runs at most once per instant and is never
  interrupted by that instant's settling; its writes begin a new instant.
- **EF-4 (No inputs).** `effect () B` runs once, in the instant the effect is
  declared, after settle — the mount hook.
- **EF-5 (Cleanup).** `B` may return a function — `return () => { … }`, or a
  closure as its last expression; both are the cleanup — and it runs before
  the next run of `B` and when the effect's region ends.
- **EF-5a (What a call set up is undone) — 2026-11-22.** A JS function
  that subscribes — to a DOM event, a store, a timer — answers the
  function that unsubscribes, and its declaration says so: a result of
  `() => void` (`export fn onShortcut(key: string, run: handler () =>
  void): () => void`). A call of it whose result is dropped is advised of,
  `DISPOSER_DROPPED` (99; an error until 2026-11-24): the type alone does
  not say the function undoes anything (it may be a follow-up the caller
  need not take). The call written as a statement, or its
  result bound to a local that the rest of the block never names. What it
  set up would outlive the region (a listener after the component is
  gone; one more on every click, from a handler). The result is kept and
  called: by an effect's cleanup (`effect () { let stop = onShortcut(…);
  return () => { stop() } }`), or by the handler that ends it. The evidence is the declared type, as
  09 MO-10k's is; a function that answers anything else, or takes
  arguments, is not read as a disposer.

  *The type, and the paths (2026-11-22, after the review).* The
  declared type is read as TypeScript would resolve it, as far as the
  declaration file says: `() => void` written out; a name its own file
  gives it (`export type Unsubscribe = () => void`); TypeScript's
  `VoidFunction`; and a record that holds such a function under the name
  of an ending — `unsubscribe`, `dispose`, `destroy`, `disconnect`,
  `stop`, `cancel`, `close` (`{ unsubscribe: () => void }`, an
  observable's subscription). And "the rest of the block never names
  it" is a statement about every path: a local is kept when each path
  from its binding to the block's end, and to each `return`, names it —
  in a statement's own expression, a closure included (it calls it
  later). `let stop = listen(…); if (on) { return () => { stop() } }`
  drops it where `on` is false; `let later = stop` keeps it only as far
  as `later` is kept. A failure's path is not one the block chose, and a
  `finally` is on every path. `rx-declare` drafts the result's type as
  TypeScript resolves it, so a library's own alias is `() => void` in
  the draft (09 MO-8k).
- **EF-6 (Order is unspecified).** The order in which apply blocks run within
  one instant's observe phase is not specified. A program whose behavior
  depends on it is incorrect. (`ref/` uses declaration order; scenarios must
  not rely on it.) What *is* specified: every cleanup of a region ending in
  the instant runs before any apply block of that instant (O-2), so
  `log(leave, 1); log(enter, 2)` across a step change is a legal
  expectation (S-ai-wizard).
- **EF-7 (onSettled).** [taken by default 2026-10-27] `onSettled(() => B)`,
  called in imperative scope, schedules `B` to run once, as an imperative
  run of its own, in the observe phase of the instant in which the change
  the calling run belongs to commits: the change its writes open, or the
  change that adopts them (a handler that launches an action: AC-1). A
  run whose writes open no instant (an apply block that writes nothing)
  has its callbacks run at the end of the current instant. `B` reads the
  committed state (SC-2); its writes begin the next instant (EF-3). It is
  Solid's `onSettled` in its unowned form: "schedule work to run after the
  action / transition triggered by the event has completed" (S-settled-1).
  The owned form, in a component body, is `effect () { … }` (EF-4), so in
  reactive scope `onSettled` is `IO_IN_REACTIVE`. `B` has no region, so a
  cleanup return (EF-5's shapes) is `SETTLED_CLEANUP_UNOWNED`, a compile
  error (Solid: a dev-mode throw). The argument is a closure with no
  parameters (`HOOK_CALLBACK`). Like `until` (AC-6) it is a function of
  the language, not syntax: a binding named `onSettled` shadows it.
- **EF-8 (onFlush).** [taken by default 2026-10-27] `onFlush(() => B)`,
  called in imperative scope, schedules `B` to run once, as an imperative
  run of its own, right after the instant the calling run opens and the
  instants its apply blocks' writes go on to open (EF-3). It never waits
  on a hold: the callback runs even while that instant is held. Every `onFlush` callback registered in one step
  runs in call order as one instant. Its use is keeping a write out of
  another write's hold: `B`'s writes are a new change, which commits on its
  own unless it joins a hold the way any later change does (H-2, D-8; a
  write to a held slot, or a reader of both). So `onFlush(() => { open :=
  false }); page := 2` closes a menu now while the page loads (S-flush-1),
  where `open := false; page := 2` is one instant and waits for it (W-3).
  A write in `B` lands after the run's own writes; writing one slot in
  both is legal and composes in that order (W-6). In reactive scope it is
  `IO_IN_REACTIVE` (Solid: the `ON_FLUSH_IN_OWNED_SCOPE` warning); the
  argument is a closure with no parameters (`HOOK_CALLBACK`); a binding
  named `onFlush` shadows it. Solid: `onFlush` (solidjs/solid#4292); a
  no-op on the server, where no imperative run happens (10 SV-2a).

### V — Views

- **V-0 (The view is the tail).** The markup at the tail of a reactive block
  is that block's view. There is no keyword; a block with no markup has no
  readers of its own.
- **V-1 (Readers).** Each `{e}` and `attr={e}` in a view is one reader (V-4 in
  vocabulary) with equation `e`: `{a + b}` is a single reader with inputs
  `{a, b}`, not two. Holds and equality cuts are per reader.
- **V-2 (Conditional).** `if c { M₁ } else { M₂ }` in a view: `c` is an
  equation; the branch markup is a region (03-regions) that exists only while
  `c` selects it; switching ends one region and begins the other.
- **V-3 (Repetition).** `for x in e { … }`: `e` is an equation over a
  collection; each element gets its own region with `x` bound as an equation
  projecting that element. Keying and identity: 06-stores.

---

## 4. Dynamic semantics: an instant

State is a map `σ` from sources to committed values, plus for every equation
and `pre` its last evaluated value. The program starts with `σ₀` from
initializers (E-4), evaluated in declaration order, then settles and commits
instant 0, running effects per EF-2/EF-4.

An instant proceeds in three phases and no phase overlaps another:

1. **Write.** An imperative run executes. Each `x := v` is recorded; `σ` is
   unchanged (W-4). The run ends.
2. **Settle.** Let `Δ` be the set of written sources. The instant's **cone** is
   every equation and reader reachable from `Δ` through the input relation.
   Every demanded equation in the cone (E-3: demanded by a reader or an
   effect's compute half) is re-evaluated against `σ' = σ[Δ ↦ v]`, in a
   topological order of the input relation (C-1 guarantees one exists). An
   equation whose re-evaluation yields an equal value is cut (E-6): its
   dependents are not in the cone through it.
3. **Observe.** `σ := σ'`. The frame (V-17) is the value at every reader
   position. Then every effect whose compute half changed (EF-2) runs its apply
   block in declaration order; writes they make are recorded for the next
   instant, which begins when this phase ends.

### Properties (to be checked by `ref/` against scenarios, then proved)

- **P-1 Glitch-freedom.** No reader, apply block, or `peek` ever observes a
  state in which an equation disagrees with its inputs. (Follows from phases
  not overlapping and topological settle.)
- **P-2 Determinism.** Given `σ` and the multiset of writes of an instant, the
  resulting `σ'` and frame are unique, independent of evaluation order within
  the topological constraints.
- **P-3 Consistency with from-scratch.** The value of every equation after an
  instant equals what it would be if every equation were re-evaluated from
  `σ'` with no memoization. (Adapton's correctness criterion.)
- **P-4 Minimality.** Only equations in the cone are evaluated; equations whose
  value did not change cut propagation (E-6).
- **P-6 pre is evaluation-indexed.** For every node `x`, `pre x` read from
  outside `x` equals the value `x` held before its most recent change, and
  reading it demands `x`; inside `x`, it is the value being replaced.
  (Ruled 2026-10-23; the frame-indexed P-6 is withdrawn.)
- **P-5 Write isolation.** Within an imperative run, no read observes that run's
  own writes (W-4), and two runs never interleave within one instant (W-3).

---

## 5. What core excludes (and where it goes)

| Excluded                                | Document       | Why not here                                              |
| --------------------------------------- | -------------- | --------------------------------------------------------- |
| `await`, pending, `latest`, `pending?`  | 04-rows, 05-holds | Introduces the in-flight version of state (V-13)       |
| Regions other than "the program"        | 03-regions     | Needs `if`/`for` branches as scopes with lifetimes        |
| FFI, impure functions, `io` row         | 04-rows        | Needs function coloring                                   |
| Structured values, paths, draft, key    | 06-stores      | Needs identity and path-granular propagation              |
| Concrete syntax                         | 07-surface     | Decided after the semantics are closed                    |

---

## 6. Worked scenario (abstract syntax)

`scenarios/S-core-1.md` — the counter.

```rx
export default component App() {
  source count := 0
  source show := true
  double = op*(count, 2)
  label  = op+("prev ", pre double -> 0)
  effect (double) { log(double) }
  <p>{show ? double : "-"} {label}</p>
}
```

| instant | action                           | frame `<p>`  | effect    | notes                                           |
| ------- | -------------------------------- | ------------ | --------- | ----------------------------------------------- |
| 0       | mount                            | `0 prev 0`   | `log(0)`  | EF-4; C-2a discharges `undefined`               |
| 1       | handler `count := 1`             | `2 prev 0`   | `log(2)`  | one instant; `pre` is frame 0's `double`        |
| 2       | handler `count := 1`             | `2 prev 2`   | —         | E-6: equal value cuts; effect does not run      |
| 3       | handler `count := 5; count := 7` | `14 prev 2`  | `log(14)` | two writes, one instant (W-3)                   |
| 4       | handler `show := false`          | `- prev 14`  | —         | `double` still demanded by the effect's compute half; `pre` is frame 3 |
| 5       | handler `count := 8`             | `- prev 14`  | `log(16)` | `label` reads `pre double` = frame 4's 14       |

Variant without the effect (so `double` is undemanded while `show` is false):

| instant | action                  | frame `<p>`  | notes                                                          |
| ------- | ----------------------- | ------------ | -------------------------------------------------------------- |
| 4       | handler `show := false` | `- prev 14`  |                                                                |
| 5       | handler `count := 8`    | `- prev 0`   | P-6: `double` not in frame 4 → `pre double` undefined → `-> 0` |

Solid 2.0's lazy memo would give `prev 14` at instant 5 (last evaluation);
this spec gives `prev 0` (previous frame). Recorded as a known divergence to
confirm against the runtime in `ref/` phase 3.

Rejected programs for the same scenario:

| program fragment                  | rule | diagnostic bin (99) |
| --------------------------------- | ---- | ------------------- |
| `double := 4` in a handler        | W-1  | unwritable          |
| `count := 1` at top level         | W-2  | unwritable          |
| `a = op+(b, 1); b = op+(a, 1)`    | C-1  | static              |
| `effect (count) { count := count + 1 }` | C-3 | static (info)    |
