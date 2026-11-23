// ReactiveScript's front end for @solidjs/vite-plugin. The plugin loads it from `@reactivescript/compiler/vite` when
// the project has the package, so `solid()` compiles `.rx` with no option; `solid({ frontends: { ".rx": rx() } })`
// names it explicitly.
//
// The crate (its Node-API build, `src/node.rs`: what `rxc app` does) already hands each module to Solid's compiler
// (spec/11 CP-1), so a `.rx` module comes back as Solid's output for the environment's `generate`, with its source map onto the `.rx` and
// its own stylesheet. Solid's plugin then takes it the way it takes lowered `.tsrx`: primitive
// names, `lazy()`, the HMR refresh pass, server functions (12 SF-7a), the stylesheet as a CSS module.
//
// Entries find themselves. JavaScript imports only a program's entry (its default export mounts the app); an `.rx`
// dependency is a factory over the app (09 MO-1b) that only `.rx` imports. So an `.rx` module imported plainly is an
// entry: the program is checked and compiled whole from it (CP-2), once per target and again when one of its files
// changes. The crate's output imports its dependencies as `./x.rx?rx-dep`, and a dependency is served from the build
// of a program that contains it. A module several programs share is one module: its instance is keyed by its factory
// (11 CP-4b `module`), not by its place in a program.
//
// Types (13 TY-1a): a production build type-checks each project with `rx-tsc` (from @reactivescript/language-server),
// once per build per tsconfig.json, when it compiles that project's first entry (and again when a rebuild of `vite build
// --watch` compiles an entry whose program changed since); entries under two tsconfigs are two checks, each failing only
// its own entries. With `wholeProgram`, rx-tsc reads the crate's rows as the build does (`--rx-whole-program`, with the
// hosts found): TypeScript's errors on the `.rx` (a route whose path lacks a param its page
// needs, MO-11h), TY-6's on the `.d.rx`, fail the build. A check that cannot run fails it too (TY-1d): a tsconfig.json
// with no @reactivescript/language-server to run rx-tsc, or, when RX_TYPECHECK=1 asked for it, no tsconfig.json; a
// production build with no tsconfig.json only says the types went unchecked. The dev server leaves types to the
// editor, which runs the same projection. RX_TYPECHECK=0 or 1 overrides either default.
//
// Declarations (09 MO-8l): before a program is read, each package it imports that nothing declares (no `rx-types/` file,
// none shipped, no `@rx-types` package) gets a draft from its TypeScript types in `node_modules/.rx-types/`, with the
// language server's generator. `rx({ generate: false })` or RX_GENERATE=0 turns it off.
//
// Whole program (02 E-5a, opt-in): `rx({ wholeProgram: true })` checks each build's modules as the whole program, so a
// kept `peek` of a prop or provision is decided by every application and provision; a module some JS file under the
// root imports with `?rx-lib` counts as applied from outside; `rx({ hostRoots: ["../site"] })` names the folders or files
// beyond the root that hold such hosts (another app's, a server's). Off by default: the editor checks per module.
//
// The runtime (11 CP-4a): what a compiled `?rx-lib` or `?rx-page` module imports the app binding from is found here,
// not asked of the app's package.json — @reactivescript/runtime is this package's dependency. Where the app's own
// imports reach it (`node_modules` up from the Vite root, as Vite resolves a bare import), the import is that bare
// name: one module with the app's `createApp`, and Solid's plugin, which loads with the app every package that runs
// on Solid, finds it listed in the app's package.json or through this package's. Where they do not (a package manager
// that hoists nothing), it is this package's own copy, by its folder: an import by path is never left to Node.
//
// A root some JS names by its file (CP-4d): `rx({ pages: ["src/App.rx"] })` — an `.rx` module named there is compiled
// as a page (its default component, as `?rx-page`) when it is imported with no query. Solid's start mode takes its
// root as a file path and writes the import itself (`solid({ start: { app: "src/App.rx" } })`), so the query has
// nowhere to go.
import { existsSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { app } = createRequire(import.meta.url)("./index.js");
const DEP = "rx-dep";
const LIB = "rx-lib";   // CP-4d: a JS module imports an .rx module's components: `import { PersonCard } from "./pages.rx?rx-lib"`
const PAGE = "rx-page";   // CP-4d: … and a route file's page, the module's default component: `import Person from "./routes/people.rx?rx-page"`
// the page each code points to: the package's copy (scripts/guide.mjs), else the repository's
const GUIDE = [path.join(path.dirname(fileURLToPath(import.meta.url)), "guide/diagnostics.md"), path.join(path.dirname(fileURLToPath(import.meta.url)), "../guide/diagnostics.md")].find(existsSync)
  ?? "https://github.com/solidjs/reactivescript/blob/main/guide/diagnostics.md";
const at = d => d.range ? `${d.range.start.line}:${d.range.start.column + 1}` : `${d.line}`;
/** The diagnostics as `rxc check` prints them, then, once per code, where its fix is explained. */
const report = ds => [
  ...ds.map(d => `${d.file}:${at(d)}: error ${d.code} [${d.rule}] ${d.msg}`),
  "",
  ...[...new Set(ds.map(d => d.code))].map(c => `${c}: why, and the fix — ${GUIDE}#${c.toLowerCase()}`),
].join("\n");
const mtime = file => { try { return statSync(file).mtimeMs; } catch { return -1; } };
const isDep = moduleId => new URLSearchParams(moduleId.split("?")[1] ?? "").has(DEP);
// `import __m0 from "./catalog.rx";` → `"./catalog.rx?rx-dep"` (one line each: the module's map is by line, CP-1c)
const tagDeps = code => code.replace(/^(import \w+ from ")(\.{1,2}\/[^"?]*\.rx)(";?)$/gm, `$1$2?${DEP}$3`);

/** TY-1a: `rx-tsc --noEmit` over the project the entry belongs to (its nearest tsconfig.json): null when it passes, the
 *  report when it does not, `{ missing }` ("tsconfig" or "checker") when it cannot run. */
function projectOf(entry) {
  let dir = path.dirname(entry);
  while (!existsSync(path.join(dir, "tsconfig.json")) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  return existsSync(path.join(dir, "tsconfig.json")) ? dir : undefined;
}
/** E-5a: `whole`, the build checks its programs as the whole program, with `hosts` the modules JS hosts import with
 *  ?rx-lib: rx-tsc then reads the crate's rows the same way (`--rx-whole-program`, `--rx-hosts`), so the gate and the
 *  build agree on what a kept `peek` is; TypeScript's check is the same either way. */
function typecheck(entry, { whole = false, hosts = [] } = {}) {
  const dir = projectOf(entry);
  if (!dir) return { missing: "tsconfig" };
  let bin;
  try { bin = createRequire(path.join(dir, "package.json")).resolve("@reactivescript/language-server/bin/tsc.js"); } catch { return { missing: "checker" }; }
  // TY-1d: what the check read, by content (rx-tsc's --rx-inputs), so the gate knows when it is stale
  const inputsFile = path.join(tmpdir(), `rx-inputs-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const args = [bin, "--noEmit", "-p", path.join(dir, "tsconfig.json"), "--rx-inputs", inputsFile];
  let hostsFile;
  if (whole) {
    args.push("--rx-whole-program");
    hostsFile = path.join(tmpdir(), `rx-hosts-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(hostsFile, JSON.stringify(hosts));
    args.push("--rx-hosts", hostsFile);
  }
  try {
    const r = spawnSync(process.execPath, args, { cwd: dir, encoding: "utf8" });
    let inputs = null; try { inputs = JSON.parse(readFileSync(inputsFile, "utf8")); } catch {}
    let stale = () => true; try { stale = createRequire(bin)("../src/inputs.js").stale; } catch {}
    return { report: r.status === 0 ? null : (r.stdout + r.stderr).trim() || `rx-tsc exited with ${r.status}`, inputs, stale };
  } finally { if (hostsFile) rmSync(hostsFile, { force: true }); rmSync(inputsFile, { force: true }); }
}
/** TY-1d: the project a type-check covers, by its tsconfig.json's real path (two links to one project are one); an entry
 *  with no tsconfig.json above it is its own folder's. */
function projectKey(entry) {
  const dir = projectOf(entry);
  return dir ? real(path.join(dir, "tsconfig.json")) : `none:${real(path.dirname(entry))}`;
}

/** MO-8l: draft a declaration for each package the program imports that nothing declares (into node_modules/.rx-types),
 *  with the language server's generator — the project's, else this checkout's. Undefined when there is none to run. */
function generator(entry) {
  for (const from of [path.join(path.dirname(entry), "package.json"), fileURLToPath(import.meta.url)]) {
    try { return createRequire(from)("@reactivescript/language-server/src/generate.js"); } catch {}
  }
  const local = path.join(path.dirname(fileURLToPath(import.meta.url)), "../tooling/rx-language-server/src/generate.js");
  return existsSync(local) ? createRequire(import.meta.url)(local) : undefined;
}

/** MO-14g: the language server's reader of a router's tree — the project's, else this checkout's. */
function hostRoutes(entry) {
  for (const from of [path.join(path.dirname(entry), "package.json"), fileURLToPath(import.meta.url)]) {
    try { return createRequire(from)("@reactivescript/language-server/src/host-routes.js"); } catch {}
  }
  const local = path.join(path.dirname(fileURLToPath(import.meta.url)), "../tooling/rx-language-server/src/host-routes.js");
  return existsSync(local) ? createRequire(import.meta.url)(local) : undefined;
}

const RX_IMPORT = /^import\b[^"']*?\bfrom\s+(["'])(\.{1,2}\/[^"'?]*\.rx)\1/gm;
/** The `.rx` files under `root` from which `file` is reached by imports: first those no other `.rx` file imports. */
function entriesOf(file, root) {
  const importers = new Map();
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".rx")) for (const [, , spec] of readFileSync(p, "utf8").matchAll(RX_IMPORT)) {
        const dep = path.resolve(path.dirname(p), spec);
        importers.set(dep, [...(importers.get(dep) ?? []), p]);
      }
    }
  };
  walk(root);
  const seen = new Set([file]);
  for (const f of seen) for (const i of importers.get(f) ?? []) seen.add(i);
  seen.delete(file);
  const top = f => !importers.has(f);
  return [...seen].sort().sort((a, b) => top(b) - top(a));
}

