# S-pre-1 — what `pre` keeps of a list is the list it was

Rules exercised: C-2, ST-2a, RG-6b, MO-2c.

## Modules

```rx
-- module: ./tags.rx
export source tags: string[] := ["a"]
export action setTags(xs: string[]) { tags := xs }
export fn useTrail(ref xs: string[]) {
  trail = [...(pre trail -> []), xs]
  str(trail)
}
export fn useBefore(ref n: number, start: number): number { p = pre n -> start
  p }
```

## Program

```rx
import { tags, setTags, useTrail, useBefore } from "./tags.rx"
fn step(log: any, now: any) => [...log, { now: now }]
export default component App() {
  source keys: string[] := []
  source n := 0
  source other := 0
  sequence = [...(pre sequence -> []), keys]
  counts = [...(pre counts -> []), n]
  log = step(pre log -> [], keys)
  fields: any = { at: n, was: pre fields -> null, keys: keys }
  before = pre keys -> ["none"]
  wasTags = pre tags -> []
  trail = useTrail(keys)
  wasN = useBefore(n, -1)
  <p>{str(sequence)} {str(counts)} {len(log)} {str(fields.was == null ? null : fields.was.keys)} {str(before)} {str(wasTags)} {trail} {wasN} {other}</p>
}
```

Each entry is the list as it was when it was added: a write of `keys` replaces it (ST-2a), and the entries before are
those lists still. One instant adds one entry, however often the equation is computed in it; an unrelated write adds none.

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `[[]] [0] 1 null ["none"] [] [[]] -1 0` |
| 1 | handler `keys := ["A"]` | `[[],["A"]] [0] 2 [] [] [] [[],["A"]] -1 0` |
| 2 | handler `keys := ["A", "B"]` | `[[],["A"],["A","B"]] [0] 3 ["A"] ["A"] [] [[],["A"],["A","B"]] -1 0` |
| 3 | handler `other := 1` | `[[],["A"],["A","B"]] [0] 3 ["A"] ["A"] [] [[],["A"],["A","B"]] -1 1` |
| 4 | handler `n := 1; keys := ["C"]` | `[[],["A"],["A","B"],["C"]] [0,1] 4 ["A","B"] ["A","B"] [] [[],["A"],["A","B"],["C"]] 0 1` |
| 5 | handler `setTags(["b"])` | `[[],["A"],["A","B"],["C"]] [0,1] 4 ["A","B"] ["A","B"] ["a"] [[],["A"],["A","B"],["C"]] 0 1` |

Found by rewriting solid-primitives in `.rx` (2026-11-24): the compiled program kept the store, so every entry was the
latest list (and an equation that only held the list did not follow its write); the interpreter added an entry each time
it settled an instant. `pre` of a `ref` parameter, and of an import, was accepted and not compiled.

## Rejected variants

`props` is read a field at a time:

```rx
-- reject: PRE_OF_NON_REACTIVE
component Kid(props: { n: number }) { was = pre props -> null
  <p>{str(was)}</p> }
export default component App() { <Kid n={1} /> }
```
