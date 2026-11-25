# Decisions: content that uses its component's state, and bugs 33–36

2026-11-25, branch `proto-children`, from 1b8aa6cb. Local. Written before the code; the last section says what the programs changed.

## A. Content that uses the component's state

| option | for | against |
| --- | --- | --- |
| **an explicit view, applied** (`{view (s) { … }}`, shown by `<props.children …/>`) | RG-4c itself sends content "created more than once, or conditionally owned" to a function prop, and no `.rx` function can make markup: the rule names a form that cannot be written. Every piece exists: the giver's is MO-11k's, the shower's is a component's application, the type is TypeScript's. Its body is a block, so its owner, contexts and awaits are where it is shown, in every runner, with no work | a new place for two existing forms; a tag that begins with a small letter |
| the same, called (`{props.children({ … })}`) | JSX's habit | a reader: each change of an argument makes the view again (4 elements for 3 presses). Cannot be right without being an application under call syntax |
| `use ctx` in plain children | nothing to learn | a name per context (two Toggles, one inside the other, cannot both be read); a library's list is `any`; held back after two reviews. Bug 33 is a separate question (below) |
| a component prop | Solid has it | a component is no value in `.rx` (RG-4a, MO-11c); it would need `Component` as a type of `.rx`, placement through values, and the caller's locals passed by hand |
| generics for lists (20) | types a library's list | does not give content a way to take the row; it composes with the view form and is not a substitute. Components have no type parameters in that prototype |
| nothing | no cost | the 2 correct UI SDK lines, Kobalte's state functions and RG-4c's own sentence stay unwritable |

**Choice: the explicit view, applied, and nothing else.** Narrowed until nothing can go wrong that a component could not do already:

1. A `.rx` component takes one view, `children`, whose declared type is a function giving a `View` with one parameter or none, written in its props type: `children: (s: { pressed: boolean }) => View`, or optional.
2. The component shows it only as `<props.children a={e} … />`, in its own view: zero, one or several places, under any `if`, `for`, `loading`, `errored`, `portal`, or among children it gives another component (that is how it is forwarded). No content, no spread, no argument named `children`.
3. A component that shows it so names it nowhere else: not read, called, stored, destructured, spread, passed, put in a closure or a context. The one exception is `if props.children { … }`, which an optional one must stand under.
4. What is given is one `{view (s) { … }}` (or `view () { … }`), nothing else. `s` is a props value: fields are equations, read where they are read; no field is written.
5. An argument is *read where the view is shown* for what it waits on and fails with, so nothing about it crosses a signature. Cautious: a view with its own `errored` is still asked for one above.
6. O-3: a field that holds a closure of the component's is not stored by the content where it outlives the view. The printed signature says which fields hold none (`value`, a word it has).

A component that has such a prop and never shows it this way is as it was (bug 34's program too): the tag is refused today, so no accepted program is in reach of these rules.

**Not chosen, on purpose:** named views (`render`): the signature has one place for what a component shows, and it is the children's; generic components; a view as a value. **What would change my mind:** upstream saying RG-4c's function prop answers a view by call; or a program, accepted by this, that is wrong in one runner and cannot be refused without refusing MO-11k's.

**For upstream:** RG-4c's text does not say how a function prop makes markup. This is one answer, and a question.

## B. The bugs

| bug | decision | reason |
| --- | --- | --- |
| 33 `use` in children | **fix, narrowly**: in compiled code and the oracle, children with a `use` in their own place and *no `await`* there are read under the owner that reads them, unless that read is of a context's value. | The text decides (08, RG-7b), the interpreter is right, and the plainest program throws. The earlier try was held back for what it did beyond that: awaits (now left whole, 36), a view carried by a context (`provide child = props.children`: `out` in every runner; unchanged now), oracle scopes kept for each read (none now). Reads nothing owns (effects, handlers) are as they were |
| 34 a closure as children | **fix the two runners that throw**: the interpreter and the oracle, where `props.children(…)` is called and the children are one closure. Compiled code, checkers and every other use: unchanged. `children={closure}` with no content: left, written up | Compiled code is right and typed; nothing that ran changes |
| 35 children in a record | **leave, written up** | a refusal would refuse records that are right (no `use` below), a fix is a rule about values that nobody wrote |
| 36 an await asked by a context | **leave, written up** | as 24 found: asked where shown it is asked again at each place; refused, it refuses right programs. A `view () { x = await … }` is the form that has its own block |
| 37 | not here: another run | |