/** E-5a, whole program: the `.rx` modules a JS host under `root` imports with `?rx-lib` (CP-4d), whose exported
 *  components JS applies with props the program cannot see. Absolute POSIX paths, the module keys. */
// an import, a re-export, a dynamic import or a require, in any quotes, whose query has `rx-lib` among its parameters
// (`./show.rx?rx-lib`, `?v=1&rx-lib`; `?rx-page`, a route file's page): what the plugin compiles as a library (`lib`,
// below) is what counts as a host
const RX_LIB_IMPORT = /(?:\bfrom\s*|\b(?:import|require)\s*\(\s*|\bimport\s*)(["'`])([^"'`?]+\.rx)\?(?:[^"'`#]*&)?rx-(?:lib|page)(?=[&=#"'`?])/g;
// the files a host may be: JS and TS modules, and the single-file components whose script imports as one
const HOST_FILE = /\.(m?[jt]sx?|c[jt]s|vue|svelte|astro|mdx?)$/;
const posix = p => p.replace(/\\/g, "/");
const real = p => { try { return posix(realpathSync(p)); } catch { return posix(p); } };

/** The aliases Vite would apply, as `resolve.alias` writes them (an object, or `{ find, replacement }` entries), in order. */
function aliasesOf(alias) {
  if (!alias) return [];
  return Array.isArray(alias) ? alias.filter(a => a && a.find !== undefined) : Object.entries(alias).map(([find, replacement]) => ({ find, replacement }));
}
/** tsconfig.json's `compilerOptions.paths` under `root`, as aliases (`"@/*": ["./src/*"]`), against its `baseUrl`. */
function tsPathsOf(root) {
  let cfg; try { cfg = JSON.parse(readFileSync(path.join(root, "tsconfig.json"), "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")); } catch { return []; }
  const o = cfg?.compilerOptions ?? {}; const base = path.resolve(root, o.baseUrl ?? ".");
  return Object.entries(o.paths ?? {}).map(([k, v]) => ({ k, to: (Array.isArray(v) ? v : [v]).map(x => path.resolve(base, x)) }));
}
/** The `paths` a host file is under: the Vite root's tsconfig.json for a file under the root, as the build resolves it;
 *  for a host elsewhere (`hostRoots`: another app's, a server's), its own project's, the nearest tsconfig.json above it. */
function tsPathsFor(file, root, memo) {
  let dir = root;
  if (path.relative(root, file).startsWith("..")) { dir = path.dirname(file); while (!existsSync(path.join(dir, "tsconfig.json")) && path.dirname(dir) !== dir) dir = path.dirname(dir); }
  if (!memo.has(dir)) memo.set(dir, tsPathsOf(dir));
  return memo.get(dir);
}
/** The file a JS module's import of `spec` names, as Vite resolves it for these aliases and tsconfig paths, or undefined
 *  when none of them says (a bare package specifier). Its real path, so a link and its target are one module. */
function resolveHost(spec, importer, aliases, tsPaths) {
  if (spec.startsWith(".")) return real(path.resolve(path.dirname(real(importer)), spec));   // from where the importer really is, as Node and Vite resolve
  for (const { find, replacement } of aliases) {
    if (find instanceof RegExp) { if (find.test(spec)) return resolveHost(spec.replace(find, replacement), importer, [], tsPaths) ?? real(spec.replace(find, replacement)); }
    else if (spec === find || spec.startsWith(find.endsWith("/") ? find : find + "/")) { const to = replacement + spec.slice(find.length); return path.isAbsolute(to) ? real(to) : resolveHost(to, importer, [], tsPaths); }
  }
  for (const { k, to } of tsPaths) {
    const star = k.indexOf("*");
    const hit = star < 0 ? (spec === k ? "" : undefined) : spec.startsWith(k.slice(0, star)) && spec.endsWith(k.slice(star + 1)) ? spec.slice(star, spec.length - (k.length - star - 1)) : undefined;
    if (hit === undefined) continue;
    const files = to.map(x => x.replace("*", hit)); return real(files.find(existsSync) ?? files[0]);
  }
  if (path.isAbsolute(spec)) return real(spec);
  return undefined;
}
const unresolved = new Set();   // ?rx-lib imports already reported as naming no file
const scans = new Map();   // a JS file → { t: its mtime, specs: the ?rx-lib imports it was read with } (the file's text: shared)
/** Every `?rx-lib` import of the JS files under `roots` (folders, or single files), linked folders followed:
 *  `{ p, spec, s }`, `s` the file's scan (kept while its mtime stands). */
function hostImports(roots) {
  const out = []; const seen = new Set();   // the real folders walked: a link back up the tree is walked once
  const walk = dir => {
    const r = real(dir); if (seen.has(r)) return; seen.add(r);
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      // a linked folder is walked as the folder it links to (a host may live in one: a workspace package, a shared pages dir)
      if (e.isDirectory() || (e.isSymbolicLink() && (() => { try { return statSync(p).isDirectory(); } catch { return false; } })())) walk(p);
      else if (HOST_FILE.test(e.name)) read(p);
    }
  };
  const read = p => {
    const t = mtime(p); let s = scans.get(p);
    if (!s || s.t !== t) { let text = ""; try { text = readFileSync(p, "utf8"); } catch {} s = { t, specs: [...text.matchAll(RX_LIB_IMPORT)].map(m => m[2]) }; scans.set(p, s); }
    for (const spec of s.specs) out.push({ p, spec, s });
  };
  for (const root of roots) { let file = false; try { file = statSync(root).isFile(); } catch {} if (file) { if (!seen.has(real(root))) { seen.add(real(root)); read(root); } } else walk(root); }
  return out;
}
/** E-5a: where hosts are looked for: the Vite root, and the folders or files `rx({ hostRoots })` names (against the
 *  root), for a host this build's root does not hold: another app's page, a server's entry. */
