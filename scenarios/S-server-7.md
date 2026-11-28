# S-server-7 — a failure after the shell, caught above the part that waits

Rules: SV-1, SV-5, E-12; DV-26.

A read that fails after the shell has been sent, inside a `loading`
boundary of a part, with the `errored` boundary that catches it above the
part (here around `Main`). The client shows the loading fallback, then the
error fallback. Solid's server, once the shell is out, streams the loading
boundary as an empty fragment marked failed and leaves the error fallback
to the client: between the landing and the takeover the page shows nothing
where the client shows `bad` (DV-26). With the `errored` right around the
`loading` (DV-9's shape) the server streams the fallback itself.

## Program

```rx
import pure { fetch } from "./prelude"
component Q(p: { l?: View }) { <b>{loading fallback { <i>q</i> } { {p.l} }}</b> }
component Main() { <Q l={await fetch("k")} /> }
export default component App() { {errored fallback(e) { <i>bad</i> } { <Main /> }} }
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `q` |
| 1 | reject "k" "no" | `bad` |

## Divergences (DV-26)

- server "Frames" instant 1: ``

The server's frame after the landing is empty; the client, taking the page
over, draws `bad`. Plain Solid does the same (`ref/oracle/repros/w3-error-through-a-part.mjs`,
at the pin and in 2.0.4).
