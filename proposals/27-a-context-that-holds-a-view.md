# 27 — A context that holds a view

[26](26-children-are-shown.md) leaves one shape with no form that keeps the caller's program: a view given to one component and shown by a part that the *caller* places. Kobalte's `Select`, `Combobox` and `Pagination` are that shape: the root takes `itemComponent`, and `<Select.Listbox />`, written among the children, shows it. In 26 a context does not carry a view (`VIEW_NOT_SHOWN`), because nothing checked the places that show it. This proposal checks them. Prototyped on a local branch (`proto-children-rule`, not published), on top of 26.

<!-- frames branch=pass upstream=fail -->
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
2. **It is given a view the component was given.** `provide slot = props.children` (any form 26 accepts of a view: a name, a choice, a default; a value in it is text, and a choice of the component's views alone, `c ? props.a : props.b`, `props.a ?? props.b`, with `undefined` for none, holds no text); `provide item = props.item` for one with a parameter, of a prop whose type the type pass holds to the context's, as it is. The prop may be optional (`item?: (o: T) => View`): where it was not given the context holds none, and `<use.item … />` shows nothing. (For one with a parameter the prop is named through the props, `props.item`: a destructured name is refused, with that form in the message.)
3. **It is shown, and nothing else.** `{use slot}` in a view; `<use.item row={r} />` for one with a parameter, with what the context's type says. Read as a value, asked, kept, given on, provided again, read by an effect, a handler or a fn: `VIEW_NOT_SHOWN`.
4. **It is not exported.** It is provided and shown in the module that declares it. The components that provide and show it are exported, and what they say of it is in their printed signatures.
5. **Each place that shows it has its own** (26's rule 1): made there, owned there, disposed with it. What it reads from contexts, what it waits on and fails with are that place's, then the provider's.

## What is checked, and where

*At every place that shows it* (`{use slot}`, `<use.item … />`), for every view that may be the one shown there:

- **What the view uses, waits on and fails with** goes up from that place to its component's root, then from the block that holds the `provide` to the provider's root, then from the provider's application, as any view given to it. The provider's block is above every place that shows its view, so what it provides and catches counts; what is between the two (where the caller wrote the part) is not counted: a provision or a boundary the caller writes *around the part alone* does not discharge what the view needs. That is the one known place where a correct program is refused (below).
- **A provision on every path**: a part that shows the context where nothing provides it is `CONTEXT_NOT_FOUND`, by the rule of any context (a default is text).
- **HTML** (SV-7d): the view's elements are placed at each place that shows the context beneath the provider's application: through content, a component's own view, a view given on, a portal (whose place is the end of the document), and across modules by the components' signatures. A provider's shape says `item-at use:<context>` (shown wherever that context is shown beneath); a part's says `use:<context>-at ul`. No word is added to a signature: the two are the existing `…-at` form.
- **The type**: the checkers ask only that the prop is a view with a parameter where the context is one; whether its type is the context's is the type pass's (`provide` in the projection): a type that names itself (a tree), fields in another order, `Array<T>`, a view that asks for less than the context gives are accepted, one that asks for more or for another type is `TS2345`. (*Corrected after the third review:* the two types were compared as texts, which refused the first four.) The type pass checks what `<use.item … />` gives (`__.use(item)` in the projection), and reports an argument it lacks at the tag.

A view that shows the context it is carried by (a tree) is a recursion like a component's: bounded by its data it runs; unbounded it overflows in every runner alike, as `component A() { <A /> }` does. Its HTML is placed two levels deep: a nesting that only a third turn makes wrong is not seen (none was found). Providers of one context nested, each of whose views shows the context again, are placed once for each place and each set of providers around it (they were walked once for every path through them: six took a minute).

## What is refused that is correct

- A provision or a boundary written by the caller around the part alone (`<Select …><Theme><Listbox /></Theme></Select>`, the item's view using `Theme`'s context): the flow goes from the part's root to the provider's block and does not read what is between. Written around the `Select`, or provided by the `Select` or the part, it is accepted. To accept it needs the part's place in the caller's content added to the flow, as the HTML rule already has it.
- A view shown by a part of *another module* than the context's: the context is not exported. The part that shows the view lives with the root that provides it; the other parts may be anywhere. (*Corrected after the third review:* this said "as Kobalte's do". Kobalte's `select-root` and `select-listbox` are two files of one package; written as two `.rx` modules they are refused, as one they run.)
- The view given on as an argument, `<Listbox renderItem={use item} />` (Kobalte's own line): refused, a context's view is only shown. It is written as a view that shows it, `{view renderItem (q) { <use.item item={q.item} /> }}`, which the message of the refusal says.
- A view context that is also read as a value somewhere (to ask whether one was given): `VIEW_NOT_SHOWN`. A part that must know asks its root for a flag.

## Evidence

Interpreter, oracle, both emitters; both checkers; then the server and hydration in both emitters.

| programs | result |
| --- | --- |
| 505 with the verdict the checkers must give in each name (`w/mkc.py`, `ckc.py`). 465: a `View` or a view with a parameter × what the view needs (nothing, a context, a boundary, a loading) × where that is (the provider's block, the part, the caller, nowhere) × where the part is (the provider's view, the caller's content, a portal, another component, a keyed loop, twice) × from a library module × HTML (5 roots × 7 places × 4 placements, the expected verdict being what the content model says of that element at that place). 40: providers (a default, none, nested, side by side, optional, a choice, a value, instances in a keyed loop, rows by a second context, a tree, what the caller provides around the root or around the part) and 19 ways to read the context as a value | **334 accepted and 171 refused, each as its name says**. The four runners agree on 333 of the 334; one differs in the oracle alone, which remakes a kept row of a keyed loop for any applied view (`<props.item … />` too, on 54571c1d as well). The crate says what the reference says of all 505, lowers and projects them alike |
| served and hydrated, both emitters | 315 of 315 (57 with a click before the client takes over). Not served: 18 in which the view waits or fails inside a portal — a portal is made by the client alone, so the served page differs from the mount, with or without a context (`w/c10`, on 54571c1d) |
| Kobalte's `Select`, `Combobox`, `Pagination` in their shape (S-context-8, each a library module and a caller) | run alike in every runner, served and hydrated; types check |

**Kobalte's shape, and where it is not exact.** The caller writes what Kobalte's caller writes: the root with `options` and `itemComponent`, the trigger, the value with a view of the selected option, a portal, the content, the listbox, and in the item's view `SelectItem`, `SelectItemLabel`, `SelectItemIndicator`. Two differences, neither of this proposal: the parts are `SelectItem`, not `Select.Item` (a record of components is not a value in `.rx`: `COMPONENT_AS_VALUE`); a render prop is written `{view itemComponent (props) { … }}`, the form of 25, where TSX writes an arrow.

## Cost

| | |
| --- | --- |
| rules | RG-4c gains the two forms; no diagnostic added (`VIEW_NOT_SHOWN`, `VIEW_FN_MISPLACED`, `CONTENT_MODEL`, `CONTEXT_NOT_FOUND` say it) |
| syntax | `<use.name … />` (a tag, as `<props.f … />` is); a function type after `context name:` |
| signatures | no word; a shape's `…-at` chain may end `use:<context>`, and a shape may say `use:<context>-at …` |
| code | crate +598 −35, `ref/` +211 −38 on top of 26: the two checkers' link of each place the context is shown to what is given for it, a tag in both emitters, the interpreter, the oracle and the type projection |
| runtime | none: `provide` and `use` as they are, `__rt.view` and `__rt.opt` of 25 and 26 |

## Against

- Module-local is a real limit: a design system that splits a root and its parts over files cannot carry a view between them by a context. Lifting it needs the view's requirements in a context's printed contract (what it uses and fails with), which a context of values does not have.
- The flow skips what the caller writes between the provider and the part: sound, and it refuses the program above.
- Every provision of the context in the module is taken to be the one shown at every place that shows it: two providers with different needs are checked against each other's places. Sound; none of the 505 programs is refused by it that should run.
- A consumer that needs to know whether a view was provided cannot ask (rule 3).

## What upstream must accept

That a context may hold a view under 26's rule, with the limit of rule 4; and the tag `<use.name … />`.

## Found on the way

The content model let `<li>`, `<dd>`, `<dt>` and `<summary>` inside a `<p>`, which the browser's parser closes for each: found by the HTML programs above (accepted, and the element moved on hydration), on 54571c1d as well; fixed in both checkers (SV-7d).

## A kit in several modules (2026-11-26, `rx-best`): what was asked again, and left out

Asked: the root and the part that shows the view in two modules (an exported context that holds a view), and `renderItem={use item}`. Both stay refused. S-module-48 holds what is written instead, with the parts named by a namespace ([30](30-a-namespace-of-parts.md)).

- **An exported context that holds a view.** In one module the checker links every place that shows the view to every provision of it: the arguments each place gives (which of them are plain values, what the others wait on and fail with), what stands between that place and its component's root, and where the browser's parser would put it. That is how the caller's view is checked once, at the root's application. With the place in another module none of that is known when the root is checked. A contract that would carry it: the context's printed row says its view's parameter; every part that shows it, in any module, gives plain values only (a pending or failing argument refused there); the root's row for the prop it carries is written as if the view were shown directly at the provision, with nothing caught between. That is sound by the argument of *Flow* above (what is above the provision is above every place that shows it), and it is two new signature rows and their checks in two checkers. It was not built: not provable in the time, and no kit read needs it — the part that shows the view is one component (`Listbox`), and it sits beside the root.
- **`renderItem={use item}`.** The written form is one line and is what every runner already reads: `{view renderItem (q) { <use.item {...q} /> }}`. Reading the argument as that view needs the types of both sides at the place it is written (is `item` a context that holds a view with a parameter, is `renderItem` a view the component shows), so it is a rewrite after the modules are loaded, in two implementations, for a line that only a kit's author writes.
- **One namespace for a kit in several modules** needs a module that hands on what others export (`export { Root, Listbox } from "./root.rx"`). `.rx` has no such export (MO-6c: an export is a declaration). Today the caller names a namespace for each module, or the kit is one module. A re-export that the loader resolves to the module that declares the name, printed as a row of the signature and written as an ES re-export by `rx-lib`, would be enough; it was not built.

33 programs for the split as it is written today (`mkk.py`: a generic and a plain root × a namespace for each module or names × the parts together, the carried view shown twice, the kit inside its own item, under an `if`, a part outside its root): 22 accepted and alike in the interpreter, the oracle and both emitters, served and hydrated 22 of 22; 4 for the type pass; 7 refused as named.
