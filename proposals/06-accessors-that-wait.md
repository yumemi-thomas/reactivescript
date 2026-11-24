# 06 — `pending` and `fails` before `ref`

## Problem

A library's accessor may wait or throw. A declaration cannot say it, so a program with no `errored` above it is accepted,
and its failure takes the page down.

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

Upstream's parser also accepts the two row words there, as the text of a type, and reads neither:

<!-- check branch=UNHANDLED_FAILURE upstream=ok -->
```rx
import { createJson } from "./q.js"
export default component App() {
  q = createJson("a")
  <p>{q}</p>
}
-- file: ./q.d.rx
export pure fn createJson(url: string): pending fails(Error) ref string
```

## Proposal

- A `ref` part of a declared result may have `pending`, `fails(E)`, or both, before its `ref`: the whole result, an item of
  its tuple, a field of its record (one level).
- A reader bound from such a part is checked as a question's reader is (ST-5): R-f-5 for its failures, CN-3d for its first
  load. A plain `ref` asks for no region, as today (MO-10d).
- Anywhere else in a row the words are a parse error, by name.
- **A record with such a part is read a part at a time.** Its name stands where a field is read from it, where it is given
  another name, where a destructuring names every such part, and where it is compared. Passed, stored, spread, shown or
  provided whole it is `RESULT_AS_VALUE`: its rows would be lost.
- An `.rx` component may take it whole, when its prop's type says the same rows: `props: { query: { data: pending
  fails(Error) Todo[] } }`.

<!-- check branch=RESULT_AS_VALUE upstream=ok -->
```rx
import { useQuery } from "./q.js"
export default component App() {
  source kept: any := null
  q = useQuery("a")
  <button onClick={() => { kept := q }}>{errored fallback(e) { <p>failed</p> } { loading fallback { <p>…</p> } { <p>{q.data}</p> } }}</button>
}
-- file: ./q.d.rx
export pure fn useQuery(key: string): { data: pending fails(Error) ref string; refetch: () => void }
```

## Evidence

`node proposals/words.mjs pending`: 6 rows in 6 programs. Taken off, no correct program is refused, and 13 mistakes are
accepted (6 `UNHANDLED_FAILURE`, 5 a client-only build's missing `loading`, 2 `RESULT_AS_VALUE`).

The limits of this evidence, plainly:

- All six rows are in small JS modules of the app's own, over five libraries (TanStack Query, solid-primitives' graphql, sse
  and geolocation, solid-use's fetch). In these libraries' own types the waiting value is a store's field or a function,
  which is no `ref` part.
- No code proves the words. No generated declaration has them.

## Cost

- 262 lines in the crate, 133 in `ref/src` (b6c904f, 793d9ae). The read-a-part-at-a-time rule is most of it, and 63c3332
  and 43e172e made it sound (shared with [08](08-draft.md)).
- Hard to learn: `RESULT_AS_VALUE`. It is the one rule here that a user meets with no warning.

## What it does not do

- A store's field that waits (`query.data` of TanStack Query as it is) is not said. A module of the app's own hands it out
  as an accessor.
- `rejects(E)` is what a promise rejects with. This is what a read throws.

## Alternatives tried and rejected

- *The words before a plain field* (`{ data: pending fails(Error) T }` in a declared result). Built first, and withdrawn:
  one library wrote it, and following the field through aliases, spreads and calls needed an analysis that three reviews
  found holes in (`spec/archive/rfc-revisions-2026-11-22.md`).
- *`holds` for `pending`.* Two words for one thing.
- *Make every `ref` `pending`.* It asks for a `loading` around every media query.

## Compatibility

The program above with the words is accepted upstream by accident, and refused here. Nothing in upstream's repository
writes it.

## Open questions

- Is it worth `RESULT_AS_VALUE`? Without records (a whole result or a tuple's item only), the rule is not needed, and three
  of the six rows still fit.
- A whole-store word would cover TanStack Query as it is. No form of it passed review.

## Prototype

MO-10f, MO-10l, MO-10k. S-module-11, 36. b6c904f, 63c3332, 43e172e, 793d9ae.
