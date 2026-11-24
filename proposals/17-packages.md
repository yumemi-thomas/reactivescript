# 17 — A package written in `.rx`

Needs nothing here. **It reverses a rule, and that must be decided first.**

## The rule

**MO-1b**: *"Each module is instantiated once per app … Module-level state is app state — not a JS module variable: on the server an app is a request (SV-4)."*

The prototype's package is imported by JavaScript too, and JavaScript has no app to ask for. It makes **one instance a page** (on the server one a request, and outside a request one a render). Two Solid roots in one document, disposed apart, then share a library's state. Run on the
prototype's runtime (two roots, each reads a library that counts its instances):

```text
{ firstApp: 1, secondApp: 1, initializations: 1 }
```

MO-1b gives 2 instances. SV-4 is kept.

**The argument for the reversal.** A handler has no owner, so an app cannot be found where most calls are made. **Against.** Two apps on one page is what MO-1b is for. The choices: (a) once a page for a package imported by JavaScript, once an app for `.rx` importers —
then one package has two instances on a mixed page; (b) an app handed to the package explicitly by a JavaScript caller; (c) once a page. The prototype is (c). **No ABI should be frozen before this is ruled.**

## Proposal, once that is ruled

- `rx-lib` compiles each module for the browser and the server, and ships beside each its printed signature (MO-9), the types of its projection, and the types JavaScript sees.
- A `.d.rx` whose first line is `//@ signature index.rx …` is a printed signature wherever a JavaScript import finds it.
- Exports are Solid's own conditions.

## Evidence

Twelve solid-primitives packages written in `.rx` (author-selected; of 98), run with the packages' own tests: 166 of 195 browser-side tests that apply, 29 of 29 server tests (re-run at a349e48). Over 739 surveyed primitives: 22 can be written wholly in `.rx`, 192
with JavaScript beside, 9 with another API, 27 are in the language, 489 not. Of the 192, 188 also have a host object or a global as a cause. **"Write your library in `.rx`" is not a claim the survey supports.**

## Cost

Crate 106 + 46 lines, `ref` 23 + 37 (2ba0966); `compiler/lib.mjs` 267. The runtime reads Solid's owner internals, held by a test.

## Prototype

MO-13a to h (proposed ids). S-module-33; `bench/tasks/rx-package`.
