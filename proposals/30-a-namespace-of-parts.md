# 30 — A kit's parts by a namespace

A kit is a root and its parts: `<Select.Root>`, `<Select.Trigger>`, `<Select.Item>` (Radix, Ark, Base UI, Kobalte, the UI SDK). In `.rx` a record of components is not a value (RG-4a), and a `.d.rx` names a JavaScript object's members one by one (MO-11q). For a module written in `.rx` nothing was needed but the import:

<!-- frames branch=pass upstream=fail -->
```rx
import * as Menu from "./menu.rx"
export default component App() {
  <Menu.Root><Menu.Trigger>m</Menu.Trigger><Menu.Content><Menu.Item>one</Menu.Item></Menu.Content></Menu.Root>
}
-- file: ./menu.rx
export context menu: { open: boolean; toggle: () => void } = { open: false, toggle: () => undefined }
export component Root(p: { children: View }) {
  source open := true
  action toggle() { open := !open }
  provide menu = { open: open, toggle: toggle }
  <nav>{p.children}</nav> }
export component Trigger(p: { children: View }) { m = use menu
  <button onClick={m.toggle}>{p.children}{m.open ? "-" : "+"}</button> }
export component Content(p: { children: View }) { m = use menu
  {if m.open { <menu>{p.children}</menu> }} }
export component Item(p: { children: View }) { <li>{p.children}</li> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `m-one` |

## Proposal

`import * as Select from "./select.rx"` (MO-6d). The name is the first part of a tag, `<Select.Item>`, and of a type in a type's text, `Select.Opt`, `Select.RootProps<Row>`. Each is the module's export of that name. **It is no value**: `Select` alone, `Select.Item` in an expression, `<Select>` are refused. It begins with a capital. The same of a JavaScript module that has a declaration file.

**Nothing is made for it.** A module is read with each member it names as a named import: `<Select.Item>` is what `import { Item as … }` and its tag are, in both checkers, the interpreter, the oracle, both emitters and the type projection. So every rule that holds for a named import holds: a part's contexts (`CONTEXT_NOT_FOUND`), its shape (`CONTENT_MODEL`), its failures, a generic root's inference, a view the kit's type declares.

<!-- check branch=UNBOUND upstream=PARSE -->
```rx
import * as Menu from "./menu.rx"
export default component App() { x = Menu.Item
  <p>{str(x)}</p> }
-- file: ./menu.rx
export component Item(p: { children: View }) { <li>{p.children}</li> }
```

<!-- check branch=CONTENT_MODEL upstream=PARSE -->
```rx
import * as Menu from "./menu.rx"
export default component App() { <p><Menu.Item>x</Menu.Item></p> }
-- file: ./menu.rx
export component Item(p: { children: View }) { <li>{p.children}</li> }
```

**For JavaScript and TSX** there is nothing to build: an `.rx` module's exports are an ES module's, and `import * as Select from "pkg/select"` is TypeScript's own.

**Not in it.** `export component Select.Item(…)` in an `.rx` module, for Kobalte's `import { Select }` with a root that is itself applied (`<Select>`): it needs an object made at run time and a row for each member in the printed signature, for a shape that the namespace gives with `<Select.Root>`. A re-export (`export * as Select from …`), for a package that gives all its kits from one entry: a package's `exports` map gives each kit its own entry today.

## Evidence

| | |
| --- | --- |
| programs (`mkn.py`: two kits whose parts share names × the parts named by a namespace, by another namespace's name, by named imports, by both at once × 14 uses — alone, together, nested, in a loop, under an `if`, in a view block, from a module that is not the entry — and 22 by hand for what a namespace is not) | 125: 101 accepted, 9 that the type pass alone refuses, 15 refused by both checkers, each as its name says |
| the interpreter, the oracle, both emitters | alike on the 101; a namespace and named imports show the same |
| served and hydrated, both emitters | 101 of 101 |
| both checkers; lowered; projected | alike on all 125 |
| a JavaScript kit with a `.d.rx`, its compound member through the namespace (`<Kit.Dialog.Root>`), its type (`Kit.Size`) | checked by both, compiled (by hand; the scenario harness has no JavaScript module of its own) |

## Cost

A paragraph of 09 (MO-6d). About 150 lines of the crate (a unit among them) and 40 of `ref/`: the parsers' walk that names the members, and the wording of the diagnostics. No grammar change (the tree-sitter grammar read both already). The type pass's own messages say `Select$Item` where the checkers say `Select.Item`.
