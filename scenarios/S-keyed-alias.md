# S-keyed-alias — a keyed equation over a source with no key is reconciled by its own

Rules: ST-4a.

The source's own rows are replaced by position; the equation's are kept by their
key.

## Program

```rx
component Row(props: { name: string }) {
  source first := peek props.name
  <li>{props.name}{first}</li>
}
export default component App() {
  source input := [{ id: 1, name: "a" }, { id: 2, name: "b" }]
  rows key id = input
  <ul>{for row in rows { <Row name={row.name} /> }}</ul>
}
```

## Frames

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `aabb` |
| 1 | handler `input := [{ id: 2, name: "B" }, { id: 1, name: "A" }]` | `BbAa` |
| 2 | handler `input[0].name := "X"` | `XbAa` |
