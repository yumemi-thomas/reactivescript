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

So the result is rendered where it is bound, and nowhere else (ruled
2026-11-22): the binding is where its components were checked. The
checker keeps it there by one syntactic rule, with no value followed
(MO-10k). A value *may hold a part of the result* when its expression
mentions the result's name, or a name bound to such an expression: an
alias, a record or an array that holds it, a field read out of it
(`table.rows`), a row of a `for` over it, what a call given it returns, a
parameter of a closure handed it. The exceptions are what cannot hand it
on: an operand of an operator that makes a primitive (arithmetic, a
comparison, `!`), a template, a condition, `len(…)` and `str(…)`; and a
closure gives what it returns, not what it captures. Such a value is read
and rendered in the binding's own region, and may not leave it: passed to
a component's prop, provided, exported, written to a source, thrown, or
passed to a call that may keep it (an action of another module, an `io` JS
fn, a method of another value, a function the checker cannot name) is
`RENDERS_ESCAPES`. A
library whose result is rendered somewhere else says where:
`renders(later)` with a component prop that `renders` it (MO-11o, the
requirements carried to that render), or `renders(root, …)` for a root of
its own (MO-11n); one that says nothing is checked the cautious way
(MO-11s) and its result travels freely.

```rx
-- module: ./boxed.rx
import { createTable } from "./table.js"
import { NameCell } from "./cells.rx"
table = createTable({ data: [{ name: "Ann" }], columns: [{ key: "name", cell: NameCell }] })
export box = { table: table }
```

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
  box = { table: table }
  <Grid table={box.table} />
}
```

So does a record that holds it, and a field read back out of that record:
`box.table` is `table`.

```rx
-- reject: RENDERS_ESCAPES
import { createTable, flexRender } from "./table.js"
import { accent, NameCell } from "./cells.rx"
component Grid(props: { box: any }) {
  <table><tbody>{for row in props.box.table.rows { <tr>{for cell in row.cells { <td>{flexRender(cell.column.cell, { value: cell.value })}</td> }}</tr> }}</tbody></table>
}
export default component App() {
  provide accent = "hot"
  table = createTable({ data: [{ name: "Ann" }], columns: [{ key: "name", cell: NameCell }] })
  <Grid box={{ table: table }} />
}
```

Every value the prop may be is one it may pass on: a branch of `?:`,

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
  c = len(table.rows) > 0
  <Grid table={c ? table : null} />
}
```

of `??`,

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
  <Grid table={table ?? null} />
}
```

what a closure returns,

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
  get = () => table
  <Grid table={get()} />
}
```

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
  <Grid table={(() => table)()} />
}
```

a field read by a key the checker cannot know (any field),

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
  box = { table: table }
  k = "table"
  <Grid table={box[k]} />
}
```

and a closure that captures it, which the component may call (revised 2026-11-21 after review).

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
  f = () => table
  <Grid table={f} />
}
```

```rx
-- reject: RENDERS_ESCAPES
import { box } from "./boxed.rx"
import { accent } from "./cells.rx"
component Grid(props: { table: any }) {
  <p>{len(props.table.rows)}</p>
}
export default component App() {
  provide accent = "hot"
  <Grid table={box.table} />
}
```

An export is a way out too: a record exported from the module that bound
the table (`./boxed.rx`, `export box = { table: table }`) is refused there,
whatever module would read it.

A part of the result is the result's (ruled 2026-11-22): a path read out
of it may be the component itself (`table.rows[0].cells[0].column.cell`),
and the checker reads no types, so every part is kept where the whole is.

```rx
-- reject: RENDERS_ESCAPES
import { createTable, flexRender } from "./table.js"
import { accent, NameCell } from "./cells.rx"
component Rows(props: { rows: any }) {
  <table><tbody>{for row in props.rows { <tr>{for cell in row.cells { <td>{flexRender(cell.column.cell, { value: cell.value })}</td> }}</tr> }}</tbody></table>
}
export default component App() {
  provide accent = "hot"
  table = createTable({ data: [{ name: "Ann" }], columns: [{ key: "name", cell: NameCell }] })
  <Rows rows={table.rows} />
}
```

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
  <Grid table={{ rows: table.rows }} />
}
```

```rx
-- reject: RENDERS_ESCAPES
import { createTable, flexRender } from "./table.js"
import { accent, NameCell } from "./cells.rx"
component Rows(props: { rows: any }) {
  <p>{len(props.rows)}</p>
}
export default component App() {
  provide accent = "hot"
  table = createTable({ data: [{ name: "Ann" }], columns: [{ key: "name", cell: NameCell }] })
  { rows } = table
  <Rows rows={rows} />
}
```

```rx
-- reject: RENDERS_ESCAPES
import { createTable, flexRender } from "./table.js"
import { accent, NameCell } from "./cells.rx"
export default component App() {
  source held: any := null
  provide accent = "hot"
  table = createTable({ data: [{ name: "Ann" }], columns: [{ key: "name", cell: NameCell }] })
  <button onClick={() => { held := table.rows }}>keep</button>
  <p>{len(table.rows)}</p>
}
```

An element of an array that holds it is one too (the earlier revision
read a static index precisely; no index is, now: `arr[1]` may be the
table),

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
  arr = [table, 5]
  <p>{len(table.rows)}</p>
  <Grid table={arr[1]} />
}
```

and so is a row of a `for` over it,

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
  {for t in [table] { <Grid table={t} /> }}
}
```

