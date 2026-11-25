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

1. (As first decided; widened below.) A `.rx` component takes one view, `children`, whose declared type is a function giving a `View` with one parameter or none, written in its props type: `children: (s: { pressed: boolean }) => View`, or optional.
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

## C. Bug 37's gate (asked after d843fd7f)

**Keep 37; replace the gate.** 37 is this branch's own regression, of the plainest program (`<P>{await fetch("q")}</P>`), which upstream compiles and which is right in every runner. Taking it out refuses that. The gate compared names over a module, and refused right programs (a sibling's `use`, a value bound from one, a closure). It now asks what *those* children hold: a `use` in their own place, or a name or a possible call of a fn that instantiates, where the program writes one as a value. Closures, sibling applications and nested ones compile and are right (6 probes that were refused).

- `x-mod-prop`: the fault is E-9's. A fn that reads a context is called unbound, through a value; the interpreter throws, with or without children. Compiled as one program it is refused again; where a bundler compiles the module alone it is not seen. Refusing every call of a prop there would refuse `<P>{await props.load()}</P>`, which is right (tried: it refuses `x-mod-propclosure`).
- `y-effect`: an effect that reads children which are waiting. It fails the same where the `await` is bound first, so it is not 37's. Left.

## D. Parity

Both checkers report `NESTED_NOT_RENDERED` by line, then name. Over 120 other seeds of `--text` on S-module-41: 4 disagreements before, none after.

## What the programs changed (2d2b37ff)

