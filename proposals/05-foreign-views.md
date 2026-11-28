# 05 — Views and components given to a JavaScript component

Needs [01](01-foreign-tags.md). Four forms, each apart, in the order of use.

1. **A view in a prop.** A field typed `View` takes a component by its name: `fallback={Empty}`.
2. **A member component.** `export component Dialog.Trigger(props: …)`, applied `<Dialog.Trigger>`. `<dialog.x>` stays an element, unless `dialog` is a name of the
   module.
3. **A render prop.** `children` typed as a function giving a `View` takes a *view lambda*, new syntax:

<!-- check branch=ok upstream=PARSE -->
```rx
import { VirtualList } from "./v.js"
export default component App() {
  source rows := ["a"]
  <VirtualList items={rows}>{view (row, i) { <p>{row}</p> }}</VirtualList>
}
-- file: ./v.d.rx
export component VirtualList(props: { items: string[]; children: (item: string, index: number) => View })
```

4. **A component as a value.** `.rx` names a component where the type says `Component`. It is checked as applied there, with no arguments, whether or not the library renders it.

## Evidence

In the 132 rows of [01](01-foreign-tags.md). No form was counted apart.

## Not claimed

Nothing says where the library renders what it is given: the strict reading is as applied where it is written. [13](13-factories.md) is the next question.

## Rejected

*A computed component (`<X />` for a value).* The static application tree must know what is applied.

## Compatibility

All are parse errors or `COMPONENT_AS_VALUE` upstream.

## Prototype

MO-11b, c, k, q, t, DV-24 (proposed ids). S-module-15, 24, 28, 34, 39. The crate's lines are in [01](01-foreign-tags.md)'s total.
