# 08 — Two literal rows with one key

Needs nothing. ST-4d.

<!-- check branch=DUPLICATE_KEY upstream=ok -->
```rx
export default component App() {
  source rows key id := [{ id: 1, t: "a" }, { id: 1, t: "b" }]
  <ul>{for r in rows { <li>{r.t}</li> }}</ul>
}
```

**Proposal.** `DUPLICATE_KEY`: a keyed list written out with two rows of the same literal key. Keys are compared as the runtime compares them: `1` and `"1"` are two:

<!-- check branch=ok upstream=ok -->
```rx
export default component App() {
  source rows key id := [{ id: 1, t: "a" }, { id: "1", t: "b" }]
  <ul>{for r in rows { <li>{r.t}</li> }}</ul>
}
```

Rows from data are not seen. (The prototype's development build names them on the console.)

**Evidence.** One benchmark task. Nothing in upstream's 305 modules.

**Cost.** 54 lines in the crate, 37 in `ref/src` (ce28f0b, with a fix).

**Compatibility.** It refuses programs accepted today, each with two rows of one identity.

**Prototype.** S-check-3.
