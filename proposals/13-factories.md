# 13 — A component given to a JavaScript function: the cautious rule

Needs [05](05-foreign-views.md) (form 4). It is the conservative rule alone: no word is added.

## Problem

`.rx` cannot give a component to a JavaScript function. A bare function call upstream is `COMPONENT_AS_VALUE`.

## Proposal

A component given to a declared fn is checked **as applied under a root of its own**, at the call: no `errored`, `loading` or `provide` above it. The library may render it anywhere; nothing above is
credited.

<!-- check branch=CONTEXT_NOT_FOUND upstream=PARSE -->
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
export fn toast(message: Component): number
```

A fn whose declared result is `Component` (a *factory*) is instantiated once, and its name is applied in a view. The components in its arguments are then checked inside the made component, where it is applied.

## Evidence

The programs of [14](14-nests-and-hosts.md) and [15](15-renders.md) need more than this; 10 of the benchmark's programs are refused with the rule and no word.

## Not claimed

It is less than any owner gives only where the library renders with an owner. A library that calls a component with no owner at all (`toast.custom` of solid-sonner) is not described by any row.

## Cost

Part of 05's count; not measured alone (a54830a, c4a5a6f).

## Compatibility

`COMPONENT_AS_VALUE` is no longer reported there. In a `.d.rx`, a result typed by the bare name `Component` was any type, and makes the fn a factory: an unbound call of it was accepted, and is `INSTANTIATION_NOT_BOUND`.

## Prototype

MO-11f, s (proposed ids). S-module-6, 9.
