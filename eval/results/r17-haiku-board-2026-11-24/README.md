# r17: 6 Haiku board apps on the AC-1h guide (2026-11-24)

Six new Haiku board apps, same scaffold as the rerun (`--brief plain --inline-docs`), on the guide with AC-1h
(`STALE_NEXT_READ`), Solid main 30e7805eb. Graded with `harness/grade.sh` (`FUZZ_ROUND=--r15`), fuzz regraded with
B5 widened (a column whose last fetch failed holds the detail's errored fallback until one lands, retry included;
Ryan 2026-11-24). Defects = failed hidden and overlap tests + fuzz seeds with a hole, minus tests whose hold probe
passes and the after-left family.

| app | tests kept | fuzz seeds | defects |
|---|---|---|---|
| 1 | 2 | 8 | 10 |
| 2 | 0 | 4 | 4 |
| 3 | 1 | 0 | 1 |
| 4 | 1 | 2 | 3 |
| 5 | 1 | 5 | 6 |
| 6 | 1 | 1 | 2 |
| mean | | | **4.33** (r16 Haiku board 19.0) |

With the two Solid bugs below fixed: 9, 4, 1, 3, 4, 2 = 3.83. No duplicate-id holes (AC-1h's family) remain.

Hold probes (all ruled fine by Ryan 2026-11-25): `holds/` (round 15 probes, the rerun's, and `../rerun-2026-11-23/trace/holds-item-reload.mjs`, new: app 4
holds an item add until its toggle's column re-asks land, which the hidden test never answers; it settles right).

## Every failure, traced

Solid (plain-Solid repros in `repro/`):
- app 5 seeds 8, 17: a row a guess moved renders with no text while later guesses and held writes pile up, so the
  heading counts more cards than show (solidjs/solid#5192).
- app 1 seed 6: a guess that makes `For` mount a row reading a memo over a failed `createOptimistic` re-asks that
  list and is held until it answers; the move guess doesn't show, and the detail pane tears beside it (id new, title
  old) (solidjs/solid#5195).

Ours, fixed here:
- app 1 seed 19, app 6 seed 13 (page error "declined"): a click read a failed list through a component. App 1's
  `onMove`, written on the board, read the other columns' lists; app 6's lane handler read `props.lens`, a memo over
  all three. R-8 never looked through components. It now does (spec/04-rows.md R-8 "Through components"); app 1 is a
  compile error. App 6 is not: its `disabled` reads `props.lens` behind `props.column == "done" && …`, and R-8 counts
  any read, guarded or not.
- apps 3, 6 "a move into a column that is still loading": they declare `-> null` and the `[]` stand-in the guide
  teaches, so the handler sends index 0 into a column it hasn't seen. Guide (async.md §1): the stand-in is not an
  answer; keep a control that computes from the list disabled while it is null.
- apps 2, 4 card counts: the count is set to a number computed from what the screen showed (app 2 from the committed
  checklist in the action; app 4 from the handler, then written as truth after the `await`). Guide (async.md §3):
  guess a count as a change.

Agent:
- app 1, 6 seeds (4, 8, 11, 15, 18, 20) "detail says loading card": the detail's `loading on(sel)` borrows lists with no `-> v`.
- app 1 "a column's retry shows loading": Done's buttons read `full` over Doing, which never answers in the test, so
  Done waits on it (guide §1 says to give the answer a value where it's declared).
- apps 1, 5 "an earlier move declined while a later move is out": app 1 re-asks only the lists the shown move
  touched; app 5 never re-asks and writes its own copy of each move into the answer.
- app 5 seeds 11, 12, 18 (settled title, order, archived card): same app 5 shape. A move copies the shown (guessed)
  title into the answer; a move's position is the client's, not the server's.
- app 4 seeds 4, 11 (two views): the detail title is copied into a plain source on select, and a rename's guess on it
  shows under the next selection.
- app 2 seeds 4, 12, 14 (hang): a guess before the list loaded, through `props.onAdd`; dev throws for it.
