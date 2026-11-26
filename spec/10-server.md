# 10 — The server

**Status: OPEN (2026-10-24).** A program can be rendered on a server and
streamed to a browser, which then takes it over. This document says what
the server computes, what the browser shows while the stream arrives, what
crosses from server to client, how the client takes over, and what state a
request owns. The same modules run on both sides — views lowered by Solid's
own compiler (`@solidjs/compiler`, `generate: "ssr"` and `"dom"`,
hydratable), the reactive lowering over `ref/compile/rt-server.ts` and
`ref/compile/rt-web.ts` — on Solid's `next` branch built from source
(`ref/SOLID_NEXT`). `ref/ssr/run.ts` serves every
scenario to Chromium, hydrates it, and drives the rest of its rows in the
browser. `S-server-1` covers what no other scenario does.

Rulings (2026-10-24): SSR is the client's mount, streamed; module state is
per request on the server; full hydration first (partial hydration later);
failures are sent to the client and panics are redacted. The rest is taken
by default — see the list at the end.

---

## SV-1 — The served page is the mount

- **SV-1a.** A request renders the entry module's mount (MO-1c) and
  streams it. The first chunk — the shell — is the **mount frame**: what
  the client would show at instant 0. A later chunk is a **landing** of a
  `loading` region: its readers' flights have answered and the region's
  content replaces its fallback. The page the browser shows from the stream
  goes through the client's frames for the mount and its landings, in
  order.
- **SV-1b (Coalescing).** A frame may be skipped, never invented: two
  landings that reach the server within one flush arrive as one chunk, and
  an answer that arrives before the shell is sent is in the shell (the
  client would have shown the fallback first; the browser never does). The
  browser never shows a frame the client would not show at some instant of
  the same mount — DV-9 is Solid's exception.
- **SV-1c (What streams).** Only a `loading` region's landing streams as
  HTML: the stream fills a hole the shell left. An answer the shell already
  painted around — a first paint (`-> v`, R-7), a lane reader (H-7) — has no
  hole: it travels as data, and the client draws it when it takes over
  (S-app-cart: the catalogue lands on the server, the browser keeps the
  empty first paint, and the client draws the rows at hydration). That is
  SV-1b's skipped frame, not an exception.
- **SV-1d (Held mount).** A reader whose `pending` no `loading` region
  catches holds the mount (H-2, CN-3c): the shell waits for it. On the
  server that is the right behaviour — the page arrives complete, with no
  skeleton — which is why CN-3c does not make it an error. Without a server
  (a client-only build) it is one: CN-3d.
- **SV-1e (Streams).** A question over a stream (`await*`, ST-6b) is served
  with its first landing; the response stays open, and its later landings
  travel to the client as data, which applies them as landings once it has
  taken over (SV-3). A plain `await` takes one answer, so its question
  closes when it lands.

## SV-2 — What runs on the server