const scanRoots = (root, more) => [root, ...(more ?? []).map(r => path.resolve(root, r))];
function warnUnresolved(p, spec) {
  if (unresolved.has(`${p}\0${spec}`)) return;
  unresolved.add(`${p}\0${spec}`);
  console.warn(`[reactivescript] whole-program check: ${path.relative(process.cwd(), p)} imports ${spec}?rx-lib, which names no .rx file here: pass the project's aliases as rx({ alias }), or the components it applies are not counted (E-5a)`);
}
/** A host's file under each name the checker's module keys may give it: the checker keys a module by the path the
 *  build named it with, which is the real one (Vite's ids) or one through a link (a root opened through a symlink,
 *  `preserveSymlinks`); so the real path, and the same file under the root as it was given. */
function keysOf(f, root) {
  const out = new Set([posix(f), real(f)]);
  const given = posix(path.resolve(root)), actual = real(root);
  if (given !== actual) for (const k of [...out]) {
    if (k.startsWith(actual + "/")) out.add(given + k.slice(actual.length));
    if (k.startsWith(given + "/")) out.add(actual + k.slice(given.length));
  }
  return out;
}
/** The hosts, resolved here: relative imports, the `alias` option and tsconfig.json's `paths`. */
function hostsUnder(root, alias, more) {
  const out = new Set(); const aliases = aliasesOf(alias); const paths = new Map();
  for (const { p, spec } of hostImports(scanRoots(root, more))) {
    const f = resolveHost(spec, p, aliases, tsPathsFor(p, root, paths));
    if (f && existsSync(f)) for (const k of keysOf(f, root)) out.add(k); else warnUnresolved(p, spec);
  }
  return [...out].sort();
}
/** The hosts, resolved by Vite itself (`resolve`, the front-end context's, which runs every plugin's `resolveId`), so an
 *  alias only another plugin knows is seen too; an import Vite does not resolve falls back to `hostsUnder`'s reading.
 *  `via` keeps Vite's answers for one plugin instance, by file, its mtime and the import: another Vite configuration in
 *  the same process (another instance) may resolve the same import elsewhere, and asks again. */
