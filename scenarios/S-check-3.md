# S-check-3 — a value is changed by a write; a handler is passed; what a call set up is undone

Rules: W-1a, SC-4, EF-5a, ST-4d; MO-10b (a method that answers nothing).

Four mistakes Solid lets through — it warns of some at run time, and is
silent on the rest — that the program text decides. The accepted program
does each of the four things the right way.

## Modules

```rx
-- module: ./keys.d.rx
// subscribes, and answers the function that unsubscribes
export fn onShortcut(key: string, run: handler () => void): () => void
// the same behind the library's own name for the type, and as a subscription object
export type Unsubscribe = () => void
export fn onResize(run: handler () => void): Unsubscribe
export fn subscribe(run: handler () => void): { unsubscribe: () => void }
// a paging primitive: what it answers is declared, so a method that answers nothing is known to be called for its effect
export pure fn createPager(): { page: number; next: () => void; count: () => number; save: () => Promise<string>; load: (page: number) => Promise<string[]> } instantiates
// a list that hands its view the rows it holds
export component Rows(props: { children: (rows: number[]) => View })
```

## Program

```rx
import { onShortcut, createPager } from "./keys.js"
component Sorted(props: { items: number[] }) {
  sorted = props.items.toSorted()
  <p>{sorted}</p>
}
export default component App() {
  source rows := [3, 1, 2]
  source hits := 0
  pager = createPager()
  labels key id = [{ id: 1, text: "a" }, { id: 2, text: "b" }]
  effect () {
    let stop = onShortcut("k", () => { hits := h => h + 1 })
    return () => { stop() }
  }
  action add() { rows := rs => [...rs, len(rs) + 1] }
  <Sorted items={rows} />
  <button onClick={add}>add</button>
  <button onClick={() => { pager.next() }}>{pager.count()} pages, {hits} hits</button>
  <ul>{for l in labels { <li>{l.text}</li> }}</ul>
}
```

## Rejected variants

A source's list pushed to: the view is never told (W-1a).

```rx
-- reject: MUTATION_IN_PLACE
export default component App() {
  source rows := [1]
  <button onClick={() => { rows.push(2) }}>{len(rows)}</button>
}
```

A prop's list sorted where the view computes: the parent's source is
reordered under it. A row of it, a local that names it, and the value a
functional write is given are the same list.

```rx
-- reject: MUTATION_IN_PLACE
component Sorted(props: { items: number[] }) {
  sorted = props.items.sort()
  <p>{sorted}</p>
}
export default component App() {
  source rows := [3, 1, 2]
  <Sorted items={rows} />
}
```

```rx
-- reject: MUTATION_IN_PLACE
export default component App() {
  source rows := [[1], [2]]
  <ul>{for r in rows { <li onClick={() => { r.push(0) }}>{len(r)}</li> }}</ul>
}
```

```rx
-- reject: MUTATION_IN_PLACE
export default component App() {
  source rows := [3, 1, 2]
  <button onClick={() => { let xs = rows; xs.reverse() }}>{len(rows)}</button>
}
```

```rx
-- reject: MUTATION_IN_PLACE
export default component App() {
  source rows := [3, 1, 2]
  <button onClick={() => { rows := rs => rs.reverse() }}>{len(rows)}</button>
}
```

A mutating method's name is not enough (revised 2026-11-24): the value must
be an array by what the program writes — a type, a list, a call that answers
one. A record's own `push` is its own method, and what a component hands its
view is not read (its declared type is not followed).

```rx
-- accept
component Link(props: { router: { push: (to: string) => string } }) {
  <button onClick={() => { log(props.router.push("/a")) }}>go</button>
}
export default component App() {
  router = { push: (to: string) => to }
  source held: any := { reverse: () => 1 }
  <p>{router.push("ok")}</p>
  <Link router={router} />
  <button onClick={() => { held := h => h.reverse() }}>x</button>
}
```

```rx
-- accept
import { Rows } from "./keys.js"
export default component App() {
  <Rows>{view (rows) { <button onClick={() => { rows.splice(0, 1) }}>{len(rows)}</button> }}</Rows>
}
```

