# S-server-8 — a `ref` reads nothing another `ref` of its pass writes

Rules exercised: SC-4c, SC-4, SC-4b, W-6, 07 §4, SV-2.

Solid calls the `ref`s of one pass in an order the language does not fix: the elements of one template in their order,
and the rows of a list after them when the page is rendered but among them when a served page is taken over. So what
one `ref` reads of a source another `ref` writes in the same pass — or of one it writes itself in each row of a `for`
— is not the same rendered and hydrated (measured: two siblings read the value before in both, the interpreter the
write; a `ref` in a row reads the write rendered and the value before hydrated; one in an `if` the write in both). No
runtime makes them agree, so that reading is refused (`REF_READS_REF_WRITE`). A write by a function of the value
(`made := m => m + 1`) reads nothing in the `ref`: the writes compose in any order. What depends on two `ref`s' writes
is read once the view is made: here an equation (`both`), which every runner computes from both writes.

A server makes no element and calls no `ref` (SV-2): its frame is the one before them.

## Program

```rx
component Row(props: { ref?: (e: Element) => void; label: string }) {
  <li ref={props.ref}>{props.label}</li>
}
export default component App() {
  source made := 0
  source top := 0
  both = made + top * 10
  <p ref={(e: Element) => { top := 1 }}>{made}/{top}/{both}</p>
  <ul>{for i in ["a", "b", "c"] { <Row label={i} ref={(e: Element) => { made := m => m + 1 }} /> }}</ul>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `3/1/13abc` |
| 1 | handler `top := 2` | `3/2/23abc` |

## Server frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `0/0/0abc` |

## Rejected variants

```rx
-- reject: REF_READS_REF_WRITE
export default component App() {
  source top := 0
  source seen := -1
  <p ref={(e: Element) => { top := 1 }}>a</p>
  <p ref={(e: Element) => { seen := top }}>{seen}</p>
}
```

Two siblings: rendered and hydrated the second reads `0`, the interpreter `1`. Write `seen = top`, an equation.

```rx
-- reject: REF_READS_REF_WRITE
export default component App() {
  source made := 0
  <ul>{for i in ["a", "b", "c"] { <li ref={(e: Element) => { made := made + 1 }}>{i}</li> }}</ul>
  <p>{made}</p>
}
```

One `ref`, in each row: rendered `3`, hydrated `1`. Write `made := m => m + 1`.

```rx
-- reject: REF_READS_REF_WRITE
export default component App() {
  source top := 0
  source seen := -1
  twice = top * 2
  <p ref={(e: Element) => { top := 1 }}>a</p>
  <ul>{for i in [1] { <li ref={(e: Element) => { seen := twice }}>{seen}</li> }}</ul>
}
```

Through an equation, from a row: rendered `2`, hydrated `0`.

```rx
-- reject: REF_READS_REF_WRITE
component Row(props: { ref?: (e: Element) => void }) {
  <li ref={props.ref}>r</li>
}
export default component App() {
  source top := 0
  source seen := -1
  action put(e: Element) { top := 1 }
  <p ref={put}>a</p>
  <Row ref={(e: Element) => { [1].forEach(x => { seen := top }) }} />
}
```

An action given by name writes; a closure given to a method that calls it at once reads; a `ref` given to a
component written in `.rx` is the element's (SC-4b).

A closure the `ref` makes for later (`e.addEventListener("click", () => { seen := top })`) reads when it is called, after
the pass: it is not refused.
