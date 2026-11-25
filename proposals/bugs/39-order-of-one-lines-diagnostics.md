# Two components of one record are reported in another order by each checker

A host declaration nests components that render none of what they are given (MO-11i), two of them on one line:

```rx
export default component nests(children in component) = [
  { component: App, children: [{ component: Root, children: [{ component: Home }] }] }
]
```

Both checkers refuse it, `NESTED_NOT_RENDERED` twice on that line: the crate says `App` first and the reference `Root`. They keep the records as they meet them, and meet a tree in their own order. It shows where the two are compared (`ref/crate.ts`), at some seeds of `--text`.

**Fix in this branch.** By line, then by name, in both. **Test.** S-module-41.
