// E-5a in a real Vite build: `rx({ wholeProgram: true })` counts a module a JS file imports with `?rx-lib` as applied
// from outside. The import here goes through an alias only Vite's config names (`resolve.alias`, not `rx({ alias })`):
// with a Solid plugin that hands front ends Vite's resolver (`context.resolve`), the alias is followed and the program's
// `peek` of a prop the host applies is refused; with one that does not, the host is not found and the build only warns.
// The host is not in this build's bundle (a server entry's, another app's): one that is gets its `?rx-lib` module
// compiled as a library, which refuses the peek on its own.
// Usage: SOLID_VITE_PLUGIN=<a built checkout with context.resolve> node compiler/test/vite-hosts.mjs
//   (the plugin without it: npm's 3.0.1, which compiler/test/vite.mjs installs under .out/.plugin)
import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "..");
const repo = path.resolve(pkg, "..");
const store = path.resolve(process.env.SOLID_NEXT ?? path.resolve(repo, "../solid-next"), "node_modules/.pnpm")   // the checkout beside the repository, or $SOLID_NEXT (as ref/scripts/solid-next.sh);
const installed = path.join(store, readdirSync(store).filter(d => d.startsWith("@solidjs+vite-plugin@")).sort().pop(), "node_modules/@solidjs/vite-plugin");
const deps = path.resolve(installed, "../..");
const vite = await import(pathToFileURL(path.join(deps, "vite/dist/node/index.js")).href);
const { default: rx } = await import(pathToFileURL(path.join(pkg, "vite.mjs")).href);
const withResolve = process.env.SOLID_VITE_PLUGIN ? path.resolve(process.env.SOLID_VITE_PLUGIN) : undefined;
const without = path.join(here, ".out/.plugin/node_modules/@solidjs/vite-plugin");
if (!withResolve) { console.error("set SOLID_VITE_PLUGIN to a built @solidjs/vite-plugin whose front ends get context.resolve"); process.exit(2); }

function project() {
  const dir = path.join(here, ".out/vite-hosts"); rmSync(dir, { recursive: true, force: true }); mkdirSync(path.join(dir, "src/pages"), { recursive: true });
  const nm = path.join(dir, "node_modules"); mkdirSync(path.join(nm, "@reactivescript"), { recursive: true });
  for (const d of readdirSync(deps)) {
    if (!d.startsWith("@")) { symlinkSync(path.join(deps, d), path.join(nm, d)); continue; }
    mkdirSync(path.join(nm, d), { recursive: true });
    for (const e of readdirSync(path.join(deps, d))) symlinkSync(path.join(deps, d, e), path.join(nm, d, e));
  }
  if (!existsSync(path.join(nm, "@solidjs/signals"))) symlinkSync(realpathSync(path.join(deps, "solid-js/node_modules/@solidjs/signals")), path.join(nm, "@solidjs/signals"));
  symlinkSync(pkg, path.join(nm, "@reactivescript/compiler"));
  for (const f of ["package.json", "dist"]) cpSync(path.join(repo, "runtime", f), path.join(nm, "@reactivescript/runtime", f), { recursive: true });
  writeFileSync(path.join(dir, "src/show.rx"), "export component Show(props: { value: number }) {\n  <b>{peek props.value}</b>\n}\n");
  writeFileSync(path.join(dir, "src/main.rx"), "import { Show } from \"./show.rx\"\nexport default component App() {\n  source n := 1\n  <Show value={n} />\n}\n");
  // the host reaches show.rx through an alias only Vite's config names
  writeFileSync(path.join(dir, "src/pages/host.tsx"), "import { Show } from \"@/show.rx?rx-lib\";\nexport const page = () => <Show value={Math.random()} />;\n");
  // this build's entry is the program alone; the host is another build's (a server entry, another app), so this
  // bundle never compiles show.rx?rx-lib itself, and only the whole-program check can know JS applies Show
  writeFileSync(path.join(dir, "src/entry.js"), "import { createApp } from \"@reactivescript/runtime\";\nimport main from \"./main.rx\";\ncreateApp({ root: document.body }).mount(main);\n");
  writeFileSync(path.join(dir, "index.html"), "<!doctype html><html><body><script type=\"module\" src=\"/src/entry.js\"></script></body></html>\n");
  return dir;
}

