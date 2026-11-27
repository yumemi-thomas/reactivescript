# S-posture-3 — an attribute that probes is a reader of its own, in compiled code too (R-11a)

Rules: R-11, R-11a, V-1.

The fix `GUESS_WHILE_LOADING` suggests, `disabled={pending? detail}`, on a
button whose `<li>` reads the selection plainly (`class`, and the `*` in the
button). Each attribute is a reader of its own, so a click on another row
shows at once: the new row is marked and `loading on(sel)` shows its
fallback while `detail` loads. Solid's JSX compiler computes one template's
changing attributes in one render effect, where the probe would make the
whole pass read ahead and the click would wait, unseen, for the answer
(instant 3 showed `1*2one`); the emitters give the probing attribute an
effect of its own (`__rt.own`). Found by an author building from the guide
(DECISION.md, "Fix round after the hunts").

## Program

```rx
export default component App() {
  source sel: number | null := null
  detail = sel == null ? null : await fetch("d" + str(sel))
  errored fallback(e) { <p>bad</p> } {
  <ul>{for it in [1, 2] { <li class={sel == it ? "on" : "off"}><button disabled={pending? detail} onClick={() => { sel := it }}>{it}{sel == it ? "*" : ""}</button></li> }}</ul>
  {if sel == null { <p>none</p> } else { {loading on(sel) fallback { <i>wait</i> } { {if detail != null { <b>{detail}</b> }} }} }}
  }
}
```

## Frames

| instant | action                 | frame      |
| ------- | ---------------------- | ---------- |
| 0       | mount                  | `12none`   |
| 1       | handler `sel := 1`     | `1*2wait`  |
| 2       | resolve detail "one"   | `1*2one`   |
| 3       | handler `sel := 2`     | `12*wait`  |
| 4       | resolve detail "two"   | `12*two`   |

## Variant: the probe reached through a fn, on the element that reads the selection

```rx
export default component App() {
  source sel: number | null := null
  detail = sel == null ? null : await fetch("d" + str(sel))
  fn busyNow() => pending? detail
  errored fallback(e) { <p>bad</p> } {
  <ul>{for it in [1, 2] { <li><button class={sel == it ? "on" : "off"} disabled={busyNow()} ref={(el) => { }} onClick={() => { sel := it }}>{it}{sel == it ? "*" : ""}</button></li> }}</ul>
  {if sel == null { <p>none</p> } else { {loading on(sel) fallback { <i>wait</i> } { {if detail != null { <b>{detail}</b> }} }} }}
  }
}
```

| instant | action                 | frame      |
| ------- | ---------------------- | ---------- |
| 0       | mount                  | `12none`   |
| 1       | handler `sel := 1`     | `1*2wait`  |
| 2       | resolve detail "one"   | `1*2one`   |
| 3       | handler `sel := 2`     | `12*wait`  |
| 4       | resolve detail "two"   | `12*two`   |

The author's own `ref` is called first, with the element.