async function hostsVia(root, resolve, alias, via, more) {
  const out = new Set(); const aliases = aliasesOf(alias); const paths = new Map();
  for (const { p, spec, s } of hostImports(scanRoots(root, more))) {
    // a host beyond the root (hostRoots) is another project's file: its own tsconfig's `paths` name its imports before
    // this build's resolver does, whose aliases are this project's
    const own = path.relative(root, p).startsWith("..") ? resolveHost(spec, p, [], tsPathsFor(p, root, paths)) : undefined;
    const key = `${p}\0${s.t}\0${spec}`;
    if (!(own && existsSync(own)) && !via.has(key)) {
      let id = null; try { id = await resolve(spec, real(p)); } catch {}   // the importer as Vite names it, by its real path
      via.set(key, id && !id.startsWith("\0") ? posix(id.split("?")[0]) : null);
    }
    const f = own && existsSync(own) ? own : via.get(key) ?? resolveHost(spec, p, aliases, tsPathsFor(p, root, paths));
    if (f && existsSync(f)) for (const k of keysOf(f, root)) out.add(k); else warnUnresolved(p, spec);
  }
  return [...out].sort();
}

/** 11 CP-4a: the folder of `@reactivescript/runtime` that `node_modules` up from `from` reaches, as Vite and Node
 *  resolve a bare import (the package exports no `package.json`, so `require.resolve` cannot be asked). */
