# TanStack Router's generator and Vite plugin, from a fork

Two packages, packed from a fork of TanStack Router and committed here as tarballs:

| file | package | sha256 |
| --- | --- | --- |
| `tanstack-router-generator-1.168.0.tgz` | `@tanstack/router-generator` | `40ec4a5484afb41dc064b1a931b937f426289b66ef4e510c2f3b7691d93268dd` |
| `tanstack-router-plugin-1.169.0.tgz` | `@tanstack/router-plugin` | `e7e7a734bfa1c127955c329efadd70d409142d8d18c9f7d12bbb7f9b953a44e3` |

- The fork: <https://github.com/yumemi-thomas/router>, branch `rx-route-files`, commit
  `8688de6c5020565c9fe5315273366277da5f27ff`, one commit on upstream `f922eb52abd094d359b646c27e40ac6774cdf993`
  (the release of `@tanstack/solid-router` 2.0.0-rc.11; the two packages carry upstream's version numbers).
- What it adds: the generator option `routeComponentExtensions` (`{ ".rx": "?rx-page" }`). A file of the routes
  directory with such an extension is a route whose component is the file's default export, imported through the query;
  the generator writes the route object itself into `routeTree.gen.ts` (`createFileRoute("/")({ component })`,
  `createRootRoute({ component })`) and never reads the file as JavaScript. The plugin's code splitter keeps to JS and
  TS route modules. Nothing in it names ReactiveScript: the option is any language's.
- Nothing else of the router is the fork's: `@tanstack/solid-router`, `router-core` and the rest are npm's.

## Why tarballs

The benchmark installs from lockfiles (`npm ci`), so that a run is the same on every machine and in CI
(`bench/README.md`). The three ways to consume a fork were weighed:

- **a git dependency** does not install: the fork is a pnpm workspace, npm cannot install one package out of a
  repository's subfolder, and the packages ship `dist/`, which a clone does not have (it is built with nx);
- **a test that runs only where the clone is** would be green in CI by not running, which is no evidence;
- **the built packages, packed and committed** (these two, 350 kB) install offline, with their integrity in the lock
  (`../package-lock.json`), and the task runs wherever the suite does.

So the third. What the task shows is then exactly this build of the fork, and it is said as that everywhere it is
counted: the option is not in any release on npm, and 09 MO-8r's count of libraries does not take it for one (it adds
no word to the language; `?rx-page` and the host declaration were taken on `filesystem-routing`'s evidence and
TanStack's TSX route files).

## Remaking them

In a checkout of the fork at that commit (Node 26, pnpm 12):

```sh
CI=1 pnpm install --frozen-lockfile
CI=1 NX_DAEMON=false pnpm nx run-many -p @tanstack/router-generator @tanstack/router-plugin -t build --skipRemoteCache
for pkg in router-generator router-plugin; do pnpm --filter "@tanstack/$pkg" pack --pack-destination <this folder>; done
```

then the lock, in a copy of the task's folder (`package.json` and `vendor/`):
`npm install --package-lock-only --legacy-peer-deps`. `pnpm pack` writes the workspace's dependency on the generator
as its version, so `package.json` overrides it with the tarball.

When the option is released upstream, this folder goes: the task takes the packages from npm, and
`bench/tasks/router-provider` (TSX route files that hand the route a component) is the record of what was written
before.
