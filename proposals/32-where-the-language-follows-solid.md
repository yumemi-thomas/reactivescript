# 32. Where the language follows Solid's rulings

Not a proposal: a record for the others to cite. ReactiveScript compiles to Solid 2, and its spec was written beside
Solid's runtime, often before Solid had decided a case. Where the two met and Solid's maintainers ruled — a rule in
Solid's `RULES-*.md`, a pinned test, a changelog line, an issue closed "by design" — the language took Solid's ruling,
even where its own first design said something else. Where Solid's behaviour is a bug (Solid says so, or nothing Solid
states supports it), the language keeps its rule, runs as if Solid were fixed, and records the difference as a
divergence (`DV-n` in spec 05 and 10) with a plain-Solid repro in `ref/oracle/repros/`. The audit of 2026-11-27
(`DECISION.md`, "Audit: rules and Solid bugs") checked every `DV` against this split.

Read the table as: *our first design* → *what Solid ruled* → *where Solid pins it* → *where the language says so now*.

| | our first design | Solid's ruling | pinned in Solid | the language now |
| --- | --- | --- | --- | --- |
| **DV-2** a failed action | a body that ends by an exception is a failed transaction: all of its held writes revert | the plain writes an action held commit when its body ends, by return or by rejection; only its optimistic state reverts ("a write is intent, a guess is the one provisional state") | `RULES-DERIVED.md` D-7 (an action's writes are held until the body has returned), D-33 (a guess lives as long as its hold); the oracle's frames on every release since rc.16 | 06 AC-1, 04 R-f-6, 07 §9; S-solid-8, S-solid-32 variants, S-action-1 (ruled 2026-10-22) |
| **DV-5** `pre` | `pre x` is `x`'s value in the previous frame | the value before its most recent change: an unrelated write does not move it (a memo's `prev` argument) | the memo API (`createMemo(fn)`'s previous value) | 02 C-2, P-6; S-core-1 (ruled 2026-10-23) |
| **DV-10** a held lane | a pending reader in lane `x` holds every reader of `x`, probes included | a tracked `latest()` of a guess reads ahead of the guess's held lane; the lane's other readers keep what they showed | `verdict-contract.test.ts` "the reader breaks out of the lane"; `RULES-FUNDAMENTALS.md` F-6 (#4284); solidjs/solid#4284 | 05 H-7, H-11; S-solid-35 variant `1 x1 / 5` (2026-10-26) |
| **DV-11** the hydration window | an input that changes after the takeover is a new question, asked at once | a boundary waiting on async cannot hydrate until the server's answer arrives; until then the node keeps the server's state | solidjs/solid#4272, closed by design | 10 SV-3b; the `## Hydration window` sections of S-solid-24, S-store-5, S-ai-feed (2026-10-26) |
| **DV-8b** `pending?` of a structured value | `pending? rows` asks the projection itself | a probe judges the reads its thunk makes, never its return value: `isPending(() => store)` reads nothing and is `false` | `RULES-DERIVED.md` D-23, D-24 ("the probe is reads-only"), A23 | `pending?` over a structured value reads its keys (`__rt.isPending`); S-ai2-search (2026-10-27) |
| **H-12** a re-armed `loading` over an error fallback | the error fallback stays up while the content under it re-asks, whatever is above | an armed boundary catches what is pending under it, the error fallback's content included | `RULES-FUNDAMENTALS.md` F-4, `RULES-DERIVED.md` D-12, D-17 | 05 H-12; S-hold-6 (2026-10-24) |
| **DV-19** `latest` of a shown guess after a re-ask | the guess (then, for one day, the truth, following Solid's behaviour of the time) | `latest` of a slot that displays a guess answers the guess until the hold commits; an answer corrects the graph now and the screen at the commit | solidjs/solid#4695 decision 3; `RULES-DERIVED.md` D-22, D-34; built in rc.22 (#4689) | 05 H-11; S-latest-reask (2026-11-06) |
| **DV-21** posture | one probe in a pass made the whole pass read ahead (Solid's behaviour, which the spec had followed) | posture is per read: a plain read beside a probe is the screen's | #4695 decision 1; D-17, D-25; S-49 and S-50 as `it.fails` (ruled, not built) | 04 R-11, 05 H-6, H-7; S-solid-27, S-solid-49, S-solid-50 keep the ruled frames, Solid's are recorded (2026-11-06) |
| **DV-22** `pending?` under a new question under a guess | `false` (Solid's behaviour) | `true` | #4695, S-44 (ruled, not built) | S-solid-44 instant 3 keeps the ruled frame; guide `GUESS_WHILE_LOADING` says what to write on today's Solid |
| **DV-23** a branch a probe opens | attaches at once with its slot empty | it is born held; the old arm stays until the landing | #4695 decision 4; D-1; S-46 (built in rc.22) | S-solid-46 (2026-11-06) |
| **AC-3a** a guess while its value loads | a guess composes on what the screen shows | it composes on the previous answer and the new answer replaces it | solidjs/solid#4795; D-34 | 06 AC-3a, `GUESS_WHILE_LOADING` (2026-11-12) |
| **DV-25 / F-3** a write beside a shown error fallback | the change holds until the re-asked question answers (H-4, D-41 read together) | a reader under a boundary on its fallback is off screen and holds nothing; the write shows at once beside the fallback | solidjs/solid#4908 (2.0.0-rc.23), its rules F-3 and F-12, `lean.test.ts` "E1 a write publishes beside a shown error fallback" | 05 H-4, H-12; S-hold-7, S-module-1 (the user's decision, 2026-11-26) |
| **SC-4c** what a `ref` reads | each `ref` reads the writes of the `ref`s before it in the pass (the interpreter's first model), then a refusal of the reading (`REF_READS_REF_WRITE`, withdrawn) | a `ref` callback is like an event handler or an effect callback: it reads the screen as it stands | solidjs/solid#5110 (fixes #5098), "Ruling (maintainer, 2026-11-20): refs are like event handlers or effect callbacks" | 02 SC-4c (2026-11-26). Solid's remaining difference, a `ref` in a `<For>` row or a `<Show>` reading an earlier `ref`'s write, is a bug of its own (DV-28) |

## Where Solid's ruling came to the language's rule (solidjs/solid#4906, stores on the thin engine, 2026-11-26)

The pin moved to Solid main 50a4bfdde on 2026-11-27 (`DECISION.md`, "Pin moved to Solid main 50a4bfdde"). #4906 states
two intended changes of store behaviour. Both are rules the language already had; nothing in the spec moved for them.

| | the language | Solid before #4906 | Solid's ruling now | pinned in Solid | checked |
| --- | --- | --- | --- | --- | --- |
| **F-10 for stores** a store write is visible at its flush | 02 W-4, 05 H-10: nothing sees a write before its instant settles; a read of the run's own write is `STALE_OWN_READ` (06 AC-1d) | the deep engine let some reads between a setter and its `flush()` see the new value | "a store write becomes visible at the flush that carries it, for every reader (F-10) … how store writes should always have behaved" | #4906's description; `packages/signals/docs/RULES-FUNDAMENTALS.md` F-10 | every scenario and review set, four runners, as before |
| **`affects` of a derived store** marks the view, not its source | 06 AC-5: `affects x` makes `pending? x` true; what `x` reads is not declared | `affects(view)` made its source store pending too | "`affects()` on a source store is no longer true because a derived view of it has a pending edit": `affects(view)` leaves `isPending` of the source `false` | #4906's description; `tests/store/derived-view-of-store-4906.test.ts` "a marked view is pending at its first untracked read; its source is not" | S-affects-projection (new): a keyed equation and a draft over a source, four runners and the server; it also found the oracle and both emitters threw at `affects` of a projection, on both pins (ours, fixed) |

## Where the language does not follow Solid, and why

| | Solid | the language | why |
| --- | --- | --- | --- |
| **X1** a kept keyed row (spec 06 ST-4a) | `reconcile(v, key)` gives a row nothing has subscribed to a new proxy, so a `<For>` remakes it; the pruning was ruled intentional in solidjs/solid#2902 and a test pins it, while Solid's documentation promises a kept proxy for a kept key | a row whose key is kept keeps its identity, whatever it reads | the documented promise is the user-facing rule, and a rule that depended on what the row reads could not be written (a row that reads nothing today reads a field after an edit). The runtime keeps the proxy itself (`ref/compile/keyed.ts`). Open upstream: solidjs/solid#5220, fix proposed in #5222. If Solid fixes it, `keyed.ts` goes; if Solid documents the pruning instead, `keyed.ts` stays as the language's own lowering of ST-4a |
| **DV-3, 4, 7–9, 12–18, 20, 26–28** | bugs, each fixed or open (spec 05 and 10) | the rule as written | Solid's own rules, or its maintainers, call each a bug; the scenario keeps the ruled frame and records Solid's |