What the code made itself is its own to change.

```rx
-- accept
export default component App() {
  source rows := [3, 1, 2]
  <button onClick={() => { let xs = [...rows]; xs.push(4); xs.sort(); rows := xs }}>{len(rows)}</button>
}
```

A handler is passed, not called (SC-4): the action would run while the
view computes, and the click would be handed what it answered.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  action bump() { n := n + 1 }
  <button onClick={bump()}>{n}</button>
}
```

```rx
-- reject: IO_IN_REACTIVE
import { createPager } from "./keys.js"
component Btn(props: { onPress: () => void }) { <button onClick={() => { props.onPress() }}>next</button> }
export default component App() {
  pager = createPager()
  <Btn onPress={true ? pager.next() : pager.next()} />
}
```

A function a context provides, or a prop is given, is read the same way
(2026-11-22): its declared type says it answers nothing, so it is called
for what it does. Where every provision the module writes gives the
field an action, the code is the one Solid's runtime has for that call.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
context cart: { n: number; add: (by: number) => void }
component Provider(props: { children: View }) {
  source n := 0
  action add(by: number) { n := v => v + by }
  provide cart = { n: n, add: add }
  {props.children}
}
component Badge() {
  c = use cart
  <b>{c.add(1)} {c.n}</b>
}
export default component App() {
  <Provider><Badge /></Provider>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
context cart: { n: number; add: (by: number) => void }
component Provider(props: { children: View }) {
  source n := 0
  action add(by: number) { n := v => v + by }
  provide cart = { n: n, add: add }
  {props.children}
}
component Badge() {
  c = use cart
  <button onClick={c.add(1)}>{c.n}</button>
}
export default component App() {
  <Provider><Badge /></Provider>
}
```

```rx
-- reject: IO_IN_REACTIVE
component Pager(props: { page: number; onNext: () => void }) {
  <p>{props.onNext()} page {props.page}</p>
}
export default component App() {
  source page := 1
  <Pager page={page} onNext={() => { page := p => p + 1 }} />
}
```

Called from a handler, each is what it was provided for.

```rx
-- accept
context cart: { n: number; add: (by: number) => void }
component Provider(props: { children: View }) {
  source n := 0
  action add(by: number) { n := v => v + by }
  provide cart = { n: n, add: add }
  {props.children}
}
component Badge() {
  c = use cart
  <button onClick={() => { c.add(1) }}>{c.n}</button>
}
component Pager(props: { page: number; onNext: () => void }) {
  <button onClick={() => { props.onNext() }}>page {props.page}</button>
}
export default component App() {
  source page := 1
  <Provider><Badge /></Provider>
  <Pager page={page} onNext={() => { page := p => p + 1 }} />
}
```

A method its declaration says answers nothing is called for what it
does: from a handler, not where the view computes (MO-10b).

```rx
-- reject: IO_IN_REACTIVE
import { createPager } from "./keys.js"
export default component App() {
  pager = createPager()
  <p>{pager.next()} {pager.count()}</p>
}
```

One that answers a promise starts work (2026-11-22): not awaited where the
view computes, nothing waits for it and the view is handed a promise.
Awaited, it is asked; from a handler, it is called.

```rx
-- reject: IO_IN_REACTIVE
import { createPager } from "./keys.js"
export default component App() {
  pager = createPager()
  <p>{pager.save()} {pager.count()}</p>
}
```

```rx
-- reject: IO_IN_REACTIVE
import { createPager } from "./keys.js"
export default component App() {
  pager = createPager()
  <button onClick={pager.save()}>{pager.count()}</button>
}
```

```rx
-- accept
import { createPager } from "./keys.js"
export default component App() {
  pager = createPager()
  rows = await pager.load(1)
  errored fallback(e) { <p>failed</p> } {
    loading fallback { <p>…</p> } { <p>{len(rows)}</p> }
  }
  <button onClick={() => { pager.save() }}>{pager.count()}</button>
}
```

The function a subscription answers, dropped (EF-5a): as a statement, and
as a local nothing uses.

