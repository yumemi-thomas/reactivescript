# S-effect-cleanup-action — a part that unregisters in its effect's cleanup, through an action, leaves the screen live

Rules exercised: EF-5, AC-1, RG-7, W-4; DV-29.

## Program

```rx
type D = { open: boolean; title: string | undefined; set: (v: boolean) => void; name: (v: string | undefined) => void }
context dialog: D = { open: false, title: undefined, set: (v: boolean) => {}, name: (v: string | undefined) => {} }
component Trigger() {
  c = use dialog
  <b>{c.open ? "T" : "F"}</b>
}
component Title() {
  c = use dialog
  effect ("t") { c.name($0); return () => { c.name(undefined) } }
  <i>t</i>
}
export default component App() {
  source mine := false
  source ids: { title?: string } := {}
  now = mine
  action set(v: boolean) { if (v != now) { mine := v } }
  action name(v: string | undefined) { ids.title := v }
  provide dialog = { open: now, title: ids.title, set: set, name: name }
  <Trigger />
  {if now { <Title /> }}
}
```

The shape of a dialog kit (Kobalte's, `examples/rx-packages/packages/kobalte/src/dialog.rx`): a part registers itself
with the root in an effect and unregisters in the effect's cleanup (EF-5), through an action the root provides; the
trigger shows the root's state. Each `set` is one instant; the cleanup's write, when `if` ends the part, is the next.

## Frames

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `F` |
| 1 | handler `set(true)` | `Tt` |
| 2 | handler `set(false)` | `F` |
| 3 | (effect) | `F` |
| 4 | handler `set(true)` | `Tt` |
| 5 | handler `set(false)` | `F` |
| 6 | (effect) | `F` |

## Divergences (DV-29)

- oracle "Frames" instant 4: `Ft`

Solid since 2.0.4 (main 30e7805eb and 50a4bfdde too; 2.0.3 and earlier do not): once an effect's cleanup has called an
action while its owner was disposed, a render effect over a memo of the root's record misses the next change — the
trigger keeps `F` beside the shown part. A plain write in the cleanup does not do it. Plain Solid:
`ref/oracle/repros/cleanup-action-write.mjs`; spec/05 DV-29. Found by `examples/rx-packages` (`live.mjs`): Kobalte's
popover, select and tooltip rewrites on the pinned Solid, whose `Title` (or item) unregisters so.
