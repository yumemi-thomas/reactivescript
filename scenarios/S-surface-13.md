# S-surface-13 — a spread after an attribute

Rules exercised: 07 §4, RG-4c, E-6.

Among the attributes, the last part that **has** a field gives it. A spread that has the field gives it though its value
is `undefined`; one that does not have it leaves the attribute before it standing. When the spread's value changes so
that the field is no longer there, the attribute stands again. (The interpreter read a field that was there and
`undefined` as one that was not there, and kept the spread's answer: found as `p2-spr-over`.)

## Program

```rx
component Q(p: { l?: string }) { <p>{p.l ?? "-"}</p> }
export default component App() { source s := true
  <Q l="o" {...(s ? { l: undefined } : {})} /> }
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `-` |
| 1 | handler `s := false` | `o` |
| 2 | handler `s := true` | `-` |

## Variant: a view: whether one was given follows the spread

```rx
component Q(p: { l?: View }) { <p>{if p.l { <b>y</b> } else { <i>n</i> }}{p.l}</p> }
export default component App() { source s := true
  <Q l="o" {...(s ? { l: undefined } : {})} /> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `n` |
| 1 | handler `s := false` | `yo` |
| 2 | handler `s := true` | `n` |

## Variant: a record with a name

```rx
component Q(p: { l?: View }) { <p>{p.l ?? "-"}</p> }
export default component App() { source s := false
  r = s ? { l: undefined } : {}
  <Q l="o" {...r} /> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `o` |
| 1 | handler `s := true` | `-` |
| 2 | handler `s := false` | `o` |

## Variant: two spreads

```rx
component Q(p: { l?: string }) { <p>{p.l ?? "-"}</p> }
export default component App() { source s := true
  a = { l: "a" }
  b = s ? { l: undefined } : {}
  <Q {...a} {...b} /> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `-` |
| 1 | handler `s := false` | `a` |
| 2 | handler `s := true` | `-` |

## Variant: an attribute after the spread

```rx
component Q(p: { l?: string }) { <p>{p.l == undefined ? "U" : p.l}</p> }
export default component App() { source s := true
  <Q {...(s ? { l: undefined } : { l: "z" })} l={s ? "o" : undefined} /> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `o` |
| 1 | handler `s := false` | `U` |
| 2 | handler `s := true` | `o` |

## Variant: `null` is a value

```rx
component Q(p: { l?: View }) { <p>{p.l ?? "-"}</p> }
export default component App() { source s := true
  <Q l="o" {...(s ? { l: null } : {})} /> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `-` |
| 1 | handler `s := false` | `o` |
| 2 | handler `s := true` | `-` |

## Variant: through a rest

```rx
component Q(p: { l?: string; k?: string }) { { k, ...rest } = p
  <p>{rest.l ?? "-"}{k ?? ""}</p> }
export default component App() { source s := false
  <Q l="o" {...(s ? { l: undefined, k: "k" } : { k: "j" })} /> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `oj` |
| 1 | handler `s := true` | `-k` |
| 2 | handler `s := false` | `oj` |
