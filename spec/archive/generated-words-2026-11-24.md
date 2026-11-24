# Words a generated declaration no longer writes (2026-11-24)

The ruling: a generated declaration — what `rx-declare` drafts, and what is drafted beside packages (MO-8l) — holds only
words proven from the code by a general rule. A word off a name, a shape, a run or a judgment is not written; an absent
word means what it means upstream (no default is changed, no word is added). What went, with what was found:

| what wrote words | why it went | found false |
| --- | --- | --- |
| `known.js`: 9 libraries' rows and words by hand, each for a version range | a judgment, and the ranges were wider than the releases it was made on | `uses(toast)` on Kobalte's `Toast.ProgressTrack` (and `ProgressTrack`), contradicted by the code; `fails(Error)` on `createSSE`'s `data`, which fails with the browser's Event |
| `ref` off the shape `() => T` (a result's part, a parameter) | the shape of a call that does something is the same | 7: `makeAbortable`, `createAbortable` (0), `makeClipboard` (1), `createForm` (formData), `createPresence` (bindDone), `createIdGenerator`, `createOverlays` (attachHost) |
| `instantiates` off `create…` / `use…` | a name (read from the code since: the last section) | not shown false by running, and 248 rows had nothing else for it |
| `rx-declare --run`, `--dom`, `--context`: `uses(c)`, `provides(c)`, `pending` off a run with nothing provided | a run that fails says something is missing, not what; a run refutes and does not prove (rx-verify's) | — |
| `declare-own.js` (MO-8s): an app module's row copied the words of the library rows it hands on | where those are a person's, it made generated words of them | — |

How it was found: rx-verify over whole drafts of the 199 modules (the 193 of the coverage suite and six of the tasks'), in
happy-dom, with the probes the benchmark has; each result held by running is run again over a module changed so that the
claim is false. Before, 15 results were mismatches: the seven `ref`, two rows' `uses` (each contradicted by the run and by the code), and
four `provides` that were rx-verify's own mistake (the component itself fails where its part does, for want of something
else); and 55 exports of a CommonJS build were said to be missing. After, none. Two modules are not run (`storage/tauri`, whose
module does not load without Tauri; `@tanstack/solid-router`, which stops the verifier).

Of the hand-written words of the tasks and the coverage entries, `bench/needed.txt` has the ones that stay: no tool has
shown them and a correct program is refused without them. They are the app author's own claims, in the app's own files.

## The section of DECLARATIONS.md on `declare-own.js`, as it was

### What a module of the app's own takes (MO-8s)

The ways round above — a hook's store
handed out field by field, a method of an object handed out as a
function, the router's provider in a component of the app's — are each
a small JS module the app writes, and until now each came with a
declaration written by hand: every word of it, though the module says
nothing the library's own rows do not. `rx-declare` now reads the
module's own text and carries those words over, in the shapes where
they hold for every run:

| the module writes | its row takes |
| --- | --- |
| `export { Toast }` of a library's component (or `export { Toast } from …`, or under another name), with its members | that row's `uses(…)` and `provides(…)`, member for member |
| a component whose body is one `return` of one library component and nothing around it (`return <RouterProvider router={router} />`), or of a fragment around that one element alone | that component's `uses(…)` and `provides(…)` |
| `export const Router = createRouter(…)`, of a fn whose row hands back a `Component` with words | the component's words (`provides(router)`) |
| a fn that calls a library's hook at the top of its body — not behind a condition, not in a nested function | the hook's `uses(…)`; and `pure`, where the hook is `pure` and the body does nothing else but return a record of functions and names |
| a fn that calls, at the top of its body, a helper of the module's own (a function declared once at the module's top, not exported) that calls the hook so | what the helper's call takes: `uses(…)`, and `pure` only where neither body does anything else |
| a field of that record that only reads the hook's result, `data: () => q.data` | `ref` (an accessor, read as a value); and `pending fails(E)` where rx-declare knows the result's field to wait or throw |
| a fn that hands its own parameters straight to a library call known to render them (`toast => toaster.show(toast)`) | `renders(H)`, where the module exports H too |

The library's rows are the project's declaration of the package where
it has one (found as the checker finds it), else what `known.js` says
of the installed release; two facts no row of the library's own can
say are kept there for this (`wraps`): that `@tanstack/solid-query`'s
`useQuery` is pure, reads the client, and has a `data` that waits and
throws (a store's field: MO-8r), and that Kobalte's `toaster.show`
renders beneath `Toast.List`. A context a carried word names is
declared with it — `export context router from "@solidjs/router"`
(MO-12e) where the project declares the package, the bare name
otherwise. The TODO a word answers is removed; any other stays. The
draft says, in a comment, which rows took what and from where.

**It adds no word and no form**: the rows are the ones a person wrote.
And it is not the guess RFC 26 forbids: `pure` is still never read off
a name. A word is copied from the row it was written on, only where
the text shows the module does what that row describes and nothing
more — a component that renders the provider inside markup of its own
(an element is something of its own; a fragment is not, and one with
the children beside the provider puts them outside it), a hook called
behind a condition, here or in a helper, a body that also logs, take
nothing (or `uses` without `pure`), and their questions stay. (The
fragment and the helper were added 2026-11-24, having been listed as
the two ways a module does the same thing and took nothing.) As any row, a
carried one is `rx-verify`'s to run. `--types-only` leaves them out.
What it cut, measured on the benchmark's own modules: `query.d.rx` in
two tasks 20 words each to none, the routers' `router.d.rx` 6 and 13 to
none and 6 (what is left is `paths`, a function with a member for each
route, kept as a value), the Kobalte toaster's 21 to none
(`tooling/rx-language-server/src/declare-own.js`, `test/declare.js`).


## `instantiates`, read from the code (later the same day)

Of 1baf03b's drafts (197 modules), 301 rows (211 functions, a package's modules counted once; counted by text as 226 before) had the word off a name
and no `ref`. With the rule of DECLARATIONS.md (*`instantiates` without `pure`*) 115 of them (93 functions) have it again, proven, 37 (29) are
`pure` alone, and 149 (89) have neither and are io: by function and package, 73 make nothing an owner keeps on any path read
(45 of them headless controllers of @ui-sdk/core, plain objects; the others collections, URLs, histories, a router), 16
make it on some path only, and 3 are not read to a function or hand back an undo. In all 120 rows of 31 packages gained it
and none lost it.

The other direction, what the word newly refuses: no program of the 44 tasks and 123 entries, no bad variant accepted.
Five functions rest on owner-free state alone (a signal or a store: `createCompass`, `createFluxStore`,
`createLocationSearchParams`, `createToggleState`, `createTrigger`): a call of one in a handler is refused, where Solid has no objection.

Run, outside the tool: of the 120, 38 were made under a root with rough arguments and each left a child or a cleanup of
it; 14 left none (context reads, and signals, which an owner does not hold); 68 needed a provider or arguments.
rx-verify over the 197 drafts: 0 mismatches (2 modules not run, as before).