what a call given it returns — whatever is called, however: a method, a
fn, a closure in a record, one made on the spot,

```rx
-- reject: RENDERS_ESCAPES
import { createTable, flexRender } from "./table.js"
import { accent, NameCell } from "./cells.rx"
fn keep(x) { x }
fn mk(x) { () => x }
component Grid(props: { a: any; b: any; c: any; d: any }) {
  <p>{len(props.a.rows)}</p>
}
export default component App() {
  provide accent = "hot"
  table = createTable({ data: [{ name: "Ann" }], columns: [{ key: "name", cell: NameCell }] })
  o = { f: (x) => x }
  <Grid a={keep(keep(table))} b={o.f(table)} c={mk(table)()} d={[].concat([table])[0]} />
}
```

and a parameter of a closure handed it.

```rx
-- reject: RENDERS_ESCAPES
import { createTable, flexRender } from "./table.js"
import { accent, NameCell } from "./cells.rx"
export default component App() {
  source held: any := null
  provide accent = "hot"
  table = createTable({ data: [{ name: "Ann" }], columns: [{ key: "name", cell: NameCell }] })
  <button onClick={() => { table.rows.forEach((row) => { held := row }) }}>keep</button>
  <p>{len(table.rows)}</p>
}
```

A call may keep what it is given. A fn, an action or a named closure of
this module is seen into: its parameter is what it is given, and its body
is checked with that. Here the action's write is the way out:

```rx
-- reject: RENDERS_ESCAPES
import { createTable, flexRender } from "./table.js"
import { accent, NameCell } from "./cells.rx"
source held: any := null
action stash(x) { held := x }
export default component App() {
  provide accent = "hot"
  table = createTable({ data: [{ name: "Ann" }], columns: [{ key: "name", cell: NameCell }] })
  <button onClick={() => { stash(table.rows[0]) }}>keep</button>
  <p>{len(table.rows)}</p>
}
```

A method of something else is not seen into, so the argument itself is
refused, in either scope: `xs.push(row)` keeps it,

```rx
-- reject: RENDERS_ESCAPES
import { createTable, flexRender } from "./table.js"
import { accent, NameCell } from "./cells.rx"
export default component App() {
  source held: any[] := []
  provide accent = "hot"
  table = createTable({ data: [{ name: "Ann" }], columns: [{ key: "name", cell: NameCell }] })
  <button onClick={() => { let xs = []; xs.push(table); held := xs }}>keep</button>
  <p>{len(table.rows)}</p>
}
```

and a function the checker cannot name — a prop, a parameter, a closure
held in a record — is how a value would be handed up to whatever applied
the component:

```rx
-- reject: RENDERS_ESCAPES
import { createTable, flexRender } from "./table.js"
import { accent, NameCell } from "./cells.rx"
component Inner(props: { report: (rows: any) => any }) {
  provide accent = "hot"
  table = createTable({ data: [{ name: "Ann" }], columns: [{ key: "name", cell: NameCell }] })
  <p>{props.report(table.rows)}</p>
}
export default component App() {
  <Inner report={(rows) => len(rows)} />
}
```

A thrown value goes to whichever boundary catches it:

```rx
-- reject: RENDERS_ESCAPES
import { createTable, flexRender } from "./table.js"
import { accent, NameCell } from "./cells.rx"
error Lost(row: any)
export default component App() {
  provide accent = "hot"
  table = createTable({ data: [{ name: "Ann" }], columns: [{ key: "name", cell: NameCell }] })
  first = len(table.rows) > 0 ? table.rows[0] : throw Lost(table)
  {errored fallback(e) { <p>lost</p> } { <p>{first.id}</p> }}
}
```

What is accepted is everything a table's own view does: reading and
rendering it, calling its methods from handlers — a closure gives what it
returns, and `() => { table.nextPage() }` returns nothing, so it may be a
component's prop — and passing on what is made of it, a primitive.

```rx
-- accept
import { createTable, flexRender } from "./table.js"
import { accent, NameCell } from "./cells.rx"
source selected := ""
action select(id) { selected := id }
fn label(row) { `${row.id}: ${len(row.cells)}` }
component Btn(props: { onPress: () => void; label: string }) {
  <button onClick={() => { props.onPress() }}>{props.label}</button>
}
component Count(props: { n: number; on: boolean; text: string }) {
  <small>{props.n} {props.on ? "on" : "off"} {props.text}</small>
}
export default component App() {
  provide accent = "hot"
  table = createTable({ data: [{ name: "Ann" }], columns: [{ key: "name", cell: NameCell }] })
  rows = table.rows
  <table><tbody>{for row in rows {
    <tr class={selected == str(row.id) ? "on" : ""} onClick={() => { select(str(row.id)) }}>
      {for cell in row.cells { <td>{flexRender(cell.column.cell, { value: cell.value })}</td> }}
      <td>{label(row)}</td>
    </tr>
  }}</tbody></table>
  <Btn label="next" onPress={() => { table.nextPage() }} />
  <Btn label={`page ${table.page + 1} of ${len(rows)}`} onPress={() => { table.setPage(table.page + 1) }} />
  <Count n={len(rows)} on={len(rows) > 0} text={str(table.title)} />
  <button onClick={() => { table.previousPage() }}>previous</button>
}
```

`label(row)` is a fn of this module given a row: its parameter is a part
of the table there, and its body only makes a string of it. `select` is
given `str(row.id)`, a primitive, which it may store.
