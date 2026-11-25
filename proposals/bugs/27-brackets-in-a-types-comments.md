# A bracket in a comment or a string of a type is read as a bracket

Each of these is a correct program, and is refused by both checkers of upstream.

A comment that holds a bracket. Upstream reads the rest of the file as the type, so `g` is not exported:

<!-- check branch=ok upstream=IO_IN_REACTIVE+NOT_EXPORTED -->
```rx
import pure { g } from "./x"
export default component App() {
  <p>{g()}</p>
}
-- file: ./x.d.rx
export type T = { // {
  a: string
}
export pure fn g(): number
```

A block comment:

<!-- check branch=ok upstream=PARSE -->
```rx
import pure { g } from "./x"
export default component App() {
  <p>{g("a")}</p>
}
-- file: ./x.d.rx
export pure fn g(a: string /* ) */): number
```

A string in an interface:

<!-- check branch=ok upstream=PARSE -->
```rx
import pure { g } from "./x"
export default component App() {
  <p>{g()}</p>
}
-- file: ./x.d.rx
export interface X { a: "}" }
export pure fn g(): number
```

A string in a type parameter:

<!-- check branch=ok upstream=PARSE -->
```rx
import pure { g } from "./x"
export default component App() {
  <p>{g(">")}</p>
}
-- file: ./x.d.rx
export pure fn g<T extends ">">(x: T): T
```

A function type among the fields of an error (its `>` closed the list):

<!-- check branch=ok upstream=PARSE -->
```rx
import pure { g } from "./x"
export default component App() {
  <p>{g()}</p>
}
-- file: ./x.d.rx
export error E(f: () => void, b: string)
export pure fn g(): number
```

A template literal type:

<!-- check branch=ok upstream=PARSE -->
```rx
import pure { g } from "./x"
export default component App() {
  <p>{g()}</p>
}
-- file: ./x.d.rx
export type T = `a${`}`}b`
export pure fn g(): T
```

A prop:

<!-- check branch=ok upstream=PARSE -->
```rx
import { C } from "./x"
export default component App() {
  <C a="x" c={1} />
}
-- file: ./x.d.rx
export component C(props: { a: string /* , b: ( */; c: number })
```

And in a `.rx` file, a type:

<!-- check branch=ok upstream=PARSE -->
```rx
type T = { // }
  a: string }
export default component App() {
  <p>x</p>
}
```

An annotation:

<!-- check branch=ok upstream=PARSE -->
```rx
export default component App() {
  source x: string /* := */ := "a"
  <p>{x}</p>
}
```

An interface:

<!-- check branch=ok upstream=PARSE -->
```rx
interface X { a: "}" }
export default component App() {
  <p>x</p>
}
```

A type argument (`f<T>(…)` is a call; with a comment it was two comparisons, of a type):

<!-- check branch=ok upstream=UNBOUND -->
```rx
type T = string
fn f(x: T): T => x
export default component App() {
  <p>{f<T /* c */>("a")}</p>
}
```

**On upstream (e650b85).** A parse error at the bracket, or after it. The type arguments: `UNBOUND` of `T`.

**Spec.** 07 §2: a type is TypeScript's, kept as text.

**Cause.** A type's text is read in a dozen places, each with its own loop over characters. Each knew some of: strings, templates and their holes, comments, the `>` of `=>`.

**Fix in this branch.** One step, a token (a string, a template, a comment, `=>`, or one character), in the crate and in the reference. What is not closed on its line ends there, as before; a block comment, at the end of the file.

**Not changed.** A template literal type over several lines is refused, by both trees. A row's words are still looked for in a comment after the result: `export pure fn g(): number /* instantiates */` is refused, by both trees.

**Test.** `a_type_is_read_by_tokens`, in `parse.rs` and `ref/units.ts`.
