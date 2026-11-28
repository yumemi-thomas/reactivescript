# .rx rerun on Solid main 30e7805eb (2026-11-23)

24 new .rx apps: board and desk9, 6 Opus + 6 Haiku each, same scaffold as round 15 (`--brief plain --inline-docs`),
current guide, Solid main 30e7805eb (#5095, #5104, #5146 fixed). Graded with `harness/grade.sh` (`FUZZ_ROUND=--r15`).
Defects = failed hidden + overlap tests + fuzz seeds with a hole, minus tests whose hold probe passes and the
after-left family (`python3 score.py`).

| | round 15 | rerun |
|---|---|---|
| desk9 Opus | 0.00 | 0.33 (2,0,0,0,0,0) |
| desk9 Haiku | 1.50 | 3.50 |
| board Opus | 6.33 | 3.67 (0,14,1,0,0,7) |
| board Haiku | 24.67 | 19.00 |

Round 15 column rescored with the same probes (it was 0, 1.5, 6.33, 25.17).

Probe changes (judgement calls; Ryan 2026-11-25: "These are all fine"):
- `round15/trace/holds9.mjs` re-ask also answers the selected issue's detail; `round15/trace/holds.mjs` `reloads()`
  answers columns not named as they first loaded. Apps that re-ask every list after a write held there and settle right.
- `trace/holds-board-reopen.mjs`: "the new-card input starts empty when the board opens again" checked after To do's
  re-ask lands. All six Opus apps keep the add input under To do's loading (ruled acceptable 2026-11-12).

Traced:
- board opus-2 (13 seeds): the detail sits in one loading region that reads all three columns, so it says "loading"
  until every column has arrived (agent).
- board opus-6 (7 seeds): page NotReadyError = solidjs/solid#5174 (a handler reading a ternary prop while its source
  re-asks; `repro/handler-reads-ternary-prop-during-reask.spec.tsx`). Minimal trail: land doing; land todo; left #3;
  land move; right #2.
- Haiku's 12 agents each posted one stray chat message (a tool they were told not to use); not part of the task.
