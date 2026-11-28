# 09 — A guess in a run that starts nothing to wait for

Needs nothing. AC-3.

<!-- check branch=GUESS_OUTSIDE_HOLD upstream=ok -->
```rx
export default component App() {
  source name := "Ann"
  source shown = name
  <button onClick={() => { guess shown := "Zed" }}>{shown}</button>
}
```

**Proposal.** `GUESS_OUTSIDE_HOLD`, which upstream has for a guess outside an action, also where the run awaits nothing and calls nothing that could be awaited. The guess is
taken back in the instant it is made.

**Not seen.** A declared action is let be, since what calls it may wait:

<!-- check branch=ok upstream=ok -->
```rx
export default component App() {
  source n := 0
  action click() { guess n := 1; n := 2 }
  <button onClick={click}>{n}</button>
}
```

**Evidence.** One benchmark task. Nothing in upstream's modules.

**Prototype.** d388410. The unit `a_guess_needs_something_to_wait_for`.
