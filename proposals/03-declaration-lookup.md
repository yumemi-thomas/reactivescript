# 03 — One project folder for declarations

Needs nothing. **It reverses a decision.** 13's list of rulings says of MO-10c: *"a project-level folder of declarations keyed by package was the
alternative, not taken."*

## Problem

A declaration is read beside the file an import resolves to (MO-10c). For a package that ships none, the app writes a JavaScript module that re-exports
each name, and its declaration.

<!-- check branch=ok upstream=IO_IN_REACTIVE -->
```rx
import { f } from "kit"
export default component App() { <p>{f(1)}</p> }
-- file: ./package.json
{ "name": "app" }
-- file: ./rx-types/kit.d.rx
export pure fn f(a: number): number
```

## Proposal

`rx-types/<spec>.d.rx`, in the importer's folder or one above it, **up to the project's folder**: the nearest one whose `package.json` has a name (as SV-5a
finds it). It is read before the package's own. Nothing above the project is read:

<!-- check branch=IO_IN_REACTIVE upstream=IO_IN_REACTIVE main=app/main.rx -->
```rx
export default component Other() { <p>a</p> }
-- file: ./app/main.rx
import { f } from "kit"
export default component App() { <p>{f(1)}</p> }
-- file: ./app/package.json
{ "name": "app" }
-- file: ./rx-types/kit.d.rx
export pure fn f(a: number): number
```

Not in this step: a shared scope (`@rx-types`), a generated place ([22](22-generated-drafts.md)).

**Why reverse it.** The re-exporting module is code in the bundle that exists for the checker. The choice was made when no library was declared; the benchmark's
programs now keep 159 declarations of packages, and none of the packages ships one.

## Cost

114 lines in the crate and 44 in `ref/src` with the other places (d9d2476). Not measured apart. `rx-tsc` has the same search.

## Open

In a workspace, each package that has a name has its own folder. Is that wanted?

## Compatibility

A project with a folder named `rx-types` would have it read.

## Prototype

MO-8k (proposed id). The unit `a_projects_declarations_are_looked_for_up_to_its_folder`.
