# 16 — `fails(E)` before a returned accessor

Needs nothing. Weak.

## Problem

A library's accessor may throw. A declaration cannot say with what, so a program with no `errored` above it is accepted.

<!-- check branch=ok upstream=ok -->
```rx
import { createJson } from "./q.js"
export default component App() {
  q = createJson("a")
  <p>{q}</p>
}
-- file: ./q.d.rx
export pure fn createJson(url: string): ref string
```

## What upstream says, and what is withdrawn

**MO-10d**: *"Solid promises nothing about an accessor: any read can hold. A reader bound from a `ref` result is checked as a reader of a question (ST-5) … with whatever hold checks a reader of `await` gets … No declaration can
say an accessor never holds."* The earlier text of this proposal had `pending` before `ref`, so that a plain `ref` asks for no region. That is a reversal of MO-10d, and it is **withdrawn**: the word is not proposed. The prototype still has it.
A separate question to upstream: both checkers accept a bare `ref` reader in a client-only build (`--spa`) with no `loading` above it, on both trees. Does *"whatever hold checks a reader of `await` gets"* mean they should not?

<!-- check branch=ok upstream=ok flags=--spa -->
```rx
import { createJson } from "./q.js"
export default component App() {
  q = createJson("a")
  <p>{q}</p>
}
-- file: ./q.d.rx
export pure fn createJson(url: string): ref string
```

## Proposal

MO-10d says nothing of failures. `fails(E)` before a `ref` that is the **whole** result: its reader needs `E` discharged above it (R-f-5), as a question's does.

<!-- check branch=UNHANDLED_FAILURE upstream=ok -->
```rx
import { createJson } from "./q.js"
export default component App() {
  q = createJson("a")
  <p>{q}</p>
}
-- file: ./q.d.rx
export pure fn createJson(url: string): fails(Error) ref string
```

Not proposed: the word on a field of a record. It needed a rule that a user meets with no warning (`RESULT_AS_VALUE`). In a parameter's type the words are refused:

<!-- check branch=PARSE upstream=ok -->
```rx
import { q } from "./kit.js"
export default component App() { <p>{q("a")}</p> }
-- file: ./kit.d.rx
export pure fn q(a: pending string): string
```

## Evidence

Taken off (`words.mjs`): 6 rows in 6 programs; 0 correct programs refused; 13 variants of 6 programs missed, of which 0 are refused still by another diagnostic. All six rows are in modules of the apps' own, over five libraries. Three of the six are a whole result. No correct program needs it.

## Compatibility

Upstream's parser takes the words as the text of a type, and reads neither.

## Prototype

MO-10l (proposed id). S-module-11.
