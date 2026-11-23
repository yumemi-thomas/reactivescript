# S-server-5 — Text is text: a value's `<` and `&` reach the page escaped once

Rules exercised: SV-1; 07 §4 (a reader shows a value; a component's children are a view).

## Program

```rx
component Note(props: { children?: View }) {
  <em>{props.children}</em>
}
export default component App() {
  source a := "1 < 2 & 3"
  <p>{a}</p>{" "}
  <Note>{a}</Note>{" "}
  <Note>plain</Note>
}
```

A reader shows its value as text, and a component shows the children it
is given, wherever the program is rendered. On the server the compiled
view escapes each hole once. The runtime escaped the value as well until
2026-11-24, so a served page showed `1 &lt; 2 &amp; 3` until the browser
took it over — and through a component's children, escaped once more.

## Frames

| instant | action                         | frame                                |
| ------- | ------------------------------ | ------------------------------------ |
| 0       | mount                          | `1 < 2 & 3 1 < 2 & 3 plain`          |
| 1       | handler `a := "<b>bold</b>"`   | `<b>bold</b> <b>bold</b> plain`      |

## Server frames

| instant | action | frame                         |
| ------- | ------ | ----------------------------- |
| 0       | mount  | `1 < 2 & 3 1 < 2 & 3 plain`   |
