# S-context-2 — a fn that reads a context reads it above each call

Rules: RG-6a, RG-7b, E-9, MO-9b, MO-12b.

## Modules

```rx
-- module: ./form.rx
export context form: { id: string; invalid: boolean }
export context density: number = 1
export fn useForm() { f = use form
  f }
export fn useFieldId(ref name: string) {
  f = useForm()
  f.id + "-" + name
}
export fn useDensity() { (use density) * 10 }
```

`useFieldId` calls `useForm`, so it uses `form` too; `useDensity` declares nothing and still instantiates, as what it
reads is above the place it is called (E-9).

## Program

```rx
import { form, density, useForm, useFieldId, useDensity } from "./form.rx"
component Field(props: { name: string }) {
  f = useForm()
  id = useFieldId(props.name)
  d = useDensity()
  <label>{id}{f.invalid ? "!" : "."}{d} </label>
}
component Form(props: { id: string; invalid: boolean; children: any }) {
  provide form = { id: props.id, invalid: props.invalid }
  <form>{props.children}</form>
}
component Dense(props: { by: number; children: any }) {
  provide density = props.by
  <div>{props.children}</div>
}
export default component App() {
  source bad := false
  source by := 2
  <Form id="a" invalid={bad}><Field name="x" /></Form>
  <Dense by={by}><Form id="b" invalid={false}><Field name="y" /></Form></Dense>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `a-x.10b-y.20` |
| 1 | handler `bad := true` | `a-x!10b-y.20` |
| 2 | handler `by := 3` | `a-x!10b-y.30` |

## Accepted variants

A fn's own provision, a fn nobody calls, and a hook called in a branch beneath its provision:

```rx
-- accept
context theme: string
fn useTheme() { t = use theme
  t }
fn unused() { t = useTheme()
  t }
component Kid() { t = useTheme()
  <i>{t}</i> }
export default component App() {
  source on := true
  provide theme = "dark"
  if (on) { <Kid /> }
}
```

## Rejected variants

The provision is not above the call; nor, through two fns, above the second one's; nor above a call at the module's root;
nor above the call of a fn of another module.

```rx
-- reject: CONTEXT_NOT_FOUND
import { useForm } from "./form.rx"
component Kid() { f = useForm()
  <p>{f.id}</p> }
export default component App() { <Kid /> }
```

```rx
-- reject: CONTEXT_NOT_FOUND
import { form, useFieldId } from "./form.rx"
component Form(props: { children: any }) { provide form = { id: "a", invalid: false }
  <b>{props.children}</b> }
component Kid() { id = useFieldId("x")
  <p>{id}</p> }
export default component App() { <Form>in</Form><Kid /> }
```

```rx
-- reject: CONTEXT_NOT_FOUND
import { form, useForm } from "./form.rx"
f = useForm()
export default component App() { provide form = { id: "a", invalid: false }
  <p>{f.id}</p> }
```

A fn that reads a context is bound where it is called:

```rx
-- reject: INSTANTIATION_NOT_BOUND
import { density, useDensity } from "./form.rx"
export default component App() { provide density = 2
  <p>{useDensity()}</p> }
```
