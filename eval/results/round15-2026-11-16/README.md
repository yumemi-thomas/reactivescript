# Round 15 (2026-11-16/17): six arms, two tasks, two tiers

This round was preregistered in [`../../PREREG-15.md`](../../PREREG-15.md), which was frozen before any run and lists every deviation. It ran 144 apps: 6 arms × (6 Opus 5.5 + 6 Haiku 5.5) × 2 tasks (desk9, and the held-out task, board). Solid was 2.0.0-rc.23; 2.0.0 has the same signals code.

**Status:** scored. Ryan ruled on 2026-11-17 that the seven "a write lands after the page was left, judged on the next visit" tests are out of scope (his caching ruling), and they are excluded in every arm. [`score-count-left.txt`](score-count-left.txt) shows the totals with them counted. The outside review is still to come.

## Result

Mean defects per app. Each app's defects are its failed hidden tests, plus its failed overlap tests, plus the fuzz seeds that found a hole, minus the traced by-design holds:

| | rx | React | Exact | XState | Foldkit | vanilla |
|---|---|---|---|---|---|---|
| desk9, Opus | **0.00** | 3.17 | 1.67 | 2.67 | 2.67 | 5.00 |
| desk9, Haiku | **1.50** | 9.00 | 21.83 | 16.50 | 16.00 | 11.00 |
| board, Opus | 6.33 | **0.67** | 7.17 | 1.50 | 1.33 | 1.50 |
| board, Haiku | 25.17 | 3.00 | 31.67 | 15.67 | **2.83** | 3.00 |

The preregistered tests ([`score.txt`](score.txt)) give:

- **H15a (Haiku, both tasks pooled; rx < each arm, Holm): not supported.**

  | comparison | difference | p | Holm |
  |---|---|---|---|
  | rx < React | −7.33 | .89 | 1 |
  | rx < Exact | 13.42 | .031 | .155 |
  | rx < XState | 2.75 | .35 | 1 |
  | rx < Foldkit | −3.92 | .75 | 1 |
  | rx < vanilla | −6.33 | .86 | 1 |

- **H15b (Opus; rx − React, upper end of the 90% interval under 1): not supported.** rx − React = +1.25 [0.33, 2.17].

  The other differences, reported without a claim:

  | comparison | difference | 90% interval |
  |---|---|---|
  | rx − Exact | −1.25 | [−2.67, 0.08] |
  | rx − XState | +1.08 | [0.17, 2.00] |
  | rx − Foldkit | +1.17 | [0.25, 2.08] |
  | rx − vanilla | −0.08 | [−1.33, 1.08] |

- **H15c (board, Haiku; rx < React): not supported.** The difference is −22.17 and p = 1.

The two tasks point opposite ways. On desk9, the task the guide was written around, .rx has the fewest defects at both tiers by a wide margin. On board, the held-out task, .rx is among the worst, ahead only of Exact.

## Why board went badly for .rx (traced)

Every .rx test failure was traced (see `trace/`).

- **The holds are by design, and they are excluded.** The hold probes (`trace/holds.mjs`, `trace/holds9.mjs`) replay a failing test. At the point where the test checks, they accept either the expected screen or the screen exactly as it was before the write. Then they answer everything still in flight, as the server would, and require the settled screen to be right.
  - In all 6 Opus board apps, the three holds known from the reference hold consistently and then settle: "two adds" (H-11), "one of two moves declined" (shared list) and "a move into Doing that fills it" (shared list).
  - The same is true for the H-11 toggle hold in 10 of 12 apps, and for 3 shared-list holds in desk9-rx-haiku-5.
  - The 36 excluded failures are listed per desk in [`exclusions.json`](exclusions.json).
- **What remains is mostly agent code, and it comes from one choice of shape.** All 6 Opus .rx board apps kept guess ledgers (`moving`, `renaming`, `addingCards`, …) laid over the column answers, which is the desk9 reference's shape. None used one store per fetch (`rx-cols`, the board reference). The ledger shape then needs hand-written writes on accept, and the agents got those wrong in the same ways:
  - **Wrong column.** An accepted move was written into the `from` column captured at the click. When an earlier move of the same card was declined, the card stayed in To do and also showed in Done (opus 1, 2, 4, 6).
  - **Stale card.** A move wrote the card captured at the click, so a rename that had been accepted in the meantime was lost (opus 2, 6).
  - **Separate placeholder list.** Add placeholders kept in their own list stay up through a shared-list hold, next to the added card that has already been written into the answer. This shows the card twice; it is the most common fuzz hole.
  - **Handler reading an unloaded column.** A click handler read a column that had not loaded yet, which throws NotReadyError (opus-6). The button was not under that column's loading boundary.
  - **Mostly broken apps.** Two Haiku apps, board-rx-haiku-1 and -4, are mostly broken: buttons never enable, about 50 failures each.
