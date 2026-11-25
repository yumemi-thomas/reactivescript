# 27 — A context that holds a view

[26](26-children-are-shown.md) leaves one shape with no form that keeps the caller's program: a view given to one component and shown by a part that the *caller* places. Kobalte's `Select`, `Combobox` and `Pagination` are that shape: the root takes `itemComponent`, and `<Select.Listbox />`, written among the children, shows it. In 26 a context does not carry a view (`VIEW_NOT_SHOWN`), because nothing checked the places that show it. This proposal checks them. Prototyped on a local branch (`proto-children-rule`, not published), on top of 26.

<!-- frames branch=pass -->
```rx
type Opt = { value: string; label: string }
context item: (props: { item: Opt }) => View
context picked: { value: string; pick: (v: string) => void }
component Listbox(p: { options: Opt[] }) {
  <ul>{for o in p.options { <use.item item={o} /> }}</ul>
}
component Item(p: { item: Opt; children: View }) {
  s = use picked
  <li onClick={() => { s.pick(p.item.value) }}>{s.value == p.item.value ? "*" : ""}{p.children}</li>
}
component Select(p: { item: (props: { item: Opt }) => View; children: View }) {
  source value := ""
  action pick(v: string) { value := v }
  provide picked = { value: value, pick: pick }
  provide item = p.item
  <div>{p.children}</div>
}
export default component App() {
  <Select>{view item (props) { <Item item={props.item}>{props.item.label}</Item> }}<Listbox options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} /></Select>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `AB` |
| 1 | handler `value := "b"` | `A*B` |

## Proposal

1. **A context whose declared type is `View`, or a function giving one, holds a view.** `context slot: View`; `context item: (row: T) => View`, of one parameter or none. (A context's type may be a function's: the parser stopped at `=>`.)
2. **It is given a view the component was given.** `provide slot = props.children` (any form 26 accepts of a view: a name, a choice, a default; a value is text); `provide item = props.item` for one with a parameter, of a prop declared with the context's type, as it is.
3. **It is shown, and nothing else.** `{use slot}` in a view; `<use.item row={r} />` for one with a parameter, with what the context's type says. Read as a value, asked, kept, given on, provided again, read by an effect, a handler or a fn: `VIEW_NOT_SHOWN`.
4. **It is not exported.** It is provided and shown in the module that declares it. The components that provide and show it are exported, and what they say of it is in their printed signatures.
5. **Each place that shows it has its own** (26's rule 1): made there, owned there, disposed with it. What it reads from contexts, what it waits on and fails with are that place's, then the provider's.

## What is checked, and where

*At every place that shows it* (`{use slot}`, `<use.item … />`), for every view that may be the one shown there:

- **What the view uses, waits on and fails with** goes up from that place to its component's root, then from the block that holds the `provide` to the provider's root, then from the provider's application, as any view given to it. The provider's block is above every place that shows its view, so what it provides and catches counts; what is between the two (where the caller wrote the part) is not counted: a provision or a boundary the caller writes *around the part alone* does not discharge what the view needs. That is the one known place where a correct program is refused (below).
- **A provision on every path**: a part that shows the context where nothing provides it is `CONTEXT_NOT_FOUND`, by the rule of any context (a default is text).
- **HTML** (SV-7d): the view's elements are placed at each place that shows the context beneath the provider's application: through content, a component's own view, a view given on, a portal (whose place is the end of the document), and across modules by the components' signatures. A provider's shape says `item-at use:<context>` (shown wherever that context is shown beneath); a part's says `use:<context>-at ul`. No word is added to a signature: the two are the existing `…-at` form.
- **The type**: the prop that is provided has the context's type, by text, and the type pass checks what `<use.item … />` gives (`__.use(item)` in the projection).

A view that shows the context it is carried by (a tree) is a recursion like a component's: bounded by its data it runs; unbounded it overflows in every runner alike, as `component A() { <A /> }` does. Its HTML is placed two levels deep, which holds every nesting it can make.

## What is refused that is correct

- A provision or a boundary written by the caller around the part alone (`<Select …><Theme><Listbox /></Theme></Select>`, the item's view using `Theme`'s context): the flow goes from the part's root to the provider's block and does not read what is between. Written around the `Select`, or provided by the `Select` or the part, it is accepted. To accept it needs the part's place in the caller's content added to the flow, as the HTML rule already has it.
- A view shown by a part of *another module* than the context's: the context is not exported. The parts live with their root, as Kobalte's do.
- A view context that is also read as a value somewhere (to ask whether one was given): `VIEW_NOT_SHOWN`. A part that must know asks its root for a flag.

## Evidence

Interpreter, oracle, both emitters; both checkers; then the server and hydration in both emitters.

| programs | result |
| --- | --- |
| 465 generated (`w/mkc.py`): a `View` or a view with a parameter × what the view needs (nothing, a context, a boundary, a loading) × where that is (the provider's block, the part, the caller, nowhere) × where the part is (the provider's view, the caller's content, a portal, another component, a keyed loop, twice) × from a library module × HTML (5 roots × 7 places × 4 placements) | each name says what the checkers must say: **327 accepted and 138 refused, all as said**; the four runners agree on all 327; the crate says what the reference says of all 465 and lowers them alike |
| 38 of providers and misuse: a default, none, nested, side by side, optional, a choice, a value, instances in a keyed loop, rows by a second context, a tree; 19 ways to read the context as a value | 14 accepted and 24 refused, as said; one of the 14 differs in the oracle alone, which remakes a kept row of a keyed loop for any applied view (`<props.item … />` too, on 54571c1d as well) |
| served and hydrated | SSR_C6 |
| Kobalte's `Select`, `Combobox`, `Pagination` in their shape (S-context-8, each a library module and a caller) | run alike in every runner, served and hydrated; types check |

**Kobalte's shape, and where it is not exact.** The caller writes what Kobalte's caller writes: the root with `options` and `itemComponent`, the trigger, the value with a view of the selected option, a portal, the content, the listbox, and in the item's view `SelectItem`, `SelectItemLabel`, `SelectItemIndicator`. Two differences, neither of this proposal: the parts are `SelectItem`, not `Select.Item` (a record of components is not a value in `.rx`: `COMPONENT_AS_VALUE`); a render prop is written `{view itemComponent (props) { … }}`, the form of 25, where TSX writes an arrow.

## Cost

| | |
| --- | --- |
| rules | RG-4c gains the two forms; no diagnostic added (`VIEW_NOT_SHOWN`, `VIEW_FN_MISPLACED`, `CONTENT_MODEL`, `CONTEXT_NOT_FOUND` say it) |
| syntax | `<use.name … />` (a tag, as `<props.f … />` is); a function type after `context name:` |
| signatures | no word; a shape's `…-at` chain may end `use:<context>`, and a shape may say `use:<context>-at …` |
| code | LINES_27 |
| runtime | none: `provide` and `use` as they are, `__rt.view` and `__rt.opt` of 25 and 26 |

## Against

- Module-local is a real limit: a design system that splits a root and its parts over files cannot carry a view between them by a context. Lifting it needs the view's requirements in a context's printed contract (what it uses and fails with), which a context of values does not have.
- The flow skips what the caller writes between the provider and the part: sound, and it refuses the program above.
- Every provision of the context in the module is taken to be the one shown at every place that shows it: two providers with different needs are checked against each other's places. Sound; none of the 503 programs is refused by it that should run.
- A consumer that needs to know whether a view was provided cannot ask (rule 3).

## What upstream must accept

That a context may hold a view under 26's rule, with the limit of rule 4; and the tag `<use.name … />`.
