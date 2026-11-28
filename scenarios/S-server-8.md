# S-server-8 — a `ref` reads the screen; Solid 2.0.4 shows an earlier `ref`'s write to some (DV-28)

Rules exercised: SC-4c, SC-4, SC-4b, W-6, H-10, 07 §4, SV-2; DV-28.

A `ref`'s closure is a handler's (SC-4): it reads the screen, as a click does (H-10), and the `ref`s Solid calls in one
pass all read it as the pass found it — none sees what another wrote in the same pass. An anchor stores its element
(`anchor := 1` here) and a popover reads it in its own `ref`: the popover reads the value before. What a `ref` writes is
in the frame that shows its element; a server makes no element and calls no `ref` (SV-2), so its frame is the one before.

That is what Solid did until 2.0.0-rc.21, rendered and hydrated alike. Since rc.22 (#4768, refs run in the creating
pass) a client render shows an earlier `ref`'s write to a `ref` in a `for` row and in an `if` made in the same pass, and
hydration showed it to the `if` only, after throwing the served element away and calling its `ref` twice — a bug of
Solid's (DV-28, its hydrated half: issue #5232, fixed on main by #5235: hydration now keeps the element and reads the screen). The
language does not follow the client render (DV-28, its rendered half): the frames below are the screen's.

What a program writes that works the same on every Solid: a `ref` stores its own element (`pop := e`), and what needs
two `ref`s' elements reads them once the view is made — an equation, or an effect (`effect (anchor, pop) { … }`). A
`ref` that counts writes by a function of the value (`made := m => m + 1`): those writes compose whatever reads what.

## Program

```rx
export default component App() {
  source anchor := 0
  source seen := -1
  source rowSeen := -1
  source ifSeen := -1
  source made := 0
  both = anchor * 10 + made
  <p ref={(e: Element) => { anchor := 1 }}>a</p>
  <p ref={(e: Element) => { seen := anchor }}>{seen}</p>
  <ul>{for i in ["x"] { <li ref={(e: Element) => { rowSeen := anchor }}>{rowSeen}</li> }}</ul>
  {if made >= 0 { <i ref={(e: Element) => { ifSeen := anchor }}>{ifSeen}</i> }}
  <ol>{for i in ["b", "c"] { <li ref={(e: Element) => { made := m => m + 1 }}>{i}</li> }}</ol>
  <b>{both}</b>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `a000bc12` |
| 1 | handler `anchor := 2` | `a000bc22` |

## Server frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `a-1-1-1bc0` |

## Divergences (DV-28)

- oracle "Frames" instant 0: `a011bc12`
- oracle "Frames" instant 1: `a011bc22`

Rendering (DV-28's rendered half, Solid's rule at a grain the language does not transcribe, spec/10): the row's `ref` and the `if`'s
read the anchor's write (`1`); the sibling reads the screen (`0`), as the language says. The functional writes count `2`
everywhere, and so does the equation that reads both.

Hydrating (DV-28's hydrated half, Solid's bug): until the pin moved to Solid main 510bb8d01, the row read the screen and the `if`'s
content was made again, its `ref` called twice and reading the write (`a001bc12`, recorded as a `hydrated` divergence).
Solid's #5235 (issue #5232; not in a release yet) keeps the served element and calls its `ref` once, reading what the
page was served with: hydrated is `a000bc12`, the language's frame, and the rows are removed.
