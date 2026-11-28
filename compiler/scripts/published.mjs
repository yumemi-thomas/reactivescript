// The package's manifest as it is published: `package.json`, and what the publish job adds to it.
//
// @reactivescript/runtime is this package's dependency (spec/11 CP-4a): the modules it compiles import the runtime, so
// an app that lists the compiler has it — where its own imports reach it, or under this package (compiler/vite.mjs
// finds either). And the package says, as a peer, what its output runs on: Solid. That is also how Solid's Vite plugin
// comes to load the runtime with the app: it follows, from the app's package.json, each package that depends on
// solid-js or @solidjs/web and that package's dependencies in turn, and a package it does not reach is left to Node
// under the dev server — on Node's copy of Solid, beside an app on Vite's.
//
// Neither is committed to package.json, as the platform packages are not (sync-optional-deps.mjs): a committed
// dependency on the runtime's release puts npm's copy in this folder's node_modules, beside the repository's own
// (../runtime), and a version bump leaves the lock out of step until that release exists. The suites install this
// package with this manifest (bench/harness.mjs, compiler/test/runtime-resolve.mjs), so what is tested is what is
// published.
export function published(pkg, runtime) {
  return {
    ...pkg,
    dependencies: { ...pkg.dependencies, [runtime.name]: `^${runtime.version}` },
    peerDependencies: { ...pkg.peerDependencies, "solid-js": runtime.peerDependencies["solid-js"], "@solidjs/web": runtime.peerDependencies["@solidjs/web"] },
  };
}
