# 29 — A tag chosen by a value: not added

Solid has `Dynamic`; Kobalte and terracotta have `as` (30 of 150 Solid 2 packages read have a tag chosen by a value; terracotta names `as` 195 times). `.rx` has no element whose tag is a value, and RG-4a keeps a component from being one. **Decided on `rx-best`: no new form.** Two forms that exist stand for it, and both hold in every runner.

**A closed set of tags is an `if`** over a prop typed by its literals. Each branch is an element the checkers know:

<!-- frames branch=pass upstream=pass -->
```rx
component Trigger(props: { as: "button" | "a"; href?: string; children: View }) {
  source open := false
  action toggle() { open := !open }
  {if props.as == "a" { <a href={props.href} onClick={toggle}>{props.children}</a> } else { <button onClick={toggle}>{props.children}</button> }}{open ? "+" : "-"}
}
export default component App() { source k: "button" | "a" := "button"
  <Trigger as={k} href="/x">go</Trigger> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `go-` |
| 1 | handler `k := "a"` | `go-` |

**A tag or a component the caller chooses is `render`** (Base UI's and the UI SDK's word; Kobalte's `as={Button}`, `asChild`): the part shows a view ([25](25-views.md)) with the attributes it owns, and the caller spreads them on its own element or component:

<!-- frames branch=pass upstream=fail -->
```rx
component Link(props: { to: string; class?: string; children: View }) {
  { to, children, ...rest } = props
  <a href={to} {...rest}>{children}</a>
}
component Trigger(props: { render: (p: { attrs: { "aria-expanded": "true" | "false"; onClick: () => void; class: string } }) => View }) {
  source open := false
  action toggle() { open := !open }
  <props.render attrs={{ "aria-expanded": open ? "true" : "false", onClick: toggle, class: open ? "on" : "off" }} />{open ? "+" : "-"}
}
export default component App() {
  <Trigger>{view render (p) { <Link to="/x" {...p.attrs}>go</Link> }}</Trigger>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `go-` |

## Why no element whose tag is a value

- **The content model needs the tag.** SV-7d holds what the browser's parser would move (a `<div>` in a `<p>`), from the text. With `<props.as>` the tag is one of the prop's literals, so each must be held: the caller's block content in a part whose `as` may be `"p"` is refused, though this caller wrote `as="div"`. The `if` form is refused the same (S-view-8), and says why in its own text. To accept it, a component's printed shape would have to be one per value of the prop, and each application read against the one it selects: a word in every signature, for a form that saves the branches of an `if`.
- **An open `as`** (`keyof JSX.IntrinsicElements`, any component) has no content model at all, and a component given by name is a value (RG-4a): its failures, its contexts and its content would be the callee's to answer for with nothing known. `render` gives the same reach with everything known: the caller's element is in the caller's text.
- **Solid remakes** what is under a `Dynamic` when the tag changes; so does an `if`. Nothing is lost there.

## Evidence

| | |
| --- | --- |
| programs written for the two forms (`mkd.py`: an `if` over two tags and over three heading levels, with the tag fixed or changing; `render` required, optional, and under a root's context; the caller's element, its own attributes beside, its component with a rest, named props, a choice by the part's state, state of its own; text, an element or an expression inside; in the module or imported) | 153: 144 accepted, 7 that the type pass alone refuses, 2 refused by both checkers, each as its name says |
| the interpreter, the oracle, both emitters | alike on the 144 |
| served and hydrated, both emitters | 144 of 144 |
| both checkers; lowered; projected | alike on all |

## What it costs an author

- A closed set of n tags is n branches, each with its attributes. Sets whose tags take the same content (headings, `ul`/`ol`, `div`/`section`) refuse nothing; a mixed one (`div`, `p`) holds every caller to the narrowest.
- A library whose API is `as` (Kobalte, terracotta) is written with `render` in `.rx`: its callers change one line. The part's children are the caller's to write inside what it renders; a view the part wants to hand over goes among what it gives under another name.

## What would change this

A real kit whose parts cannot be `render`; or a count of closed sets so wide that the branches are the larger part of a library. Then: `<props.as …>` for a prop typed by tag literals, read by every runner as its `if`.
