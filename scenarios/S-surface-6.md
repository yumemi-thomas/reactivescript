# S-surface-6 — a `peek` kept where what it reads changes

Rules: E-5a, E-5, E-4, E-10.

`peek e` reads `e` once, without subscribing. Where that read is a source's
seed (`source draft := peek …`, E-4) or a value argument (E-10), the
snapshot is the point and has a name. Where the expression around it is
kept and read again — an equation, a provision, what a view shows, a
component's argument — and nothing else in it changes, the `peek` freezes
it: if what it reads is written, refreshed or loads, every reader keeps
the first value (Solid: `untrack` in a memo with no other source, or a
provider given `value={untrack(data)}`). That is `SNAPSHOT_KEPT`, unless
the rest of the expression changes, which makes the `peek` a sample
(`n * 2 + peek n` reads `n` again whenever it recomputes).

A module is checked alone by default, so a prop or a provision counts as
changing: the module cannot see who applies the component or who provides.
Checked as the whole program (`rx check --whole-program`, `rxc check
--whole-program`), every application and provision is seen, and a `peek`
of a prop or provision that nothing changes is accepted.

## Modules

```rx
-- module: ./show.rx
export component Show(props: { value: number }) {
  <b>{peek props.value}</b>
}
```

```rx
-- module: ./theme.rx
export context theme: string
export component Label() {
  <i>{peek use theme}</i>
}
```

## Program

```rx
component Panel(props: { start: number }) {
  source draft := peek props.start
  <p>{draft}</p>
}

export default component App() {
  source n := 1
  label = "n"
  twice = n * 2 + peek n
  fixed = peek label
  <p>{label}={n} {twice} {fixed}</p>
  <Panel start={n} />
  <button onClick={() => { n := n + 1 }}>+</button>
}
```

`draft` is a named snapshot (E-4); `twice` is a sample, recomputed when `n`
changes; `fixed` peeks an equation that never changes.

## Frames

| instant | action              | frame              |
| ------- | ------------------- | ------------------ |
| 0       | mount               | `n=1 3 n1+`        |
| 1       | handler `n := 2`    | `n=2 6 n1+`        |

Instant 1: `twice` reads `n` again; `Panel`'s draft keeps its seed.

## Rejected variants

```rx
-- reject: SNAPSHOT_KEPT
export default component App() {
  source n := 1
  frozen = peek n
  <p>{frozen}</p>
  <button onClick={() => { n := n + 1 }}>+</button>
}
```

`frozen` has no other input, so it is `1` forever while `n` counts.

```rx
-- reject: SNAPSHOT_KEPT
context page: pending fails(Error) string
component Title() {
  <h1>{use page}</h1>
}
export default component App() {
  data = await fetch("data")
  provide page = peek data
  errored fallback { <p>failed</p> } {
    loading fallback { <p>…</p> } {
      <Title />
    }
  }
  <button onClick={() => { refresh data }}>reload</button>
}
```

The provision is read once: `data` loads and is refreshed, and `Title`
keeps what it first saw (Solid: `<Ctx value={untrack(data)}>`).
`provide page = data` passes it live.

```rx
-- reject: SNAPSHOT_KEPT
import { Show } from "./show.rx"
export default component App() {
  <Show value={1} />
}
```

Checked one module at a time, `show.rx` cannot see that every application
passes a constant: `props.value` is a prop, which the parent can change.

```rx
-- reject: SNAPSHOT_KEPT
-- whole-program
import { Show } from "./show.rx"
export default component App() {
  source n := 1
  <Show value={n} />
  <button onClick={() => { n := n + 1 }}>+</button>
}
```

As the whole program, the application is seen: `n` is written, so the
`peek` in `show.rx` is refused even though the write is in another file.

```rx
-- reject: SNAPSHOT_KEPT
-- whole-program
import { theme, Label } from "./theme.rx"
export default component App() {
  source t := "light"
  provide theme = t
  <Label />
  <button onClick={() => { t := "dark" }}>dark</button>
}
```

The same through a context: the provision is live, and `t` is written.

```rx
-- accept: whole-program
import { Show } from "./show.rx"
import { theme, Label } from "./theme.rx"
export default component App() {
  source n := 1
  provide theme = "light"
  <Show value={n} />
  <Label />
}
```

As the whole program: nothing writes `n`, and the only provision of
`theme` is a constant, so neither `peek` can go stale.
