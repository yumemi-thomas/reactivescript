# S-module-16 — components a JS fn renders where its result is bound: `renders`

Rules: MO-11l, MO-11s, MO-11c, MO-11g, DV-24, RG-7b, R-f-5.

## Modules

```rx
-- module: ./table.d.rx
// a headless table: column definitions carry cell components, and the app renders each cell with flexRender
export pure fn createTable(ref options: { data: any[]; columns: { key: string; cell: Component }[] }): any renders
export pure fn flexRender(comp: any, props: any): any
```

```rx
-- module: ./cells.rx
import pure { fetch } from "./prelude"
export context accent: string
export component NameCell(props: { value: string }) {
  <b class={use accent}>{props.value}</b>
}
export component NoteCell(props: { value: string }) {
  note = await fetch(`note:${props.value}`)
  <i>{note}</i>
}
```

A JS fn that is not a factory may still take components, and render them
itself: a table's column definitions carry cell components, and the app's
view calls `flexRender(cell.column.cell, …)` for each cell. `renders` on its
declaration says so (MO-11l): the components in its argument literals are
values there (as in a factory's, MO-11c, MO-11g), and they are checked as
applied where its result is bound, among that region's children, which is
where the app renders the table (DV-24's assumption, at the binding instead
of an application). `renders` implies `instantiates`.

So the result is rendered where it is bound, and nowhere else (revised
2026-11-21 after review): the binding is where its components were
checked. A result that travels — passed to a component's prop, provided,
exported, written to a source, passed to a call, or aliased by an equation
that does one of those — could be rendered under other boundaries and
providers, so it is refused (`RENDERS_ESCAPES`). A library whose result is
rendered somewhere else says where: `renders(later)` with a component prop
that `renders` it (MO-11o, the requirements carried to that render), or
`renders(root, …)` for a root of its own (MO-11n). Reading through it
(`table.rows`, `cell.column.cell`) is rendering it here.

## Program

```rx
import { createTable, flexRender } from "./table.js"
import { accent, NameCell, NoteCell } from "./cells.rx"

export default component App() {
  provide accent = "hot"
  people = [{ name: "Ann" }, { name: "Bo" }]
  errored fallback(e) { <p>failed</p> } {
    loading fallback { <p>loading…</p> } {
      table = createTable({ data: people, columns: [{ key: "name", cell: NameCell }, { key: "name", cell: NoteCell }] })
      <table><tbody>{for row in table.rows {
        <tr>{for cell in row.cells { <td>{flexRender(cell.column.cell, { value: cell.value })}</td> }}</tr>
      }}</tbody></table>
    }
  }
}
```

Accepted: `NameCell`'s `accent` is provided above the binding, and
`NoteCell`'s failure is discharged by the `errored` above it.

## Rejected variants

```rx
-- reject: CONTEXT_NOT_FOUND
import { createTable, flexRender } from "./table.js"
import { NameCell } from "./cells.rx"
export default component App() {
  table = createTable({ data: [], columns: [{ key: "name", cell: NameCell }] })
  <p>{table.rows.length}</p>
}
```

The cell is checked where the table is made, with no `accent` above it.

```rx
-- reject: UNHANDLED_FAILURE
import { createTable, flexRender } from "./table.js"
import { NoteCell } from "./cells.rx"
export default component App() {
  table = createTable({ data: [], columns: [{ key: "name", cell: NoteCell }] })
  <p>{table.rows.length}</p>
}
```

`NoteCell`'s failure escapes to the binding's region.

```rx
-- reject: CONTEXT_NOT_FOUND
import { flexRender } from "./table.js"
import { accent, NameCell } from "./cells.rx"
export default component App() {
  provide accent = "hot"
  <p>{flexRender(NameCell, { value: "x" })}</p>
}
```

`flexRender` says nothing of where it renders what it is given (it is not
declared `renders`), so `NameCell` is checked the most cautious way: under
a root of its own (MO-11s), where the `accent` provided above the call does
not reach.

```rx
-- reject: RENDERS_ESCAPES
import { createTable, flexRender } from "./table.js"
import { accent, NameCell } from "./cells.rx"
component Grid(props: { table: any }) {
  <table><tbody>{for row in props.table.rows { <tr>{for cell in row.cells { <td>{flexRender(cell.column.cell, { value: cell.value })}</td> }}</tr> }}</tbody></table>
}
export default component App() {
  provide accent = "hot"
  table = createTable({ data: [{ name: "Ann" }], columns: [{ key: "name", cell: NameCell }] })
  <Grid table={table} />
}
```

`Grid` renders the cells, not `App`'s view: whatever `Grid` is under (a
boundary of its own, or none, a provider or none) is where they run.

```rx
-- reject: RENDERS_ESCAPES
import { createTable, flexRender } from "./table.js"
import { accent, NameCell } from "./cells.rx"
context grid: any
export default component App() {
  provide accent = "hot"
  table = createTable({ data: [{ name: "Ann" }], columns: [{ key: "name", cell: NameCell }] })
  t = table
  provide grid = t
  <p>{len(t.rows)}</p>
}
```

An alias travels as the value does.
