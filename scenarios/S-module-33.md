# S-module-33 — an `.rx` package: its shipped `.d.rx` is the printed signature, read as one

Rules: MO-13a, MO-13b, MO-9b, MO-8k, MO-10c, MO-2, MO-4a, MO-7, R-f-5, RG-7b, AC-4.

A package written in `.rx` ships, beside each compiled module, the
signature the compiler printed for it. Its first line says so:
`//@ signature index.rx`. A declaration found for a JS import (MO-8a,
MO-8k) that carries that line is not a JS module's declaration: it is the
signature of the `.rx` module the JavaScript was compiled from, read as
MO-9b reads one, and the import is an `.rx` import in everything but its
specifier. Without the line a `.d.rx` means what it meant (MO-8a).

## Modules

```json
-- module: ./node_modules/@demo/rates/package.json
{ "name": "@demo/rates", "exports": { ".": { "browser": "./dist/index.js", "node": "./dist/index.server.js", "default": "./dist/index.js" }, "./theme": { "browser": "./dist/theme.js", "node": "./dist/theme.server.js", "default": "./dist/theme.js" } } }
```

```rx
-- module: ./node_modules/@demo/rates/dist/theme.d.rx
//@ signature theme.rx (09-modules MO-3, MO-13a). Sources are read-only to importers (MO-2).
export type Theme
export context theme: Theme
export component ThemeProvider(props: { children: provides(./theme.rx#theme) }) keeps(children) shape(roots section; closes-p; children-at section)
```

```rx
-- module: ./node_modules/@demo/rates/dist/index.d.rx
//@ signature index.rx (09-modules MO-3, MO-13a). Sources are read-only to importers (MO-2).
export error Offline(code)
export source code := …
export source rate: pending fails(Error | Offline) = …
export action pick
export pure fn useLabel(ref amount: number) instantiates
export pure fn parse(text)
export component Badge(props: { label }) uses(./theme.rx#theme) shape(roots b)
export component Rate(props: {}) fails(Error | Offline) shape(roots span)
```

Both files are what `rxc`'s library build wrote from the package's
`src/theme.rx` and `src/index.rx` (MO-13e). `index.rx` imports `theme` from
`./theme.rx`, so `Badge`'s need is printed relative to its own module,
`uses(./theme.rx#theme)`: read where the package is installed, that is
`node_modules/@demo/rates/dist/theme.rx#theme`, the key of the context
`@demo/rates/theme` exports (MO-13b).

```json
-- module: ./node_modules/@demo/plain/package.json
{ "name": "@demo/plain", "exports": { ".": "./index.js" } }
```

```rx
-- module: ./node_modules/@demo/plain/index.d.rx
// a JS module's declaration: no marker, so MO-8a's defaults
export pure fn parse(text: string): Promise<number>
```

```rx
-- module: ./vendor/local.d.rx
//@ signature local.rx (09-modules MO-3, MO-13a). Sources are read-only to importers (MO-2).
export source hits := …
export action hit
```

`vendor/local.d.rx` is beside a compiled `./vendor/local.js` (MO-8a): the
marker is read there as it is in a package.

## Program

```rx
import { code, rate, pick, useLabel, parse, Badge, Rate, Offline } from "@demo/rates"
import { ThemeProvider, theme } from "@demo/rates/theme"
import { hits, hit } from "./vendor/local.js"

component Mine() {
  provide theme = { accent: "teal" }
  <Badge label="mine" />
}

export default component App() {
  source amount := 2
  label = useLabel(amount)
  parsed = await parse("12")
  <ThemeProvider accent="red">
    <Badge label={label} />
    <button onClick={() => { pick("USD"); hit() }}>{code} {hits} {parsed}</button>
    <button onClick={() => { refresh rate }}>again</button>
    {errored fallback(e) { <p>failed</p> } {
      {errored fallback(e: Offline) { <p>offline</p> } {
        {loading fallback { <p>…</p> } { <Rate /> <i>{rate}</i> }}
      }}
    }}
  </ThemeProvider>
  <Mine />
}
```

Accepted, and every row is the signature's: `code` and `hits` are
read-only sources, `rate` is a question that may wait and fail with
`Error | Offline` (both discharged), `pick` and `hit` are actions,
`useLabel` takes its first argument by reference and instantiates, `parse`
returns nothing that rejects (MO-9b: `rejects(…)` absent), `Badge` needs
the package's `theme` above it — provided by the package's own
`ThemeProvider`, and, in `Mine`, by the app itself with the context it
imported from `@demo/rates/theme` (MO-7: the same key). The runners that
execute have no such package to run; `bench/tasks/rx-package` builds one
and runs it (MO-13e).

## Rejected variants

```rx
-- reject: CONTEXT_NOT_FOUND
import { Badge } from "@demo/rates"
export default component App() {
  <Badge label="x" />
}
```

`uses(./theme.rx#theme)` across the package boundary: nothing above the
application provides the package's context (RG-7b, MO-13b).

```rx
-- reject: UNHANDLED_FAILURE
import { rate, Offline } from "@demo/rates"
export default component App() {
  errored fallback(e: Offline) { <p>offline</p> } {
    loading fallback { <p>…</p> } { <i>{rate}</i> }
  }
}
```

`rate: pending fails(Error | Offline)`: the typed boundary takes
`Offline`, and `Error` reaches the root (R-f-5).

```rx
-- reject: UNHANDLED_FAILURE
import { Rate } from "@demo/rates"
export default component App() {
  loading fallback { <p>…</p> } { <Rate /> }
}
```

A component's own `fails(…)` is what escapes its root, at each place it is
applied.

```rx
-- reject: WRITE_TO_NON_SOURCE
import { code } from "@demo/rates"
export default component App() {
  <button onClick={() => { code := "USD" }}>{code}</button>
}
```

MO-2a: a package's source is read-only to the app; `pick` is its write
interface.

```rx
-- reject: INVALID_REFRESH_TARGET
import { code } from "@demo/rates"
export default component App() {
  action again() { refresh code }
  <p>{code}</p>
}
```

`code := …` is a plain source and `rate = …` a question: the signature
says which (MO-9b), and a JS declaration has no row for either.

```rx
-- reject: IMPORT_ROW_MISMATCH
import { parse } from "@demo/rates" fails Offline
export default component App() {
  n = await parse("1")
  loading fallback { <p>…</p> } { <p>{n}</p> }
}
```

MO-4a: `fails` asserts rows at the JS boundary, and this import's rows are
an `.rx` module's.

```rx
-- reject: NOT_EXPORTED
import { rates } from "@demo/rates"
export default component App() {
  <p>{rates}</p>
}
```

```rx
-- reject: UNHANDLED_FAILURE
import { parse } from "@demo/plain"
export default component App() {
  n = await parse("1")
  loading fallback { <p>…</p> } { <p>{n}</p> }
}
```

The same row with no marker is a JS function's (MO-8a): absent,
`rejects(…)` is `Error`, so the awaited call can fail and nothing takes
it. From `@demo/rates`, the program above awaits `parse` under no
boundary.