- **SV-2a.** The server computes what the mount frame needs: source
  initializers, equations (their awaits included), contexts and provisions,
  and the view. It runs nothing that belongs to an instant after the
  mount: no effect's apply half, no action, no handler, no cleanup. No
  source is written on the server, so every source holds its initializer
  (or its question's answer) for the whole request. An effect's compute
  half is reactive scope — whether the server computes it is unobservable
  (Solid's server does; an input's failure is an answer there too, E-12).
- **SV-2b.** So the served frame is the mount **before** any effect's
  writes. A program whose effects write at the mount (an effect chain,
  EF-5) shows the pre-effect frame from the server and the effect's frame
  once the client has taken over and run the effect — S-region-7 serves
  `0 valid` and the client goes on to `2 invalid`. Both are client frames
  (SV-1b holds); the second simply comes after hydration.

## SV-3 — Hydration (ruled: full hydration first)

- **SV-3a (Adoption).** The client takes over the served page by running
  the same mount against the HTML instead of building it: every element and
  text the view would create is adopted from the page, and where the client
  draws what the server drew, it builds nothing. The whole tree hydrates
  (partial hydration — leaving static parts unhydrated — is later).
- **SV-3b (Answers cross).** Every question the server answered is answered
  on the client with the server's answer, sent in the stream; it is not
  asked again. A question still pending when the client takes over
  continues: its answer streams to the client, and until it arrives the
  node is the server's — it keeps the server's state and does not follow
  a change to its inputs (a stream: until the server's stream ends). Once
  the answer lands, the node hydrates and follows its inputs as usual: a
  later change is a new question, and the client asks it. A question the
  server had already answered follows its inputs from the takeover. (Ruled
  2026-10-26 by adopting Solid's position, DV-11: a boundary waiting on
  async cannot hydrate before the server's answer arrives. Scenarios list
  these frames under `## Hydration window`: S-solid-24, S-store-5,
  S-ai-feed.) A failure crosses as SV-5 says.
- **SV-3c (Determinism).** Everything else is recomputed on the client
  from those answers and the initializers, and must come out the same.
  Inside `.rx` it does: there is no io in reactive scope (R-io-3), so an
  equation is a function of its inputs. The JS boundary is the exception —
  a `pure` import is the author's assertion (CN-5), and a `pure` function
  that is not deterministic (the time, a random number) yields a different
  frame on each side: `HYDRATION_MISMATCH`, a runtime diagnostic (bin R).
- **SV-3d.** After hydration the client is an ordinary client: effects run
  their first instant (SV-2b), handlers are attached, and every later
  instant is the client's. A client may take over at any point of the
  stream — right after the shell, or after the last landing — and the
  frames from then on are the client's frames (with SV-3b's window: a node
  whose server answer is still out follows its inputs once it lands).
- **SV-3e (Input before hydration).** An event the user causes before the
  client has taken over is recorded and replayed after it, in order,
  through the handlers the client has just attached (Solid's hydration
  bootstrap and delegated-event replay). Each replayed event is **its own
  instant**, as it would have been live: a program cannot tell a replayed
  click from a user's, so two clicks on a counter are two bumps
  (S-server-2). Solid did not until 2026-10-26 (DV-14, fixed).

## SV-4 — State is per request (ruled)

- **SV-4.** On the server, an app is a request. Each request instantiates
  every module once (MO-1b) — its module-level sources, equations and
  contexts — and nothing in them is shared with another request. A
  cross-request cache is a JS module's business, behind an import, never a
  `.rx` module's state. The compiler emits each `.rx` module as a factory
  the runtime runs once per app (09, Implementation), so no module state
  exists at JS module scope. (S-server-1: a second request, in flight at
  the same time, keeps its own shell while the first one's questions land.)

- **SV-4a (The request) — proposed 2026-11-19.** The host gives the app
  its request (the runtime's `createApp({ request })`), and the render runs
  in Solid's request event for it, so a JS library that locates a server
  render by that event sees the request being served: `@solidjs/router`
  matches the page's URL from it (`compiler/test/ssr-router.mjs`). A
  program's own code does not read the request; what it needs from it, a
  route's params, comes through the library.

## SV-5 — What crosses: failures sent, panics redacted (ruled)

- **SV-5a.** A failure whose class is declared — `error C(…)` in a `.rx`
  module (R-f-1) or `export error C` in a `.d.rx` (MO-8) — that reaches a
  boundary or a catch on the server is sent to the client as it is: its
  class, its message and its fields. The client gives it back its class,
  so a typed boundary or catch decides the same on both sides (S-server-1:
  the `NotFound` boundary takes the `NotFound` the server sent). A class is
  identified by its declaration, not its name: two modules that each
  declare `NotFound` declare two classes (as two contexts, MO-7). A JS module's
  class (`export error C` in its `.d.rx`) is the JS class itself, on both
  sides, identified by its declaration: the compiler writes it at the
  import (`jsClass(NotFound, "app/people.d.rx#NotFound")`). That identity
  is read from the declaration's own place and nothing else (ruled
  2026-11-22): a package's specifier; or, for the app's own `.d.rx`, the
  nearest `package.json` above it that has a name, then the path below it
  (`shop/src/err.d.rx#Gone`; a `package.json` with no name, a
  `{"type":"module"}` scope, is passed over); with no named one above, the
  path below the nearest `package.json` above it (`err.d.rx#Gone`,
  `lib/err.d.rx#Gone`); with none above at all, the file's own name. A
  folder's own name, or any folder above the package, is never part of
  it, so it holds no machine path and is the same in every checkout, on
  every machine and from every entry: the earlier revisions took the
  folder of the nearest `package.json` above the *entry* for the root of
  an unnamed project, so a class in a nested unnamed scope was
  `web/err.d.rx#Gone` from one entry and `err.d.rx#Gone` from another,
  and two classes could be named alike in one build. An unnamed package
  has nothing to tell its classes from another unnamed one's, and the
  compiler does not guess: two declarations that would name a class
  alike in one program are refused where they are loaded
  (`DUPLICATE_WIRE_ID`, naming both and the fix, a `"name"` in the
  `package.json` above one of them). So in an accepted program every
  declared class has an identity of its own, and both builds agree on
  it. A rejection of it that
  a question awaits is sent with that identity: the nearest declared class
  up the instance's prototype chain, whatever order the program declared
  them in, so a `Child` of a declared `Base` is sent as `Child` when both
  are declared and as `Base` when only `Base` is; the declared classes above
  it go with it (`$classes`), so a client boundary typed with `Base` takes a
  sent `Child`, giving it `Child`'s class where the client declares it. What is sent is a copy of the instance, of its
  class (so `instanceof` and a typed boundary still hold on the server):
  its message, its identity, and the fields its declaration names,
  `export error HttpError(status, code)`; a bare `export error NotFound`
  sends the message alone (revised 2026-11-21, after review: Solid
  serializes an error with every field it holds, a library's `cause`, a
  response's headers, the stack, so the library's own instance is never
  the one sent). A field the declaration names that an instance does not
  have is not sent, and the client reads `undefined` where the row says a
  value: the failure is still sent as its class, and the server says so
  once per class and field, naming the declaration, unless the row marks
  the field optional, `export error HttpError(status, code?)` (revised
  2026-11-21 after review: it was left out in silence). Each field is copied
  as the copy's own data property, the value the instance read (revised
  2026-11-21 after review: a class whose field is a getter, `get status()
  { return 404 }`, made the copy refuse the assignment). What the client
  gets back is guaranteed in these terms only: a typed boundary or catch
  matches it by the identities sent (`$class`, `$classes`), `instanceof`
  holds for the client's own declared class, and the message and declared
  fields are there as data. It is not the library's instance rebuilt: the
  client's object takes the class's prototype without running its
  constructor, so state the constructor sets up (a private `#field`, a
  closure, an undeclared property) is not there; a declared field the
  class defines as a getter arrives as the value sent, own data that
  shadows the getter, and any other getter or method runs against the
  copy's data alone. Nothing checks a
  JS class's fields before it runs (IO-3: the declaration is the trust
  boundary). The copy is made at a boundary the app owns, an awaited
  promise or `sendErrors`, and nowhere else (revised 2026-11-21: the first
  draft marked the class's prototype, so every instance anywhere in the
  server process was sendable once a program had declared it). A library that
  serializes a rejection itself, before the program awaits it
  (`@solidjs/router`'s `query` cache), is given one more boundary, an
  adapter around the function it caches: `query(sendErrors(fetchPerson),
  "person")`, from `@reactivescript/runtime`. It marks a rejection or
  throw of a class the request's app declares, during that app's request
  only; elsewhere, and on the client, it changes nothing.
- **SV-5b.** Anything else that reaches a boundary is sent as the generic
  error: an `Error` whose message is Solid's `Internal Server Error`. That
  is every panic (R-f-3), and a rejection of an undeclared class — a JS
  import without a declaration rejects with plain `Error` (R-f-8). The
  generic error is an `Error`, so the boundary that discharges it is the
  one that would discharge the original (`Error` or untyped, R-f-10): the
  static failure check is unchanged by where the program runs. Only the
  message and the fields stay on the server.
- **SV-5c.** So what may leave the server is decided by declarations: to
  send a JS module's failure, declare its class in the module's `.d.rx`
  (MO-8); to redact one of the program's own, throw a panic or a JS
  `Error` instead of a declared class.
- **SV-5d.** A panic is redacted where it happens. If the client takes over
  first and computes the same panic itself, its own boundary shows its own
  message — nothing came from the server (S-server-1 hydrated after the
  shell: `error: db password is hunter2`, computed in the browser).

## SV-6 — A failed boundary is served drawn

- **SV-6.** A boundary that takes a failure during the server render — in
  the shell or in a later chunk — is streamed with its fallback rendered:
  the browser shows the client's frame (`no user 7`, S-server-1 instant 1),
  and the client adopts it and keeps tracking the failed content, so it
  recovers like any boundary (D-41). DV-9 and DV-12 are Solid's.

---

## Divergences from Solid's server render and hydration (`ref/ssr/`)

DV-24 (a component value handed to JS is checked as owned where it is passed) is a static assumption, not a run-time divergence; it is recorded with its rule, 09 MO-11.

Each has a standalone repro with nothing of ReactiveScript in it — one
`app.jsx` compiled by `@solidjs/compiler` for both sides — in
`ref/oracle/repros/`, re-run on `next` @ `0847122` (2026-10-26).

- **DV-9 (a failed boundary on the server) — a Solid bug, ruled
  2026-10-26 (solidjs/solid#4287); reproduced 2026-10-24; fixed on `next`
  2026-10-26 (shows in no scenario at `2c9fdd9`)**
  (`dv9-ssr-after-shell.mjs`, `dv9-hydrate/`). Outside a server component,
  Solid renders no error fallback for a failure that reaches a `<Loading>`
  through an async read. A boundary that fails before the shell is empty in
  the HTML; one that fails after it is streamed as an empty fragment, which
  replaces the loading fallback with nothing — so the browser shows a frame
  no client instant shows (`Profile` where the client shows `Profile no
  user 7 error: …`). The error is serialized, but when the client hydrates
  it renders that boundary from scratch: it asks the question again and
  shows the loading fallback, never the failure it was sent. Inside
  `runInServerComponentScope` the fallback is rendered on the server and
  every served frame is the client's (`SV_SCOPE=1 npm run -s ssr`).
  It was recorded as `server` divergences in S-server-1, S-hold-5,
  S-solid-38 and S-ai2-settings; those records were removed 2026-10-27:
  at `2c9fdd9` the server draws the fallback. Solid's development server
  build draws a panic's own message there (it keeps fidelity by design);
  its production build sends the generic error SV-5b asks for, so the
  `ssr` runner now runs the production server build.
  (A failure thrown synchronously in content the server renders is drawn —
  S-hold-6 serves `item 4 not found`.)
- **DV-11 (the hydration window) — reversed 2026-10-26: Solid's position
  adopted** (solidjs/solid#4272, closed by design; `dv11-hydrate/`). The
  spec said a question whose input changes on the client after the
  takeover is a new question the client asks at once. Solid answered that
  a boundary waiting on async cannot hydrate until the server's answer
  arrives: until then the node keeps the server's state and does not
  follow its inputs, and afterwards it follows them as usual. SV-3b now
  says so. The frames that were recorded as `hydrated` divergences
  (S-solid-24 `1 loading`, S-store-5 `a3 -`, S-ai-feed) are the rule,
  listed under each scenario's `## Hydration window`.
- **DV-14 (replay is one instant) — a Solid bug, ruled 2026-10-26
  (solidjs/solid#4285); reproduced 2026-10-24; fixed on `next` 2026-10-26
  (#4299)**
  (`dv14-replay-instant/`). `runHydrationEvents` runs the recorded queue in
  one microtask with no flush between events, so handlers replayed together
  share an instant: two clicks whose actions each write `n := n + 1` both
  read `n` = 0 (H-10) and the counter reads 1 where a live user would have
  read 2. A flush between replayed events would make each its own instant.
  Recorded as a `hydrated` divergence in S-server-2's `## Before
  hydration` table.
- **DV-12 (a boundary hydrated in its error state) — reproduced
  2026-10-24; fixed on `next` 2026-10-26 (solidjs/solid#4273, fix #4279)** (`dv12-hydrate/`). The client hydrates an error boundary the
  server drew by throwing the server's error in place of running its
  content, so the boundary reads nothing: when the failed content's inputs
  change and a good answer lands, the boundary keeps the failure (the
  question is asked and answered; nothing is listening). The same page
  rendered by the client recovers. S-hold-6 hydrated: `item 4 not found`
  where the rule says `loading…`, then `pear`. Recorded as a `hydrated`
  divergence.

- **DV-15 (a client question's fallback is rebuilt) — a Solid bug, ruled
  2026-10-26 (solidjs/solid#4286, low priority); reproduced 2026-10-24;
  fixed on `next` 2026-10-26 (shows in no scenario at `2c9fdd9`)** (`dv15-client-hole/`). A bare `ssrSource: "client"` memo
  read under `<Loading>`: the server sends the fallback and marks the
  boundary `"$$f"`. Hydrating, the client adopts the fallback, resumes the
  content, which suspends on the question it now asks, and renders the
  fallback again — the served element is dropped for an identical one.
  The frame is right and nothing is asked twice; what is lost is the
  element (focus, selection, an animation). S-server-3 hydrated, recorded
  as a `hydrated` divergence at the hydration instant until 2026-10-27; at
  `2c9fdd9` the served element is adopted.

- **DV-26 (a failure after the shell, caught above the part) — Solid's,
  2026-11-26** (`ref/oracle/repros/w3-error-through-a-part.mjs`, at the pin
  and in 2.0.4; S-server-7). DV-9's fix draws the error fallback in the
  streamed fragment where the `errored` boundary is right around the
  `loading` that failed. With anything between them — the `loading` is in a
  part, inside a `<b>` — the fragment is empty and marked failed: the page
  shows nothing where the loading fallback was until the client takes it
  over and draws the error fallback. Recorded as a `server` divergence; the
  program is ordinary, and nothing is refused. Found by the third review
  (`p3-err-aw-ifinner-app`); reduced to plain Solid by track 2, step c.
  *Memo (2026-11-26):* the plain-Solid issue is drafted, not posted
  (`solid-main.noindex/drafts/2-errored-stream-nested`): reproduced on main
  (ad1f561), 2.0.4, 2.0.0, rc.23 and rc.21; the remainder of #4287, named as a
  limit in #4303; the cause in the server `createErrorBoundary`'s
  `renderOutcome`. Nothing here changes when it is fixed but this record.

- **DV-27 (a store a `ref` writes while hydrating) — Solid's, 2026-11-26**
  (`ref/oracle/repros/dv27-hydrate`, plain Solid compiled by its own
  compiler; at the pin, 2.0.4 not run; S-server-9). A `ref` writes in the
  pass that makes its element (07 §4); taking a served page over, a write
  of a signal is shown, a write of a store (a source whose value is an
  array or a record, ST-1) is made but its reader does not run again for
  it: the page keeps the server's text until the next change of the store.
  Recorded as a `hydrated` divergence; the program is ordinary, and nothing
  is refused. Found by track 3 beside SC-4c's programs. *Memo:* no Solid
  issue is drafted for it yet; `ref/oracle/repros/dv27-hydrate` is the
  plain-Solid program one would start from.

- **DV-28 (a `ref` reads an earlier `ref`'s write in the same pass) —
  Solid's, a regression in 2.0.0-rc.22, 2026-11-26** (S-server-8; the
  plain-Solid issue is drafted, not posted:
  `solid-main.noindex/drafts/5-hydration-rebuilds-show`, which supersedes
  draft 4). A `ref` reads the screen as the pass found it (02 SC-4c), as
  Solid did until rc.21, rendered and hydrated alike (run here with that
  draft's harness at rc.21: every `ref` reads the value before, nothing is
  replaced). Since rc.22 — the release of #4768, which runs a `ref`'s
  callback "untracked in the creating pass's context" (related: #5098,
  another rc.22 regression bisected to #4768, and #5110) — a client render
  shows an earlier `ref`'s write to a `ref` in a `<For>` row and in a
  `<Show>`; hydrating, a row's `ref` reads the screen, and the `<Show>`'s
  served content is thrown away and made again, its `ref` called twice, the
  second time reading the write. The minimal case is an ordinary
  UI-library one: `<button ref={setAnchor}>` and a popover in `<Show>` whose
  `ref` reads `anchor()`. Recorded as `oracle` and `hydrated` divergences;
  nothing is refused, and the interpreter is not made to follow it.
  *What a user writes that is the same on every Solid:* each `ref` stores
  its own element (`ref={(e: Element) => { pop := e }}`), and what needs two
  of them reads them once the view is made, `effect (anchor, pop) { … }` (or
  an equation); a `ref` that counts writes by a function of the value
  (`n := v => v + 1`). (A first version of SC-4c refused the reading,
  `REF_READS_REF_WRITE`, a006d85a; withdrawn: a Solid bug is no reason to
  refuse a program.)

Ruled 2026-10-26 (Ryan): DV-9, DV-14 and DV-15 are Solid bugs, not intended
behaviour — the server draws a failed boundary's fallback and the client
adopts it; each replayed event is its own instant; a hydrated fallback is
kept. DV-11 and DV-12 were filed as bugs (solidjs/solid#4272, #4273); DV-12
was fixed, and DV-11 was answered by design and adopted (SV-3b).

## SV-7 — A mismatch is unwritable

The ideal SV-3c points at: nothing the program can say computes one thing
on the server and another in the browser. What is left is assertions an
author writes, and Solid's runtime parity (CP-1b), which `ref/ssr/` tests.

- **SV-7a (Inside `.rx`).** Already so: there are no globals (`Math`,
  `Date` and `window` are `UNBOUND` until imported), reactive scope has no
  io (R-io-3), and every answer the mount used is the server's (SV-3b). So
  an equation is a function of its inputs, and its inputs — initializers,
  props, provisions, answers — are the same on both sides. The only way out
  of the language is an import.
- **SV-7b (Client questions).** An equation that awaits `client` JS (12
  SF-5b) is not asked on the server. Its reader shows what holds it there:
  under a `loading` region, the fallback; with a first paint (`-> v`, R-7),
  `v`. The browser asks it once it has taken the page over, and its answer
  lands as an ordinary landing. A reader of a client question that nothing
  holds — no region, no first paint — is `CLIENT_QUESTION_UNHELD` (bin S):
  the server could never finish that page. (Solid: `ssrSource: "client"`,
  whose bare form is a render error at run time.) This is the one place
  CN-3c's "pending need not be under a boundary" does not hold. A prop
  carries it: an argument computed from a client question is checked where
  the component reads it. Executable: S-server-3 (DV-15 aside).
- **SV-7c (Synchronous JS during the mount) — ruled 2026-10-24: Solid's
  default.** A `pure` JS call in reactive scope is computed again in the
  browser, as Solid computes every synchronous value again (it serializes
  async answers only). `pure` asserts no side effects; that the function
  also gives the same result on both machines is the author's assertion
  too (CN-5), and when it does not — `toLocaleString` with the server's
  locale and time zone is the classic case — Solid's runtime reports
  `HYDRATION_MISMATCH` (bin R) where the structure differs. (Measured
  2026-11-22, `bench/tasks/ssr-divergence`: where only a text differs —
  the usual case for a formatted value — Solid 2.0's development build
  adopts the server's node and says nothing, so that mismatch is silent.
  The ruling stands: `pure` is the one unchecked word, and a run-time
  comparison of every text would be a check the language does not add.)
  The language's remedies are the ones it
  already has: what depends on the browser is `client` JS (a client
  question, SV-7b), and a locale or a time zone can be an argument the
  server receives.

  *Where it is caught (2026-11-24).* Whether a development build could
  report it was looked at again, with the two places a comparison could
  live. (1) Hydration, where the server's node and the client's value
  meet: that is Solid's `insert`, which while hydrating returns the
  client's value without reading the node (`@solidjs/web` 2.0.2,
  `insertExpression`; its development build checks the structure — a tag
  that is not the expected one — and no text), and the compiled program
  hands `insert` a value, never the node: a comparison there is Solid's
  to add. (2) The calls: record each `pure` JS call's answer on the
  server and compare it in the browser. That is not sound. `pure` says a
  call writes nothing but its own state (09 MO-8a), not that it is a
  function of its arguments — a primitive answers an accessor, an id
  maker a fresh id — so answers are comparable only call for call, and a
  streamed render and its hydration do not make their calls in one
  order. So no run-time comparison is added, as ruled. What can be run is
  the word itself: `rx-verify` calls a `pure` fn with the probe's
  arguments on both sides — its own process has a browser's globals
  (`--dom`) or has not, and a second one is started the other way — and a
  plain answer that is steady on each side (two calls alike) and differs
  between them refutes the row: `whereNow: declared pure, but it answers
  differently on the server and in the browser ("the server" with no
  window, "the browser" with one)`. A row so refuted is not recorded as
  verified, and strict declarations (09 MO-8j) refuse it. It is a test,
  with the reach of one: a value both sides compute alike under the
  machine it is run on (a locale that happens to match) is not
  contradicted. `server` and `client` fns run on one side and are not
  asked. `bench/tasks/ssr-divergence` counts its variant — what only the
  browser knows declared `pure`, and read by the view — as caught by
  `rx-verify`; the checkers accept it, and hydration says nothing.
  *Where more could be done (not adopted):* the server could record each
  such call's result during the mount and the browser adopt it — one
  serialized value per call, so a long list of formatted cells doubles
  its payload — with a `stable` declaration to opt hot functions out. The
  first version does nothing beyond Solid.
- **SV-7d (Structure).** The browser re-parses the server's HTML, and
  nesting HTML forbids changes the tree it builds (text in a `<tr>`, a
  `<div>` in a `<p>`). Solid's compiler refuses it within a template; the
  checker refuses it across components: a component's signature records
  the content category of its root elements, and an application whose
  parent forbids it is `CONTENT_MODEL` (bin S). Concretely (`ref/src/content.ts`,
  after HTML's tree construction): a component's root, a branch's content,
  and the children a component places, each against the elements open
  above it — a `<tr>` outside a `<tbody>`/`<thead>`/`<tfoot>` (the parser
  adds a `<tbody>` in a `<table>`, drops the tag elsewhere), anything but
  table parts or a non-text child in the table modes (foster parenting),
  a block in an open `<p>`, nested `<a>`, `<form>`, `<button>`, a heading
  in a heading, an `<li>`/`<dd>`/`<dt>` in its own kind. A view's root is
  an unknown place. Executable: S-server-4; `repros/sv7d-table/` shows the
  page it prevents — served rows in a `<tbody>`, a later row outside it.
  *A value shown is its text (2026-11-26).* `{n}` in the table modes is
  text as written text is, wherever it is written: in place, as content,
  in a view with a parameter, through a context that holds a view, as a
  component's root (the row `roots #text` of its shape). What is no
  value is not text: a view the component was given, under whatever
  name; a field of a view's parameter declared `View`; a view a context
  holds; a loop; a choice of the component's views; a call of a JavaScript
  fn its declaration says answers `View` (2026-11-26, L7: trusted as a
  JavaScript component in the same place is; a result not said, or a
  value's, is text). A field of the props whose type is not read is as it
  was. S-server-6.
- **SV-7e (The wire).** An answer must survive the trip: a value the
  serializer cannot carry is `WIRE_VALUE` (12 SF-6a), at run time while
  types are text, statically once they are not.

What remains possible is an assertion that lies — `pure`, a `.d.rx` —
and `HYDRATION_MISMATCH` then names which one.

## Out of scope: the page changed by something else

- **SV-OUT (ruled 2026-10-24).** A served page that something outside the
  program changes before or after hydration — a browser extension
  injecting or removing nodes, a translator replacing text — is not a
  mismatch the language can prevent: the page is an input the program does
  not control. It stays with Solid's runtime and its warnings and errors
  (key misses, unclaimed nodes, structure mismatches). The language's claim
  is about the program: what it computes is the same on both sides.

## Diagnostics this document adds

| code | bin | rule |
| --- | --- | --- |
| `HYDRATION_MISMATCH` | R | SV-3c: a `pure` JS function computed differently on the two sides |

## Implementation

- **Views are Solid's compiler's.** The emitter writes each view as JSX
  (text as string children, `{e}` as `{__rt.show(e)}`, control flow as
  `Show` / `For` / `Loading` / `Errored`), and `@solidjs/compiler` lowers it:
  hydration keys, marker regions, which holes are scoped and which fragment
  entries are memos, all as `documentation/hole-owner-id-matrix.md` on
  `next` specifies. (Before 2026-10-24 the runtimes built views by hand,
  copying the compiler's output; that copy is gone.)
- **The reactive lowering, one call sequence.** Hydration finds the
  server's answers by owner id, so `rt-server.ts` and `rt-web.ts` implement
  the same `__rt` API with the same solid-js primitives in the same order,
  and where the client creates an owner the server has no counterpart for
  (a value-level error boundary for `e catch …` takes two ids, a typed
  boundary's unwrapping memo one), the server reserves its ids. A context's
  default is created at its declaration, on both sides, rather than at its
  first use (which happens at different times on the two). A value-level
  catch that Solid provided on both sides would retire the reservations.
- **Failures.** A declared class's instances are marked with Solid's
  `markSafeError` (which is how `ssrSanitizeError` decides what to send) and
  carry their declaration's identity in a `$class` field, assigned in
  declaration order — the same on both sides. Solid serializes an error as
  `Object.assign(new Error(msg), { name, …fields })`, which loses the
  class; the client's class test gives it back by `$class`.
- **The runner** (`npm run -s ssr`): for every table, (1) serves the rows up
  to the first handler and checks the browser's frames against the
  client's (SV-1); (2) hydrates after the last landing and (3) right after
  the shell, then drives every remaining row in the browser — handlers, and
  landings of flights on whichever side asked them — checking the client's
  frames (SV-3d); at each hydration, that no element was rebuilt where the
  frame did not change and that no question was asked again (SV-3a,
  SV-3b; Solid traces a hydrated computation under a mocked `fetch` and
  `Promise`, which the harness recognises and does not count), with the
  client on Solid's dev build, whose key-miss, tag-mismatch and
  unclaimed-node reports fail the table; (4) with
  `CSR=1`, also mounts the same bundle on an empty page — the baseline that
  separates a hydration difference from a renderer one. A `## Server frames`
  table is checked row by row, with a concurrent second request (SV-4).
  A `## Before hydration` table drives the served page as a user would —
  `click "<selector>"`, `input "<selector>" "<text>"` — before a `hydrate`
  row takes it over, then checks each frame (SV-3e).
- **Not exercised yet:** `HYDRATION_MISMATCH` (no scenario imports a
  nondeterministic `pure` function).

## Decisions (all ruled; the last open ones 2026-10-26)

1. **Plain `Error` is redacted** (SV-5b; ruled 2026-10-26). The ruling sends failures; a
   rejection from an undeclared JS import is a failure of class `Error`
   for the checker (R-f-8), but its message is whatever the JS library put
   there (a database error, a path), so it is sent as the generic error.
   Declaring the class (MO-8) is how to send it.
2. **No effect's apply half runs on the server** (SV-2; ruled 2026-10-26), and the served
   frame is the pre-effect mount.
3. **A replayed event is its own instant** (SV-3e; ruled 2026-10-26). Solid's replay is one
   instant (DV-14); the rule is what a live user would have caused.
4. **A stream question keeps the response open** (SV-1e; ruled 2026-10-26) and sends its
   later landings as data.

Ruled 2026-10-24 for SV-7: **the first version follows Solid's defaults and
adds nothing at run time**; where more could be done it is written down as
not adopted (SV-7c's recording). The static checks (SV-7b's hold, SV-7d's
content model) cost nothing at run time and stay.
