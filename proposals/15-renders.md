# 15 — `renders(H)`: rendered later, beneath a component of the library (experimental)

Needs [12](12-context-rows.md) and [13](13-factories.md). Weak: it is the dearest word here, for few programs.

<!-- check branch=ok upstream=PARSE -->
```rx
import { Toaster, toast } from "./kit.js"
context theme: string
component Saved() { t = use theme
  <p>{t}</p> }
export default component App() {
  provide theme = "dark"
  <Toaster />
  <button onClick={() => { toast(Saved) }}>save</button>
}
-- file: ./kit.d.rx
export component Toaster(props: {})
export fn toast(message: Component): number renders(Toaster)
```

**Proposal.** `renders(H)` after a fn's signature names a component of the same file. What the fn is given is rendered later beneath an application of H, and is checked among H's children. RG-7b's *beneath* is then a
place of the program.

**Which application.** With several of H, the library chooses (an id, the nearest). So a need is refused only where **no** application meets it. The first version held a call to every one, and refused this:

<!-- check branch=ok upstream=PARSE -->
```rx
import { Toaster, toast } from "./kit.js"
context theme: string
component Saved() { t = use theme
  <p>{t}</p> }
component Relevant() {
  provide theme = "dark"
  <Toaster id="good" />
  <button onClick={() => { toast(Saved, "good") }}>save</button>
}
export default component App() {
  <Toaster id="other" />
  <Relevant />
}
-- file: ./kit.d.rx
export component Toaster(props: { id: string })
export fn toast(message: Component, id: string): number renders(Toaster)
```

Known gap: a call for the other one is accepted, and throws when it runs.

**Evidence.** Taken off (`words.mjs`): 5 rows in 4 programs; 4 correct programs refused; 7 variants of 3 programs missed, of which 0 are refused still by another diagnostic. Kobalte's toaster (alpha), solid-sonner (stable), TanStack Router's code routes (release candidate), and one module of the app's own.

**Cost.** 748 lines in the crate, 213 in `ref/src` (d0c28e5), and two rows in a printed signature.

**The other way.** A message in a source, and the list in markup. Is the word worth it for toasts?

**Prototype.** MO-11u (proposed id). S-module-22.
