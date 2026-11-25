# S-surface-12 — a word of the language as a name

Rules: W-1, W-6, AC-3.

A declaration takes a word of the language as a name where no form of the
language begins with it there; it is then read and written as any name is:
no statement has `:=` right after its word.

## Program

```rx
export default component App() {
  source on := false
  source fallback := { n: 1 }
  source effect := 1
  source refresh := "a"
  <p>{on} {fallback.n} {effect} {refresh}</p>
}
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `false 1 1 a` |  |
| 1 | handler `on := !on` | `true 1 1 a` |  |
| 2 | handler `effect := v => v + 1; refresh := "b"` | `true 1 2 b` |  |
| 3 | handler `fallback.n := 2` | `true 2 2 b` |  |
