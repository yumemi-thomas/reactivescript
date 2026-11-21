# Board probe, 2026-11-17: 3 Opus .rx desks on the AC-1g draft

Not preregistered. Three fresh board desks (`scaffold.mjs board rx --brief plain --inline-docs`). The prompt is the same
as round 15's except for two new bullets in guide/async.md ("three layers"). The compiler had the first draft of AC-1g:
a row parameter, or a local read from a source *before* the `await`. Same Solid (rc.23), grader (`grade.sh`,
`FUZZ_ROUND=--r15`) and hold probes (round 15 `trace/holds.mjs`); 3 desks ran at a time.

| desk | hidden | overlap | fuzz | defects (holds that probe clean and the after-left family excluded) |
|---|---|---|---|---|
| opus-1 | 43/45 | 23/26 | 2/20 | 4 |
| opus-2 | 43/45 | 22/26 | 1/20 | 4 |
| opus-3 | 43/45 | 20/26 | 7/20 | 9 |

The mean is 5.67, against 6.33 for round 15's six Opus board apps: no real change.

What the defects are (traced):
- **Stale or wrong-column writes disappeared from the code that AC-1g's draft could see.** No app writes a row it was
  given. Two apps (opus-1, opus-2) moved the read after the `await` instead (`let found = findCard(r.id, todo, doing,
  done)`, `let now = locate(…)`) and copied that row into the target column. When a rename of the card was accepted
  while two moves of it were out, the moves held the rename (a shared list) and the copy put the old title back:
  fuzz opus-1 seed 11, opus-2 seed 8, and "a renamed card keeps its new title when it moves" (opus-2, opus-3). The
  final AC-1g (the same commit as this folder) flags any source read in such a write, before or after the `await`.
  It rejects opus-1 and opus-2, and nothing else in the corpus.
- **A move's accepted re-ask follows `from`, the column at the click** (opus-2, opus-3: "an earlier move declined
  while a later move of the card is out", which fails its hold probe). The fix is the One store rule ("re-ask the
  answers that held the row … and add the one that holds it now"). A check can't see this.
- **A guess in a list of its own beside an answer written directly** (opus-1 "an item added while the checklist
  reloads shows once" and fuzz seed 9; opus-3 fuzz seeds 3 and 8, "(adding…)" beside its card). The new guide bullet
  ("A guess and the answer that ends it share a place") was not followed.
- **Ledger composition.** opus-3's move guess carries the title passed at the click, so a rename guess doesn't reach
  the moving card. opus-3's detail drops the column and title while its checklist reloads (fuzz seeds 7, 10, 12, 14,
  18).
- opus-1's new-card input sits under To do's loading region, so it is gone while the reopened board loads.
- opus-2 "toggles keep showing while the checklist reloads": the app keeps its own ±1 count (not fully traced).

All three agents kept guess ledgers. opus-2 guessed moves on the column answers directly (the reference's shape) but
kept ledgers for renames, toggles and item adds.

## Probe 2: one shape, guesses on the answer (desks r15h, `probe2/`)

The guide was rewritten (commit 93cb0aa) to teach one shape for server data: guesses go on the answer stores, and an
accepted write re-asks them. The ledger sections were removed. Three Opus desks, same brief and harness.

| desk | hidden | overlap defects | fuzz | defects |
|---|---|---|---|---|
| opus-1 | 45/45 | 1 | 6/20 | 7 |
| opus-2 | 45/45 | 1 | 4/20 | 5 |
| opus-3 | 45/45 | 1 | 2/20 | 3 |

Mean 5.0. **All three apps used the shape**; none kept a ledger. Traced:
- "an earlier move declined while a later move of the card is out" (all three, fails its hold probe): an accepted
  move re-asked only its from/to lists, not the list holding the card now.
- opus-1 fuzz seeds 2, 9, 18: the guide said to also re-ask "the list that holds the row now (`latest`)". `latest`
  of a list that hasn't answered yet throws NotReadyError, which `catch (e) => []` doesn't take; the action's own
  `try` took it as a decline with an empty message and skipped every refresh, so the guess reverted. With the
  `latest` reads replaced by plain refreshes of all three lists, those seeds pass. Guide fixed in fde2b56: re-ask
  every list the row can be in.
- Seed 14 (opus-1, opus-3) and opus-2 seed 17: a toggle made while switching to another card was held. The card shows
  the toggle and the held checklist doesn't. This is a Solid bug: solidjs/solid#4987 (repro
  `repro/guess-hidden-in-held-loading-on.spec.tsx`).
- opus-2 seed 10: the card count loses a toggle after a rename guessed in between. This is a Solid bug:
  solidjs/solid#4988 (repro `repro/guess-lost-after-other-field.spec.tsx`).
- opus-2 seed 13 page error: the app mirrors derived state (which card each column has selected) into sources with
  effects. That is agent code.
- opus-1 seed 12: the detail of a card in Doing shows "error: declined" when a To do re-ask fails. In the app,
  reading `sel.card.title` throws To do's error. Minimal trail: select a To do card, accept a reorder in To do (To do
  re-asked), select a Doing card, fail the re-ask. Probably the same family as probe 3's detail tear (solidjs/solid#4990);
  not yet re-checked against that repro.
- opus-2 seed 20 (heading count after an archive), minimal trail: select #3, a toggle accepted, a rename, Archive tab,
  Doing's re-ask lands, archive #3. The heading says 1 and the column shows 2. Not yet reduced.
