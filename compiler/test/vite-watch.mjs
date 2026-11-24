// `vite build --watch` with the `.rx` front end, rebuild by rebuild (13 TY-1d, 09 MO-8k):
// - an edit of a `.ts` module alone compiles no `.rx` entry, so only the front end's `buildStart` can type-check the
//   rebuild: a type error in it fails the rebuild, and fixing it builds again;
// - a `.d.rx` that is created where none was is read by the next rebuild (Rolldown watches no path that has no file),
//   and under the dev server by the next compile of the program that looked for it, with no restart.
// The first needs a Solid plugin that calls front ends at each build's start (`Frontend.buildStart`).
// Usage: SOLID_VITE_PLUGIN=<a built checkout with Frontend.buildStart> node compiler/test/vite-watch.mjs
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { viteDir } from "./vite-dir.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "..");
const repo = path.resolve(pkg, "..");
const store = path.resolve(process.env.SOLID_NEXT ?? path.resolve(repo, "../solid-next"), "node_modules/.pnpm")   // the checkout beside the repository, or $SOLID_NEXT (as ref/scripts/solid-next.sh);
const installed = path.join(store, readdirSync(store).filter(d => d.startsWith("@solidjs+vite-plugin@")).sort().pop(), "node_modules/@solidjs/vite-plugin");
const deps = path.resolve(installed, "../..");
const pluginDir = process.env.SOLID_VITE_PLUGIN ? path.resolve(process.env.SOLID_VITE_PLUGIN) : undefined;
const hasBuildStart = dir => { try { return /frontend\.buildStart/.test(readFileSync(path.join(dir, "dist/esm/index.mjs"), "utf8")); } catch { return false; } };
if (!pluginDir || !hasBuildStart(pluginDir)) { console.error("set SOLID_VITE_PLUGIN to a built @solidjs/vite-plugin that calls front ends at each build's start (Frontend.buildStart)"); process.exit(2); }
const vitePkg = viteDir(deps);
const vite = await import(pathToFileURL(path.join(vitePkg, "dist/node/index.js")).href);
const solid = (await import(pathToFileURL(path.join(pluginDir, "dist/esm/index.mjs")).href)).default;
const { default: rx } = await import(pathToFileURL(path.join(pkg, "vite.mjs")).href);

const dir = path.join(here, ".out/vite-watch"); rmSync(dir, { recursive: true, force: true }); mkdirSync(path.join(dir, "src"), { recursive: true });
const nm = path.join(dir, "node_modules"); mkdirSync(path.join(nm, "@reactivescript"), { recursive: true });
for (const d of readdirSync(deps)) {
  if (!d.startsWith("@")) { symlinkSync(d === "vite" ? vitePkg : path.join(deps, d), path.join(nm, d)); continue; }
  mkdirSync(path.join(nm, d), { recursive: true });
  for (const e of readdirSync(path.join(deps, d))) symlinkSync(path.join(deps, d, e), path.join(nm, d, e));
}
if (!existsSync(path.join(nm, "@solidjs/signals"))) symlinkSync(realpathSync(path.join(deps, "solid-js/node_modules/@solidjs/signals")), path.join(nm, "@solidjs/signals"));
symlinkSync(pkg, path.join(nm, "@reactivescript/compiler"));
symlinkSync(path.join(repo, "tooling/rx-language-server"), path.join(nm, "@reactivescript/language-server"));
for (const f of ["package.json", "dist"]) cpSync(path.join(repo, "runtime", f), path.join(nm, "@reactivescript/runtime", f), { recursive: true });
let edited = [];   // the files of the edit a rebuild is awaited for
const touch = (p, text) => { writeFileSync(p, text); const t = new Date(Date.now() + 1500); utimesSync(p, t, t); };   // an edit, also on a file system whose times are coarse
const src = (f, text) => { const p = path.join(dir, "src", f); touch(p, text); edited.push([p, text]); };
writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "fixture", type: "module" }));
writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { jsx: "preserve", jsxImportSource: "@solidjs/web", strict: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true, lib: ["ES2022", "DOM"], types: [] }, include: ["src/**/*.rx", "src/util.ts"] }));
writeFileSync(path.join(dir, "src/main.rx"), "export default component App() {\n  source n := 1\n  <p>{n}</p>\n}\n");
writeFileSync(path.join(dir, "src/util.ts"), "export const label: string = \"a\";\n");
writeFileSync(path.join(dir, "src/entry.js"), "import { createApp } from \"@reactivescript/runtime\";\nimport main from \"./main.rx\";\nimport { label } from \"./util.ts\";\ndocument.title = label;\nconst app = createApp({ root: document.body });\napp.mount(main(app));\n");
writeFileSync(path.join(dir, "index.html"), "<!doctype html><html><body><script type=\"module\" src=\"/src/entry.js\"></script></body></html>\n");

