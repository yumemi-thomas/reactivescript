Not reduced past 21 steps (30-min box). Fuzz seed 11 (r15, board-rx3 = eval/reference/board/rx-store).
At rest (nothing in the air) the Doing column renders a row "# · /" (every field empty): the store dump
(src-with-store-dump, a <pre> reading the same `board`) holds the right rows (STORE[... 5:doing:0 3:doing:1] over
DOING[5 3] DONE[]), so the keyed row #3 under `for r in props.rows { if r.adding … else … }` renders undefined fields
after it moved Done -> Doing while the Doing column's re-ask failed and answered again. Same family as
keyed-row-under-if-after-guess.rx / keyed-row-under-show-after-guess.spec.tsx. A plain-Solid attempt (two <For>/<Show>
over a keyed createOptimisticStore over signals, same guesses and truth changes) did not reproduce: it needs the
actions' refreshes (async memos in transitions).
Run: node replay-board.mjs <desk> "$(cat min11.trail)" 1     (replay-board's `answer` applies a write even when the
flight is not in the air; step 17's error is that, harmless.)
