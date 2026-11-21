# Round 15: six arms, two tasks, two tiers, for publication

Pre-registration, committed before any round 15 agent runs. Status: FROZEN 2026-11-16 (Ryan: "It's round 15 time"). The deviations are listed under "Freeze".

## Why

Rounds 10 to 14 were exploratory. Each one changed the guide, Solid, or the grader between runs, used one task the guide had been tuned on (desk9), and ran on unreleased builds. Round 15 is the round meant to be published.

- **Fixed in advance:** the arms, tasks, builds, grader and tests below.
- **Builds:** released versions only.
- **Tasks:** one task the guide has never seen (board) next to the familiar one (desk9).
- **Reporting:** every result is published, including nulls and reversals.

Ryan's direction (2026-11-12): .rx has to at least equal React at frontier models to matter. The defect gap at small models is the claim it may be able to win. Cost is reported, but it isn't a hypothesis.

## Arms

All six arms have a hand-written reference that grades 0 on both tasks (see "References").

| arm | stack | what it stands for |
|---|---|---|
| `rx` | ReactiveScript over Solid 2.0, with `--inline-docs` (language.md, async.md, reference.md) | PRIMITIVES |
| `react` | React 19, TanStack Query offered | the default |
| `contract` | Exact (Contract + TypeScript data module), its own `start-here.md` | Exact, a likely competitor |
| `xstate` | React 19 + xstate 5.32 + @xstate/react 6.1, Stately v5 docs | PROCESS (state machines) |
| `foldkit` | Foldkit 0.170 on Effect 4, with `--inline-docs` | PROCESS (Effect/TEA) |
| `vanilla` | plain TypeScript and the DOM | PLATFORM (stand-in for Remix 3's no-abstractions bet) |

## Tasks

- **`desk9`** (`brief-plain.md`), unchanged since round 12. Graded by `hidden.mjs` (77), `hidden-overlap.mjs` (38) and `fuzz.mjs --r15`, 20 seeds. The guide was tuned against this task over rounds 9 to 14, so it is not held out. It is reported as the familiar task.
- **`board`** (`brief-plain.md`), a sprint board: cards across three columns, moves and reordering, a work-in-progress limit, each card's checklist, renames, adds, an archive page, and overlapping writes. It is new and held out: no .rx, guide or Solid change was made while looking at agent output for it. Graded by `hidden.mjs` (45), `hidden-overlap.mjs` (26) and `fuzz-board.mjs`, 20 seeds. Agents see `visible.mjs` (26).

## Builds (released only)

- **Solid:** `solid-js`, `@solidjs/signals`, `@solidjs/web` and `@solidjs/compiler` 2.0.0-rc.23 from npm (tag commit 8c34a505a, 2026-11-16). It contains #4856, #4859, #4888, #4889, #4897, #4902, #4904, #4907, #4918, #4926, #4928, #4929, #4931 and #4932.
- **rxc:** built from the commit that freezes this file (`cargo build --release`), with the runtime in `ref/compile/rt-web.ts` from that commit. Deviation: not published first (see "Freeze").
- **Exact:** Exact has no tagged release, so this is a pinned checkout, commit 8c742e6a (a deviation, as planned).
- **Foldkit:** the published 0.170.0, with effect 4.1.0.
- **React / XState:** react 19.2.0, xstate 5.32.6, @xstate/react 6.1.0, @tanstack/react-query 5.90.2.

**Gate (as drafted; see "Freeze"):** before the round starts, all 12 references (6 arms × 2 tasks) are regraded on the frozen builds and must grade 0. If one gains a hole, it is traced. A framework bug is filed upstream and the round waits; a reference bug is fixed in the reference.

## Grading

- **What counts:** only defects (Ryan, 2026-11-10). Holds that are by design (H-11) and failures the brief caused are excluded from every total. Each exclusion is listed with its trace.
  - **How exclusions are applied:** the graders still fail a test that a hold breaks, as they do on the .rx board reference. Every .rx failure is traced, and one whose trace is a by-design hold is excluded. The holds found while writing the references, and so excluded: H-11 (a switch made while a write's re-ask is out holds with it: on board "two adds show both, each taking its own id", and "a toggle declined after another card was selected puts the first card's count back", where the selection holds with the toggle); the shared-list holds below; and a guess made before its value shows, handled under the loading boundary, guarded by `disabled`, or kept in a separate list (Ryan, 2026-11-12). The fuzzers allow these holds themselves (A5, B3). A hold is excluded only when it is consistent: a screen that disagrees with itself, flickers back or never settles is still a defect.
  - **Shared-list holds (Ryan, 2026-11-15):** two writes that guess the same list share its slots (#4724) and end together, so a declined one stays up, consistently, until the other ends. These are by-design holds and excluded like H-11. On board, the per-fetch .rx reference fails two overlap tests this way ("one of two moves declined puts back only its card", "a move into Doing that fills it while a move out is pending disables the rest"). Both are excluded, with traces.
- **Defects per app:** failed hidden tests, plus failed overlap tests, plus fuzz seeds with a hole, with a task's tests and fuzz counted together (as `harness/grade.sh`).
- **Fuzz rules,** the same for every arm:
  - **Same field written twice:** at rest, the field must show the server's last answer (Ryan, 2026-11-14, final). This is why `--r15` drops desk9's A2 allowance.
  - **Late writes:** a write that answers after its page was left need not show on the next visit (Ryan, 2026-11-14: out of scope). On desk9 this is A4, extended to the detail, labels, comments and two-views checks. On board it is B1: settled checks are skipped, as is the duplicate-card check, in a visit where a late write landed.
  - **B2 (board):** after two moves overlap in the air, a column's settled order isn't checked, only which cards it holds.
  - **B4 (board):** while anything is in the air, a card's count may keep accepted toggles of an item that was toggled more than once in that busy period, because their answers can come back in another order than the clicks. At rest, the server's count. This follows from the same-field ruling above (added 2026-11-16, before any run).
  - **Repeated keys:** when one request is asked twice (an archive asked on two visits), every asker gets the first answer the server accepted (fuzzer fix, 2026-11-16, before any run).
  - **Distinct texts:** fuzz-added cards and items get unique texts, because two adds of one text are one flight to the harness.
- **Board fuzz oracles:** these are listed at the top of `harness/fuzz-board.mjs`.
  - Every frame: duplicate card, heading count, card count against progress, every card's count against the server (give or take that card's own writes still in the air), the work-in-progress limit, the detail's column and title.
  - Settled: columns, checklist and archive equal the server's.

## Freeze (2026-11-16)

Ryan started the round on rc.23 and waived two steps, so that the round would not wait on more regrades of builds that don't change. Both waivers are deviations from this file as drafted.

- **Gate:** not rerun on rc.23. rc.23 is `next` f57cc89fe plus a version bump and a size re-record (8c34a505a). On f57cc89fe, both .rx references graded 0: desk9 77/77, 38/38, 0/20; board 44/45 and 23/26 (only the excluded holds), fuzz 0/120 seeds. The other ten references don't use Solid. They graded 0 on the fuzzers before the two fuzz changes above, which only remove false holes.
- **Outside review:** not done before the runs. The review happens after, on this file as frozen.
- **rxc:** not published before the runs. The binary is built from the freezing commit.
- **Prompt delivery:** each agent is told to read its desk's `.prompt` (written by `scaffold.mjs`, the round 12 prompt per arm) in full and follow it, instead of getting the text pasted in. That costs one read, the same for every arm.
- **Concurrency:** the runs go two at a time on one 4-CPU machine, in the order in `runs/r15/.order` (a seed-15 shuffle of the 144 desks). Time per run is taken from each agent's transcript.

### What happened during the runs (recorded after, 2026-11-17)

- **Two container restarts.** The machine restarted twice, at about 22:25Z on 11-16 (after 34 runs) and about 02:40Z on 11-17 (after 88). Each restart killed the runs that were going. Finished runs kept their desks, and each one's final report was saved as `<desk>/.report`.
- **Four desks run again from scratch.** Four desks were interrupted mid-run: board-rx-haiku-2, board-rx-haiku-4, desk9-contract-opus-2 and board-vanilla-haiku-6. Their partial desks were moved to `runs/r15/.interrupted/` (kept, not graded). Each was scaffolded fresh and run again in the same order. The remaining runs went in the same order as before. All 144 runs finished at about 07:20Z on 11-17.
- **Five empty final reports.** These agents ended without a final report: board-rx-haiku-1, board-contract-haiku-1, board-rx-haiku-4, board-xstate-haiku-1 and board-contract-haiku-2. Their apps are graded as left on disk, like every other app.
- **After-the-page-was-left tests (Ryan, 2026-11-17).** Seven grader tests judge, on the next visit, a write that landed after its page was left. Ryan's caching ruling had already put that case out of scope, but before this only the fuzzer (A4) followed it. These tests are now excluded from every arm's totals; the counted totals are reported beside them.
- **Solid 2.0.0.** Solid 2.0.0 was released during the round, on `main`. Between 8c34a505a and 2.0.0 (main 8a129c9f6), the signals and solid sources changed only in comments and docs links. The one code change is in web: a `hydrate(document)` fix (#4962), and these apps don't hydrate. So the results apply to 2.0.0 too.

## Runs

- **Count:** for each arm and task, 6 frontier (Opus) and 6 small (Haiku) apps. That is 6 × 2 × 12 = 144 runs, in one interleaved batch.
- **Limits:** at most 15 `./check`/`./test` calls per run.
- **Harness:** subagents with the round 12 prompt per arm (`harness/prompt-arms.json`). Time is recorded per run (`.agent.json` `ms`).

## Hypotheses

All tests use seed 15. Each app's defects are summed across its task's three graders. Comparisons pool the two tasks, and permutations shuffle labels within a task, so 12 apps per arm per tier.

- **H15a (primary family, small tier):** .rx apps have fewer defects than each other arm.
  - Five one-sided permutation tests on mean defects, 100,000 relabellings, Holm-corrected together: rx < react, rx < contract, rx < xstate, rx < foldkit, rx < vanilla.
- **H15b (frontier tier):** .rx apps have no more defects than React apps.
  - Difference in means (rx − react), with a 90% bootstrap interval stratified by task, 10,000 resamples. Holds if the upper end is under 1 defect.
  - The same interval is reported for rx against each other arm, without a claim.
- **H15c (held-out check):** H15a's rx < react, on board alone, small tier. Reported beside the pooled test. This shows whether the effect survives on a task the guide was never tuned for.
- **Descriptive, every arm × tier × task:** mean defects with a 90% interval; defects by kind; cost per run and per correct app; time per run; turns; lines.
  - Cost and time are not hypotheses (Ryan: .rx won't win on cost).
- **Not tested:** PROCESS against PLATFORM comparisons are reported descriptively only.

The direction is the claim. A null or reversed result is reported as plainly, and all 144 apps, their grades and their traces are published.

## Known caveats (from writing the references)

- **Board, .rx:** the reference (`reference/board/rx-cols`, 429 lines) is the guide's shape: one keyed optimistic store per fetch (Ryan, 2026-11-15: store granularity = the fetch call), every write a guess into those stores, accepted writes re-asking the answers they changed, and an add's placeholder in the same store. An earlier reference that kept its own record of every write (`reference/board/rx`, 532 lines) was dropped, because references must be idiomatic and the app should not keep its own bookkeeping (Ryan, 2026-11-14 and 2026-11-15). Writing the reference changed the guide's async.md section "One store over the server" (8876be0, task-neutral examples) and made keys apply at any depth (ST-4a, c58dba7). This came from writing the reference, never from agent output, so board stays held out from agents. It is still not blind to the .rx authors, which the report states.
- **Board, .rx move re-asks:** an accepted move re-asks the answers that hold the card now (read with `latest`), as well as its own columns. Re-asking only its own columns leaves a stale copy after two moves of one card (fuzz 2/60), and re-asking all three columns is worse (5/60). An agent has to see this to score 0 on board. Missing it is an agent defect.
- **Board, Exact:** `parallel` hides an earlier send's failure once a later send concludes, and the brief clears a move error only when the next move starts. Idiomatic Contract cannot meet this (`parallel` takes no `then`), so the Exact reference keeps errors in its data module, the only way found. Recorded as an Exact limit that agents must work around; the test stays (Ryan, 2026-11-14).
- **Board brief, unspecified but untested:**
  - a move into a column still loading;
  - whether "archive error" covers both the archive page's load failure and a declined archive;
  - adding before To do has loaded;
  - when the archive error clears;
  - re-selecting a card whose checklist failed to load.
- **Desk9 (from rounds 9 to 14):**
  - the fuzz server never returns a stale answer to a load that started before a write;
  - the 60 ms settle can hide late TanStack updates.
- **Solid:** the .rx board references found #4859, #4861 to #4864, #4871, #4874, #4888, #4889, #4897, #4902 and #4904. If the frozen Solid lacks a fix, .rx agents can hit that bug. Each such hole counts as a defect, attributed to Solid in the report.

## References (all grade 0)

| task | rx | react | contract | xstate | foldkit | vanilla |
|---|---|---|---|---|---|---|
| desk9 (`--r15`) | 0 | 0 | 0 | 0 | 0 | 0 |
| board (+40 extra seeds) | 0 (429 lines, rx-cols) | 0 (681) | 0 (510) | 0 (890) | 0 (1293) | 0 (752) |

`reference/desk9/*` and `reference/board/*` (rx = `rx-cols`) were graded on Solid `next` 57a7f422f, except board rx, which was graded on b08afe5ce. Its two excluded overlap failures are shared-list holds, and its one excluded hidden failure is H-11 (see `rx-cols/GRADE.txt`). All references are regraded at the gate.

## Review and cost

- **Review:** before freezing, an outside reviewer (not Claude) reads this file and the board brief and tests. Ryan picks who.
- **Cost:** about $200 to $250. Frontier runs cost about $1.30 to $3.30 each, depending on arm; small runs about $0.15 to $0.30 each.
