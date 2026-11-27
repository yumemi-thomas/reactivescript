# .rx diagnostics: every code and its fix

`rxc check` and the editor report a diagnostic as `file:line:column: error CODE [rule] message`. The message already
says what to do. This page says why, with a program that gets the code and the same program fixed, one section per
code. Codes keep Solid 2.0's names where Solid has the same check at run time (`REACTIVE_WRITE_IN_OWNED_SCOPE`,
`ASYNC_STORE_SETTER`, …), so a compile error here and a dev-mode warning from Solid mean the same thing.

The `[rule]` is the id of the rule in `spec/` (`grep -n "^- \*\*AC-1c" spec/*.md`). `reference.md` has every rule in
one line; you rarely need more than this page and that one.

Fences marked `rx before` get the section's code and fences marked `rx after` check clean: the compiler's tests run
every one of them (`compiler/tests/diagnostics_page.rs`). A fence may declare the modules it imports first, each after a line `-- module: ./ui.d.rx`, then `-- main` and the program. Fences with no mark are sketches the page cannot check (a type error is `rx-tsc`'s, and its tests check those).

## Parse errors: habits from JavaScript, React and Solid

A parse error names the habit it looks like, when it recognises one; otherwise its code is `PARSE`.

### PARSE

The text has no `.rx` reading at that point. The message says what the parser expected and quotes what it found.
`reference.md`'s grammar is the whole syntax. In a `.d.rx`, a word the vocabulary no longer has is refused by name, with what is written instead (09 MO-8r):
`renders` after a fn, `renders(later)`, `renders` before a prop's type, `nests(component under parent)` and `outlet`
(a tree of components is given to a factory declared `nests(children in component)`, MO-11i), and `pending` or
`fails(…)` before a part of a result that is not `ref` (MO-10l). An `.rx` module is
imported for what it exports, never as `import "./x.rx"`, which is for a stylesheet or a polyfill (07 §1a).

### JS_LOCAL

`const`, `let` and `var` declare locals in a handler or an action body only. A component and a module's top level hold
declarations: a value that changes is a `source`, one computed from others is an equation (E-1).

```rx before
export default component App() {
  const n = 1
  let d = n * 2
  <p>{d}</p>
}
```

```rx after
export default component App() {
  source n := 1
  d = n * 2
  <p>{d}</p>
}
```

### JS_FUNCTION

There is no `function`. A pure function is `fn`, code that writes or awaits is an `action`, code that renders is a
`component`.

```rx before
function twice(x) { return x * 2 }
export default component App() {
  <p>{twice(1)}</p>
}
```

```rx after
fn twice(x) => x * 2
export default component App() {
  <p>{twice(1)}</p>
}
```

### JS_RETURN

A component's body is its declarations, then its markup. There is no `return`.

```rx before
export default component App() {
  source n := 1
  return <p>{n}</p>
}
```

```rx after
export default component App() {
  source n := 1
  <p>{n}</p>
}
```

### JS_API

`createSignal`, `useState`, `createMemo`, `useEffect` and the rest are spelled as declarations: `source x := v` is
state, `x = e` is a memo, `effect (x) { … }` is an effect. A name the module imports is not the habit: `[todos, setTodos] = createStore<Todos>(…)` with
`createStore` imported from a declared JS module is that library's call (its setter may hand a draft, 09 MO-10i).

```rx before
export default component App() {
  [n, setN] = createSignal(0)
  <button onClick={() => { setN(n + 1) }}>{n}</button>
}
```

```rx after
export default component App() {
  source n := 0
  <button onClick={() => { n := n + 1 }}>{n}</button>
}
```

### ASSIGNMENT

A source is written with `:=` as a statement, in a handler or an action (W-1). There is no `=`, `+=` or `++` on state.
To write from the value as it stands at the write, give a function: `n := v => v + 1` (W-6).

```rx before
export default component App() {
  source n := 0
  <button onClick={() => { n += 1 }}>{n}</button>
}
```

```rx after
export default component App() {
  source n := 0
  <button onClick={() => { n := v => v + 1 }}>{n}</button>
}
```

### REACTIVE_WRITE_IN_OWNED_SCOPE

A write happens in imperative scope only: a handler, an action, an effect's apply block (W-2). A closure created in a
component or an equation is a pure function (SC-3), so an arrow that writes needs a braced body in a handler position,
and a reusable writer is an `action`. Solid throws the same code at run time.

```rx before
export default component App() {
  source n := 0
  <button onClick={() => n := n + 1}>{n}</button>
}
```

```rx after
export default component App() {
  source n := 0
  <button onClick={() => { n := n + 1 }}>{n}</button>
}
```

```rx before
export default component App() {
  source n := 1
  reset = () => { n := 0 }
  <button onClick={reset}>{n}</button>
}
```

```rx after
export default component App() {
  source n := 1
  action reset() { n := 0 }
  <button onClick={() => { reset() }}>{n}</button>
}
```

## Writes

### WRITE_TO_NON_SOURCE

Only sources are written (W-1). An equation is always equal to its right side, and props, parameters and contexts are
read-only (O-4): the block that declares a source writes it, and others get an action that does.

```rx before
export default component App() {
  source n := 1
  double = n * 2
  <button onClick={() => { double := 4 }}>{double}</button>
}
```

```rx after
export default component App() {
  source n := 1
  double = n * 2
  <button onClick={() => { n := 2 }}>{double}</button>
}
```

A source imported from another module is written through an action that module exports (MO-2):

```rx after
-- module: ./store.rx
export source selected := 0
export action select(id: number) { selected := id }
-- main
import { selected, select } from "./store.rx"
export default component App() {
  <button onClick={() => { select(5) }}>{selected}</button>
}
```

A library may hand a callback a draft to change in place (Solid 2's store setter). The `.d.rx` marks that parameter
`draft`, and in a closure passed there its paths are written with `:=`; any other parameter's fields are not (MO-10i),
so a `.rx` value is never changed behind its writes. The draft itself is replaced by returning the new value.

```rx before
-- module: ./store.d.rx
export pure fn makeStore(init: { done: number }): [{ done: number }, (update: (state: { done: number }) => void) => void]
-- main
import { makeStore } from "./store.js"
export default component App() {
  [todos, setTodos] = makeStore({ done: 0 })
  <button onClick={() => { setTodos((d) => { d.done := d.done + 1 }) }}>{todos.done}</button>
}
```

```rx after
-- module: ./store.d.rx
export pure fn makeStore(init: { done: number }): [{ done: number }, (update: (draft state: { done: number }) => void) => void]
-- main
import { makeStore } from "./store.js"
export default component App() {
  [todos, setTodos] = makeStore({ done: 0 })
  <button onClick={() => { setTodos((d) => { d.done := d.done + 1 }) }}>{todos.done}</button>
}
```


### MUTATION_IN_PLACE

A list that is the value of a source, an equation or a prop is changed by a write, never in place (W-1a). `rows.push(x)`, `rows.sort()`
and the like change the array itself: nothing is told that it changed, so the view does not follow, and every other
reader of that array — an equation over it, the parent that passed it as a prop — now holds a changed value it did not
ask for. Solid has the same trap (a signal's array pushed to, a memo's array sorted). Write the new value; for a sorted
or reversed view of a list, `toSorted`, `toReversed` and `toSpliced` give a copy. The check reads what
says the value is a list: a type (`items: string[]`), a list written out, a call that answers one. An object's own `push`
(`router.push("/a")`) is its method. A list the code made itself (`let xs = [...rows]`) is its own to change.

```rx before
export default component App() {
  source rows := [1]
  <button onClick={() => { rows.push(2) }}>{len(rows)}</button>
}
```

```rx after
export default component App() {
  source rows := [1]
  <button onClick={() => { rows := rs => [...rs, 2] }}>{len(rows)}</button>
}
```

```rx before
component Sorted(props: { items: number[] }) {
  sorted = props.items.sort()
  <p>{sorted}</p>
}
export default component App() {
  source rows := [3, 1, 2]
  <Sorted items={rows} />
}
```

```rx after
component Sorted(props: { items: number[] }) {
  sorted = props.items.toSorted()
  <p>{sorted}</p>
}
export default component App() {
  source rows := [3, 1, 2]
  <Sorted items={rows} />
}
```


### DUPLICATE_KEY

A keyed list (`rows key id = …`, ST-4) gives each row its identity by its key: a row's own state, and its place in the
DOM, follow the key across a reorder or a new answer. Two rows with one key are one row to Solid: the second takes the
first's state, or is dropped. Rows written out in the program with the same key are refused (ST-4d); rows that come
from data — an answer, a key a click computes — are the data's to keep distinct, and the checker cannot read them. In
a development build the runtime does: when a keyed list is given two rows with one key it names the list and the key
on the console (`DUPLICATE_KEY [ST-4d] rows is keyed by id, and two of the rows it was given have id: 1 …`), once for
a list and a key, and the program goes on as its production build does. Solid's own development build says nothing
there. Give each row its own key where the rows are made.

```rx before
export default component App() {
  rows key id = [{ id: 1, text: "a" }, { id: 1, text: "b" }]
  <ul>{for row in rows { <li>{row.text}</li> }}</ul>
}
```

```rx after
export default component App() {
  rows key id = [{ id: 1, text: "a" }, { id: 2, text: "b" }]
  <ul>{for row in rows { <li>{row.text}</li> }}</ul>
}
```

### STALE_OWN_READ

All the writes of one run land together when the run ends, so after `count := count + 1` the run still reads the old
`count` (W-3, W-4). Keep the value you wrote in a local and read that.

```rx before
export default component App() {
  source count := 0
  source seen := 0
  <button onClick={() => { count := count + 1; seen := count }}>{count} {seen}</button>
}
```

```rx after
export default component App() {
  source count := 0
  source seen := 0
  <button onClick={() => { let next = count + 1; count := next; seen := next }}>{count} {seen}</button>
}
```

### STALE_WRITE_BACK

A write after an `await` that is computed from a read before it overwrites whatever changed the source in between
(another action, a reload). Write functionally, so the write applies to the value as it stands (W-6), or guess it with
`guess` and let the answer replace the guess (AC-3).

```rx before
import { post } from "./api.js"
export default component App() {
  source log := ""
  action add(x: string) {
    let before = log
    let r = await post(x) catch (e) => ""
    log := before + x
  }
  <button onClick={() => { add("a") }}>log: {log}</button>
}
```

```rx after
import { post } from "./api.js"
export default component App() {
  source log := ""
  action add(x: string) {
    let r = await post(x) catch (e) => ""
    log := v => v + x
  }
  <button onClick={() => { add("a") }}>log: {log}</button>
}
```


### STALE_NEXT_READ

A handler that calls an action joins that action's change, and an action holds its writes until it settles, so a
write computed from its own source (`seq := seq + 1`, or through a local) is held with it. Until then the next click
reads the old value and computes the same one again: a counter that mints ids gives one id twice. Read it with
`latest`, which sees a write still waiting, so the screen waits with the action and the next click builds on it (or
write functionally, `seq := v => v + 1`, when the run doesn't need the value). If the write should show now, give it
its own instant with `onFlush` instead.

```rx before
import { post } from "./api.js"
export default component App() {
  source seq := 0
  source cards := ""
  action add(id: number) {
    let r = await post("add") catch (e) => ""
    cards := v => v + "/" + str(id)
  }
  <button onClick={() => { let n = seq + 1; seq := n; add(n) }}>{cards}</button>
}
```

```rx after
import { post } from "./api.js"
export default component App() {
  source seq := 0
  source cards := ""
  action add(id: number) {
    let r = await post("add") catch (e) => ""
    cards := v => v + "/" + str(id)
  }
  <button onClick={() => { let n = latest seq + 1; seq := n; add(n) }}>{cards}</button>
}
```


### ACTION_ANSWER_HELD

An action that declares what it answers (`action show(t: string): number`) answers it at the call: the caller gets the
value, not a promise. Such an action never waits, so an `await` (or `refresh`, `affects`, a guess) in its own statements
— a branch, a loop, a `try`, and a local closure it calls by name — would make its change outlive the call, and the
answer would come before its writes settle. An inline `action { … }` is its own run and is not refused: it is launched,
as a call of a declared action is. Leave the result out, so a caller gets a
promise that settles with the change, or keep the part that answers at once and let the caller launch the waiting part.

```rx before
import { post } from "./api.js"
export default component App() {
  source seq := 0
  source sent := ""
  action add(t: string): number {
    let r = await post(t) catch (e) => ""
    sent := r
    seq := v => v + 1
    return 1
  }
  <button onClick={() => { add("a") }}>{seq}:{sent}</button>
}
```

```rx after
import { post } from "./api.js"
export default component App() {
  source seq := 0
  source sent := ""
  action mint(): number {
    let n = seq + 1
    seq := n
    return n
  }
  action send(t: string) {
    let r = await post(t) catch (e) => ""
    sent := r
  }
  <button onClick={() => { let id = mint(); send("a" + str(id)) }}>{seq}:{sent}</button>
}
```


### STALE_CAPTURE

After an `await`, a write into a source with a question (the server's answer) takes only what the server answered,
plain arguments (an id, a title, an index) and the answer's own value at the write (`x := rs => …`, finding rows there
by id). A row the action was given, or read from a source before the `await` or after it, is what the screen showed:
by then it may have changed (a rename accepted), be somewhere else (an earlier move declined) or carry a write another
action still holds, so the screen loses the edit or shows the row twice. When the answer doesn't say where a row is now
(a move answers only where it went), re-ask the answers it left and joined with `refresh`.

```rx before
import pure { fetchDone } from "./api.js"
import { postMove } from "./api.js"
type Card = { id: number; title: string }
export default component App() {
  source done = await fetchDone() -> "" catch (e) => ""
  action finish(card: Card) {
    let r = await postMove() catch (e) => ""
    done := v => v + card.title
  }
  <button onClick={() => { finish({ id: 1, title: "a" }) }}>{done}</button>
}
```

```rx after
import pure { fetchDone } from "./api.js"
import { postMove } from "./api.js"
export default component App() {
  source done = await fetchDone() -> "" catch (e) => ""
  action finish(id: number) {
    await postMove() catch (e) => ""
    refresh done
  }
  <button onClick={() => { finish(1) }}>{done}</button>
}
```

### SNAPSHOT_INITIALIZER

A source's `:=` seed is read once. Reading another reactive value there takes a snapshot, which must say so with
`peek(…)` (E-4). If the value should follow its input, it is an equation, or a source with a question (`source x = e`,
ST-5).

```rx before
export default component App() {
  source form := { email: "a@x" }
  source email := form.email
  <p>{email}</p>
}
```

```rx after
export default component App() {
  source form := { email: "a@x" }
  source email := peek(form.email)
  <p>{email}</p>
}
```

### SNAPSHOT_ARGUMENT

A `fn` that declares state (an effect, a source) reads its value parameters once. Declare the parameter `ref` to pass
the reactive value itself, or pass `peek(…)` to say a snapshot is meant (E-10). A field of a `for` row (`counter(r.x)`)
counts: the row never changes, its fields do. Pass the row, or `peek r.x`; a seed, `source draft := r.x`, is a snapshot
by rule and needs neither.

```rx before
export default component App() {
  fn watch(v) {
    effect (v) { log(v) }
    v
  }
  source n := 1
  w = watch(n)
  <p>{w}</p>
}
```

```rx after
export default component App() {
  fn watch(ref v) {
    effect (v) { log(v) }
    v
  }
  source n := 1
  w = watch(n)
  <p>{w}</p>
}
```

An equation that never changes is no snapshot: one that awaits nothing and reads only pure JS imports, components,
error classes and such equations (a validation schema built at module level, passed to `createForm({ schema })`).

### SNAPSHOT_KEPT

`peek e` reads `e` once. Where the expression around it is kept and read again (an equation, a provision, what a view
shows, a component's argument) and nothing else in it changes, the `peek` freezes it: if `e` is written, refreshed or
loads, every reader keeps the first value (E-5a). Drop `peek` to read it live, or, when a frozen copy is what you want,
name it: `source saved := peek e`. A `peek` next to something that does change (`n * 2 + peek n`) is a sample, read again
each time the expression recomputes, and is accepted.

A name that never changes can still be read through to something that does: a field of a `for` row whose list is
written (`peek r.x`: the row survives a write to its field, or a keyed reconcile) and a field of the instance a JS
primitive made (`peek size.width`). Both are refused the same way; the row or the instance itself (`peek r`) is
constant, and fine.

```rx before
export default component App() {
  source n := 1
  shown = peek n
  <p>{shown}</p>
  <button onClick={() => { n := n + 1 }}>+</button>
}
```

```rx after
export default component App() {
  source n := 1
  <p>{n}</p>
  <button onClick={() => { n := n + 1 }}>+</button>
}
```

A module is checked alone by default, so a `peek` of a prop (`peek props.value`) or of a provision (`peek use theme`)
counts as changing: that module cannot see who applies the component or who provides. `rxc check --whole-program` (and
`ref/check.ts --whole-program`) checks the loaded modules as the whole program and accepts such a `peek` when no
application or provision passes anything that changes. It assumes JS applies only the entry's exported components, the
components passed to it as values, and the exported components of a module a JS file imports with `?rx-lib` (name it
with `--host m.rx`; the Vite plugin's `rx({ wholeProgram: true })` finds them itself, in the project's JS and TS modules
and `.vue`, `.svelte`, `.astro` and `.mdx` files, resolving each import with Vite's
own resolver where `@solidjs/vite-plugin` hands it one (`context.resolve`), else through tsconfig.json's `paths` and the
aliases you give it as `rx({ wholeProgram: true, alias })`, the same object as Vite's `resolve.alias`; an import it
cannot resolve is reported as a warning). Anything else a TSX file applies is outside what
it sees.

### DUPLICATE_DECLARATION

A name is declared once in a block (E-7). Rename one.

```rx before
export default component App() {
  source x := 1
  x = 2
  <p>{x}</p>
}
```

```rx after
export default component App() {
  source x := 1
  y = 2
  <p>{x} {y}</p>
}
```

### CYCLE

Equations that read each other in one instant have no value (C-1). Break the loop with `pre`, the value before the
last change (C-2), or make one side a source written by an event.

A provision can be one side of the loop. `use theme` beside `provide theme` is that provision — it is the block's,
wherever it is written — so `up = use theme` followed by `provide theme = { ...up, fg: props.fg }` reads itself. What
is above a provision is read in the provision: `provide theme = { ...(use theme), fg: props.fg }` (RG-7b).

```rx before
export default component App() {
  source s := 0
  a = b + 1
  b = a + 1
  <p>{a}</p>
}
```

```rx after
export default component App() {
  source s := 0
  a = s + 1
  b = a + 1
  <p>{b}</p>
}
```

### PRE_OF_NON_REACTIVE

`pre x` is `x`'s value before its last change, so `x` has to be reactive: a source or an equation (C-2).

```rx before
export default component App() {
  fn f(x) => x
  y = pre f
  <p>{y}</p>
}
```

```rx after
export default component App() {
  source n := 1
  y = pre n -> 0
  <p>{y}</p>
}
```

### EFFECT_WRITES_OWN_SOURCE

An effect that writes what it reads runs again from its own write: a loop across instants (C-3). Derive the value as an
equation, as a source with a question (ST-5), or write it from the event that changes the inputs.

```rx before
export default component App() {
  source n := 0
  effect (n) { n := n + 1 }
  <p>{n}</p>
}
```

```rx after
export default component App() {
  source n := 0
  shown = n + 1
  <p>{shown}</p>
}
```

### EFFECT_RELAY_TEAR

State computed from other state is an equation, not a source an effect keeps in step (C-3a). An effect's block that
writes a source declared beside it, with a value computed from reactive values, is advised of (the program is accepted and the build goes on). Where the block reads what
the effect does not name, the source is computed once and never again; where it reads what the effect fired for, the
source is one frame late (the screen shows the new input beside the old total), and the server, which runs no effect,
never computes it.

```rx advice
export default component App() {
  source qty := 1
  source price := 5
  source total := 0
  effect () { total := qty * price }
  <p>{qty} × {price} = {total}</p>
}
```

```rx advice
export default component App() {
  source qty := 1
  source history: number[] := []
  effect (qty) { history := [...history, $0] }
  <p>{history.join(", ")}</p>
}
```

Write the equation. A value that is also written by hand is a source with a question (`source draft = props.initial`,
ST-5); one that builds on its last value reads `pre`; a history of what the user did is written by the click.

```rx after
export default component App() {
  source qty := 1
  source price := 5
  total = qty * price
  history: number[] = [...(pre history -> []), qty]
  <p>{qty} × {price} = {total} ({history.join(", ")})</p>
}
```

An effect still writes what is not derived: a constant (`if ($0 > 10) { warned := true }`), the source's own value
(`visits := visits + 1`), what a JS call answers (`width := measure($0)`), a reading you say is taken once
(`saved := peek(draft)`), anything from a listener or a timer it sets up, and state an outer block declares (a
component that registers with its parent's list).

### SNAPSHOT_IN_EFFECT

Advice, not an error: the program is accepted and the build goes on (`rxc check` prints it as `advice`). An effect's
block reads a value that changes and that the effect does not take as an input. The block runs when its inputs change
(with no inputs: once), so it sees that value as it was then and is not run again when it changes.

```rx advice
import { setTitle } from "./page.js"
export default component Cart() {
  source qty := 1
  total = qty * 5
  effect () { setTitle(`cart: ${total}`) }   // advice: `total` is not an input — the title is set once
  <button onClick={() => { qty := qty + 1 }}>{total}</button>
}
```

Name it as an input and read what the block is given, or say the snapshot is meant:

```rx after
import { setTitle, report } from "./page.js"
export default component Cart() {
  source qty := 1
  source saves := 0
  total = qty * 5
  effect (total) { setTitle(`cart: ${$0}`) }
  effect (saves) { report(peek(qty)) }       // what `qty` held when `saves` changed
  <button onClick={() => { qty := qty + 1; saves := saves + 1 }}>{total}</button>
}
```

### GUESS_AFTER_AWAIT

Advice, not an error: the program is accepted and the build goes on. An action's first guess is written after an
`await`, so it is ahead of nothing: what it shows appears once that `await` has answered.

```rx advice
import pure { fetchTodos } from "./api.js"
import { addTodo } from "./api.js"
export default component Todos() {
  source todos = await fetchTodos()
  source failed := ""
  action add(id: string, title: string) {
    try {
      await addTodo(id, title)
      guess todos := ts => [...ts, { id: id, title: title }]     // advice: after `await addTodo(…)`
      refresh todos
    } catch (e) { failed := e.message }
  }
  <button onClick={() => { add("1", "milk") }}>add</button>
  {failed}
  {errored fallback(e) { <p>failed</p> } {
    {loading fallback { <p>…</p> } { <p>{len(todos)}</p> }}
  }}
}
```

Write the guess before the `await` it is a guess about:

```rx after
import pure { fetchTodos } from "./api.js"
import { addTodo } from "./api.js"
export default component Todos() {
  source todos = await fetchTodos()
  source failed := ""
  action add(id: string, title: string) {
    guess todos := ts => [...ts, { id: id, title: title }]
    try {
      await addTodo(id, title)
      refresh todos
    } catch (e) { failed := e.message }
  }
  <button onClick={() => { add("1", "milk") }}>add</button>
  {failed}
  {errored fallback(e) { <p>failed</p> } {
    {loading fallback { <p>…</p> } { <p>{len(todos)}</p> }}
  }}
}
```

### PROBE_BESIDE_HELD_READ

Advice, not an error: the program is accepted and does what Solid does. A computation — an equation, a `{…}`, an
attribute, an `if` condition, a `for` list, a `loading on(…)` — reads ahead (`latest`, `pending?`, or an equation
that does) and also reads plainly a value that an open change can hold: a source an action writes, a value that waits
on a question, or one computed from either. Solid makes a computation that reads ahead anywhere read ahead as a
whole (R-11): the plain read shows what is on screen, and the computation does not wait for that value's change. The
same goes for a computation that reads such an equation, and for the pass right after one that probed — so what it
shows can depend on whether it probed last time, not only on what it reads now.

```rx advice
import { send } from "./api.js"
export default component Save() {
  source n := 0
  source k := 0
  action save() { try { n := 5; k := 1; await send() } catch {} }
  <p>{str(pending? n) + "," + str(k)}</p>    // advice: `true,0` while the action runs — k does not wait
}
```

If that is what you want, nothing needs to change. If `k` should wait for its change while the probe shows ahead,
read the two in computations kept apart up to the screen. An equation of its own for the probe is not enough: what
reads it reads ahead too.

```rx after
import { send } from "./api.js"
export default component Save() {
  source n := 0
  source k := 0
  action save() { try { n := 5; k := 1; await send() } catch {} }
  <p>{pending? n ? "saving" : "saved"}</p> <p>{k}</p>
}
```

For a `loading on(…)`: `on([latest id, filter])` re-arms at once on `id`'s change, `filter` held or not; write
`on(filter)` (or `on(id)`) for a re-arm that lands with the change. A plain read of the very name the computation
probes, where the probe is always evaluated (`[pending? x, x]`), is the screen's either way and is not advised; nor is
a read that only happens once the probe said `false` and can be held only through what it probed (`pending? users ?
"loading…" : total` with `total = len(users)`).

## Actions, guesses and holds

### HELD_WRITE

A handler that writes and awaits is an action (AC-1b), and an action's writes land when its body ends (AC-1). So a
write before the `await` does not show while the work runs. Say which you meant: `guess x := …` for state that
shows while the work runs (on a source with a question, ST-5c); `onFlush(() => { x := … })` for a reset that lands now
(EF-8); a declared `action` to hold it on purpose; or write it after the `await`. `async.md` ("What lands together, and
what waits") is the long form.

```rx before
import { post } from "./api.js"
export default component App() {
  source status := ""
  <button onClick={() => {
    status := "saving"
    let r = await post() catch (e) => e.message
    status := r
  }}>status: {status}</button>
}
```

```rx after
import { post } from "./api.js"
export default component App() {
  source status := ""
  <button onClick={() => {
    onFlush(() => { status := "saving" })
    let r = await post() catch (e) => e.message
    status := r
  }}>status: {status}</button>
}
```

### AWAIT_IN_EXPRESSION

In imperative code a run suspends only at a statement (AC-1). Bind the answer first, `let v = await e`, then use `v`.

In reactive scope the same code is an `await` in a fn that declares nothing, or in a closure: what they compute is part of
the expression that calls them (E-9, 07 §3). Answer the promise and await the call (`fn load(id) => getUser(id)`, `user = await load(id)`), or name the
answer in the fn's block (`r = await getUser(id)` then `r`).

```rx before
import { checkout } from "./api.js"
export default component App() {
  source status := ""
  action place() {
    try { status := `got ${await checkout()}` } catch {}
  }
  <button onClick={() => { place() }}>{status}</button>
}
```

```rx after
import { checkout } from "./api.js"
export default component App() {
  source status := ""
  action place() {
    try {
      let r = await checkout()
      status := `got ${r}`
    } catch {}
  }
  <button onClick={() => { place() }}>{status}</button>
}
```

In a plain source's seed, `source x := await …`: a seed is a snapshot taken once (E-4), with no question to wait on.
The source that waits is the one with a question, `source x = await …` (ST-5a): it is asked again when what it reads
changes, and a write overrides it.

```rx before
import pure { load } from "./api.js"
export default component App() {
  source x := await load(1) -> 0
  {errored fallback(e) { <i>e</i> } { <p>{x}</p> }}
}
```

```rx after
import pure { load } from "./api.js"
export default component App() {
  source x = await load(1) -> 0
  {errored fallback(e) { <i>e</i> } { <p>{x}</p> }}
}
```


### ASYNC_WATERFALL

Advice, not an error: the program is correct and the build goes on (`rxc check` prints it as `advice`). In one action
or handler, a question awaited after another that reads nothing the first answered waits for the first for nothing:
the two could have been out at once.

```rx advice
import pure { fetchUser, fetchNews } from "./api.js"
export default component App() {
  source shown := ""
  action load(id: number) {
    try {
      let user = await fetchUser(id)
      let news = await fetchNews()        // advice: reads nothing `await fetchUser(…)` answered
      shown := `${user.name}: ${len(news)}`
    } catch (e) { shown := "failed" }
  }
  <button onClick={() => { load(1) }}>{shown}</button>
}
```

Ask both, then await them together (a JS helper over `Promise.all`), or make each an equation, which Solid asks side
by side:

```rx after
import pure { fetchUser, fetchNews } from "./api.js"
export default component App() {
  source id := 1
  user = await fetchUser(id)
  news = await fetchNews()
  <button onClick={() => { id := id + 1 }}>next</button>
  {errored fallback(e) { <p>failed</p> } {
    {loading fallback { <p>…</p> } { <p>{user.name}: {len(news)}</p> }}
  }}
}
```

A second question that needs the first's answer (`await fetchTeam(user.team)`) is no waterfall, and an io call awaited
for nothing (`await save(a); await notify(b)`) is left alone, with whatever follows it: their order may be the point.
A loader declared io (as `rx-declare` drafts it) is advised too when its answer is bound (`let news = await
loadNews()`), and the advice then says what it cannot know: that one call may need what the other did. Declare the
loaders `pure` once you have checked that they only ask. Each question is advised once, on its own line.

### GUESS_OUTSIDE_HOLD

A guess lives in an action's hold until the server answers it (AC-3). An effect's apply block is never an action, so
declare one and call it from the block.

The same code is reported for a guess in a run that starts nothing to wait for: a handler that only guesses
(`onClick={() => { guess todos := ts => [...ts, row] }}`) is an action with no hold, so the guess is taken back in the
instant it is made and nothing shows. A guess goes before the `await` it is a guess about (`guess todos := …; await
addTodo(row)`); if the value is the source's new value, write it (`todos := …`). A run that awaits, re-asks
(`refresh`), declares `affects`, writes, or calls anything of its own is left alone.

```rx before
export default component App() {
  source draft := "a"
  source saved = "a"
  effect (draft) { guess saved := $0 }
  <p>{saved}</p>
}
```

```rx after
import { post } from "./api.js"
export default component App() {
  source draft := "a"
  source saved = "a"
  action save(v: string) {
    guess saved := v
    await post(v) catch (e) => null
  }
  effect (draft) { save($0) }
  <p>{saved}</p>
}
```

### GUESS_ON_DEFERRED

A `deferred` equation is a lagging copy of another value (V-16), so nothing would confirm a guess on it. Guess the
value it lags.

```rx before
import { post } from "./api.js"
export default component App() {
  source name := "Ann"
  shown = name
  deferred later = shown
  action fix() { guess later := "Zed"; await post() catch (e) => null }
  <button onClick={() => { fix() }}>{later}</button>
}
```

```rx after
import { post } from "./api.js"
export default component App() {
  source name := "Ann"
  shown = name
  deferred later = shown
  action fix() { guess shown := "Zed"; await post() catch (e) => null }
  <button onClick={() => { fix() }}>{later}</button>
}
```

### INVALID_REFRESH_TARGET

`refresh x` re-asks `x`'s question (AC-4), so `x` is an equation that awaits or a source declared with `=`. A source
seeded with `:=` has nothing to re-ask: write it instead.

```rx before
export default component App() {
  source base := 1
  <button onClick={() => { refresh base }}>{base}</button>
}
```

```rx after
import pure { fetchBase } from "./api.js"
export default component App() {
  source id := 1
  base = await fetchBase(id) catch (e) => 0
  <button onClick={() => { refresh base }}>{base}</button>
}
```

### INVALID_AFFECTS_TARGET

`affects x` makes `pending? x` true until the action commits (AC-5), so `x` is a source or an equation of this
program, not a parameter or a plain value.

```rx before
export default component App() {
  action go(n) { affects n }
  <p>x</p>
}
```

```rx after
import { post } from "./api.js"
export default component App() {
  source total := 0
  action go(n: number) {
    affects total
    let r = await post(n) catch (e) => 0
    total := r
  }
  <button onClick={() => { go(1) }}>{pending? total ? "…" : total}</button>
}
```

### HOOK_CALLBACK

`onFlush` and `onSettled` take a closure with no parameters, `onFlush(() => { … })`: its body is the run they schedule
(EF-7, EF-8).

```rx before
export default component App() {
  source open := true
  <button onClick={() => { onFlush(open) }}>x</button>
}
```

```rx after
export default component App() {
  source open := true
  <button onClick={() => { onFlush(() => { open := false }) }}>x</button>
}
```

### SETTLED_CLEANUP_UNOWNED

A callback passed to `onSettled` runs once and has no region to bind a cleanup to (EF-7). Setup with teardown is an
`effect` whose apply block returns the cleanup (EF-4, EF-5).

```rx before
export default component App() {
  source n := 0
  <button onClick={() => { onSettled(() => { return () => { log(n) } }) }}>x</button>
}
```

```rx after
export default component App() {
  source n := 0
  effect (n) { return () => { log($0) } }
  <button onClick={() => { n := n + 1 }}>x</button>
}
```


### DISPOSER_DROPPED

A JS function that subscribes — to a DOM event, a store, a timer — usually answers the function that unsubscribes. Its
declaration says so with a result of `() => void` (EF-5a), and a call whose result is dropped is advised of (the program is accepted and the build goes on): the statement
`listen(…)`, or `let stop = listen(…)` with `stop` never used. What the call set up would outlive the component, and a
handler that calls it would add another on every click. Keep the function and call it when the region ends: an effect's
cleanup (`return () => { stop() }`), or the handler that ends what the call started.

The type is read through a name the declaration file gives it (`export type Unsubscribe = () => void`) and TypeScript's
`VoidFunction`, and a subscription object counts too: a record with such a function named `unsubscribe`, `dispose`,
`destroy`, `disconnect`, `stop`, `cancel` or `close`. The local must be used on every path: `if (on) { return () => {
stop() } }` drops it when `on` is false (return the cleanup on both paths), and `let later = stop` keeps it only if
`later` is used.

```rx advice
-- module: ./keys.d.rx
export fn onShortcut(key: string, run: handler () => void): () => void
-- main
import { onShortcut } from "./keys.js"
export default component App() {
  source hits := 0
  effect () { onShortcut("k", () => { hits := h => h + 1 }) }
  <p>{hits}</p>
}
```

```rx after
-- module: ./keys.d.rx
export fn onShortcut(key: string, run: handler () => void): () => void
-- main
import { onShortcut } from "./keys.js"
export default component App() {
  source hits := 0
  effect () {
    let stop = onShortcut("k", () => { hits := h => h + 1 })
    return () => { stop() }
  }
  <p>{hits}</p>
}
```

### UNTIL_PREDICATE

`until` waits for a condition to become true, so it takes a predicate, `until(() => e)` (AC-6). A plain value is read
once and never changes.

```rx before
export default component App() {
  source ok := false
  action wait() { await until(ok) }
  <button onClick={() => { wait() }}>{ok}</button>
}
```

```rx after
export default component App() {
  source ok := false
  action wait() { await until(() => ok) }
  <button onClick={() => { wait() }}>{ok}</button>
}
```

## Reactive scope and io

### IO_IN_REACTIVE

An io function (an import without `pure`, `until`, an action) runs in imperative scope only: a handler, an action, an
effect's apply block (R-io-3, AC-6). An equation re-runs whenever its inputs change, so it may only ask pure questions.

```rx before
export default component App() {
  source ok := false
  done = until(() => ok)
  <p>{ok}</p>
}
```

```rx after
export default component App() {
  source ok := false
  action wait() { await until(() => ok) }
  <button onClick={() => { wait() }}>{ok}</button>
}
```

A method is the same. One whose declaration gives it a row is what the row says (`export fn toast.success(…)` is io,
`export pure fn toast.history()` is not; spec/09 MO-8t). One with no row is read as far as the declarations go: a
method of a declared value whose type answers nothing, or a promise, is io (`export const client: { invalidate(key:
string): void }`), and so is any method of an import that is io itself — one with no declaration, or a declared `fn`.
So `{toast.success("saved")}` in a view is this code, where it shows a toast each time the view computes; call it from
a handler, `onClick={() => { toast.success("saved") }}`. If a method only reads, its row says so: `export pure fn
toast.history(): string[]`.

### ACTION_CALLED_IN_OWNED_SCOPE

An action is called from a handler or another action, never from an equation or the markup (R-io-3). Solid throws the
same code at run time. An action a context provides is one too: with `context cart: { add: (id: string) => void }` and
`provide cart = { add: add }`, `{c.add(id)}` in a view and `onClick={c.add(id)}` are this code (a function a prop is
given, declared to answer nothing, is `IO_IN_REACTIVE`: the type does not say it is an action).

An action, or a closure of statements, kept in a list or a record is followed wherever the value goes: `fs[0]()`,
`(a > 2 ? fs[0] : fs[1])()`, `fs.at(0)()`, `[...fs][0]()` are this code too, and so is a call of what a fn answers of
what it was given (`pick(fs)()`): the message then says the value *may be* io, because no form says where it went.
Giving such a value on is free — `onClick={pick(fs)}`, `{for h in fs { <button onClick={h}>…</button> }}`.

```rx before
export default component App() {
  source n := 1
  action bump() { n := n + 1 }
  x = bump()
  <p>{x}</p>
}
```

```rx after
export default component App() {
  source n := 1
  action bump() { n := n + 1 }
  <button onClick={() => { bump() }}>{n}</button>
}
```

### ARGUMENT_COUNT

A call of an action passes one argument per parameter (AC-1f). A missing argument is `undefined` in the body and an
extra one is dropped, both silently, so the count is checked where the action is declared in the module.

```rx before
export default component App() {
  source n := 0
  action go(by: number) { n := n + by }
  <button onClick={() => { go(1, 2) }}>{n}</button>
}
```

```rx after
export default component App() {
  source n := 0
  action go(by: number) { n := n + by }
  <button onClick={() => { go(1) }}>{n}</button>
}
```

### IO_IN_FN

A `fn` is pure by definition (R-io-2). Code that calls io is an `action`, or the io call moves into the handler.

```rx before
export default component App() {
  fn noisy(v) => log(v)
  source n := 1
  <p>{noisy(n)}</p>
}
```

```rx after
export default component App() {
  action noisy(v: number) { log(v) }
  source n := 1
  <button onClick={() => { noisy(n) }}>{n}</button>
}
```

### ASYNC_STORE_SETTER

A draft block is a synchronous transaction on its draft `d` (ST-3b): it holds `let`, expressions and writes to `d`,
nothing that awaits, refreshes or calls io. Do that work in an action and write the result. Solid throws the same code
when a store setter returns a promise.

```rx before
export default component App() {
  source id := 1
  sel = draft(pre sel -> {}) { refresh id }
  <p>{sel}</p>
}
```

```rx after
export default component App() {
  source id := 1
  sel = draft(pre sel -> {}) { d[str(id)] := true }
  <p>{sel}</p>
}
```

### DRAFT_ESCAPES

A library's draft (MO-10i) is its callback's only while the library's call of it runs: the library may take it back when
the callback returns, as Solid's store setter does. So a draft is a place, not a value. A read of it is a copy
(`let n = d.done`, `saved := d`), and its name stands only in its own callback: a closure made inside may run later (a
timer, an event, a `then`), when writing or reading the draft would touch nothing. Use the draft in the callback itself;
read what a later closure needs into a local first; loop with the statement, `for (const x of xs) { … }`, not with a
closure handed to `forEach`. The same code is reported for the other ways a draft could be kept: an `await` in the
callback (the library's call ends there), a callback made elsewhere (`setTodos(update)`: write the closure in the call,
so its parameter is known to be the draft), and the setter itself passed, stored or given another name (share the change
as an action that calls it). A closure given a name and used for nothing but the setter's argument is fine
(`bump = (d) => { … }`, `setTodos(bump)`): any other use of that name is this error. And what is called on a draft is a
method of plain data (an array's, a Map's, a Set's, a string's); a function one of them calls (`forEach`, `map`,
`sort`) is written in the call.

```rx before
-- module: ./store.d.rx
export pure fn makeStore(init: { done: number }): [{ done: number }, (update: (draft state: { done: number }) => void) => void]
export fn later(f: handler () => void): void
-- main
import { makeStore, later } from "./store.js"
export default component App() {
  [todos, setTodos] = makeStore({ done: 0 })
  <button onClick={() => { setTodos((d) => { later(() => { d.done := 1 }) }) }}>{todos.done}</button>
}
```

```rx after
-- module: ./store.d.rx
export pure fn makeStore(init: { done: number }): [{ done: number }, (update: (draft state: { done: number }) => void) => void]
export fn later(f: handler () => void): void
-- main
import { makeStore, later } from "./store.js"
export default component App() {
  [todos, setTodos] = makeStore({ done: 0 })
  <button onClick={() => { later(() => { setTodos((d) => { d.done := 1 }) }) }}>{todos.done}</button>
}
```

### DRAFT_WRITE_OUTSIDE_DRAFT

A draft block writes only its draft, `d` (ST-3a). Other sources are written by the event that changes them.

```rx before
export default component App() {
  source id := 1
  source other := {}
  selected = draft(pre selected -> {}) { other[str(id)] := true }
  <p>{selected}</p>
}
```

```rx after
export default component App() {
  source id := 1
  selected = draft(pre selected -> {}) { d[str(id)] := true }
  <p>{selected}</p>
}
```

## Failures and loading

### UNHANDLED_FAILURE

A value that can fail is read where nothing handles the failure (R-f-5). Wrap the reader in an `errored` region where
it is read. To make a rejection an answer instead, catch it at the `await`: `await f(x) catch (err) => alt`.

Reported on `host.d.rx`, at its view: a component a JS host renders (a file-based router's page) reads it, and
nothing above it in the view the declaration states handles the failure. The message names the read
(`person.name at pages.rx:23`). Put the region in the page's layout, around `{props.children}` (or around the
router's `<Outlet />`, where the layout renders its pages with it), in your app's component around the router's, or
in the page; if the page is in a layout that has one, the declaration places it wrong (spec/09 MO-14, MO-14f,
guide/libraries.md, *File-based routers*).

```rx before
import pure { fetchUser } from "./api.js"
export default component App() {
  source id := 1
  user = await fetchUser(id)
  <p>{user}</p>
}
```

```rx after
import pure { fetchUser } from "./api.js"
export default component App() {
  source id := 1
  user = await fetchUser(id)
  {errored fallback(e) { <p>failed: {e.message}</p> } { <p>{user}</p> }}
}
```

### CATCH_NOT_ON_AWAIT

A `catch` follows something other than an `await` (R-f-4). A value that failed is shown where it is read, by an
`errored` region around its readers; a `catch` belongs on the `await`, where it makes the rejection the answer. A rule
the user breaks is a value (`""` or a message), not a failure.

```rx before
import pure { fetchUser } from "./api.js"
export default component App() {
  source id := 1
  user = await fetchUser(id)
  <p>{user catch (e) => "unknown"}</p>
}
```

```rx after
import pure { fetchUser } from "./api.js"
export default component App() {
  source id := 1
  user = await fetchUser(id)
  {errored fallback(e) { <p>unknown</p> } { <p>{user}</p> }}
}
```

### UNCAUGHT_ACTION_FAILURE

An action catches its own failures (R-f-6): a handler cannot, since it does not await the action. Put a
`try { … } catch (e) { … }` in the body, or `catch (e) => alt` on the `await`.

```rx before
import { post } from "./api.js"
export default component App() {
  source saved := ""
  action save() {
    let r = await post()
    saved := r
  }
  <button onClick={() => { save() }}>{saved}</button>
}
```

```rx after
import { post } from "./api.js"
export default component App() {
  source saved := ""
  action save() {
    let r = await post() catch (e) => "failed"
    saved := r
  }
  <button onClick={() => { save() }}>{saved}</button>
}
```

### NOT_AN_ERROR_CLASS

A `catch` or `errored` that names a class narrows to error classes declared with `error` (R-f-1). Declare the class,
or drop the name to take any failure.

```rx before
import pure { fetchUser } from "./api.js"
export default component App() {
  source id := 1
  user = await fetchUser(id)
  {errored fallback(e: Missing) { <p>{e.message}</p> } { <p>{user}</p> }}
}
```

```rx after
import pure { fetchUser } from "./api.js"
export default component App() {
  source id := 1
  user = await fetchUser(id)
  {errored fallback(e) { <p>{e.message}</p> } { <p>{user}</p> }}
}
```

### ROW_NARROWER_THAN_INFERRED

A declared row (`lane`, `fails(…)`) says less than the value does (CN-4a, RG-7e). Widen the declaration, or drop it and
let the compiler infer it.

```rx before
import pure { fetchUser } from "./api.js"
export default component App() {
  source id := 1
  user: lane string = await fetchUser(id)
  <p>{user}</p>
}
```

```rx after
import pure { fetchUser } from "./api.js"
export default component App() {
  source id := 1
  user: lane pending fails(Error) string = await fetchUser(id)
  {errored fallback(e) { <p>failed</p> } { <p>{user}</p> }}
}
```

### UNGUARDED_SNAPSHOT

A handler reads a value as a snapshot when it can have no value yet (a first load) or can fail, so the click sees no
value or throws (R-8). Put the element inside the `loading` / `errored` regions whose content reads the value, with
`disabled={pending? x}` while a new question is out; or read it in the handler inside `try { … } catch (e) { … }`. The region must read the
value itself, not only `pending? x`: a probe takes no failure, so a region that reads `x` only through `pending?` stays
on its content when `x` fails, and the click throws.

The same holds through components. A callback prop (`onMove={(c, i) => { … }}`) runs on the child's click, and a child's
handler that reads `props.f` reads whatever each parent binds to `f`. A handler reads what its region shows: pass the
child the value it shows, and have the click read that, not another list the child never shows.

```rx before
import pure { fetchUser } from "./api.js"
export default component App() {
  source id := 1
  user = await fetchUser(id)
  <button onClick={() => { log(user) }}>show</button>
}
```

```rx after
import pure { fetchUser } from "./api.js"
export default component App() {
  source id := 1
  user = await fetchUser(id)
  {errored fallback(e) { <p>failed</p> } {
    {loading fallback { <p>loading…</p> } {
      <button disabled={pending? user} onClick={() => { log(user) }}>{user}</button>
    }}
  }}
}
```

### GUESS_WHILE_LOADING

A click can start a guess on a value while that value is loading a new question: its question reads what the click
reads (a selection, a row), and the element is neither inside the `loading` region that shows the value nor disabled
while it loads (AC-3a). The guess composes on the previous answer, and the new answer replaces it (D-34), so the
user's change disappears while its action is out. Put the element inside the value's `loading` region, give it
`disabled={pending? x}`, or keep the pending change in a source of its own until it lands. Solid warns
`OPTIMISTIC_WRITE_WHILE_LOADING` at run time for the same case.

Neither cover holds when the selection changes while a guess on `x` is out. That change joins the guess's hold
(H-11), so a `loading on(sel)` region keeps its content (H-6), and `pending? x` read in that region's markup is
`false` on Solid today although the rule says `true` (05 DV-22): the control stays enabled and a second click guesses
on the old answer. The check accepts it, since the element is covered. Test the verdict in the handler too, where it
reads `true` (R-12): `onClick={() => { if (!(pending? x)) { flip(it.id) } }}`, or keep the pending change in a source
of its own.

```rx before
import pure { fetchIssue } from "./api.js"
import { postRename } from "./api.js"
export default component App() {
  source sel := 1
  source detail = await fetchIssue(sel)
  action rename(t: string) {
    try {
      guess detail := d => d == null ? d : { ...d, title: t }
      await postRename(sel, t)
      refresh detail
    } catch (e) {
      log(e)
    }
  }
  errored fallback(e) { <p>failed</p> } {
    loading on(sel) fallback { <p>loading…</p> } {
      <h2>{detail.title}</h2>
    }
  }
  <button onClick={() => { sel := sel + 1 }}>next</button>
  <button onClick={() => { rename("Bravo") }}>rename</button>
}
```

```rx after
import pure { fetchIssue } from "./api.js"
import { postRename } from "./api.js"
export default component App() {
  source sel := 1
  source detail = await fetchIssue(sel)
  action rename(t: string) {
    try {
      guess detail := d => d == null ? d : { ...d, title: t }
      await postRename(sel, t)
      refresh detail
    } catch (e) {
      log(e)
    }
  }
  errored fallback(e) { <p>failed</p> } {
    loading on(sel) fallback { <p>loading…</p> } {
      <h2>{detail.title}</h2>
    }
  }
  <button onClick={() => { sel := sel + 1 }}>next</button>
  <button disabled={pending? detail} onClick={() => { rename("Bravo") }}>rename</button>
}
```

### ASYNC_OUTSIDE_LOADING_BOUNDARY

In a client-only build (`--spa`), a value with no answer yet and no `loading` region above it shows nothing until it
answers (CN-3d). Put it under `loading fallback { … } { … }`, or give the await a first paint, `await f() -> v`. Later
answers are transitions and need no region.

```rx before spa
-- module: ./api.d.rx
export pure fn getProduct(id: string): Promise<{ name: string }>
-- main
import { getProduct } from "./api.js"
export default component App() {
  source id := "a"
  product = await getProduct(id)
  errored fallback(e) { <p>error: {e.message}</p> } {
    <p>{product.name}</p>
  }
}
```

```rx after spa
-- module: ./api.d.rx
export pure fn getProduct(id: string): Promise<{ name: string }>
-- main
import { getProduct } from "./api.js"
export default component App() {
  source id := "a"
  product = await getProduct(id)
  errored fallback(e) { <p>error: {e.message}</p> } {
    loading fallback { <p>loading…</p> } { <p>{product.name}</p> }
  }
}
```

Fences marked `spa` are checked as a client-only build: a served page shows the server's first frame, so the same
program is clean when it is server-rendered.

### LOADING_ON_OUTSIDE_HOLD

A value is read outside the `loading on(x)` region that waits on it, so that read holds the change: the region's
fallback never shows and the old content stays up with no sign of the wait (CN-3e). Move the read under the region, or
read `latest x` there. Solid warns with the same code at run time.

```rx before
import pure { fetchData } from "./api.js"
export default component App() {
  source id := 1
  data = await fetchData(id)
  {errored fallback(e) { <p>error: {e.message}</p> } {
    <div>{loading on(id) fallback { <p>spinner</p> } { <p>{data}</p> }} {loading fallback { <p>spinner</p> } { <p>{data}</p> }}</div>
  }}
}
```

```rx after
import pure { fetchData } from "./api.js"
export default component App() {
  source id := 1
  data = await fetchData(id)
  {errored fallback(e) { <p>error: {e.message}</p> } {
    <div>{loading on(id) fallback { <p>spinner</p> } { <p>{data}</p> }} {loading on(id) fallback { <p>spinner</p> } { <p>{data}</p> }}</div>
  }}
}
```

## Components, regions and contexts

### UNBOUND

The name is not declared where it is read. A component sees its declaration site, not its caller (RG-7a): pass the
value as a prop, provide it in a context, or import it. JavaScript's globals (`Math`, `JSON`, `document`) are not in scope:
export what you use of one from a `.js` module, and import that.

```rx before
component Row(props) { <p>{caption}</p> }
component List(props) {
  caption = "hi"
  <Row />
}
export default component App() {
  <List />
}
```

```rx after
component Row(props: { caption: string }) { <p>{props.caption}</p> }
component List(props) {
  caption = "hi"
  <Row caption={caption} />
}
export default component App() {
  <List />
}
```

A request is made the same way: `fetch` is a global, so a loader is a function of a module of yours.

```rx before
export default component App() {
  source id := 1
  <button onClick={() => { fetch("/seen/" + id) }}>seen</button>
}
```

```rx after
import { markSeen } from "./api.js"      // export const markSeen = id => fetch("/seen/" + id)
export default component App() {
  source id := 1
  <button onClick={() => { markSeen(id) }}>seen</button>
}
```

`props` is a name only in a component that declares it: `component Lane()` has none (RG-4b), and a read of
`props.col` there would be `undefined`. Declare what it takes.

```rx before
component Lane() { <h3>{props.col}</h3> }
export default component App() {
  <Lane col="todo" />
}
```

```rx after
component Lane(props: { col: string }) { <h3>{props.col}</h3> }
export default component App() {
  <Lane col="todo" />
}
```

### UNKNOWN_COMPONENT

A capitalised tag names a component declared or imported in this module (RG-4a). A JS import is a component only
when its `.d.rx` declares one: `export component X(props: { … })` (MO-11a). For a package with none, the message gives
the file to write, `rx-types/<package>.d.rx`, and the `npx rx-declare` command that drafts it from the package's types
(MO-8k); the Vite plugin and the editor draft one on their own unless that is turned off (MO-8l).

```rx before
export default component App() {
  <Nope />
}
```

```rx after
component Nope(props) { <p>nope</p> }
export default component App() {
  <Nope />
}
```

A kit's compound part is a member of an object, `<Dialog.Trigger>`: the `.d.rx` declares each member by its written
name, `export component Dialog.Trigger(props: { … })` (MO-11q), and a member it does not declare is unknown.

### RESULT_AS_VALUE

A prop whose type says which of its fields wait or fail (`props: { query: { data: pending fails(Error) T; status:
string } }`, the row words `.rx` writes before a type, 04 CN-4a) is read a field at a time: `props.query.data` is
checked where it is read, so every read of it has to be one the checker sees. The record itself is therefore not a
value. Passed to a component, returned by a closure, provided, exported, written to a source, spread or put in a
record, it would be read on the other side as a plain value, with no `errored` or `loading` asked for. Read the field
and pass that: the field carries its rows (a prop, a provision and an export all do). Another name for the record is
an equation (`q = props.query`); comparing or testing it reads no field. To pass it whole to a component, type that
component's prop with the same rows on its fields. The same code is reported for a read that is not a field the type
names: an inherited method (`props.query.valueOf()` answers the record itself).

A JS result is read the same way when its declaration says a `ref` part of it waits or fails (`{ data: pending
fails(Error) ref T; refetch: () => void }`, MO-10l): the name bound to the result is not passed, stored or returned
whole, and the part is, with its rows (`<List todos={q.data} />`).

```rx before
component Count(props: { of: any }) {
  <b>{len(props.of.data)}</b>
}
component Panel(props: { query: { data: pending fails(Error) string[]; status: string } }) {
  <p>{props.query.status}</p>
  {errored fallback(e) { <p>failed</p> } { <Count of={props.query} /> }}
}
export default component App() {
  <Panel query={{ data: ["milk"], status: "success" }} />
}
```

```rx after
component Count(props: { of: string[] }) {
  <b>{len(props.of)}</b>
}
component Panel(props: { query: { data: pending fails(Error) string[]; status: string } }) {
  <p>{props.query.status}</p>
  {errored fallback(e) { <p>failed</p> } { <Count of={props.query.data} /> }}
}
export default component App() {
  <Panel query={{ data: ["milk"], status: "success" }} />
}
```

### DUPLICATE_WIRE_ID

A declared JS error class crosses from the server to the client as itself (SV-5a), named by its declaration: its
package's name and the path below it, or, in a package with no name, the path below the nearest `package.json`. Two
declarations in unnamed packages can come out alike (`err.d.rx#Gone` in two folders that each hold a
`{"type":"module"}`), and nothing would tell the client which class the server sent. Give the `package.json` above one
of them a `"name"`.

```rx before
-- module: ./web/package.json
{ "type": "module" }
-- module: ./web/err.d.rx
export error Gone
-- module: ./server/package.json
{ "type": "module" }
-- module: ./server/err.d.rx
export error Gone
-- main
import { Gone } from "./web/err.js"
import { Gone as Lost } from "./server/err.js"
export default component App() {
  <p>ok</p>
}
```

```rx after
-- module: ./web/package.json
{ "name": "web", "type": "module" }
-- module: ./web/err.d.rx
export error Gone
-- module: ./server/package.json
{ "type": "module" }
-- module: ./server/err.d.rx
export error Gone
-- main
import { Gone } from "./web/err.js"
import { Gone as Lost } from "./server/err.js"
export default component App() {
  <p>ok</p>
}
```

### COMPONENT_AS_VALUE

A component is applied in markup, `<Greeting name="x" />`, not stored or called as a function (RG-4a). The exception is
JS that takes a component: a factory's arguments (`createRouter({ routes: [{ path: "/", component: Home }] })`), a JS
component's prop typed `Component` — or one whose type holds components, in the record or the list you write there
(`<Markdown builtins={{ Heading: Heading }}>`), or the name of an equation bound to such a record or list, where every
mention of that name is such a prop (`builtins = { Heading: Heading }`, then `<Markdown builtins={builtins}>`: read
anywhere else, exported, or given to no such prop, the binding is this code) (MO-11c, MO-11f) — and the arguments of any other JS call, where a
library may render it anywhere: there it is checked under a root of its own, with nothing above the call credited
(MO-11s, below), unless the fn's row names the component that renders it (`renders(Toaster)`, MO-11u).

```rx before
component Greeting(props) { <p>{props.name}</p> }
export default component App() {
  x = Greeting
  <p>{x}</p>
}
```

```rx after
component Greeting(props: { name: string }) { <p>{props.name}</p> }
export default component App() {
  <Greeting name="x" />
}
```

Where a library renders the components it is given is said in its `.d.rx` (MO-11r): a fn handing back a `Component`
renders them inside it (a factory, MO-11f), and `nests(children in component)` on it says the tree — each entry of a
record's `children` among the children of that record's `component` (MO-11i). A fn that hands its components to
another component of the library, which renders them later, names that component: `renders(Toaster)` (MO-11u) —
they are then checked among its children, wherever the program applies it.

A record or a list of components built outside the prop — `parts = { Heading: Heading }`, then `builtins={parts}` —
is this diagnostic on the line of `parts`: the components are read in the literal the prop is given, where the
checker can name them. Write the record in the prop.

A JS fn that is no factory (or a JS import with no declaration) still takes a component: it is checked the most
cautious way, under a root of its own (MO-11s). It must then stand on its own: an `errored`, a `loading` or a `provide`
above the call does not count, so one it needs is refused as `UNHANDLED_FAILURE` or `CONTEXT_NOT_FOUND` there. Give the
component its own boundary, say in the fn's row which component of the library renders it (`renders(Toaster)`), or give
the components to a factory: a few lines of the app's own JavaScript that take them as records and hand back the
component that renders them (a route tree, `guide/libraries.md`).

### INSTANTIATION_NOT_BOUND

A `fn` that declares state makes new state each time it is called, and one that reads a context (`use`) reads it above
the place it is called, so its result is bound to a name, `x = f(…)`, and the name is read (E-9, RG-6).

```rx before
export default component App() {
  fn counter(ref base) {
    source extra := 0
    base + extra
  }
  source n := 1
  <p>{counter(n)}</p>
}
```

```rx after
export default component App() {
  fn counter(ref base) {
    source extra := 0
    base + extra
  }
  source n := 1
  c = counter(n)
  <p>{c}</p>
}
```

### REGION_ESCAPE

A closure that captures something from a region that ends sooner (a `for` row, an `if` branch) is stored where it
outlives that region (O-3). Keep the state at the level that stores the closure, or pass the value rather than a
closure over it.

```rx before
export default component App() {
  source handlers := []
  source rows := [1, 2]
  <ul>{for r in rows {
    source hits := 0
    <li onClick={() => { handlers := [...handlers, () => hits] }}>{hits}</li>
  }}</ul>
}
```

```rx after
export default component App() {
  source seen := []
  source rows := [1, 2]
  <ul>{for r in rows {
    source hits := 0
    <li onClick={() => { seen := [...seen, hits] }}>{hits}</li>
  }}</ul>
}
```

### UNSTABLE_LIST_IDENTITY

The rows of a `for` are rebuilt as fresh records on every change, so every row's state and effects start over
(ST-4b). Declare a key, `rows key id = …`, so rows keep identity.

```rx before
export default component App() {
  source rows := [{ id: 1, name: "a" }, { id: 2, name: "b" }]
  view = map(rows, fn(r) => { id: r.id, name: r.name + "!" })
  {for r in view {
    effect (r.name) { log(r.id, $0) }
    <p>{r.name}</p>
  }}
}
```

```rx after
export default component App() {
  source rows := [{ id: 1, name: "a" }, { id: 2, name: "b" }]
  view key id = map(rows, fn(r) => { id: r.id, name: r.name + "!" })
  {for r in view {
    effect (r.name) { log(r.id, $0) }
    <p>{r.name}</p>
  }}
}
```

### VIEW_NOT_SHOWN

A component reads a view it was given (its children, or a prop typed `View`) as a value (RG-4c). A view is only shown:
`{props.children}` in the component's view, at as many places as it likes, each with its own, made there; given on to
another component, as content or as an argument typed `View`; or asked for, `if props.children { … }`,
`props.children ?? …`. It is not kept by `peek`, a source or `pre`, carried by a context, read by an effect or a handler,
answered by a closure, held in a record or a list, given to a fn, or given to a prop whose type is a value's. The
message says what to write for the one it found. The rule is of a prop declared `View` (children declared `number` are a
number) and of the names bound to it: a parameter or an inner equation of the same spelling is another name.
"Was it given" is asked of the argument as it was written, and makes nothing: content was given, a view given on asks
its giver (through an argument, a spread, a rest or a default alike), a choice follows its branch, and a value answers as
JavaScript has it (`0`, `""` and `undefined` are nothing under `if`; only `undefined` is under `??`).

```rx before
component Reveal(props: { children: View }) {
  source kept := null
  <button onClick={() => { kept := props.children }}>show</button><i>{kept}</i>
}
export default component App() {
  <Reveal><b>x</b></Reveal>
}
```

```rx after
component Reveal(props: { children: View }) {
  source open := false
  <button onClick={() => { open := true }}>show</button>{if open { <i>{props.children}</i> }}
}
export default component App() {
  <Reveal><b>x</b></Reveal>
}
```

### CONTEXT_NOT_FOUND

`use x` reads the nearest provision of context `x` above the region, and some path that renders it has none (RG-7b).
Provide it above the component (`provide x = …`), or give the context a default (`context x: T = v`). A `fn` that uses
a context is refused at its call, not at its own line: the provision goes above the component that calls it.

For a JS library's hook (`uses(router)`), the provision is the library's provider. A page a file-based router renders
has it from the host: `host.d.rx` says so (`provides(router)` on its view, spec/09 MO-14). Reported on `host.d.rx`,
the view provides no such context; reported on a component of a route module the view does not name, JavaScript may
render that component anywhere — name it in the view, or take what it needs as a prop. A context your `.rx` entry
provides above the router reaches a page once the view names the entry's component and the declaration imports the
router's (MO-14f); and where the view names your entry, the router's own context is provided by the router's
component, by its row (`export component AppRouter(props: {}) provides(router)`), to what is rendered through it —
not to the entry itself.

```rx before
context room: number
component Room(props: { id: number }) {
  <p>{(use room) == props.id ? "*" : "-"}</p>
}
export default component App() {
  <Room id={1} />
}
```

```rx after
context room: number
component Room(props: { id: number }) {
  <p>{(use room) == props.id ? "*" : "-"}</p>
}
export default component App() {
  provide room = 1
  <Room id={1} />
}
```

A component given to a library that renders it later, beneath a component of its own (a toast, a routed page), is
checked where that component is applied: the fn's row says `renders(Toaster)` (MO-11u), and a context the component
reads must be above every `<Toaster>` of the program — above the call is not where it runs. The diagnostic is on the
line of the call, and says which fn and which component. (`UNHANDLED_FAILURE` and, in a client-only build,
`ASYNC_OUTSIDE_LOADING_BOUNDARY` are reported the same way, for a failure or a first load nothing above that component
holds.)

```rx before
-- module: ./toasts.d.rx
export component Toaster(props: {})
export fn toast(message: string | Component): number renders(Toaster)
-- main
import { Toaster, toast } from "./toasts.js"
context accent: string
component Saved() {
  <b class={use accent}>saved</b>
}
component Editor() {
  provide accent = "dark"
  <button onClick={() => { toast(Saved) }}>save</button>
}
export default component App() {
  <Editor />
  <Toaster />
}
```

```rx after
-- module: ./toasts.d.rx
export component Toaster(props: {})
export fn toast(message: string | Component): number renders(Toaster)
-- main
import { Toaster, toast } from "./toasts.js"
context accent: string
component Saved() {
  <b class={use accent}>saved</b>
}
export default component App() {
  provide accent = "dark"
  <button onClick={() => { toast(Saved) }}>save</button>
  <Toaster />
}
```

A UI kit's compound parts read their root's context (`<Dialog.Trigger>` needs `<Dialog>` above it): their `.d.rx`
says so, `uses(dialog)` on each part and `provides(dialog)` on the root (MO-11q, MO-12), and `rx-declare` drafts both
by rendering each part alone and inside its root.

```rx before
-- module: ./kit.d.rx
export context dialog
export component Dialog(props: { children?: View }) provides(dialog)
export component Dialog.Trigger(props: { children?: View }) uses(dialog)
-- main
import { Dialog } from "./kit.js"
export default component App() {
  <Dialog.Trigger>open</Dialog.Trigger>
}
```

```rx after
-- module: ./kit.d.rx
export context dialog
export component Dialog(props: { children?: View }) provides(dialog)
export component Dialog.Trigger(props: { children?: View }) uses(dialog)
-- main
import { Dialog } from "./kit.js"
export default component App() {
  <Dialog><Dialog.Trigger>open</Dialog.Trigger></Dialog>
}
```

### CONTEXT_AS_VALUE

A context is read with `use`, which gives the nearest provision (RG-7): `{use theme}`, not `{theme}`.

```rx before
context theme: string = "light"
export default component App() {
  <b>{theme}</b>
}
```

```rx after
context theme: string = "light"
export default component App() {
  <b>{use theme}</b>
}
```

### GENERIC_CONTEXT

A context is declared once, at module level, and every provision and `use` of it is of that one type (RG-7a): it has no
type parameter. A generic function type as its type read as a context of a plain value, and no context that holds a
view. Write the parameter's place `any` (or `unknown` and the fields' types); a generic root's props type the caller's
view (proposals/28).

```rx before
context row: <T>(p: { item: T }) => View
export default component App() {
  <b>x</b>
}
```

```rx after
context row: (p: { item: any }) => View
export default component App() {
  <b>x</b>
}
```

### NOT_A_CONTEXT

`provide` and `use` name a `context` declaration (RG-7). Declare one, `context picked: number`, and provide it.

```rx before
export default component App() {
  source picked := 1
  provide picked = 2
  <b>{picked}</b>
}
```

```rx after
context picked: number
export default component App() {
  provide picked = 2
  <b>{use picked}</b>
}
```

### SOURCE_CONTEXT

A context is read-only beneath its provision (O-4); `context x: source T` was withdrawn (RG-7c, 2026-10-31). Provide the
value and the writes you allow, as actions: `context picked: { current: number; set: (v: number) => void }`.

```rx before
context picked: source number
export default component App() {
  source n := 1
  provide picked = n
  <b>{use picked}</b>
}
```

```rx after
context picked: { current: number; set: (v: number) => void }
export default component App() {
  source n := 1
  action set(v: number) { n := v }
  provide picked = { current: n, set: set }
  <b>{(use picked).current}</b>
}
```

## Modules

### TOP_LEVEL_MARKUP

A module is declarations (MO-1c). The app's view is a component: `export default component App() { … }`.

```rx before
source n := 1
<p>{n}</p>
```

```rx after
source n := 1
export default component App() {
  <p>{n}</p>
}
```

### SHADOWED_IMPORT

A local declaration has the name of an import (MO-1d). Rename one: `import { initials as initialsOf } from "./util.rx"`.

For an import whose methods have rows of their own in its declaration (`export fn toaster.show(…)`, spec/09 MO-8t),
every second binding of the name is this code — a parameter, a local, a loop's variable too (`for toaster in …`): the
methods' rows are read by the name `toaster.show` as written, and a second `toaster` would have them read off
something else. It is reported on the import's line.

```rx before
-- module: ./util.rx
export fn initials(name) => name.slice(0, 1)
-- main
import { initials } from "./util.rx"
export default component App() {
  source initials := "AB"
  <p>{initials(initials)}</p>
}
```

```rx after
-- module: ./util.rx
export fn initials(name) => name.slice(0, 1)
-- main
import { initials as initialsOf } from "./util.rx"
export default component App() {
  source initials := "AB"
  <p>{initialsOf(initials)}</p>
}
```

### NOT_EXPORTED

The module, or its `.d.rx` declaration file, does not export that name (MO-6, MO-8). Check the spelling, or declare the
export.

```rx before
-- module: ./util.rx
export fn initials(name) => name.slice(0, 1)
-- main
import { initial } from "./util.rx"
export default component App() {
  <p>{initial("Ann")}</p>
}
```

```rx after
-- module: ./util.rx
export fn initials(name) => name.slice(0, 1)
-- main
import { initials } from "./util.rx"
export default component App() {
  <p>{initials("Ann")}</p>
}
```

### MODULE_NOT_FOUND

No file at that import path (MO-6). `.rx` modules are imported with their extension, `"./ui.rx"`; JavaScript modules
without it.

```rx before
-- module: ./util.rx
export fn initials(name) => name.slice(0, 1)
-- main
import { initials } from "./utils.rx"
export default component App() {
  <p>{initials("Ann")}</p>
}
```

```rx after
-- module: ./util.rx
export fn initials(name) => name.slice(0, 1)
-- main
import { initials } from "./util.rx"
export default component App() {
  <p>{initials("Ann")}</p>
}
```

### MODULE_CYCLE

Two modules import each other, directly or through others (MO-5). Move what both need into a third module.

```rx before
-- module: ./a.rx
import { b } from "./b.rx"
export source n := 1
export a = b + 1
-- module: ./b.rx
import { n } from "./a.rx"
export b = n * 2
-- main
import { a } from "./a.rx"
export default component App() {
  <p>{a}</p>
}
```

```rx after
-- module: ./n.rx
export source n := 1
-- module: ./a.rx
import { n } from "./n.rx"
import { b } from "./b.rx"
export a = b + 1
-- module: ./b.rx
import { n } from "./n.rx"
export b = n * 2
-- main
import { a } from "./a.rx"
export default component App() {
  <p>{a}</p>
}
```

### IMPORT_ROW_MISMATCH

An import restates what its source already declares (MO-4, MO-8, SF-5): `pure` on a function that is io, `fails(…)` on
an `.rx` module (its rows are its signature's), or `server` / `client` on a name its `.d.rx` declares otherwise. Drop
the annotation on the import and let the declaration say it.

```rx before
-- module: ./store.rx
export source selected := 1
export action select(id: number) { selected := id }
-- main
import pure { select } from "./store.rx"
export default component App() {
  <button onClick={() => { select(2) }}>pick</button>
}
```

```rx after
-- module: ./store.rx
export source selected := 1
export action select(id: number) { selected := id }
-- main
import { select } from "./store.rx"
export default component App() {
  <button onClick={() => { select(2) }}>pick</button>
}
```

## Server functions

### SERVER_CAPTURE

A server function runs in its own request on the server, so it cannot read the client's state: a module source, a
context (`use`), `refresh`, `affects`, `action { … }` (SF-3). Pass what it needs as an argument, and do the client's
part in the action that awaited the call.

```rx before
source n := 1
server fn f() { return n }
x = await f() catch (e) => 0
export default component App() {
  <p>{x}</p>
}
```

```rx after
source n := 1
server fn f(v: number) { return v }
x = await f(n) catch (e) => 0
export default component App() {
  <p>{x}</p>
}
```

### SERVER_WRITE

A server function cannot write client state (SF-4). Return the value and write it in the action that awaited the call:
`let r = await save(x); status := r`.

```rx before
source status := ""
server fn save(x) { status := "saved"; return x }
export default component App() {
  <p>{status}</p>
}
```

```rx after
source status := ""
server fn save(x) { return x }
action go() {
  let r = await save("saved") catch (e) => "failed"
  status := r
}
export default component App() {
  <button onClick={() => { go() }}>{status}</button>
}
```

### SERVER_ONLY

A `server` JS import is not in the client bundle (SF-5a). Call it in a `server fn` body and await that from the client.

```rx before
-- module: ./api.d.rx
export server pure fn findUser(id: number)
-- main
import { findUser } from "./api"
export default component App() {
  user = await findUser(1) catch (e) => null
  <p>{user}</p>
}
```

```rx after
-- module: ./api.d.rx
export server pure fn findUser(id: number)
-- main
import { findUser } from "./api"
server fn loadUser(id) {
  let u = await findUser(id)
  return { name: u.name }
}
export default component App() {
  user = await loadUser(1) catch (e) => null
  <p>{user}</p>
}
```

### CLIENT_IN_SERVER

A `client` JS import (the browser's API) is called in a server function's body, which runs on the server (SF-5c). Call
it from the client and pass the value as an argument.

```rx before
-- module: ./api.d.rx
export client pure fn viewport()
-- main
import { viewport } from "./api"
server fn size() { return viewport() }
export default component App() {
  n = await size() catch (e) => 0
  <p>{n}</p>
}
```

```rx after
-- module: ./api.d.rx
export client pure fn viewport()
-- main
import { viewport } from "./api"
server fn size(w: number) { return w * 2 }
export default component App() {
  width = await viewport() -> 0
  n = await size(width) catch (e) => 0
  {errored fallback(e) { <p>error</p> } { <p>{n}</p> }}
}
```

### CLIENT_NOT_AWAITED

In reactive scope a `client` JS function is a client question, asked once the browser has the page (SV-7b), so it is
awaited: `width = await viewport() -> 0`.

```rx before
-- module: ./api.d.rx
export client pure fn viewport()
-- main
import { viewport } from "./api"
export default component App() {
  width = viewport()
  <p>{width}</p>
}
```

```rx after
-- module: ./api.d.rx
export client pure fn viewport()
-- main
import { viewport } from "./api"
export default component App() {
  width = await viewport() -> 0
  {errored fallback(e) { <p>error</p> } { <p>{width}</p> }}
}
```

### CLIENT_QUESTION_UNHELD

The server never asks a client question, so the page needs a `loading` region above the reader, or a first paint on
the await, `await viewport() -> 0` (SV-7b).

```rx before
-- module: ./api.d.rx
export client pure fn viewport()
-- main
import { viewport } from "./api"
export default component App() {
  width = await viewport() catch (e) => 0
  <p>{width}</p>
}
```

```rx after
-- module: ./api.d.rx
export client pure fn viewport()
-- main
import { viewport } from "./api"
export default component App() {
  width = await viewport() catch (e) => 0
  {loading fallback { <p>measuring</p> } { <p>{width}</p> }}
}
```

## Markup and styles

### CONTENT_MODEL

The browser's HTML parser rewrites some nestings (a `<tr>` outside a table, a `<div>` inside a `<p>`), so the page the
server sends is not the tree the client builds and hydration fails (SV-7d). Nest the elements the way HTML allows.

```rx before
export default component App() {
  <p><div>x</div></p>
}
```

```rx after
export default component App() {
  <div><p>x</p></div>
}
```

### STYLE_PLACEMENT

A view has one `<style>`, at the top level of the component's view: it scopes the whole view, branches and loops
included (CSS-1). Move it there.

```rx before
export default component App() {
  <div><style>p { color: red }</style><p>x</p></div>
}
```

```rx after
export default component App() {
  <style>p { color: red }</style>
  <div><p>x</p></div>
}
```

## Types (`rx-tsc`, the editor)

These come from the TypeScript layer, which checks the program's projection (13).

### MISSING_AWAIT

An equation's value is a promise or a stream, which Solid would consume as a value (R-1a, TY-5b). Write `await e`, or
`await* e` for a stream.

### WIRE_VALUE

A server function's result or parameter is not data: a function or a class instance does not cross the wire (SF). Return
plain data.

### DECLARATION_MISMATCH

`rx-tsc` checks each `.d.rx` against its JS module's real TypeScript types (TY-6): the declaration says something the
module doesn't do. Fix the declaration so the real export fits it: drop a `ref` the function doesn't take, correct a
prop or parameter type, or remove an export the module doesn't have. A module with no types needs a `.d.ts` beside it
(a re-export of the package's is enough) for its declaration to be checked; without one, the `.d.rx` is its types.
Where a component's props are the library's type and a record after it (`props: KitProps<T> & { onPick?: handler … }`),
each field of the record is checked too (TY-6f): it must name a prop the type has, with a type the library's takes — the
same, or narrower. The message names the prop and both types; correct the field's name or its type.

```d.rx before
// lib.d.rx, beside lib.js whose lib.d.ts says: export declare function twice(n: number): number
export pure fn twice(n: string): number
```

```d.rx after
export pure fn twice(n: number): number
```

### VIEW_FN_EXPECTED

The component's declaration types `children` as a function giving a `View` (a render prop): it calls its children for
each thing it renders, so they are written as a view lambda, its only child (MO-11k). A render prop declared optional
(`children?: …`) may be left out: `<Select.Listbox />` renders its items by itself. An `.rx` component that shows its
children with what it knows, `<props.children on={lit} />` (RG-4c), takes the same.

```rx before
-- module: ./list.d.rx
export component VirtualList(props: { items: any[]; children: (row: any, i: number) => View })
-- main
import { VirtualList } from "./list.js"
export default component App() {
  rows = ["a", "b"]
  <VirtualList items={rows}><p>row</p></VirtualList>
}
```

```rx after
-- module: ./list.d.rx
export component VirtualList(props: { items: any[]; children: (row: any, i: number) => View })
-- main
import { VirtualList } from "./list.js"
export default component App() {
  rows = ["a", "b"]
  <VirtualList items={rows}>{view (row, i) { <p>{row} #{i}</p> }}</VirtualList>
}
```

### VIEW_FN_MISPLACED

A `view (…) { … }` is a render prop: the only child of a JS component whose declaration types `children` as a function
giving a `View`. Anywhere else, write the markup itself, or a `for` over the list (MO-11k).

An `.rx` component takes one where its `children` are typed so and it shows them, `<props.children on={lit} />` (RG-4c). It
then names `props.children` nowhere else: it is not read, called, stored, passed or spread. Optional ones are shown under
`if props.children { … }`.

```rx before
export default component App() {
  xs = ["a", "b"]
  <ul>{view (x) { <li>{x}</li> }}</ul>
}
```

```rx after
export default component App() {
  xs = ["a", "b"]
  <ul>{for x in xs { <li>{x}</li> }}</ul>
}
```

### NESTED_NOT_RENDERED

A record gives a component other components to render among its own children — a route's `children` under its
`component`, to a router declared `nests(children in component)` (MO-11i), or in a host declaration's view (MO-14) —
and that component renders none: its pages would never show, and nothing above them could be checked. A layout renders
its pages where it writes `{props.children}`.

Under a host declaration there is a second way: a layout may render its pages through a component of the host's own —
TanStack Router's `<Outlet />`, or the router's component in the app's `.rx` entry. The declaration imports that
component from its JS module (`import { Outlet } from "@tanstack/solid-router"`), and the pages are then checked where
the layout applies it (MO-14f) — itself, or through `.rx` components of yours: a layout that applies `<Frame />`,
which applies `<Outlet />`, renders its pages at that outlet, under what the frame has around it and what the layout
has around the frame. A component that renders *its own* children and is given none (`<Card />`) is no outlet, and a
frame with no outlet renders none: both are still this code.

```rx before
-- module: ./router.d.rx
export pure fn createRouter(routes: unknown): Component nests(children in component)
-- main
import { createRouter } from "./router.js"
component Layout() {
  <nav>menu</nav>
}
component Home() {
  <h1>Home</h1>
}
Router = createRouter({ component: Layout, children: [{ component: Home }] })
export default component App() {
  <Router />
}
```

```rx after
-- module: ./router.d.rx
export pure fn createRouter(routes: unknown): Component nests(children in component)
-- main
import { createRouter } from "./router.js"
component Layout(props: { children?: View }) {
  <nav>menu</nav>
  <main>{props.children}</main>
}
component Home() {
  <h1>Home</h1>
}
Router = createRouter({ component: Layout, children: [{ component: Home }] })
export default component App() {
  <Router />
}
```

### HOST_VIEW_STALE

Reported by the tools, not by a checker: `rx-tsc`, `rx-verify` and a build (`vite build`); the dev server fixes it
instead (MO-14g). A `host.d.rx` whose first line names the router's tree it was derived from (`//@ routes
./routeTree.gen.ts ./main.rx`, or a routes directory) is that tree's, and it has fallen behind: a route file was
added, removed, or moved to another layout since the file was written, or the file was edited by hand. A page would
be checked under a layout the router no longer renders it in — or under nothing. The message says which route and
where. Write the file again from the tree: `rx-declare --host --sync src/host.d.rx` (`--check` only asks). Generate
the tree first where it is not there (`vite build`, or the router's own CLI): the router's plugin writes it, and the
declaration is read off it.

The same code refuses a source that cannot be read as the router has it: a routes directory named under a Vite
config that gives `filesystem-routing` a `toPath`, `router` or `routers` of its own. A directory is read with the
package's convention; put the router in a module, give it to the plugin (`fileRoutes({ router })`), and name the
module (`//@ routes ./routes.config.js`, guide/libraries.md).

```d.rx before
//@ routes ./routeTree.gen.ts ./main.rx
import { App } from "./main.rx"
import { Root } from "./routes/__root.rx"
import { Home } from "./routes/index.rx"
import { AppRouter } from "./router.tsx"
import { Outlet } from "@tanstack/solid-router"
export default component nests(children in component) = [{ component: App, children: [{ component: Root, children: [{ component: Home }] }] }]
```

```d.rx after
//@ routes ./routeTree.gen.ts ./main.rx
import { App } from "./main.rx"
import { Root } from "./routes/__root.rx"
import { About } from "./routes/about.rx"
import { Home } from "./routes/index.rx"
import { AppRouter } from "./router.tsx"
import { Outlet } from "@tanstack/solid-router"
export default component nests(children in component) = [{ component: App, children: [{ component: Root, children: [{ component: About }, { component: Home }] }] }]
```

A declaration with no `//@ routes` line is written by hand and is never stale in this sense: `rx-verify`'s probe is
what holds it.

### DECLARATION_VERSION

The `.d.rx` is pinned (`//@ for <package> <range>`) to versions of its package that are not the one installed (MO-8f).
Its rows were written for another version: check them against this one (the package's changelog, its `.d.ts`), fix
what changed, then update the pin.

```d.rx before
//@ for @solidjs/router ^1.9.0
export pure fn useParams(): any uses(router)
```

```d.rx after
//@ for @solidjs/router ^2.0.0
export pure fn useParams(): any uses(router)
```

### UNVERIFIED_ROW

Reported only in strict mode (`rx-tsc --rx-strict`, or `"reactivescript": { "strict": true }` in the tsconfig;
MO-8j, TY-7). A declaration row is an assertion about a JS library; strict mode asks that running showed it. The row
was not recorded as holding by `rx-verify --record`: nothing recorded it, it was edited since the record, rx-verify
found a mismatch, or it could not check it (no probe arguments, no scene). Run `rx-verify --record lib.d.rx` with a
probe beside it (`lib.probe.mjs`) and fix what it reports. No word of a row opts it out: strict mode is the project's
choice, and a declaration the project cannot yet show by running is a reason to leave it off.

A host declaration (`host.d.rx`, MO-14) is asked for too, though no module imports it: its view and each component
it imports from JavaScript are rows `rx-verify --record host.d.rx` records, against the scene its probe gives.

