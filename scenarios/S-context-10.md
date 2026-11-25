# S-context-10 — a context that holds a view: a choice of views, and a choice that is asked

Rules: RG-4c, SV-7d.

What the third independent review found refused and right (2026-11-26). A context that holds a view, given a choice
of the component's views (`c ? p.a : p.b`, `p.a ?? p.b`, `p.a || p.b`, with `undefined` for none), holds views and no
text: each is placed where the context is shown, so rows may go to a `<tbody>`. And a choice or a default of views is
asked as one view is: `if p.l ?? p.r`, `if c ? p.l : p.r`.

The program: a table whose rows are one of two views its root was given.

## Program

```rx
context body: View
component Part() { <table><tbody>{use body}</tbody></table> }
component Rt(p: { b?: View; c?: View; z: boolean; children?: View }) { provide body = p.z ? p.b : p.c
  <div>{p.children}</div> }
component Give(p: { children: View; z: boolean }) { <Rt z={p.z} b={p.children} c={p.children}><Part /></Rt> }
export default component App() { source n := "A"
  <button onClick={() => { n := "B" }}>t</button><Give z={n != "B"}><tr><td>{n}</td></tr></Give> }
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `tA` |  |
| 1 | handler `n := "B"` | `tB` |  |

## Variant: one view or none

```rx
context body: View
component Part() { <table><tbody>{use body}</tbody></table> }
component Rt(p: { b?: View; z: boolean; children?: View }) { provide body = p.z ? p.b : undefined
  <div>{p.children}</div> }
component Give(p: { children: View; z: boolean }) { <Rt z={p.z} b={p.children}><Part /></Rt> }
export default component App() { source n := "A"
  <button onClick={() => { n := "B" }}>t</button><Give z={n != "B"}><tr><td>{n}</td></tr></Give> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `tA` |  |
| 1 | handler `n := "B"` | `t` |  |

## Variant: the first that was given

```rx
context body: View
component Part() { <table><tbody>{use body}</tbody></table> }
component Rt(p: { b?: View; c?: View; children?: View }) { provide body = p.b ?? p.c
  <div>{p.children}</div> }
component Give(p: { children: View }) { <Rt c={p.children}><Part /></Rt> }
export default component App() { source n := "A"
  <button onClick={() => { n := "B" }}>t</button><Give><tr><td>{n}</td></tr></Give> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `tA` |  |
| 1 | handler `n := "B"` | `tB` |  |

## Variant: a default of views is asked as a view is

```rx
component W(p: { l?: View; r?: View }) { {if p.l ?? p.r { <i>Y</i> } else { <i>N</i> }}{p.l ?? p.r ?? "D"} }
export default component App() { source n := "A"
  <button onClick={() => { n := "B" }}>t</button><W r={n == "B" ? "R" : undefined} /> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `tND` |  |
| 1 | handler `n := "B"` | `tYR` |  |

## Variant: a choice of views is asked as a view is

```rx
component W(p: { l?: View; r?: View; z: boolean }) { {if p.z ? p.l : p.r { <i>Y</i> } else { <i>N</i> }} }
export default component App() { source n := "A"
  <button onClick={() => { n := "B" }}>t</button><W z={n == "A"} r="R" /> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `tN` |  |
| 1 | handler `n := "B"` | `tY` |  |

## Rejected variants

A flag before the view: where the flag is false the context holds `false`, which is shown as text, and text is not a
row.

```rx
-- reject: CONTENT_MODEL
context body: View
component Part() { <table><tbody>{use body}</tbody></table> }
component Rt(p: { b?: View; z: boolean; children?: View }) { provide body = p.z && p.b
  <div>{p.children}</div> }
component Give(p: { children: View; z: boolean }) { <Rt z={p.z} b={p.children}><Part /></Rt> }
export default component App() { <Give z={true}><tr><td>a</td></tr></Give> }
```

`null` is a value too, and is shown:

```rx
-- reject: CONTENT_MODEL
context body: View
component Part() { <table><tbody>{use body}</tbody></table> }
component Rt(p: { b?: View; z: boolean; children?: View }) { provide body = p.z ? p.b : null
  <div>{p.children}</div> }
component Give(p: { children: View; z: boolean }) { <Rt z={p.z} b={p.children}><Part /></Rt> }
export default component App() { <Give z={true}><tr><td>a</td></tr></Give> }
```