function runtimeDir(from) {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    const at = path.join(dir, "node_modules/@reactivescript/runtime");
    if (existsSync(path.join(at, "package.json"))) return at;
    if (path.dirname(dir) === dir) return undefined;
  }
}
const runtimes = new Map();   // a Vite root → how its compiled modules name the runtime
/** How a compiled module names the runtime for the app under `root`: the bare name where the app's own imports reach
 *  the package (one module with them, and with what Solid's plugin loads with the app); else this package's own copy —
 *  its dependency, or the repository's beside it — by its folder, whose `exports` Vite reads for the environment. */
function runtimeFor(root) {
  if (runtimes.has(root)) return runtimes.get(root);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const own = () => runtimeDir(here) ?? [path.join(here, "../runtime")].find(d => existsSync(path.join(d, "dist/web.js")));
  const spec = runtimeDir(root) ? "@reactivescript/runtime" : own() ? posix(real(own())) : "@reactivescript/runtime";
  runtimes.set(root, spec);
  return spec;
}

/** @returns {import("@solidjs/vite-plugin").Frontend} */
export default function rx(options = {}) {
  const flag = process.env.RX_TYPECHECK;
  // TY-1d: when each project (by its tsconfig.json) was last type-checked, and what came of it. Once per build per
  // project: a rebuild (`vite build --watch`) compiles an entry again because a file of its program changed, and a file
  // of that project newer than its last check asks for another. Two entries of one build under two tsconfigs are two
  // checks, each failing its own entries; one passing does not stand for the other.
  const typedProjects = new Map();   // projectKey → { outcome, entry, hosts, inputs, stale }
  const typed = () => flag !== "0" && (flag === "1" || process.env.NODE_ENV === "production");
  function check(file, hosts = []) {
    const r = typecheck(file, { whole: !!options.wholeProgram, hosts });
    const t = r?.missing ? r : r.report;
    // TY-1d: a check that was asked for (RX_TYPECHECK=1), or a TypeScript project's production build, fails when it
    // cannot run; a production build with no tsconfig.json is not a TypeScript project, and only says so
    const where = path.relative(process.cwd(), file);
    const outcome = t?.missing === "checker" || (t?.missing === "tsconfig" && flag === "1")
      ? `types not checked: ${t.missing === "checker" ? `no @reactivescript/language-server to run rx-tsc with (install it in the project)` : `no tsconfig.json above ${where}`}; set RX_TYPECHECK=0 to build without checking them (13 TY-1d)`
      : t?.missing ? null : t ? `type errors (rx-tsc):\n${t}` : null;
    if (t?.missing && !outcome) console.warn(`[reactivescript] types not checked: no tsconfig.json above ${where} (13 TY-1d)`);
    // TY-1d (revised after review): stale when anything the check read is different now — by content, not mtime
    const st = { outcome, entry: file, hosts: hosts.join("\0"), stale: r?.missing ? () => true : () => r.stale(r.inputs) };
    typedProjects.set(projectKey(file), st);
    return st;
  }
  const builds = new Map();
  const via = new Map();   // E-5a: what this instance's Vite resolved each ?rx-lib import to (hostsVia)
  let serving = false;   // the dev server (Vite's `serve`, as Solid's plugin says it: `solid.dev` with hot updates or a dev build's transform)
  let lastRoot;   // the Vite root, for whole-program checking's ?rx-lib hosts   // entry\0target\0moduleName\0spa\0lib → { entry, target, moduleName, spa, lib, out, stamps }
  // E-5a: the hosts a whole-program check counted are part of what it was checked against: a JS file that starts or stops
  // importing a module with ?rx-lib makes the check stale, as an edit of one of its modules does
  // CP-4d: the modules `rx({ pages })` names, by their real paths (against the Vite root): JS applies their default
  // component, as it does a module imported with ?rx-page — so each is a host of a whole-program check too
  const pagesUnder = root => (options.pages ?? []).map(p => real(path.resolve(root, p)));
  const withPages = (hosts, root) => options.pages?.length ? [...new Set([...hosts, ...pagesUnder(root).filter(existsSync).flatMap(f => [...keysOf(f, root)])])].sort() : hosts;
  const hostsNow = () => options.wholeProgram ? withPages(hostsUnder(lastRoot ?? process.cwd(), options.alias, options.hostRoots), lastRoot ?? process.cwd()) : [];
  const fresh = (b, hosts = hostsNow()) => [...b.stamps].every(([f, t]) => mtime(f) === t) && b.hosts.join("\0") === hosts.join("\0");
  function build(entry, target, moduleName, spa, lib = false, hosts = hostsNow()) {
    const key = `${entry}\0${target}\0${moduleName}\0${spa}\0${lib}`;
    const prior = builds.get(key);
    if (prior && fresh(prior, hosts)) return prior;
    if (options.generate !== false && process.env.RX_GENERATE !== "0") {   // MO-8l, before the program is read
      let drafted = [];
      try { drafted = generator(entry)?.ensureDeclarations(entry) ?? []; }
      catch (e) { console.warn(`[reactivescript] drafting declarations failed, the program is read without them (MO-8l): ${e?.message ?? e}`); }
      for (const r of drafted) if (r.removed) console.warn(`[reactivescript] removed an outdated drafted declaration for ${r.spec} that could not be redone (${r.reason}): it is undeclared until it is declared or can be drafted again (MO-8l)`);
      for (const r of drafted) if (r.status === "written") console.info(`[reactivescript] drafted a declaration for ${r.spec} from its types: ${path.relative(process.cwd(), r.file)} (MO-8l)`);
    }
    // MO-14g, before the program is read: a host declaration derived from the router's tree (`//@ routes`) is held to
    // the tree as it is now — the router's plugin has written it by the time a module is compiled. The dev server writes a
    // declaration that fell behind again (a route file was added while it runs); a build refuses it (HOST_VIEW_STALE)
    hostInStep(entry);
    // E-5a: `rx({ wholeProgram: true })` checks a build as the whole program, counting every module a JS host imports with
    // ?rx-lib as applied from outside; off by default, so a build and the editor (per module) agree
    const out = JSON.parse(options.wholeProgram ? app(entry, target, moduleName, spa, lib, true, hosts) : app(entry, target, moduleName, spa, lib));
    if (out.modules) out.modules = Object.fromEntries(Object.entries(out.modules).map(([p, m]) => [path.resolve(p), m]));
    // what the build was made from: its modules, and every file the crate read or looked for (`asked`: declarations, a
    // package.json, and where a declaration would be, MO-8k), so an edited or added `.d.rx` makes it stale as an edited
    // module does; a file that is not there is stamped so, and appearing changes it
    const files = [...new Set([...(out.modules ? Object.keys(out.modules) : out.diagnostics ? [entry, ...out.diagnostics.map(d => d.file)] : [entry]), ...(out.asked ?? []).map(f => path.resolve(f))])];
    const b = { entry, target, moduleName, spa, lib, out, hosts, stamps: new Map(files.map(f => [f, mtime(f)])) };
    builds.set(key, b);
    return b;
  }
  function hostInStep(entry) {
    let H; try { H = hostRoutes(entry); } catch { H = undefined; }
    const file = H?.hostFor(entry); if (!file) return;
    let d; try { d = H.drift(file); } catch (e) { d = { stale: true, problems: [String(e?.message ?? e)] }; }
    if (!d?.stale) return;
    if (serving) { let wrote = false; try { wrote = H.sync(file); } catch {} if (wrote) { console.info(`[reactivescript] ${path.relative(process.cwd(), file)} written again from the router's tree: ${d.problems.join("; ")} (MO-14g)`); return; } }
    throw new Error(`HOST_VIEW_STALE [MO-14g] ${H.message(file, d)}\n\nHOST_VIEW_STALE: why, and the fix — ${GUIDE}#host_view_stale`);
  }
  const built = (file, target, moduleName, spa) =>
    [...builds.values()].filter(b => b.target === target && b.moduleName === moduleName && b.spa === spa && b.out.modules?.[file]);
  /** A dependency: from a build of a program that has it, rebuilt if that program changed. */
  function containing(file, target, moduleName, spa, root, hosts = hostsNow()) {
    const has = built(file, target, moduleName, spa);
    const b = has.find(x => fresh(x, hosts)) ?? has[0];
    if (b) return build(b.entry, target, moduleName, spa, false, hosts);
    // the entry's compile was skipped (Vitest's `fsModuleCache` served it), so find the program from the files
    let failed;
    for (const entry of entriesOf(file, root)) {
      const found = build(entry, target, moduleName, spa, false, hosts);
      if (found.out.modules?.[file]) return found;
      if (!failed && found.out.diagnostics) failed = found;   // the program holds it but does not compile: report why
    }
    if (failed) return failed;
    throw new Error(`${file} is imported as an .rx dependency, but no program under ${root} contains it`);
  }
  return {
    compile(source, context) {
      if (context.root) lastRoot = path.resolve(context.root);
      serving = !!context.solid?.dev && process.env.NODE_ENV !== "production";
      // E-5a: with Solid's plugin handing a resolver (`context.resolve`), the hosts are resolved by Vite, so asynchronously;
      // without it, here (the `alias` option and tsconfig paths), and the compile stays synchronous
      if (options.wholeProgram && typeof context.resolve === "function")
        return hostsVia(lastRoot ?? process.cwd(), context.resolve, options.alias, via, options.hostRoots).then(hosts => compileWith(context, withPages(hosts, lastRoot ?? process.cwd())));
      return compileWith(context, hostsNow());
    },
    // TY-1d: a build starts (Solid's plugin calls this where it has the hook: each `vite build`, each rebuild of
    // `vite build --watch`, each environment). A rebuild after an edit of a `.ts` module alone compiles no `.rx` entry,
    // so nothing above would check it: here the project is checked again when anything its last check read (by
    // content: rx-tsc's --rx-inputs) is different, and a build whose check failed fails before it bundles. The first build has no entry yet: its first
    // compile checks.
    buildStart() {
      if (!typed()) return;
      let failed;
      for (const [, st] of typedProjects) {
        const now = st.stale() ? check(st.entry, st.hosts ? st.hosts.split("\0") : []) : st;
        failed ??= now.outcome;
      }
      if (failed) throw new Error(failed);
    },
  };
  function compileWith({ id, moduleId, root, solid, addWatchFile }, hosts) {
      const file = path.resolve(id);
      const target = solid.generate === "ssr" ? "ssr" : solid.generate === "universal" ? "universal" : "dom";
      const moduleName = solid.moduleName ?? "@solidjs/web";
      // 08 CN-3d: a client-only build (no SSR, nothing hydrates) has nothing to show on a first load nothing holds
      const spa = target === "dom" && solid.hydratable === false;
      const dep = isDep(moduleId);
      const query = new URLSearchParams(moduleId.split("?")[1] ?? "");
      // CP-4d: a page by its query, or — imported with none — by `rx({ pages })`: a root a JS host names as a file
      const page = query.has(PAGE) || (!dep && !query.has(LIB) && !!options.pages?.length && pagesUnder(path.resolve(root ?? lastRoot ?? process.cwd())).includes(real(file)));
      const lib = page || query.has(LIB);
      let typeOutcome = null;
      if (typed() && !dep) {
        const key = projectKey(file);
        let st = typedProjects.get(key);
        // stale when anything its check read is different now (an .rx module of this build among them), or the hosts it
        // was checked with are
        const changed = s0 => s0.stale() || (options.wholeProgram && s0.hosts !== hosts.join("\0"));
        if (!st || changed(st)) st = check(file, options.wholeProgram ? hosts : []);
        typeOutcome = st.outcome;
      }
      const { entry, out } = dep ? containing(file, target, moduleName, spa, path.resolve(root ?? process.cwd()), hosts) : build(file, target, moduleName, spa, lib, hosts);
      // a declaration the program read is watched as its modules are: fixing a row re-checks the program, also after it
      // failed (so before any error below is thrown). One that is not there yet (rx-types/, beside a JS module) cannot be
      // watched: the dev server resolves what a module watches and refuses a path with no file, and Rolldown's
      // `vite build --watch` watches none. It is stamped, so the next compile of the program, whatever starts it, reads
      // the new declaration (MO-8k), and a build's type-check counts it as a change (buildStart)
      for (const p of out.asked ?? []) if (p.endsWith(".d.rx") && existsSync(p)) addWatchFile(path.resolve(p));
      if (typeOutcome && typed() && !dep) throw new Error(typeOutcome);   // each entry of a build that failed its check fails, until a file changes
      if (out.diagnostics) throw new Error(report(out.diagnostics));
      if (out.error) throw new Error(out.error);
      const m = out.modules[file];
      for (const p of Object.keys(out.modules)) if (p !== file) addWatchFile(p);
      // CSS-4: each module links its own stylesheet, so a module several programs share links it once
      // CP-4d: a library's components by name, bound to the host's app (`import { PersonCard } from "./pages.rx?rx-lib"`);
      // the default export stays the module, for `components(pages)`. Appended, so the source map's lines still hold.
      // MO-13h: the module's name — its path from the project's root, the same in the browser's build and the server's —
      // is given to `components`, and left on the module for a host that calls `components(pages)` itself: the module is
      // then rooted as a package's is (state that lasts as the page or the request does, ids that are the server's)
      // CP-4b: under the dev server a module is named — its path from the root and its text's hash — and the runtime keys
      // its instance by the name (`__rt.module`), not by the factory: the dev server serves one module under several URLs
      // (a timestamp per hot update, and Vite 8 spells the query of a `?import` module in two orders), the browser
      // evaluates each, and two factories were two instances of the module's state and contexts. A build bundles a module
      // once and names nothing. The name has the way the module is imported in it (a dependency, `?rx-lib`, `?rx-page`):
      // those are three modules to a bundler, with an instance each (CP-4d), and the dev server keeps to that.
      const keyed = (code, fn) => solid.dev && /^export (?:default )?function (?:module|__rxModule)\(/m.test(code)
        ? `${code}\n${fn}.__rxKey = ${JSON.stringify(`${path.relative(lastRoot ?? process.cwd(), file).split(path.sep).join("/")}?${page ? PAGE : lib ? LIB : DEP}#${createHash("sha1").update(m.code).digest("hex").slice(0, 12)}`)};\n` : code;
      const libName = JSON.stringify(path.relative(lastRoot ?? process.cwd(), file).split(path.sep).join("/"));
      const named = lib && file === entry
        ? `\nmodule.__rxName = ${libName};` + (out.components?.length ? `\nimport { components as __rxComponents } from ${JSON.stringify(runtimeFor(path.resolve(root ?? lastRoot ?? process.cwd())))};\nconst __rx = __rxComponents(module, undefined, ${libName});\n${out.components.map(n => `export const ${n} = __rx.${n};`).join("\n")}\n` : "\n")
        : "";
      // CP-4d: a route file's page (`?rx-page`) — the default export is the module's default component, bound as the named
      // ones are (a file-based router imports a route file for its default export); the module itself is `__rxModule`.
      // The compiled module's own line is rewritten in place, so the source map's lines still hold.
      if (page && file === entry) {
        if (!out.page) throw new Error(`${path.relative(process.cwd(), file)} is imported as a route file's page (?rx-page) and has no default component: write \`export default component Page() { … }\` (11 CP-4d)`);
        const code = tagDeps(m.code).replace(/^export default function module\(/m, "export function __rxModule(");
        return { code: keyed(code + named.replace("__rxComponents(module,", "__rxComponents(__rxModule,").replace("\nmodule.__rxName = ", "\n__rxModule.__rxName = ") + `export default __rx.${out.page};\n`, "__rxModule"), map: m.map, css: m.css ?? "" };
      }
      return { code: keyed(tagDeps(m.code) + named, "module"), map: m.map, css: m.css ?? "" };
  }
}
