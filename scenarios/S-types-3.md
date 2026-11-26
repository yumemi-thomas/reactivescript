# S-types-3 — a write is typed by what its source was declared to hold, not by an `if` around it

Rules exercised: TY-2, W-1.

An `if` narrows what a *read* of a source is, as in TypeScript: under `if (a)` a read of `a` is no longer `undefined`.
A write is not a read: `a := undefined` there writes the source, whose type is the one it was declared with (or, with
none written, the one its first value has). The projection typed the write by the narrowed read, so the ordinary
"if there is one, clear it" and a switch between two literals were refused by the type layer (`TS2345`), while both
checkers and every runner had them right.

## Program

```rx
fn pick(): string | undefined => undefined
source top: "x" | "y" := "x"
action flip() { if (top == "x") { top := "y" } else { top := "x" } }
component Row() {
  source s: 1 | 2 := 1
  <i onClick={() => { if (s == 1) { s := 2 } }}>{s}</i>
}
export default component App() {
  source a: { v: string } | undefined := undefined
  source b := pick()
  source on := true
  action clear() { if (a) { a := undefined } }
  effect (on) { if (b) { b := undefined } }
  <button onClick={() => { if (!a) { a := { v: "set" } } else { a := p => undefined } }}>{a ? a.v : "none"} {b ?? "no"} {top}</button>
  {if on { source t: string | null := null
    <b onClick={() => { if (t != null) { t := null } }}>{t ?? "-"}</b> }}<Row />
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `none no x-1` |
| 1 | handler `a := { v: "set" }` | `set no x-1` |
| 2 | handler `clear()` | `none no x-1` |
| 3 | handler `flip()` | `none no y-1` |

## Rejected variants

(`-- types: CODE`: refused by the type layer.)

```rx
-- types: TS2345
export default component App() {
  source a: { v: string } | undefined := undefined
  <button onClick={() => { if (a) { a := 3 } }}>{a ? a.v : "none"}</button>
}
```

What is written is still held to the declared type.

```rx
-- types: TS2345
component Other() { source a := 0
  <u onClick={() => { a := "s" }}>{a}</u> }
export default component App() {
  source a: "x" | "y" := "x"
  <button onClick={() => { if (a == "x") { a := "y" } }}>{a}</button><Other />
}
```

Two sources of one name, each written under its own type.
