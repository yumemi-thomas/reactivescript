# S-answer-1 — an action that declares what it answers answers at the call

Rules: AC-1i, AC-1, AC-1h, AC-1b, R-f-6.

Merged onto PR #1 on 2026-11-27 (the prototype's 23 programs were `rx-t1.noindex/sets/mk9.py`).

## Program

```rx
export default component App() {
  source seq := 0
  source last := 0
  source items: string[] := []
  source saved := ""
  action mint(): number {
    let n = seq + 1
    seq := n
    return n
  }
  action add(t: string): number {
    let id = mint()
    items := v => [...v, t + str(id)]
    return id
  }
  action save(t: string) {
    let r = await fetch(t) catch (e) => "none"
    saved := r
  }
  <button onClick={() => { last := add("a") }}>{seq}:{last}:{items.join(",")}:{saved}</button>
}
```

## Frames

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `0:0::` |
| 1 | handler `last := add("a")` | `1:1:a1:` |
| 2 | handler `last := add("b")` | `2:2:a1,b2:` |
| 3 | handler `save(str(last))` | `2:2:a1,b2:` |
| 4 | resolve "2" "ok" | `2:2:a1,b2:ok` |

`add` answers its id at the call: the handler writes it into `last` in the same instant as `add`'s own writes (a
handler's, AC-1i), and `add` calls `mint`, which answers too. A `.tsx` caller gets a number, not a promise. The second
click reads the committed `seq` (`1`), as no change is held. `save` waits: it is an ordinary action.

## Rejected variants

```rx
-- reject: ACTION_ANSWER_HELD
export default component App() {
  source seq := 0
  source sent := ""
  action add(t: string): number {
    let r = await fetch(t) catch (e) => ""
    sent := r
    seq := v => v + 1
    return 1
  }
  <button onClick={() => { add("a") }}>{seq}:{sent}</button>
}
```

An action that answers at the call never waits: the answer would come before its writes settle. Leave the result out
(a caller then gets a promise), or keep the part that answers at once and launch the waiting part as its own action.

```rx
-- reject: ACTION_ANSWER_HELD
export default component App() {
  source seq := 0
  action add(t: string): number {
    let wait = () => { let r = await fetch(t) catch (e) => "" }
    seq := v => v + 1
    wait()
    return 1
  }
  <button onClick={() => { add("a") }}>{seq}</button>
}
```

Own statements are read as AC-1b reads them: a local closure the body calls by name runs in this run, so its `await`
is the body's (a handler written this way is an action that holds `seq`). Found re-checking B10 on PR #1.

```rx
-- reject: ACTION_ANSWER_HELD
export default component App() {
  source seq := 0
  source rows = await fetch("rows") -> ""
  action reload(): number {
    refresh rows
    seq := v => v + 1
    return 1
  }
  <button onClick={() => { reload() }}>{seq}:{rows}</button>
}
```

In an action a `refresh` holds the change until the question answers again (AC-1h); one that answers at the call
cannot hold it. `affects` and a guess are refused alike.

```rx
-- reject: STALE_NEXT_READ
export default component App() {
  source seq := 0
  source done := ""
  action save(id: number) {
    let r = await fetch(str(id)) catch (e) => ""
    done := r
  }
  action note(id: number): number {
    save(id)
    return id
  }
  <button onClick={() => { let n = seq + 1; seq := n; note(n) }}>{seq}:{done}</button>
}
```

`note` answers at once, but it launches `save`, which waits: the handler's write joins `save`'s change (AC-1, D-7) and
is held, so the next click mints `1` again. An action outlasts its call when it launches one that does (AC-1h); before
the merge an action that answers was taken never to (found re-checking B10; a plain action that only launches `save`
was missed the same way).

```rx
-- reject: STALE_NEXT_READ
export default component App() {
  source seq := 0
  source shown := ""
  action add(t: string): number {
    let n = seq + 1
    seq := n
    action { let r = await fetch(t) catch (e) => ""; shown := r }
    return n
  }
  <button onClick={() => { add("a") }}>{seq}:{shown}</button>
}
```

An inline `action { … }` is its own run, launched as a declared action is (it is not `ACTION_ANSWER_HELD`); one that
waits holds the writes of the run that launches it, and the counter beside it is AC-1h's.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source seq := 0
  action mint(): number {
    let n = seq + 1
    seq := n
    return n
  }
  <p>{mint()}</p>
}
```

It is still an action: called while a view computes it would write while the view computes.

```rx
-- accept
export default component App() {
  source seq := 0
  source shown := ""
  action add(t: string): number {
    action { let r = await fetch(t) catch (e) => ""; shown := r }
    seq := v => v + 1
    return 1
  }
  <button onClick={() => { add("a") }}>{seq}:{shown}</button>
}
```

The inline action waits and the body's write is functional: nothing computed from a stale read, nothing refused.
