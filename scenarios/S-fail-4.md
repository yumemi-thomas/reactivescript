# S-fail-4 — a pane that borrows another pane's data shows the borrowed read in a region of its own

Rules: R-f-4, R-f-5, R-6, D-41.

## Program

```rx
component Detail(props) {
  item = await fetch("item:" + props.id)
  errored fallback(e) { <p>detail failed: {e.message}</p> } {
    {errored fallback { <h2>{item.title}</h2> } { <h2>{props.titles[props.id]}</h2> }}
    <p>{item.body}</p>
  }
}

export default component App() {
  titles = await fetch("titles")
  <div>
    {errored fallback(e) { <p>list failed: {e.message}</p> } { <p>{titles.length}</p> }}
    <Detail id={1} titles={titles} />
  </div>
}
```

The list and the detail each have their own boundary. The detail borrows
the list's titles for its heading, and puts that read in a region of its
own: when the list fails, the list shows the failure and the heading's
region falls back to the detail's own answer.

## Frames

| instant | action                                      | frame                        |
| ------- | ------------------------------------------- | ---------------------------- |
| 0       | mount                                       | ``                           |
| 1       | reject titles "down"                        | ``                           |
| 2       | resolve item {"title":"Login","body":"b"}   | `list failed: downLoginb`    |

Instant 1: the mount still waits for `item` (no `loading` boundary, H-2).
Instant 2: the list's failure stays in the list (the heading's boundary
discharges it in the detail, R-f-4), and the detail shows its own answer.

Without the inner region the program is accepted (R-f-11 was withdrawn), and the
list's failure would reach the detail's boundary: the detail would show
"detail failed: down" for a request it did not make, and its retry would ask
`item` again, not `titles`. Found in the round 10 AI eval (desk rx-2).
