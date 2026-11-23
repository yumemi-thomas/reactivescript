# S-module-39 — a component inside a record or an array, in a JS component's prop

Rules: MO-11c, MO-11b, DV-24, RG-7b, R-f-5.

## Modules

```rx
-- module: ./markdown.d.rx
// solid-marked's <Markdown>: the components that render each kind of node, by name
export component Markdown(props: { builtins: { Heading?: Component<{ depth: number; children?: View }>; Paragraph?: Component<{ children?: View }> }; children?: View })
// a tab strip given its panels as a list, and a kit whose prop is a table of components
export component Tabs(props: { panels: Component[]; labels: string[] })
export component Provider(props: { components: Record<string, Component>; children?: View })
// a prop that is a component, and one that is neither
export component Shell(props: { header: Component; meta?: { title: string } })
```

```rx
-- module: ./people.d.rx
export error NotFound
export pure fn fetchPerson(id: string): Promise<{ name: string }> rejects(NotFound)
```

A library's component is given components in a record — `solid-marked`'s
`<Markdown builtins={{ Heading }}>`, an MDX provider's `components` — or
in a list. MO-11c reads a prop typed `Component` and nothing that only
holds one: the record was `COMPONENT_AS_VALUE`. A prop whose declared
type holds a `Component` inside a record or an array (a field, an
element, the last argument of `Record<…>`, `Array<…>`, `Partial<…>`) is
read the same way now, with no word: each component written in the
literal the prop is given is checked as applied there, with no arguments,
among the application's children (DV-24), as a direct one is.

And the literal may have a name (2026-11-25): an equation bound to a
record or an array of components (`panels = [First, Second]`, at a
module's top or in a component) is read as that literal where it is
given, by name, to such a prop — on the condition that every mention of
the name in the module is one: read anywhere else, exported, or given to
nothing, the components in it are values (`COMPONENT_AS_VALUE`, on the
line of the binding).

## Program

```rx
import { Markdown, Tabs, Provider } from "./markdown.js"
context accent: string
component Heading(props: { depth: number; children?: View }) {
  <h2 class={use accent}>{props.children}</h2>
}
component Paragraph(props: { children?: View }) {
  <p>{props.children}</p>
}
component First() {
  <p class={use accent}>one</p>
}
component Second() {
  <p>two</p>
}
builtins = { Heading: Heading, Paragraph: Paragraph }
export default component App() {
  provide accent = "dark"
  panels = [First, Second]
  <Markdown builtins={{ Heading: Heading, Paragraph: Paragraph }}>{"# hi"}</Markdown>
  <Markdown builtins={builtins}>{"# by name"}</Markdown>
  <Tabs panels={[First, Second]} labels={["one", "two"]} />
  <Tabs panels={panels} labels={["one", "two"]} />
  <Provider components={{ h1: Heading }}><p>text</p></Provider>
}
```

Accepted: `Heading` and `First` read a context provided above the
components that render them.

## Rejected variants

```rx
-- reject: CONTEXT_NOT_FOUND
import { Markdown } from "./markdown.js"
context accent: string
component Heading(props: { depth: number; children?: View }) {
  <h2 class={use accent}>{props.children}</h2>
}
component Themed() {
  provide accent = "dark"
  <p>themed</p>
}
export default component App() {
  <Themed />
  <Markdown builtins={{ Heading: Heading }}>{"# hi"}</Markdown>
}
```

The context is provided beside the `<Markdown>` that renders the heading,
not above it.

```rx
-- reject: UNHANDLED_FAILURE
import { Tabs } from "./markdown.js"
import { fetchPerson } from "./people.js"
component Panel() {
  person = await fetchPerson("1")
  <p>{person.name}</p>
}
export default component App() {
  loading fallback { <p>…</p> } { <Tabs panels={[Panel]} labels={["one"]} /> }
}
```

A panel that can fail, under no `errored` region above the tabs.

```rx
-- reject: COMPONENT_AS_VALUE
import { Shell } from "./markdown.js"
component Title() {
  <h1>title</h1>
}
export default component App() {
  <Shell header={Title} meta={{ title: "x", icon: Title }} />
}
```

A record given to a prop whose type holds no `Component`: the component
in it is a value nothing renders.

```rx
-- reject: CONTEXT_NOT_FOUND
import { Markdown } from "./markdown.js"
context accent: string
component Heading(props: { depth: number; children?: View }) {
  <h2 class={use accent}>{props.children}</h2>
}
builtins = { Heading: Heading }
export default component App() {
  <Markdown builtins={builtins}>{"# hi"}</Markdown>
}
```

A record given by name is checked where it is given, as the literal is.

```rx
-- accept
import { Tabs } from "./markdown.js"
component First() {
  <p>one</p>
}
component Legend() {
  panels = 3
  <p>{panels} panels</p>
}
export default component App() {
  panels = [First]
  <Tabs panels={panels} labels={["one"]} />
  <Legend />
}
```

A mention is the name's by its scope: `Legend`'s own `panels` is another
binding, and reading it is no reading of `App`'s list (2026-11-26; the
mentions were counted by spelling over the module, and this was
`COMPONENT_AS_VALUE`).

```rx
-- reject: COMPONENT_AS_VALUE
import { Tabs } from "./markdown.js"
component First() {
  <p>one</p>
}
export default component App() {
  panels = [First]
  count = panels.length
  <Tabs panels={panels} labels={[`${count}`]} />
}
```

The name is read as its literal only where every mention of it is such a
prop. Read anywhere else, the list is a value, and so are the components
in it.

```rx
-- reject: COMPONENT_AS_VALUE
import { Tabs } from "./markdown.js"
component First() {
  <p>one</p>
}
component Second() {
  <p>two</p>
}
export default component App() {
  source wide := false
  panels = wide ? [First, Second] : [First]
  <Tabs panels={panels} labels={["one"]} />
}
```

A list that is computed is not a literal: the checker reads the
components a record or an array literal names, not the values an
expression may take.
