# 06 — Stores, questions, actions

**Status: OPEN (2026-10-21).** Structured values, sources with a standing
question, drafts, keys, streams, and the imperative forms that tie writes to
async work: `action`, `guess`, `refresh`, `affects`. Rules cite Solid's
F-9, F-11 and the derived rules they restate. In `ref/`: ST-1…ST-6,
AC-1…AC-5 (S-store-1…5, S-solid-8/9/15/20/26/32…35/37). Optimistic path writes: S-store-6. AC-6 `until`: S-action-2. AC-7 try/catch: S-action-1. A functional guess over a held input, and two actions guessing one slot (H-11): S-action-3, S-action-4. AC-1b…AC-1d (inferred actions, held writes, stale own reads): S-infer-1…5. AC-1e (stale write-back): S-infer-6. AC-1g (an answer takes only what is the server's): S-infer-7.

---

## ST — Structured values

- **ST-1 (Structured vs atomic is the type).** A source or equation whose
  value is an object or array is structured; there is no separate store
  primitive. Atomic lowers to `createSignal`/`createMemo`, structured to
  `createStore`/`createProjection`.
- **ST-2 (Dependencies are per object identity, per key).** A read of `o.k`
  depends on `(o, k)`; a read of a reactive name depends on its root. Reaching
  `o` through `x` tracks every step. A shared object reached through two
  names notifies readers through either (S-region-3 instant 6).
- **ST-2a (Writes).** `x := v` replaces the root; E-6 per-path equality
  applies (an equal-by-paths value is a no-op and keeps the old identity).
  `x.a.b := v` mutates in place and notifies `(x.a, b)`; readers of `x`
  alone are not notified. Several path writes in one imperative run are one
  change (W-3).
- **ST-2b (Equation results).** A structured equation result is compared per
  path with its previous value (E-6): equal → cut, keep old identity;
  otherwise the root changed. With a key (ST-4) the result is reconciled
  instead.
- **ST-2c (Pending is per key).** [Solid F-9, D-30, S-37] A held path write makes
  `pending? x.a` true and leaves `pending? x.b` false; a root write or a
  re-ask of a source with a question (ST-5) makes the whole family pending
  (S-solid-37 and its variant).

## ST-3 — Draft

An equation may write only its own draft, in its own body:

```rx
selected = draft(pre selected -> {}) { d[id] := true; d[prevId] := false }
```

- **ST-3a.** `draft(e) Block` evaluates `e` (normally `pre x -> seed`),
  binds a copy of it to `d` in the block, runs the block (the only place
  `:=` appears in reactive scope, and only on paths rooted at `d`), and the
  equation's value is `d`. Writes are the delta (O(changes)); the copy is
  made along written paths only, so untouched sub-objects keep identity
  (S-store-2). E-6 then compares the draft with the previous value per
  path: an unchanged key's readers and effects are quiet.
- **ST-3b.** The block is reactive scope for reads: every read is an input.
  It is not imperative scope: no `io` calls, no writes to anything but `d`
  (W-1 applies), no `await` except as an equation input.
- **ST-3c.** A draft never escapes its body: a closure that captures `d` and
  runs later is rejected (O-3). Late answers are `yield` (ST-6), not
  callbacks into a draft.

## ST-4 — Key

- **ST-4a.** `x: T[] key k = e` (abstract syntax `x key k = e`; also on a
  source, `source x key k = e`) declares
  that elements of `x` have identity `k`. A new result — an equation's
  next value, and a value written to a keyed source (`rows := [fresh
  records]`: lowered as Solid's `reconcile(v, k)` since 2026-11-22; it
  replaced the store's rows by position before, so a row kept its
  region only where it kept its index) — is **reconciled** by
  `k`: rows with the same key keep their object identity and receive
  per-key path updates (their readers run only for changed keys); new keys
  create, missing keys remove; a reorder moves rows (S-store-3). A kept
  row is kept whatever its body reads of it, and what an updater answers
  is reconciled as a written value is (S-store-kept-row, 2026-11-26: Solid's
  `reconcile` alone remakes a row nothing has read; the runtime keeps it). `pending?`
  and `latest` on an element follow the key.
  The key applies at any depth, as Solid's: on a record (`x key k = { a: …,
  b: … }`) every list inside it is reconciled by `k` (taken by default,
  2026-11-15).
- **ST-4b.** `for u in x` over a keyed collection uses the key for row
  identity (RG-2a). A collection derived from a keyed one by selection
  (`filter(rows, …)`) keeps the rows' identity and needs no key of its own;
  an unkeyed `for` over records that are rebuilt on every change (`map`
  into fresh objects) is a diagnostic (`UNSTABLE_LIST_IDENTITY`, bin S).
- **ST-4c.** Solid: `createProjection(fn, seed, { key })`, `<For keyed>`.
- **ST-4d (One row per key) — 2026-11-22.** Rows with one key are one row
  to Solid: the second takes the first's region and its state, or is
  dropped. Where a keyed list's rows are written out — the seed of a
  keyed source, a keyed equation whose expression is a list of records,
  and (widened 2026-11-22) the value a write or a guess gives a keyed
  list, whether it is the list itself (`rows := [{ id: 2, … }, { id: 2,
  … }]`) or what an expression-bodied updater answers (`rows := rs =>
  [{ id: 9, … }, { id: 9, … }, ...rs]`) —
  two with the same literal key are `DUPLICATE_KEY` (bin S). The rows
  compared are the ones in that one list literal: a written row against
  what a spread beside it holds (`[...rs, { id: 1 }]`) is the run's to
  know, like any key that is computed. Rows that
  come from data (an answer, a write computed at run time) are the
  data's to keep distinct: the key's value is not known before the
  program runs, so that half is bin R (08 CN-2: a static check does not
  become a run-time one), and Solid's own development build says nothing
  of it. Since 2026-11-24 the runtime does, in a development build
  (Solid's `DEV`, as `__rt.lend`'s refusal is, 09 MO-10i): the rows a
  keyed list is given — the seed, a write, what an updater answers or
  leaves in its draft, a keyed answer, a keyed projection — are read for
  two with one key, and the list is named on the console with the key
  (`DUPLICATE_KEY [ST-4d] rows is keyed by id, and two of the rows it was
  given have id: 1 …`), once for a list and a key. It is a report, not a
  refusal: the program goes on as its production build does, where a row
  from a backend is not the program's to make unique and Solid shows what
  it shows. A production build reads nothing. (Until then the benchmark's
  variant, rows added by a click with a key the list has, "ran silently":
  `bench/tasks/duplicate-keys`.)

## ST-5 — A source with a standing question

- **ST-5a.** `source x = e` (not `:=`) declares a source whose value is the
  equation `e` **until written**: it re-derives when `e`'s inputs change, and
  a write `x := v` overrides it until the next re-derivation. `e` may
  `await`. `e` may also be a constant (`source editing = null`,
  `source cart = []`): a question with no inputs, whose truth is that
  constant — the shape for provisional UI state that a guess (AC-3) can
  clear and that reverts to the truth when the hold ends (examples/users.rx,
  examples/cart.rx). Solid: `createSignal(fn)`, `createStore(fn, seed)`;
  written both plainly and optimistically, a `createSignal(fn)` truth under
  a `createOptimistic(() => truth())` layer. Only this form waits: the seed
  of `source x := e` is a snapshot taken once (E-4), with no question to
  wait on, and an `await` in it is `AWAIT_IN_EXPRESSION` (2026-11-26, bug
  42: it was accepted and never compiled) — write `source x = await …`.
- **ST-5b.** Its question (V-9) is `e`'s inputs. `refresh x` re-asks it
  quietly; `affects x` declares that in-flight work will change it (H-9).
- **ST-5c.** Any source, and an equation (V-2), are the legal targets of
  `guess` (AC-3): a guess needs a truth that will confirm or correct it. An
  equation's truth is its expression, a source's its question's answer and
  its plain writes (since 2026-11-20; before, a `:=` source was
  `GUESS_NO_QUESTION`). A guess is not a write of the truth,
  so an equation still takes no `:=` (W-1). A guessed equation lowers to
  Solid's `createOptimistic(fn)` / `createOptimisticStore(fn, seed)`, whose
  setter only guesses; a guessed source with a question to a
  `createSignal(fn)` truth under a `createOptimistic` layer, because it is
  also written plainly. Not a deferred equation (`GUESS_ON_DEFERRED`): its
  value lags the one a guess would be confirmed by (V-16). Not `props` or a
  parameter (O-4): guess over the child's own equation of a prop
  (`shown = props.title`), which shows the guess where the child reads it
  (S-guess-equation).

## ST-6 — Streams

- **ST-6a.** `yield v` in an equation body is another answer to the same
  question: a quiet update (F-9), each landing its own change —
  `pending?` is `false` after the first answer. A change to an input
  restarts the body (R-4) — later answers of the old body are inert — and
  runs its `finally`. `yield` has no meaning in imperative scope. In `ref/`
  a stream is a flight that lands more than once (S-store-5); the body form
  waits on 07's concrete syntax.
- **ST-6b.** `await* e` of an async iterable is its latest answer; the loop
  is implied (07: streams are `await*`). A plain `await` takes one answer —
  of an async iterable, its first; later landings are not its answers (the
  three runners in `ref/` follow this since 2026-10-24; S-store-5 reads its
  stream with `await*`). A keyed structured stream reconciles each answer
  (ST-4).
- **ST-6c.** Solid: an async-generator memo/projection; `live(fn)`.

---

## AC — Actions and guesses (imperative forms)

- **AC-1 (action).** `action name(params) { … }` declares an `io` function
  whose body is **one change** across its awaited work: every write between
  entry and return belongs to that change and is held until the body returns
  (F-2's explicit form) — that is, until every `await` in it has landed. The
  questions its writes cause (a fetch re-asked because a source changed) are
  not the action's: they hold the change only as any change's pending
  readers do (H-2…H-6), so an action with no `await`, `select(id) { selected
  := id }`, is an ordinary instant and a `loading on(selected)` shows its
  fallback at once (clarified 2026-10-24: all three agents of the second AI
  test asked). The
  handler that launches it is the same instant, so the handler's own plain
  writes — before or after the call — are the action's and are held with it
  (D-7's same-tick adoption); to land something now, make it a guess, a
  separate event, or an `onFlush` run (02 EF-8).
  `action { … }` inline in a handler is the same for one run, and so is an
  arrow whose body guesses, declares `affects`, or writes and awaits
  (AC-1b). There is no
  escape: a write after an `await` is still the action's (the language has
  the scope, so none of 2.0's generator plumbing — S-9's "fresh write
  escapes" is unwritable; S-solid-9 is the inverted port). A rejection
  inside the body ends it like a return: the writes it held commit, and
  only its optimistic state reverts — a write is intent, a guess is the one
  provisional state (ruled 2026-10-22 against the oracle, DV-2; S-solid-8
  and S-solid-32 variants). Compensation is the catch's job. An action body suspends only at a
  statement-level `await` (`await e` or `let v = await e`, either with a
  `catch (x: C) => alt` after it: a matching rejection is the statement's
  value, R-f-4); an `await` anywhere else in imperative scope is
  `AWAIT_IN_EXPRESSION` (bind it first; S-await-1). The instant
  begins when the run suspends or returns (H-10). An action called from a
  handler is launched, not awaited: the handler continues, and the
  handler's own writes are the same instant's change (D-7's same-tick
  adoption).
- **AC-1b (Inferred action).** [ruled 2026-10-28] An arrow function in
  imperative scope, including an element's event handler (02 SC-4), is an
  action when its own statements include `guess x := e` (AC-3),
  `affects x` (AC-5), or both a write to a source (W-1) and a
  statement-level `await` (07 decision 16). It is then `(ps) => action { B }`
  with every consequence of AC-1: one change across its awaited work, its
  writes held with it, its guesses living over that hold, and every failure
  it can produce caught (R-f-6). "Own statements" excludes the bodies of
  closures inside it, each inferred on its own, and an inline `action { … }`,
  which is its own run; it includes the statements of a local closure the
  body calls by name (`let f = () => { … }; f()`), whose writes are this
  run's. Calling an inferred arrow launches the action, as calling a
  declared one does. A body that awaits and writes nothing is a plain run.
  An `effect`'s apply block is never inferred: its return is the effect's
  cleanup (EF-5), which an action's body cannot give, and the next run's
  cleanup could not cancel an action in flight. A server function's body is
  never inferred. A guess in either stays `GUESS_OUTSIDE_HOLD`.
  Lowers to Solid's `action` exactly as `action { … }` does, nothing added
  (11). Solid: a TypeScript function's promises are invisible to the
  transition, so its author writes `action(function* () { … })`; here every
  suspension is a statement the compiler sees, so the keyword is needed only
  to hold a write on purpose (AC-1c) or to name an action (S-infer-1, 3, 4).
- **AC-1c (Held write).** [ruled 2026-10-28] In an inferred action (AC-1b),
  a plain write from which some path of the body reaches an `await` is a
  compile error (`HELD_WRITE`): it would be held until the work ends (AC-1),
  so a later write in the body hides it and otherwise it lands late, and
  nothing in the text says so. The fix names what the write is for:
  ephemeral state that shows while the work runs ("saving", a spinner, a
  pending row) is a guess, `guess x := v` (ST-5c; on any source, `source
  saving := false`); a reset that lands
  now and stays (clear an error, clear an input, close a menu) is
  `onFlush(() => { x := v })` (02 EF-8). A write meant to be held — a
  transition: `action go() { id := 2; await prefetch() }` (S-solid-20) — is
  written in a declared action, which this check does not cover: `action`
  is the author saying "hold it". Guesses and `affects` are not plain writes
  (S-infer-2). The check is the language's, not Solid's (Solid cannot see a
  body): it adds nothing at run time.
- **AC-1d (Stale own read).** [ruled 2026-10-28] In any imperative run — a
  handler, an apply block, an action body, declared or inferred — reading a
  source that the same change has already written, on some path before the
  read, is a compile error (`STALE_OWN_READ`). The read gets the committed
  value, not the write (02 W-4, 05 H-10, SC-2). Solid agrees: in 2.0.0-rc.19
  an `action()` that writes a signal, yields, and reads it again gets the
  old value until the action commits. "The same change" is the whole body
  for an action (AC-1) and the stretch up to the next `await` for a plain
  run, where the `await` ends the change (07 §5). Keys count: after
  `x.a := v`, reading `x.a` or `x` is stale and reading `x.b` is not. A
  guess is a write the run does not see either (H-10). A functional write
  (`x := v => …`, W-6) reads nothing now; a closure's body runs later,
  except a local closure the run calls, whose reads are the run's;
  `pending?` and `latest` are probes, not snapshots. Every other read is
  the committed snapshot it always was, with no error. The fix is the local
  the value came from (`let n = count + 1; count := n; … n`) or a functional
  write (S-infer-5). The local fixes this run only: when the change is held
  (an action, or a run that calls one), the next run still reads the old
  value until the change settles, which is AC-1h.
- **AC-1e (Stale write-back).** [taken by default 2026-10-28] In any
  imperative run, a plain value write `x := e` after an `await`, where `e`
  is computed from a read of `x` taken before that `await` — directly, or
  through locals bound from it — is a compile error (`STALE_WRITE_BACK`).
  The read is `x` as the run started; whatever changed `x` while the run
  waited (another action, a reload, a click) is erased by the write: a
  lost update. Keys count as in AC-1d: a read of `x.a` or `x` and a write
  of `x.a` or `x` overlap; a read of `x.b` and a write of `x.a` do not; an
  index computed from `x` (`let i = indexOf(x, …); … x[i].f := v`) is not
  the written value and does not count. The fix is the functional write
  (`x := v => …`, W-6), which applies to `x` as it stands at the write, or
  a guess (`guess`, AC-3) that the answer replaces. A guess or a write
  before the `await` is the change's own and is not checked; nor is an
  awaited answer (`let r = await …`), which is the server's, not a
  snapshot of `x`. The check is the language's (Solid cannot see the read,
  the suspension and the write in one body): it adds nothing at run time.
  Found by the AI eval's round 4 (eval/results/change-2026-10-28): 2 of
  its 3 .rx defects, and a latent one in a run that passed every test; on
  all 76 eval .rx apps and the repository's examples it fires on those 3
  runs only (S-infer-6).
- **AC-1f (Calls pass the parameters).** [taken by default 2026-11-14] A
  call of an action declared in the module passes one argument per
  parameter; any other count is `ARGUMENT_COUNT` (static). The parameters
  are the action's whole input: a missing one is `undefined` in the body
  and an extra one is dropped, silently either way. An action imported from
  an `.rx` module or passed as a prop is not checked (its signature carries
  no parameters yet, MO-3). Found by the eval board (r15prep,
  `check-accepts-arity-and-missing-props.rx`; S-check-1).
  *A parameter may be left out (2026-11-26):* `action add(item: Item, at?:
  number)` — the last ones, marked `?` as a fn's (02 E-9a); a call passes
  the required ones and any of the rest, and one left out is `undefined` in
  the body (`at ?? 0`). S-surface-14.
- **AC-1g (An answer takes only what is the server's).** [taken by default
  2026-11-17] In a declared action, a write after an `await` into a source
  with a question (the server's answer, ST-5a) takes only the `await`'s
  value, plain arguments, and its own value at the write (a functional
  write's argument, W-6). A value that names, directly or inside its
  closure, a source or equation, a local read from one (before the `await`
  or after it), or a parameter typed as a row (a type that is not
  `number`, `string`, `boolean`, a literal, `null`, or a local alias of
  those) is a compile error (`STALE_CAPTURE`). Such a value is what the
  screen showed, not what the server answered: by the time the server
  answers, the row may have changed (a rename accepted), be somewhere else
  (an earlier move declined), or carry a write another action holds with
  this one (a shared list, H-11), which a read does not see (H-10). The
  write puts the old row, count or place into the answer, so the screen
  shows a lost edit or a row twice. AC-1e's fix, the functional write, does
  not help when its closure names such a value. The fix is to find rows in
  the answer itself by id (`x := rs => …`), or, when the server's answer
  doesn't say where a row is now (a move answers only where it went), to
  re-ask the answers it left and joined (`refresh x`). Plain parameters
  (an id, a title, an index the handler worked out) are what the user
  asked for and are not checked; nor is an untyped parameter, a guess, a
  write before the first `await`, or a write to a source without a
  question (a failure record keeps what the user tried). A write that AC-1e
  reports is not reported again. Principle: a write must not read stale
  state. Found by the AI eval's round 15 (eval/results/round15-2026-11-16):
  the moves of 4 of 6 frontier board apps wrote the card they were given or
  the column it was in at the click, and in a probe on the first draft of
  this rule (pre-`await` reads only) 2 of 3 apps moved the read after the
  `await` and lost a rename held with the move. On round 15's 24 .rx apps,
  the 19 .rx references, the examples and 161 .rx apps of earlier rounds it
  fires on 9 of the 12 round 15 board apps, each time on the traced defect,
  and on 3 October apps that write `x := x.map(…)` after an `await`
  (S-infer-7).
- **AC-1h (A held write the next run computes from).** [taken by default
  2026-11-24] A plain value write `x := e`, where `e` is computed from a
  read of `x` in the same change (directly, or through locals bound from
  it), is a compile error (`STALE_NEXT_READ`) when the change is held past
  the run: in a declared action, a write that some path of the body
  carries to an `await`; in a plain run (a handler), a write in a stretch
  that calls, by name, an action whose body awaits, re-asks or declares
  `affects` (the run joins that action's change, AC-1) — and in a declared
  action that calls such an action too (2026-11-27: `action note() { let n
  = seq + 1; seq := n; save(n) }` with `save` waiting held `seq` through
  two calls and minted one id twice, unrefused). Until the change
  settles, every other run reads the committed `x` (W-4, H-10), so the
  next click computes the same value again: a counter mints one id twice,
  a toggle flips back, a page goes forward once for two clicks. The check
  is about the read, not about when the write lands, so it does not ask
  which the author meant (that is intent, 2026-11-08): both fixes keep
  the read off the stale value. When the write should wait with the action
  but the next run should build on it, read it with `latest x` (R-9: the
  value the held write moves `x` toward; `let n = latest seq + 1; seq := n;
  add(n)`, S-infer-9), or, when the run does not need the value, write
  functionally (`x := v => …`, W-6, Solid's setter function form). When it
  should show now (a reset), give it its own instant, `onFlush(() => { x :=
  n })` (02 EF-8, S-infer-8). `latest` does not see this run's own write
  (W-4, AC-1d). Keys count as in AC-1d. Not checked: an inferred action's writes (HELD_WRITE, AC-1c,
  already reports them), a functional write (`x := v => …`, W-6; it reads
  `x` as it stands at the write) unless the same change also reads `x`
  plainly (that read is the stale one: `let n = seq + 1; seq := v => v +
  1; add(n)` still mints one id twice), a guess, a write not computed from its
  own source (a draft cleared, a flag set), a write after a declared
  action's last `await` (it lands as the action ends), a call of an action
  passed as a prop or parameter (the checker can't see it is one), and a
  call of an action that never waits and launches none that does (it
  settles as it returns): an action outlasts its call when its own
  statements launch one that does — a call by name, a local closure that is
  an action of its own and waits, an inline `action { … }` that waits — and
  a plain run's inline `action { … }` that waits is joined as a call is
  (2026-11-27, found re-checking B10: both had been taken to settle as they
  return; S-infer-8, S-answer-1). Principle:
  a write must not read stale state. Found by the .rx rerun of 2026-11-23
  (eval/results/rerun-2026-11-23): 4 of 6 Haiku board apps minted
  temporary card ids from a counter beside the add action, in the shape
  AC-1d's fix showed (`let n = seq + 1; seq := n`), and in 3 of them two
  quick adds showed two cards with one id. On the 263 app folders of every
  round (October apps read with `optimistic` as `guess`), the references
  and the examples it fires on those 4 apps, the same counter in 2 round
  15 Haiku board apps and 1 rerun desk9 Haiku app (a comment key), and on
  2 counters that 2 Opus probe apps bump to restart a page or a retry,
  where a second click before the first settles does nothing. It fires on
  no reference, no example and no declared action (S-infer-8, S-infer-9).
- **AC-1i (An action that answers at the call; B10, 2026-11-26, merged
  2026-11-27).** `action show(t: string): number { … return id }` declares
  what it answers: the call answers that value, not a promise (a `.tsx`
  caller gets a number). Such an action never waits: an `await`,
  `refresh`, `affects` or a guess in its own statements — as AC-1b reads
  them: a branch, a `try`, a loop, and the local closures the body calls by
  name (a call runs the closure's statements in this run); not other
  closures — is `ACTION_ANSWER_HELD`, since its change would outlive the
  call and the answer would come before its writes settle. An inline
  `action { … }` is its own run (AC-1b) and is not refused: it is launched,
  as a call of a declared action is (the prototype refused it, which
  refused correct code: an inline action with no `await` is an ordinary
  instant, and one that waits is what a call of a waiting action is). Its
  body is checked as a handler's run (it is one, named): its writes land as
  a handler's do, in the caller's instant, and AC-1h's form for a run
  applies — a counter it writes before launching an action that waits is
  `STALE_NEXT_READ`. An action that answers outlasts its call exactly when
  it launches one that does (AC-1h), so a caller's counter beside it is
  checked the same way. It is still an action: called while a view or an
  equation computes it is `ACTION_CALLED_IN_OWNED_SCOPE`, and its body lets
  no failure out (R-f-6). The difference from Solid's `action()`: an action
  that never waits gives `action()` nothing to hold — AC-1 already calls
  such a body an ordinary instant, AC-1g has no answer to guard and AC-1h no
  held write of its own —, so the only thing lost is the promise, and with
  it a caller's way to wait for a change that has already settled when the
  call returns. Lowers to a plain function (`__rt.now`), not to `action`.
  S-answer-1.
- **AC-2 (Not special).** An action is only a way to tie writes to async
  work; the hold is the thing (H-2). `refresh`, `affects` and probes behave
  the same inside and outside one.
- **AC-3 (guess).** `guess x := e`, legal only inside an action
  body, declared or inferred (AC-1b); in an `effect`'s apply block, which
  is never an action, it is `GUESS_OUTSIDE_HOLD`, and on a source or an
  equation (ST-5c): writes a guess that is the
  graph's and the screen's value for `x` from the instant's settle,
  display-ahead and verdict-inert, until the hold it was made over commits
  or `x`'s own answer differs — the full rule is H-11. `x`'s truth is
  whatever its question gives: a constant (`source draft = "Ann"`), another
  source (`source draft = name`, S-solid-32), or an `await`; for a source
  declared with `:=`, its plain writes (S-guess-writable-1, -2), which land
  with the action's change, so the guess ends showing the action's own write. Lowers to
  `createOptimistic`/`createOptimisticStore` by usage. Path targets
  (`guess x.a := v`, `guess todos[i].done := true`) guess per key,
  as Solid's per-node override: the rest of `x` is the truth beneath the
  guess, a new answer corrects only where it differs at a guessed key, and
  equal there it confirms silently (S-store-6). A question re-asked by an
  action that guessed (`refresh x`) is authoritative work in flight: the
  change waits for that answer before the body-end correction (D-34) — for
  a guess on `x` itself, and for a guess on another source whose truth may
  follow `x` (S-app-todos: an add guessed in its own list stays until the
  re-asked server list brings the row; a declined toggle's revert and its
  recorded failure land with that list, in one frame). Solid does the same:
  the action's transition holds until the refresh it started lands.
  Lowers to `createOptimisticStore(fn, seed)`; a source that is guessed and
  also written plainly lowers to an optimistic layer derived from its
  writable truth: `createOptimistic(() => truth())` over `createSignal`, or
  `createOptimisticStore(() => truth, seed)` over `createStore(v)` or
  `createStore(fn, seed)` (S-guess-writable-3). Plain writes go to the truth
  and guesses to the layer. A guess is verdict-inert: an
  action that wants `pending? x` true while its guess stands declares
  `affects x` (AC-5; the idiom is in 07 §5).

  *A guess needs something to wait for (2026-11-22).* The hold a guess
  lives over is the action's: what it awaits, what it re-asks
  (`refresh`), what it says is in flight (`affects`), a write a question
  is asked again for. A handler that only guesses is an action by AC-1b
  — and one with no hold: it ends in the instant it starts, the guess is
  taken back there, and nothing shows. Solid has no word for it (a
  `setOptimistic` outside a transition is reverted at the next flush,
  silently). So an action — declared, inferred or inline — whose own
  statements guess and can start nothing a guess would live over is
  `GUESS_OUTSIDE_HOLD`, at its first guess: no statement-level `await`,
  no `refresh` or `affects`, no plain write, no inline action, and no
  call of anything but the language's hooks (`onFlush`, `onSettled`,
  `log`) — a call may launch what holds, so any other call leaves the
  run alone. It is the text's own statement, read as AC-1b reads it
  (through the local closures the body calls by name), and it refuses
  no run that could hold. S-check-1.

  *Advice: a guess written after the `await` (2026-11-22).* `await
  addTodo(id, title); guess todos := …` is a correct program whose guess
  is not ahead of anything: the row shows once the server has answered.
  That is advice (99, the advisory rows), `GUESS_AFTER_AWAIT`: an
  action's first guess written after a statement-level `await`, once,
  on the guess. A guess after an earlier one (`guess a …; await f();
  guess b …; await g()`) is the next step's, and is not advised.
- **AC-3a (A guess while its value loads a new question).** [taken by default
  2026-11-12; follows Solid's ruling on solidjs/solid#4795] While an equation
  or source `x` that awaits is loading a new question (its inputs changed), a
  guess on it composes on the previous answer, and the new answer replaces it
  (D-34; a guess the screen never showed is void, and one it showed stays only
  until its hold commits). Before a first answer the guess is judged by that
  answer the same way (S-56). Either way the user's change is not on screen
  while its action is out. A handler (a plain arrow or an inferred action, or
  a named action it calls) that guesses `x`, where `x`'s question reads a name
  the handler or that action reads (what the click is about: a selection, a
  row), must be **covered** as in R-8: the element sits inside a `loading`
  region whose content reads `x`, or its `disabled` reads `x` (for a
  `<form>`'s `onSubmit`, every submit button's `disabled` does, since a form
  with its submit buttons disabled does not submit). Otherwise it is
  `GUESS_WHILE_LOADING` (static). The repairs are Solid's: the control inside
  `x`'s `loading`, or `disabled={pending? x}`, or the pending change kept in a
  source of its own until it lands. Solid's dev build warns the same case at
  the guess (`OPTIMISTIC_WRITE_WHILE_LOADING`); the check finds it before the
  race runs. Principle: a write must not read stale state (the guess's
  function reads the previous question's answer). Found by the AI eval: over
  round 12's .rx apps it flags 8 handlers in 5 apps, and driving each in a
  browser (select, then rename or post while the selection loads) loses the
  rename or the issue's existing comment in every one, and in no unflagged app
  (eval/results/desk12-2026-11-11/repro/probe-guess-while-loading.*). It also
  fired on the eval's own references (the rename and post buttons sat beside
  the detail's `loading` region) and on `examples/ai/feed.rx` (send while a
  new room loads); those now disable the control while it loads.
- **AC-4 (refresh).** `refresh x`, in imperative scope anywhere, re-asks
  `x`'s question (ST-5) or re-runs an `await` equation for the same inputs:
  quiet — `pending? x` stays `false`, `x` keeps showing its last answer
  while the re-ask is up, and the fresh value reveals silently
  (S-solid-26 instants 4–5, S-solid-37). On a question source it drops a
  write's override (S-store-4). Issued inside an open change, the landing is
  staged into that change and reveals at its commit, still quiet (Solid
  D-31; S-solid-26 instant 7). Any other target is `INVALID_REFRESH_TARGET`.
  An awaited `refresh x` resolves when the re-ask lands (not in `ref/`).
- **AC-5 (affects).** `affects x`, in imperative scope anywhere, declares
  that work now in flight will change `x`: `pending? x` is `true` until
  the change it was declared in commits (S-solid-26 instants 6–8). In an
  arrow it makes the arrow an action (AC-1b), since only an action's change
  lasts across the work (S-infer-4); in an apply block it lasts one instant.
- **AC-7 (try/catch).** [ruled 2026-10-23] Actions are imperative code,
  so they fail the way imperative code does: `try { … } catch (e) { … }
  finally { … }` and `throw e` are statements of imperative scope. A
  rejected `await` throws at the `await`; a `catch` inside the body runs
  **inside the action** — the same change, still open — so its writes land
  with the body's end in one frame (S-action-1: the reverted guess and
  `status := "failed: …"` commit together). `finally` runs on the way out
  either way. An uncaught throw or rejection is the action's rejection
  (AC-1, DV-2) — and since R-f-6 (ruled 2026-10-23) a compile error for any
  failure the body can produce: an action catches what it can fail with,
  and only a panic reaches DV-2. `catch (e: A | B)` takes those classes and
  rethrows the rest; a snapshot of a failing value throws at the read
  (R-f-7). In a plain handler the same statements work with no hold
  involved and no check. Solid: a generator action's `try` around `yield` —
  the rejection is thrown back at the yield point.
- **AC-6 (until).** [executable 2026-10-25] `await until(() => p)` in
  imperative scope waits until the predicate `p` settles truthy and gives
  that value. It is a function of the language, not syntax — Solid's
  `until` — and is called from imperative scope (in reactive scope,
  `IO_IN_REACTIVE`); its argument is a predicate, `() => e`
  (`UNTIL_PREDICATE`), whose body is reactive scope: it reads, tracked, and
  does not write. `p` reads the **authoritative view**: guesses (AC-3), and
  whatever is derived from them, are invisible, so a guess never satisfies
  the wait for its own confirmation; staged truth reads normally. Pending
  is "not yet". When `p` fails, `until` rejects with that failure, so
  `await until(…)` fails with what its predicate can fail with (R-f-6 —
  a predicate that cannot fail needs no `try`). The write or landing that
  flips `p` joins the awaiting action's change and reveals with it (Solid
  D-31): the action resumes in that instant (S-action-2). Not yet: Solid's
  `{ timeout, signal }` options.

---

## Diagnostics this document makes unwritable or static

| code                            | bin | rule                                             |
| ------------------------------- | --- | ------------------------------------------------ |
| `ASYNC_STORE_SETTER`            | U   | ST-3b: a draft block has no `await` statement    |
| `IMMUTABLE_UPDATE_IN_STORE`     | U   | ST-3: a structured equation is a delta over `pre`|
| `UNSTABLE_LIST_IDENTITY`        | S   | ST-4b                                            |
| `ACTION_CALLED_IN_OWNED_SCOPE`  | U   | AC-1: an action is `io` (IO-2)                   |
| `INVALID_REFRESH_TARGET`        | S   | AC-4: not a source with a question / await eq    |
| `INVALID_AFFECTS_TARGET`        | S   | AC-5                                             |
| `GUESS_OUTSIDE_HOLD` (new) | S   | AC-3: an apply block (never an action, AC-1b)    |
| `HELD_WRITE` (new)              | S   | AC-1c: an early write in an inferred action      |
| `STALE_OWN_READ` (new)          | S   | AC-1d: a read of the change's own write          |
| `STALE_WRITE_BACK` (new)        | S   | AC-1e: a pre-`await` read written back after it  |
| `STALE_CAPTURE` (new)           | S   | AC-1g: after an `await`, an answer written with anything but the server's |
| `GUESS_ON_DEFERRED` (new)  | S   | AC-3 / ST-5c: a deferred equation lags its truth |
| `GUESS_WHILE_LOADING` (new) | S | AC-3a: a guess a click can make while its value loads a new question (D-34) |

## Scenarios

- `S-store-1`: path writes notify per key; a root write compares per path (ST-2). ✓
- `S-store-2`: draft delta keeps identity (ST-3). ✓
- `S-store-3`: keyed reconcile; rows keep identity across a new result (ST-4). ✓
- `S-store-4`: `source x = e` derived until written; refresh is quiet (ST-5, AC-4). ✓
- `S-store-5`: stream of answers, restart on input change (ST-6). ✓
- Solid ports: S-8 (+ rejection variant), S-9 (inverted: no escape), S-15,
  S-20 (+ the race the fallback won), S-26 rows 4–7 (+ verdict-inert guess),
  S-32 (+ two rejected variants), S-33, S-34, S-35 (+ derived flight), S-37
  (+ per-key variant). ✓