- **A, rule 1 and 4.** UI SDK and Kobalte take *either* a function or plain content, and have a second view (`render`, `as`). A children-only, view-only form could not be used by the components that asked for it. So: views of other names (MO-11k's named form), and `View | ((s: T) => View)` for children. Both keep every rule; a view of another name has its own placement in the summary (`f-at`).
- **A, rule 2.** A spread is allowed (`<props.children {...now} />`): the state of a part is a record. For O-3 its fields are all of what it holds.
- **An application is emitted through the runtime** (`__rt.view`), not as a tag: plain content and a thunk from JavaScript are no components. Told by the function's length, as UI SDK's own bridge does; so a `.rx` view always has a parameter, and a lone value given as plain content is wrapped (a closure would be taken for a view).
- **`if props.children` of mixed children is refused**: the question would make the content.
- **The parameter's type is in the printed signature** (written out only): without it, an array changed in place through `s` was accepted across modules.
- **B, 33**: a snapshot (`source x := peek(props.children)`) was `out` in every runner and became `in`; it is the caller's again.
- **Found**: [38](proposals/bugs/38-a-view-that-provides.md).

## After the review that was cut off

Each finding was run again on d843fd7f, 2d2b37ff and upstream e650b85; what follows replaces the lines above where they differ.

- **B, 33: taken out.** `<P>{use c}</P>` with `peek([p.children, p.children])` was `outout` in every runner and became `outin` compiled: the mark "a snapshot is reading" was spent by the first read. Giving it back is easy; knowing every read that must be the caller's is not (a component made under the snapshot, a getter in between), and this was the third try that moved a program the runners agreed on. A `use` in plain children is as it was; a view reads where it is shown. S-context-4 holds what a fix must not change; bugs/33 says what one would have to be.
- **C: taken back, d843fd7f's gate.** The new one refused a program that reads no context (a fn with state kept as a value) and compiled a wrong one (a local fn under another name). A gate that only narrows the old one was worked out and not made: the refusal of an `await` also keeps the module's other children that read a context from being compiled wrong (33), and a narrower one has to answer for a fn that another module gives a module compiled alone. The correct programs that d843fd7f refuses and upstream compiles (six kinds, awaits.rs) stay refused.
- **A: plain content beside a view is a view that asks nothing.** With 33 out, plain content with a `use` would have been accepted and wrong. Emitted as a view it needs no helper in the runtime, no wrapping of a lone value, and an `await` in it is asked where it is shown. A view alone is told from nothing by `typeof`, not by its length; the length is for JavaScript's thunk where plain content is taken.
- **A: three programs.** Children of named views alone are none (the interpreter and the oracle called it some); a field named `children` in a spread is the view's (the interpreter dropped it); `{view children (s) { … }}` is refused (compiled, it was overwritten).
- **A: types by name.** The parameter's type, and the props', are read through names: of the module, of the `.rx` modules it imports, and through their signatures, which now say what an exported type stands for. What cannot be read (JavaScript's types, a union, a type that names itself) is not refused: an in-place write through it is not seen, as through a component's props (which still read no names: not changed here, it would change verdicts).
- **A: the stale view.** A spread that may give a view is refused: what is written, then the type, decides; unknown may. Kept out: dropping the field (silent), running a closure as a view (it makes it again at each change).
- **Found: types.** A missing or wrong argument of an optional or a union view was told by TypeScript at a name the projection did not map, and lost. Mapped.
- **Kept, because a library needs each**: named views (UI SDK's `renderToken`, `Segment`, `fallback`; TanStack's `fallback`; Kobalte's `element`-like parts of S-view-6), plain content or a view (Kobalte's Resizable, ToggleButton, Rating, Checkbox, Switch, Select; TanStack's Link, MatchRoute, Block; 332 of UI SDK's exports). **Not relaxed**: asking for children that may be plain (36 of UI SDK's, no other library): a JavaScript host's content would be made twice, or owned above where it is shown.
- **D** has its test (S-module-41) and page ([39](proposals/bugs/39-order-of-one-lines-diagnostics.md)).
- **34**: a closure given on (`<T>{props.children}</T>`) is called as well. **38**: run served and hydrated.

## E. Refuse the ambiguity (asked while the branches were being split)

**Yes, narrowed.** A context used in a component's plain children, in no block or component of theirs, is refused (`AMBIGUOUS_CONTEXT`) where the component provides it around *every* place it shows them *in its own view*. Own commit on both branches; S-context-5, bugs/33.

1. **Is a program refused that is right in every runner?** 1,116 generated programs (31 ways a component shows its children, 15 forms of children, a default or a provision above), each run in the interpreter, the oracle and both emitters on d843fd7f. "The summary says it provides c" alone refuses right ones, so it was narrowed until the runners stopped agreeing on what it refuses: every place, not some (one outside and first: all runners have the caller's); not a snapshot (`outout`); not what a context carries on; not a prop given on to a component that provides; not a spread, a record, a list, a closure, a name in an effect, a handler or an action. These are `apart(c)` in a printed signature. Left: a component that provides the same value as is above it (22 of 1,116; one of the 81 earlier probes it refuses, `review3-extra-flight`, built for that), children never shown (23), and a read not reached. No program of either tree, the benchmark or UI SDK. `use` in a block, in a component, in a view, bound above: untouched.
2. **The await gate.** Not unnecessary and not smaller. (a) It also keeps from being compiled what stays accepted and wrong: 149 of the 388 on which the runners differ (kept in a value, given as a prop, carried by a context that the component's own provision is above, one place in and one out, met in the other order). The summary cannot tell those from right ones, so a gate that trusts it would compile them. (b) A fn that reads a context, called through a value (E-9), is no `use` in the children; whole-program it is names, in a module compiled alone (a package, a bundler's, `x-mod-prop`) it is not there at all: as on d843fd7f. What changes: an await whose question is such a `use` is now refused by the checker with a reason, before the gate.
3. **Verdicts that change.** Both trees 0 of 1,170 (code, projection 0); signatures 0; bench, UI SDK copy 0. Earlier probes: 79 of the two reviews' 146 and 2 of the gate's 38, each wrong, throwing, refused or not compiled in some runner on d843fd7f (on upstream too, but `review3-extra-flight`).
4. **The price** is in bugs/33 and 24: 08 and RG-7b accept these, the interpreter runs them, upstream's checkers pass them; upstream's compiled code is wrong or throws on each. If upstream decides for 08 and fixes it, the refusal goes; if for RG-4c, the checkers' credit goes instead.

Found beside: `provide c = use c` where a `use c` is in the children overflows the stack of both checkers, on d843fd7f too. Not touched.
