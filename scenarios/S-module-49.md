# S-module-49 — a function part of a declared result: `io` where it does something, a read where it only computes

Rules: MO-10b, R-io-3, SC-4, MO-8j.

## Modules

```rx
-- module: ./clip.d.rx
// calling it only computes: it makes the thing. What the thing's functions do is said part by part
export pure fn makeClipboard(): { read: () => string; write: io (text: string) => boolean; clear: () => void; size: ref number }
export pure fn counter(): [() => number, io () => number]
export pure fn nextId(): io () => number
export pure fn sizes(): { twice: (n: number) => number; reset: () => void }
```

A function part that answers nothing, or a promise, is called for what it does: it is io. One that answers a value is
a read, unless the row marks it `io`: `write` answers whether it wrote, and writes. The fn itself stays `pure` — a
component may call it in its body — and each part is what the row says, read off the result or bound by a name, in a
record, a tuple or as the whole result.

## Program

```rx
import { makeClipboard, counter, nextId, sizes } from "./clip.js"
export default component App() {
  c = makeClipboard()
  { read, write } = makeClipboard()
  [count, bump] = counter()
  next = nextId()
  s = sizes()
  source last := ""
  <p onClick={() => { if (write("y")) { last := c.read() }
    c.clear(); bump(); next(); s.reset() }}>{c.read()} {read()} {count()} {s.twice(c.size)} {last}</p>
  <button onClick={c.clear}>clear</button>
}
```

Accepted: the reads are in the view, what does something is in the handler. The runners that execute have no such
module to run.

## Rejected variants

```rx
-- reject: IO_IN_REACTIVE
import { makeClipboard } from "./clip.js"
export default component App() {
  c = makeClipboard()
  <p>{str(c.write("x"))}</p>
}
```

Marked `io`: it answers a value, and is still called for what it does.

```rx
-- reject: IO_IN_REACTIVE
import { counter } from "./clip.js"
export default component App() {
  [count, bump] = counter()
  <p>{count()} {bump()}</p>
}
```

Bound by a name, an item of a tuple.

```rx
-- reject: IO_IN_REACTIVE
import { nextId } from "./clip.js"
export default component App() {
  next = nextId()
  ids = [1, 2].map(next)
  <p>{ids.length}</p>
}
```

The whole result, given to what calls it while the call runs (MO-8j).

```rx
-- reject: IO_IN_REACTIVE
import { sizes } from "./clip.js"
export default component App() {
  { reset } = sizes()
  <p>{str(reset())}</p>
}
```

A part that answers nothing, bound by a name: of a fn that is no instantiation too.

```rx
-- reject: IO_IN_REACTIVE
import { makeClipboard } from "./clip.js"
export default component App() {
  { write } = makeClipboard()
  <button onClick={write("x")}>w</button>
}
```

A handler is passed, not called (SC-4).
