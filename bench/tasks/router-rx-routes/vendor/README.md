# TanStack Router's generator and Vite plugin, from a fork

Two packages, packed from a fork of TanStack Router and committed here as tarballs:

| file | package | sha256 |
| --- | --- | --- |
| `tanstack-router-generator-1.168.0.tgz` | `@tanstack/router-generator` | `7fe7520082ae98737cb5c95a39e5b2cb7c4d23f78e68e99384751e765b3fbbc9` |
| `tanstack-router-plugin-1.169.0.tgz` | `@tanstack/router-plugin` | `00967ffed1f030b90484dbfe90843b3b80e42ac8c63ee9c28b0bf62b8ba9af0f` |

- The fork: <https://github.com/yumemi-thomas/router>, branch `rx-route-files`, commit
  `7ba29121aa4a424671cfa5c0c6ae2e64fce18d0d`, two commits on upstream `f922eb52abd094d359b646c27e40ac6774cdf993`
  (the release of `@tanstack/solid-router` 2.0.0-rc.11; the two packages carry upstream's version numbers). The first,
  `8688de6`, is the option below; the second (2026-11-25) the one after it.
- What it adds: the generator option `routeComponentExtensions` (`{ ".rx": "?rx-page" }`). A file of the routes
  directory with such an extension is a route whose component is the file's default export, imported through the query;
  the generator writes the route object itself into `routeTree.gen.ts` (`createFileRoute("/")({ component })`,
  `createRootRoute({ component })`) and never reads the file as JavaScript. The plugin's code splitter keeps to JS and
  TS route modules. Nothing in it names ReactiveScript: the option is any language's.
- And, since `7ba2912`: `routeComponentOptionsExport` (`"route"`). A component route file may export its route options
  — `loader`, `validateSearch`, `beforeLoad` — under that name. Where the file's text has an `export` statement that
  declares the name (`export route = …`, `export const route = …`; the file is still never parsed), the generator
  imports it beside the component (`{ default as XRouteComponent, route as XRouteOptions }`) and spreads it into the
  route it writes (`createFileRoute("/")({ ...XRouteOptions, component: XRouteComponent })`), so the route's types
  follow from it: `useLoaderData({ from: "/" })` is typed by the exported loader, and a link to a route needs the
  search its `validateSearch` answers. A file that exports no such name is a component-only route, as before. The
  frontend exports the name as a plain record (11 CP-4d: ReactiveScript's does, for an exported record of functions).
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