const saved = { RX_TYPECHECK: process.env.RX_TYPECHECK, RX_GENERATE: process.env.RX_GENERATE };
Object.assign(process.env, { RX_TYPECHECK: "1", RX_GENERATE: "0" });
let starts = 0;   // the builds begun
const watcher = await vite.build({
  root: dir, configFile: false, logLevel: "silent", clearScreen: false,
  plugins: [{ name: "builds", enforce: "pre", buildStart() { starts++; } }, solid({ frontends: { ".rx": rx() } })],
  // the watcher polls: what is tested is a rebuild reading what changed, not the platform's file events. On macOS they
  // report a project written just before the watcher started late, as one burst, and an edit made meanwhile is merged
  // into it or never reported (compiler/test/vite.mjs met the same under the dev server): no rebuild started, and each
  // check here waited its minute out. (Vite takes the watcher's options from `chokidar` and writes over `watcher`: given
  // there, nothing polled)
  build: { outDir: "dist", emptyOutDir: true, watch: { chokidar: { usePolling: true, interval: 50 } } },
});
// each build's outcome, in order: "ok", or its error's text
const rounds = []; let error = null;
watcher.on("event", e => {
  if (e.code === "ERROR") error = String(e.error?.message ?? e.error);
  if (e.code === "BUNDLE_END") e.result?.close?.();
  if (e.code === "END") { rounds.push(error ?? "ok"); error = null; }
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** The outcome of a build that read the edits made since the last call. A build's `buildStart` is called before it reads
 *  any module, so one called after the edits were written reads them; the watcher's own START does not say that (it is
 *  reported late, and a rebuild under way when the edits are written reports it after them: its outcome was taken for
 *  theirs, one run in six). The watcher takes a file's state when it begins to watch it, some time after the build that
 *  named it has ended, and never sees an edit made before that: one no build has started for is made again, each second.
 *  The outcome is the last build's once the watcher is quiet (an edit made twice may be built twice, to the same end). */
const next = async (ms = 90000) => {
  const until = Date.now() + ms, from = edited.length ? starts : 0, files = edited; edited = [];
  for (let at = Date.now(); starts === from && Date.now() < until; await sleep(100)) if (files.length && Date.now() - at > 1000) { for (const [p, text] of files) touch(p, text); at = Date.now(); }
  for (let quiet = 0; quiet < 8 && Date.now() < until; await sleep(100)) quiet = rounds.length < starts ? 0 : quiet + 1;
  return rounds.at(-1);
};

let fail = 0;
const check = (name, ok, detail) => { if (!ok) fail++; console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n  ${JSON.stringify(detail ?? null).slice(0, 1500)}`}`); };
try {
  check("the first build is checked and passes", await next() === "ok", rounds);
  // TY-1d: a .ts module alone changes, with a type error: no .rx entry is compiled again
  src("util.ts", "export const label: string = 1;\n");
  const broken = await next();
  check("a type error in a .ts module alone fails the rebuild (TY-1d, by buildStart)", /type errors \(rx-tsc\)/.test(broken ?? "") && /util\.ts/.test(broken ?? ""), rounds);
  src("util.ts", "export const label: string = \"b\";\n");
  check("fixing it builds again", await next() === "ok", rounds);
  // MO-8k: the program starts to import a JS module nothing declares: its call is io, in reactive scope
  src("lib.js", "export const twice = n => n * 2;\n");
  src("main.rx", "import { twice } from \"./lib.js\"\nexport default component App() {\n  source n := 1\n  <p>{twice(n)}</p>\n}\n");
  const undeclared = await next();
  check("an undeclared JS module's call in reactive scope fails the rebuild", /IO_IN_REACTIVE/.test(undeclared ?? ""), rounds);
  // its declaration is created. Rolldown's watcher watches no path that has no file, so nothing rebuilds yet; the next
  // rebuild, here one a .ts edit starts, reads it: the check passes at buildStart and the program compiles
  src("lib.d.rx", "export pure fn twice(n: number): number\n");
  src("util.ts", "export const label: string = \"c\";\n");
  check("a .d.rx created since is read by the next rebuild, whatever starts it (MO-8k)", await next() === "ok", rounds);
} finally {
  await watcher.close();
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
}

// the dev server: a path with no file cannot be watched (Vite resolves what a module watches), so a created .d.rx
// invalidates nothing by itself; it is stamped, so the next compile of the program reads it, with no restart
{
  src("main.rx", "import { twice } from \"./lib2.js\"\nexport default component App() {\n  source n := 1\n  <p>{twice(n)}</p>\n}\n");
  src("lib2.js", "export const twice = n => n * 2;\n");
  Object.assign(process.env, { RX_TYPECHECK: "0", RX_GENERATE: "0" });
  const server = await vite.createServer({ root: dir, configFile: false, logLevel: "silent", clearScreen: false, plugins: [solid({ frontends: { ".rx": rx() } })], server: { middlewareMode: true, ws: false, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const env = server.environments.client;
    const compile = () => env.transformRequest("/src/main.rx").then(r => r?.code ? "ok" : "nothing", e => String(e?.message ?? e));
    const before = await compile();
    check("under the dev server, the undeclared call is refused", /IO_IN_REACTIVE/.test(before), before);
    src("lib2.d.rx", "export pure fn twice(n: number): number\n");
    const after = await compile();
    check("and the next compile reads a .d.rx created since, with no restart (MO-8k)", after === "ok", after);
  } finally {
    await server.close();
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}
process.exit(fail ? 1 : 0);