- opus-3 seed 18: a rename and an item add land on the card below the selected one. Not yet reduced.

## Probe 3: re-ask every list the row can be in (desks r15i, `probe3/`)

Same as probe 2, with the move rule fixed (fde2b56).

| desk | hidden | overlap defects | fuzz | defects | agent time |
|---|---|---|---|---|---|
| opus-1 | 45/45 | 0 | 9/20 | 9 | 6.0 min |
| opus-2 | 44/45 | 0 | 7/20 | 8 | 5.4 min |
| opus-3 | 44/45 | 1 | 10/20 | 12 | 6.7 min |

Mean 9.67. All three follow the rule (no `latest`; every accept re-asks all three columns). Every hold probe passes,
including "an earlier move declined …", which no app fails now. Two new overlap failures in all three apps ("an add
accepted while To do reloads", "two renames, the later declined") are consistent holds: the re-asks of the other
columns hold the add and the declined rename until they land (`trace/holds-probe3.mjs`, `probe3/holds/*.extra.txt`).
They are excluded as shared-list holds, but they are longer holds than before, caused by re-asking every list.

Traced fuzz families:
- opus-3, 7 of its 10 holes: the detail finds the card's column with `has(todoRows, selected)` and no `catch`, so it
  shows "loading" until every column has answered. That is agent code.
- opus-1 seeds 2, 13, 18 and opus-2 seeds 2, 13: the detail tears after a re-ask fails. opus-1 shows the else branch
  with values from before the selection (`#-1 undefined in`), and opus-2 shows `#4 in`. Minimal trail (opus-1): Doing
  loads while To do and Done are still on their first fetch; move #4 up, then down; select #4; accept the second move
  (it re-asks all three); fail To do. A Solid bug: solidjs/solid#4990 (repro
  `repro/show-fallback-tear-after-failed-load.spec.tsx`). A `Show` whose condition reads a memo that reads stores through
  error boundaries mounts its fallback with values from before a held selection. It only happens when another error
  boundary over a memo of that condition exists, which is what `selIndex = (… where …) catch (e) => -1` compiles to.
  Re-asking every list makes it more frequent.
- Count tears (opus-1 seeds 10, 16; opus-2 seeds 10, 14, 20; opus-3 seed 10) match #4987 and #4988.
- opus-3 "a move into a column that is still loading": the move is allowed and its index is counted from the unloaded
  column. That is agent code.
- Hidden "the new-card input starts empty when the board opens again" (opus-2, opus-3): agent code.
- Every app mirrors its column counts into sources through an `effect` (`Count`) to drive the Doing limit.

## Regrade on Solid main 4f3c3c4ce (`regrade-main/`)

The same apps and grader on Solid main 4f3c3c4ce, which has the fixes for #4987, #4988 and #4990 (and #4969–#4972).

| | before (rc.23) | on main |
|---|---|---|
| Probe 2 board | 7, 5, 3 (mean 5.0) | 6, 3, 2 (mean 3.67) |
| Probe 3 board | 9, 8, 12 (mean 9.67) | 7, 8, 11 (mean 8.67) |
| Desk9 on the one-shape guide (r15j) | 0, 0, 1 | 0, 0, 1 |

The hidden and overlap results are identical. Seven fuzz holes are gone: probe 2's count and toggle tears (#4987, #4988), probe 3 opus-1's three detail tears (#4990), and opus-3 seed 10.

What's left that I had put on Solid:
- probe 3 opus-2 seed 13 (and very likely seed 2): the detail mounts blank (`#4 in`). New Solid bug, solidjs/solid#4998
  (`repro/for-mount-blank-after-failed-reask.spec.tsx`). The detail is mounted by `For` after a held selection, and
  the latest re-ask of a list it reads fails while an older ask is still out.
- probe 3 opus-2 seeds 14 and 20, and opus-1 seed 16: a toggle clicked on the old detail while a new selection is held.
  The detail's progress shows the toggle, but the card in its column doesn't. Minimal trail (seed 20): Doing loads;
  select #3; its checklist loads; To do loads; add item "qa 3"; select #1 (held with the add); toggle item 1. Plain-Solid
  versions of the same family: solidjs/solid#4999 (`repro/count-misses-guess-under-held-loading-on.spec.tsx`, plus
  `repro/two-readers-of-row-disagree-under-hold.spec.tsx` in a comment there).
- opus-1 seed 13: a move guess on Doing asks the errored To do again, because the detail's `where` memo reads it
  through a fresh error boundary. `where` then waits on that ask, so the detail says "in Doing" while the card shows in
  Done. Solid bug solidjs/solid#5002 (`repro/errored-list-reasked-by-fresh-boundary.spec.tsx`).
- opus-1 seed 10: after every ask has landed, `selected` stays pending and the detail is stuck on the old card. The
  trail is 18 steps: a toggle, a save and a move, each re-asking all three lists, with selections in between. Solid bug
  solidjs/solid#5003 (`repro/select-stuck-pending.spec.tsx`).

So every probe 3 hole I had put on Solid is still a Solid bug on main, now filed as #4998, #4999, #5002 and #5003.

The desk9 hole (opus-1 seed 14) is a guide issue. The handler skips its row guess when `pending? issues`, and that reads
true while another row guess holds a landed refresh. guide/async.md no longer tells agents to test `pending?` in the
handler.
