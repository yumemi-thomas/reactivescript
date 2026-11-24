# S-module-26 — where a package's declaration is found

Rules: MO-8k, MO-10c, MO-8b, MO-11a.

A package import's `.d.rx` is looked up in four places, and the first that
exists is the declaration (MO-8k):

1. the project's, `rx-types/<spec>.d.rx`, in the importer's directory or one
   above it — so a package that ships nothing needs no re-export file, and a
   wrong shipped declaration can be overridden;
2. the package's own, beside the file the import resolves to (MO-10c);
3. a shared one, `node_modules/@rx-types/<scope>__<name>/index.d.rx` (a
   subpath: `<subpath>.d.rx`), as `@types` is for TypeScript;
4. a generated one, `node_modules/.rx-types/<spec>.d.rx`, which the tooling
   drafts from the package's own types (MO-8l).

The compiled import stays `from "<spec>"`, for the bundler (MO-8c).

## Modules

```json
-- module: ./node_modules/@demo/kit/package.json
{ "name": "@demo/kit", "exports": { ".": { "solid": "./dist/index.jsx", "default": "./dist/index.js" } } }
```

```rx
-- module: ./node_modules/@demo/kit/dist/index.d.rx
// shipped by the package — but it says `now` is pure, and it is not
export pure fn now(): number
export component Badge(props: { label: string })
```

```rx
-- module: ./rx-types/@demo/kit.d.rx
// the project's: it wins over the shipped one
export fn now(): number
export component Badge(props: { label: string })
```

```rx
-- module: ./node_modules/@rx-types/demo__charts/index.d.rx
// a shared declaration for @demo/charts, which ships none
export component Chart(props: { points: number[] })
```

```rx
-- module: ./node_modules/@rx-types/demo__charts/bars.d.rx
export component Bars(props: { points: number[] })
```

```rx
-- module: ./node_modules/.rx-types/@demo/gauge.d.rx
//@ generated from @demo/gauge's types (MO-8l)
export component Gauge(props: { value: number })
export fn readGauge(): number
```

```json
-- module: ./node_modules/@demo/pat/package.json
{ "name": "@demo/pat", "exports": { "./*": "./general/*.js", "./feature/*": "./special/*.js" } }
```

```rx
-- module: ./node_modules/@demo/pat/special/x.d.rx
// what `@demo/pat/feature/x` resolves to: `./feature/*` is the more specific pattern
export component Special(props: { on: boolean })
```

```rx
-- module: ./node_modules/@demo/pat/general/feature/x.d.rx
// what `./*` alone would give: not the file Node loads
export component General(props: { on: boolean })
```

A package's `exports` patterns are matched as Node matches them: of the
keys whose `*` the subpath fits, the one with the longest part before the
`*` wins, whatever their order (`PATTERN_KEY_COMPARE`), so
`@demo/pat/feature/x` is `special/x.js` and its declaration
`special/x.d.rx`.

## Program

```rx
import { Badge } from "@demo/kit"
import { Chart } from "@demo/charts"
import { Bars } from "@demo/charts/bars"
import { Gauge } from "@demo/gauge"
import { Special } from "@demo/pat/feature/x"
export default component App() {
  <Badge label="new" /> <Chart points={[1, 2, 3]} /> <Bars points={[4]} /> <Gauge value={3} /> <Special on={true} />
}
```

Accepted: each component is declared, by the project (`Badge`), a shared
declaration (`Chart`, and `Bars` by its subpath) and a generated one
(`Gauge`). The runners that execute have no such packages to run.

## Rejected variants

```rx
-- reject: IO_IN_REACTIVE
import { now } from "@demo/kit"
export default component App() {
  t = now()
  <p>{t}</p>
}
```

The project's declaration is the one read: there `now` is io, so calling it
in reactive scope is refused, although the shipped file says `pure`.

```rx
-- reject: NOT_EXPORTED
import { Pie } from "@demo/charts"
export default component App() {
  <Pie />
}
```

The shared declaration is the row (MO-8b): it declares no `Pie`.

```rx
-- reject: UNKNOWN_COMPONENT
import { Dial } from "@demo/dial"
export default component App() {
  <Dial />
}
```

`@demo/dial` has no declaration in any of the four places: a JS import with
none is not a component (MO-11a).

```rx
-- reject: IO_IN_REACTIVE
import { readGauge } from "@demo/gauge"
export default component App() {
  v = readGauge()
  <p>{v}</p>
}
```

A generated draft never guesses `pure` (MO-8l): `readGauge` is io until a
person says so, at the import or as `pure fn` in
`rx-types/@demo/gauge.d.rx`, which the message says.

```rx
-- accept
import pure { readGauge, Meter } from "@demo/gauge" fails Error
export default component App() {
  v = readGauge()
  <p>{v} {Meter.of(1)}</p>
}
```

What the import says of a draft stands, as with no declaration, and a name
the draft has no row for (`Meter`, a class) is an undeclared import (MO-8l).

```rx
-- reject: UNKNOWN_COMPONENT
import { Dial } from "@demo/gauge"
export default component App() {
  <Dial />
}
```

The generated draft declares no `Dial`: it is an undeclared import, and no
component.

```rx
-- reject: NOT_EXPORTED
import { General } from "@demo/pat/feature/x"
export default component App() {
  <General on={true} />
}
```

`general/feature/x.d.rx` is not the declaration: `./*` is the less specific
pattern, though it comes first.