```rx
-- accept: advice DISPOSER_DROPPED
import { onShortcut } from "./keys.js"
export default component App() {
  source hits := 0
  effect () { onShortcut("k", () => { hits := h => h + 1 }) }
  <p>{hits}</p>
}
```

```rx
-- accept: advice DISPOSER_DROPPED
import { onShortcut } from "./keys.js"
export default component App() {
  source hits := 0
  <button onClick={() => { let stop = onShortcut("k", () => { hits := h => h + 1 }); hits := 0 }}>{hits}</button>
}
```

The same when the declaration names the type (an alias of its own file,
or TypeScript's `VoidFunction`) or answers a subscription object; when
only one branch keeps it; and when it is only given another name.

```rx
-- accept: advice DISPOSER_DROPPED
import { onResize } from "./keys.js"
export default component App() {
  source hits := 0
  effect () { onResize(() => { hits := h => h + 1 }) }
  <p>{hits}</p>
}
```

```rx
-- accept: advice DISPOSER_DROPPED
import { subscribe } from "./keys.js"
export default component App() {
  source hits := 0
  effect () { subscribe(() => { hits := h => h + 1 }) }
  <p>{hits}</p>
}
```

```rx
-- accept: advice DISPOSER_DROPPED
import { onShortcut } from "./keys.js"
export default component App() {
  source hits := 0
  source on := true
  effect (on) {
    let stop = onShortcut("k", () => { hits := h => h + 1 })
    if ($0) { return () => { stop() } }
  }
  <p>{hits}</p>
}
```

```rx
-- accept: advice DISPOSER_DROPPED
import { onShortcut } from "./keys.js"
export default component App() {
  source hits := 0
  <button onClick={() => { let stop = onShortcut("k", () => { hits := h => h + 1 }); let later = stop }}>{hits}</button>
}
```

Kept on every path: by the cleanup, by a list the cleanup runs, by a
source another handler calls, by a subscription's own method.

```rx
-- accept
import { onShortcut, onResize, subscribe } from "./keys.js"
export default component App() {
  source hits := 0
  source held: (() => void) | null := null
  effect () {
    let stops = [onShortcut("k", () => { hits := h => h + 1 })]
    let sub = subscribe(() => { hits := 0 })
    let off = onResize(() => { hits := 0 })
    if (hits > 100) { off(); return () => { sub.unsubscribe(); for (const s of stops) { s() } } }
    return () => { off(); sub.unsubscribe(); for (const s of stops) { s() } }
  }
  <button onClick={() => { held := onShortcut("j", () => { hits := 0 }) }}>on</button>
  <button onClick={() => { if (held) { held() }; held := null }}>{hits}</button>
}
```

Two rows written with one key (ST-4d).

```rx
-- reject: DUPLICATE_KEY
export default component App() {
  labels key id = [{ id: 1, text: "a" }, { id: 1, text: "b" }]
  <ul>{for l in labels { <li>{l.text}</li> }}</ul>
}
```

```rx
-- reject: DUPLICATE_KEY
export default component App() {
  source labels key id := [{ id: "x", text: "a" }, { id: "y", text: "b" }, { id: "x", text: "c" }]
  <ul>{for l in labels { <li>{l.text}</li> }}</ul>
}
```

```rx
-- reject: DUPLICATE_KEY
export default component App() {
  source labels key id := [{ id: 1, text: "a" }]
  <button onClick={() => { labels := [{ id: 2, text: "a" }, { id: 2, text: "b" }] }}>reset</button>
  <ul>{for l in labels { <li>{l.text}</li> }}</ul>
}
```

Where the list is written, too (2026-11-22): the rows of a write, and

```rx
-- reject: DUPLICATE_KEY
export default component App() {
  source labels key id := [{ id: 1, text: "a" }]
  <button onClick={() => { labels := ls => [{ id: 9, text: "new" }, { id: 9, text: "newer" }, ...ls] }}>add</button>
  <ul>{for l in labels { <li>{l.text}</li> }}</ul>
}
```

the rows an updater answers. A written row whose key the list may already
hold (`[...ls, { id: 1 }]`) is not refused: what `ls` holds is the run's.