- **Solid bugs, reported upstream with plain-Solid repros in `repro/`.** They count as defects, as the prereg says, and are attributed to Solid.
  - [solidjs/solid#4969](https://github.com/solidjs/solid/issues/4969): `reasks()` overflows the stack when two keyed projections each wait on the other, because each holds a row read from the other (board-rx-opus-4, fuzz seed 20).
  - [#4970](https://github.com/solidjs/solid/issues/4970): a memo under a keyed projection stays stale after an accepted add, when a reorder had written that projection's own row back (board-rx-opus-6, "an add accepted while To do reloads").
  - [#4971](https://github.com/solidjs/solid/issues/4971): a memo over a keyed projection's `length` counts a placeholder twice after its answer replaces it (board-rx-opus-1 and -4, "an item added while the checklist reloads"; the repro is 25 lines).
  - [#4972](https://github.com/solidjs/solid/issues/4972): `RangeError: Invalid array length` in the scheduler heap after a reorder wrote a projection's own row back, a rename was out and the list was asked again (board-rx-opus-4, fuzz seed 6).

  Fixing all of these would remove only a handful of board defects, so the gap would remain.

**Lesson.** On a task the guide wasn't tuned for, frontier agents carried over the shape they had seen (ledgers) instead of the guide's "One store over the server". The language's checks didn't stop them, because the ledger shape is legal. The writes after an accept, which that shape forces, are where they failed. This is a guide/teaching result, and possibly a reason to look for a static check. It is not a sign that the language's semantics are wrong.

## Cost, time, size (descriptive)

From [`descriptives.tsv`](descriptives.tsv), which reads each agent's transcript and the app's own sources. Prices are per 1M tokens. Opus 5.5: $4 input, $20 output, $0.20 cache read, $5 cache write. Haiku 5.5: $0.10 input, $0.50 output; its cache rates are assumed to be the usual 0.1× and 1.25× of input. The total across all 144 runs is $128.74.

| tier / task | metric | rx | React | Exact | XState | Foldkit | vanilla |
|---|---|---|---|---|---|---|---|
| Opus desk9 | $/run | 1.23 | 1.20 | 2.20 | 2.01 | 2.84 | 1.06 |
| | min/run | 6.4 | 6.1 | 10.0 | 9.9 | 11.0 | 5.3 |
| | lines | **454** | 943 | 572 | 1508 | 2516 | 982 |
| Opus board | $/run | 1.66 | 0.90 | 1.99 | 1.68 | 2.55 | 0.86 |
| | min/run | 9.6 | 4.8 | 8.1 | 8.9 | 10.0 | 4.5 |
| | lines | **414** | 654 | 476 | 1029 | 2021 | 688 |
| Haiku desk9 | $/run | 0.09 | 0.08 | 0.11 | 0.13 | 0.17 | 0.08 |
| | lines | **371** | 968 | 548 | 1324 | 2140 | 1075 |
| Haiku board | $/run | 0.08 | 0.05 | 0.13 | 0.11 | 0.17 | 0.06 |
| | lines | **344** | 716 | 517 | 928 | 1601 | 638 |

Lines count non-blank lines of the app's own sources: `src/` without the harness files, or `app.contract` + `app.ts` for Exact. Time runs from the first to the last entry of the agent's transcript, with two runs going at a time on 4 CPUs.

## Files

- `grades/`: each app's grade (hidden, overlap, fuzz), unchanged from `grade.sh`.
- `exclusions.json`, `trace/`: the hold probes, their outputs (`trace/out/`) and the step traces behind the attributions above.
- `repro/`: the Solid repros.
- `score15.py`: the H15a–c computations.
- `descriptives.py`: cost, time and size per run.
- `apps/`: all 144 apps' sources and the agents' final reports (`.report`).
- `order.txt`: the run order (a seed-15 shuffle).
