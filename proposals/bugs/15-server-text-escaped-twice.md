# Text is escaped twice on the server

A served page shows `1 &lt; 2` until the browser takes it over.

<!-- frames branch=pass upstream=fail runner=ssr -->
```rx
export default component App() {
  source a := "1 < 2 & 3"
  <p>{a}</p>
}
```

| instant | action | frame |
| ------- | ------- | ------- |
| 0 | mount | `1 < 2 & 3` |

**On upstream (e650b85).** `Server frames instant 0: expected '1 < 2 & 3', got '1 &lt; 2 &amp; 3'`. Through a component's children, once more.

**Spec.** SV-1; 07 §4: a reader shows a value as text.

**Cause.** The server runtime's `show` escapes, and so does the compiled view around each hole.

**Fix in this branch.** 907b5a8: the view escapes, the runtime does not. `{props.children}` is inserted as it is.

**Test.** S-server-5, served and hydrated in Chromium.
