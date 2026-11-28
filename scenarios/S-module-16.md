# S-module-16 — components a JS fn is given, with no word of where it renders them: a table's cells

Rules: MO-11s, MO-8r, MO-11c, RG-7b, R-f-5.

## Modules

```rx
-- module: ./table.d.rx
// a headless table: column definitions carry cell components, and the app renders each cell with flexRender
export pure fn createTable(ref options: { data: any[]; columns: { key: string; cell: Component }[] }): any instantiates
export pure fn flexRender(comp: any, props: any): any
```

```rx
-- module: ./old.d.rx
// as it was written until 2026-11-23
export pure fn createTable(ref options: { data: any[]; columns: { key: string; cell: Component }[] }): any renders
```

```rx
-- module: ./cells.rx
import pure { fetch } from "./prelude"
export context accent: string
export component NameCell(props: { value: string; tone: string }) {
  <b class={props.tone}>{props.value}</b>
}
export component ThemedCell(props: { value: string }) {
  <b class={use accent}>{props.value}</b>
}
export component NoteCell(props: { value: string }) {
  note = await fetch(`note:${props.value}`)
  errored fallback(e) { <i>no note</i> } {
    loading fallback { <i>…</i> } { <i>{note}</i> }
  }
}
export component BareNoteCell(props: { value: string }) {
  note = await fetch(`note:${props.value}`)
  <i>{note}</i>
}
```

A JS fn that is not a factory may take components and render them itself:
a table's column definitions carry cell components, and the app's view
calls `flexRender(cell.column.cell, …)` for each cell. Its declaration
says nothing of where: a component given to a fn with no word is checked
the cautious way, under a root of its own (MO-11s) — it may fail to no
boundary but its own and use no provision but its own — and the fn's
result is a plain value, which travels as any value does.

`renders` after the signature said "where the result is bound" (MO-11l)
until 2026-11-23. One library wrote it (a table, through an adapter of the
app's own), and it is withdrawn (MO-8r): a cell is given what it needs as
its props, which is what a table's cell context is for.

## Program

```rx
import { createTable, flexRender } from "./table.js"
import { accent, NameCell, NoteCell } from "./cells.rx"
source kept: any := null
component Pagination(props: { table: any; onReady: (t: any) => void }) {
  <button onClick={() => { props.table.nextPage(); props.onReady(props.table) }}>next</button>
}

export default component App() {
  provide accent = "hot"
  tone = use accent
  people = [{ name: "Ann" }, { name: "Bo" }]
  table = createTable({ data: people, columns: [{ key: "name", cell: NameCell }, { key: "name", cell: NoteCell }] })
  <table><tbody>{for row in table.rows {
    <tr>{for cell in row.cells { <td>{flexRender(cell.column.cell, { value: cell.value, tone: tone })}</td> }}</tr>
  }}</tbody></table>
  <Pagination table={table} onReady={(t) => { kept := t }} />
}
```

Accepted: each cell stands by itself — `NameCell` is given its tone,
`NoteCell` holds and catches its own question — and the table is a value:
handed to a component, to a callback, kept in a source.

## Rejected variants

```rx
-- reject: CONTEXT_NOT_FOUND
import { createTable, flexRender } from "./table.js"
import { accent, ThemedCell } from "./cells.rx"
export default component App() {
  provide accent = "hot"
  table = createTable({ data: [], columns: [{ key: "name", cell: ThemedCell }] })
  <p>{table.rows.length}</p>
}
```

A cell that reads the app's context: checked under a root of its own, where
the `accent` provided above the table does not reach.

```rx
-- reject: UNHANDLED_FAILURE
import { createTable, flexRender } from "./table.js"
import { BareNoteCell } from "./cells.rx"
export default component App() {
  errored fallback(e) { <p>failed</p> } {
    table = createTable({ data: [], columns: [{ key: "name", cell: BareNoteCell }] })
    <p>{table.rows.length}</p>
  }
}
```

Nor does a boundary above the table: a cell that can fail catches it itself.

```rx
-- reject: CONTEXT_NOT_FOUND
import { flexRender } from "./table.js"
import { accent, ThemedCell } from "./cells.rx"
export default component App() {
  provide accent = "hot"
  <p>{flexRender(ThemedCell, { value: "x" })}</p>
}
```

The same for a component handed straight to `flexRender`.

```rx
-- reject: PARSE
import { createTable } from "./old.js"
export default component App() {
  table = createTable({ data: [], columns: [] })
  <p>{table.rows.length}</p>
}
```

`renders` alone is refused by name, with what says it now.
