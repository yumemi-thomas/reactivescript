# MO-8j: an action given by name to what calls it now

Counts only. No checker is changed.

**The hole.** In an equation or a view, an action or an `io` import given *by name* to a callback that is called while the
call runs is accepted; written as a closure (`x => inc(x)`) it is refused. In Solid's development build the accepted program
stops (`ACTION_CALLED_IN_OWNED_SCOPE`, `REACTIVITY_HALTED`, an empty page); in production the action runs in the equation.
Both checkers agree on all 68 expressions tried, and upstream's main accepts them too (proposals/bugs/44). Accepted today:
`map`, `filter`, `some`, `reduce`, `forEach`, `flatMap`, `toSorted`, `replace`; a fn of the module that calls its parameter;
a `pure` import's callback, rest, optional, generic, `unknown`, `any` or record-method parameter; `[io].map(g => g())`,
`({ io }).io()`, `ap([io][0])`, `cur(io)(1)`. Real: `insertSorted([1, 2], 3, save)` (@solid-primitives/sortable).

**The reviewer's rule.** In an equation or a view, an action or an `io` value given by name where a closure may be given has
the verdict its closure has.

**What it would refuse.** Each name that stands as an argument, an item of a list or a field of a record was replaced by
`x => name(x)`, one at a time, in every accepted program, and the reference's checker asked again
(`ACTION_CALLED_IN_OWNED_SCOPE`, `IO_IN_REACTIVE`, `REACTIVE_WRITE_IN_OWNED_SCOPE` counted).

| | accepted programs | names tried | refused as an argument of a call | refused in a record that is an argument | refused in a record that is provided |
| --- | --- | --- | --- | --- | --- |
| this branch: scenarios, examples, eval | 448 | 3,387 | 0 | 2 (`useMutation({ mutationFn: addTodo })`: S-module-12, examples/query) | 7 |
| this branch: bench, tasks and coverage | 181 | 365 | 0 | 2 (`useQuery({ queryFn: fetchTodos })` query-forward, `mutationFn: renameTodo` query-mutation) | 1 (context-provider) |
| both, together | 629 | 3,752 | **0** | **4** | **8** |
| upstream main (bbe2a189): scenarios, examples, eval | 289 | 2,892 | **0** | **0** | **6** |

(One more is refused as a closure and is outside the rule: a handler's `setTodos(bump)`, a store's updater with a draft parameter, S-module-25.)
The 12 are correct programs: the library or the reader keeps the function and calls it later. So:

- The rule as an *argument of a call* refuses nothing of either tree or of the benchmark. But it would refuse programs that
  are correct and not there: `preventDefault(save)`, `combineHandlers(save)`, `createCallback(save)`, `chain([save])` (all of
  @solid-primitives, all accepted today; their closures are refused today).
- The rule as "wherever a closure may be given" refuses 12 correct programs of the trees. It cannot be the rule.
- What is known to call now, and refuses none of these: the language's own methods (`map`, `filter`, `some`, `every`, `find`,
  `reduce`, `forEach`, `flatMap`, `toSorted`, `replace`) and a fn of the module whose body calls its parameter. A JavaScript
  import is not known to call or to keep, so nothing there can be refused without refusing the four above.

Not counted: an action that reaches a call through a variable or a record read later (`cur(io)(1)`, `ap([io][0])`), which no
program of the trees writes.
