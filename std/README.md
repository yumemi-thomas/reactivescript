# `@reactivescript/std` (an experiment, not published)

JavaScript's own calculations and the browser's calls, as modules an `.rx` program imports. The language's rule:
"there are no globals (`Math`, `Date` and `window` are `UNBOUND` until imported) … The only way out of the language is an
import" (spec/10 SV-7a). Upstream names no such module: it says an import is the way out, not whose. Nothing here is the language's.

| module | what | surveyed packages (of 98) that use it |
| --- | --- | --- |
| `math` | `max` `min` `round` `floor` `abs` `ceil` `sqrt` `sin` `cos` `PI` `isInteger` `isFinite`; `num` (unary `+`) | 12 10 8 6 6 4 3 2 2 4 4 3 |
| `json` | `parse` `stringify` | 5 4 |
| `object` | `entries` `keys` `fromEntries` (a computed key: `fromEntries([[k, v]])`) `from` (Array's); `setOf` `mapOf` (`new Set`, `new Map`) | 19 14 3 7 |
| `is` | `isFunction` `isArray` `isString` `isObject` `isNumber` `isBoolean`, each a type predicate (`x is string`: TypeScript narrows); `cast<T>(x)`, JavaScript's `as` | 43 19 17 16 8 |
| `time` | `after` (setTimeout) `every` (setInterval) `soon` (queueMicrotask) `now` (Date.now) `elapsed` (performance.now) | 16 6 5 4 3 |
| `browser` | `on` `onWindow` `onDocument` (listeners), `onFrame`, `onResize`, `onMutation`, `onMedia`, `onVisible`, `onIntersect` | 42, 7 4 4 3 3 2 |
| `now` | `first` (the first value, hydration) `boxOf` `windowSize` `matches` `isVisible` | 8 7 4 3 3 |

Left out, used by one package each: storage, online, clipboard, geolocation, idle callbacks, `Object.values`, `Intl`. `Date` and
`Intl` answer by the machine's time zone and locale (SV-7c); `Math.random` is not a calculation.

- **A call that listens answers what stops it**, so an effect returns it. `browser` is `client`: it runs in no server code.
- **Words**: `pure` ×22, `handler` ×12, each proven from the code (`rx-declare --audit`: 34 of 34, none contradicted) and none contradicted by `rx-verify --dom` (the 12 callbacks held, the 22 `pure` read; two claims that are no word, the fields of `entries` and `fromEntries`, not run). `client` ×9 is a placement, held by nothing.
- **`now` has no declaration**: no tool proves a read of the browser `pure`, so the importer says it (`import pure { first, matches } …`).
  `await` of a `client` read is the language's way (SV-7b), but its result carries `fails(Error)`, which no row takes away.
- `node std/test/browser.mjs` (Chromium, 39 checks): each answers, stops, gives back its listener, observer or interval, and what it was given is collected.