/** The same program with its host in another build's root, a sibling folder: found only when `hostRoots` names it. */
function elsewhere() {
  const dir = project(); rmSync(path.join(dir, "src/pages"), { recursive: true, force: true });
  const site = path.join(here, ".out/vite-hosts-site"); rmSync(site, { recursive: true, force: true }); mkdirSync(path.join(site, "pages"), { recursive: true });
  // its own project's tsconfig names the program's folder: `app/*`
  writeFileSync(path.join(site, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "app/*": ["../vite-hosts/src/*"] } } }));
  writeFileSync(path.join(site, "pages/host.tsx"), "import { Show } from \"app/show.rx?rx-lib\";\nexport const page = () => <Show value={Math.random()} />;\n");
  return dir;
}

async function buildWith(pluginDir, options = { wholeProgram: true }, make = project) {
  const solid = (await import(pathToFileURL(path.join(pluginDir, "dist/esm/index.mjs")).href + `?${Math.random()}`)).default;
  const dir = make();
  const warned = []; const w = console.warn; console.warn = (...a) => { warned.push(a.join(" ")); w(...a); };
  const saved = { RX_TYPECHECK: process.env.RX_TYPECHECK, RX_GENERATE: process.env.RX_GENERATE };
  Object.assign(process.env, { RX_TYPECHECK: "0", RX_GENERATE: "0" });
  try {
    await vite.build({
      root: dir, configFile: false, logLevel: "silent", clearScreen: false,
      resolve: { alias: { "@": path.join(dir, "src") } },
      plugins: [solid({ frontends: { ".rx": rx(options) } })],
      build: { outDir: "dist", emptyOutDir: true, write: false },
    });
    return { ok: true, warned };
  } catch (e) { return { ok: false, error: String(e?.message ?? e), warned }; }
  finally { console.warn = w; for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; }
}

let fail = 0;
const check = (name, ok, detail) => { if (!ok) fail++; console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n  ${JSON.stringify(detail).slice(0, 1500)}`}`); };
const resolved = await buildWith(withResolve);
check("with context.resolve, the aliased ?rx-lib import is followed: the peek of a prop the host applies is refused (E-5a)", !resolved.ok && /SNAPSHOT_KEPT/.test(resolved.error), resolved);
if (existsSync(path.join(without, "dist/esm/index.mjs"))) {
  const old = await buildWith(without);
  check("without it (npm's 3.0.1), the alias is not seen: the build is accepted, with a warning naming the import", old.ok && old.warned.some(m => /@\/show\.rx\?rx-lib, which names no \.rx file here/.test(m)), old);
} else console.log("- skipped the plugin without context.resolve: run compiler/test/vite.mjs once to install it");
// a host in another build's root (a sibling folder, reaching the program through its own tsconfig's paths)
for (const [name, dir] of [["with context.resolve", withResolve], ...(existsSync(path.join(without, "dist/esm/index.mjs")) ? [["without it", without]] : [])]) {
  const named = await buildWith(dir, { wholeProgram: true, hostRoots: ["../vite-hosts-site"] }, elsewhere);
  check(`${name}, a host beyond the root that hostRoots names is counted: the peek is refused (E-5a)`, !named.ok && /SNAPSHOT_KEPT/.test(named.error), named);
  const unnamed = await buildWith(dir, { wholeProgram: true }, elsewhere);
  check(`${name}, the scan stops at the Vite root: the same host unnamed is not counted`, unnamed.ok, unnamed);
}
process.exit(fail ? 1 : 0);
