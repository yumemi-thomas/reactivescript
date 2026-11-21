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
// Types (13 TY-1a): a production build type-checks the project with `rx-tsc` (from @reactivescript/language-server),
// once, when it compiles its first entry: TypeScript's errors on the `.rx` (a route whose path lacks a param its page
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
// root imports with `?rx-lib` counts as applied from outside. Off by default: the editor checks per module.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { app } = createRequire(import.meta.url)("./index.js");
const DEP = "rx-dep";
const LIB = "rx-lib";   // CP-4d: a JS module imports an .rx module's components: `import { PersonCard } from "./pages.rx?rx-lib"`
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
function typecheck(entry) {
  let dir = path.dirname(entry);
  while (!existsSync(path.join(dir, "tsconfig.json")) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  if (!existsSync(path.join(dir, "tsconfig.json"))) return { missing: "tsconfig" };
  let bin;
  try { bin = createRequire(path.join(dir, "package.json")).resolve("@reactivescript/language-server/bin/tsc.js"); } catch { return { missing: "checker" }; }
  const r = spawnSync(process.execPath, [bin, "--noEmit", "-p", path.join(dir, "tsconfig.json")], { cwd: dir, encoding: "utf8" });
  return r.status === 0 ? null : (r.stdout + r.stderr).trim() || `rx-tsc exited with ${r.status}`;
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
const RX_LIB_IMPORT = /\bfrom\s*(["'])([^"']+\.rx)\?rx-lib\1|\bimport\s*\(\s*(["'])([^"']+\.rx)\?rx-lib\3/g;
function hostsUnder(root) {
  const out = new Set();
  const walk = dir => {
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(m?[jt]sx?|cjs)$/.test(e.name)) for (const m of readFileSync(p, "utf8").matchAll(RX_LIB_IMPORT)) out.add(path.resolve(path.dirname(p), m[2] ?? m[4]).replace(/\\/g, "/"));
    }
  };
  walk(root);
  return [...out];
}

/** @returns {import("@solidjs/vite-plugin").Frontend} */
export default function rx(options = {}) {
  const flag = process.env.RX_TYPECHECK;
  let typed = flag === "0" ? true : null;   // whether this process has type-checked (once per build)
  const builds = new Map();
  let lastRoot;   // the Vite root, for whole-program checking's ?rx-lib hosts   // entry\0target\0moduleName\0spa\0lib → { entry, target, moduleName, spa, lib, out, stamps }
  const fresh = b => [...b.stamps].every(([f, t]) => mtime(f) === t);
  function build(entry, target, moduleName, spa, lib = false) {
    const key = `${entry}\0${target}\0${moduleName}\0${spa}\0${lib}`;
    const prior = builds.get(key);
    if (prior && fresh(prior)) return prior;
    if (options.generate !== false && process.env.RX_GENERATE !== "0") {   // MO-8l, before the program is read
      let drafted = [];
      try { drafted = generator(entry)?.ensureDeclarations(entry) ?? []; }
      catch (e) { console.warn(`[reactivescript] drafting declarations failed, the program is read without them (MO-8l): ${e?.message ?? e}`); }
      for (const r of drafted) if (r.status === "written") console.info(`[reactivescript] drafted a declaration for ${r.spec} from its types: ${path.relative(process.cwd(), r.file)} (MO-8l)`);
    }
    // E-5a: `rx({ wholeProgram: true })` checks a build as the whole program, counting every module a JS host imports with
    // ?rx-lib as applied from outside; off by default, so a build and the editor (per module) agree
    const out = JSON.parse(options.wholeProgram ? app(entry, target, moduleName, spa, lib, true, hostsUnder(lastRoot ?? process.cwd())) : app(entry, target, moduleName, spa, lib));
    if (out.modules) out.modules = Object.fromEntries(Object.entries(out.modules).map(([p, m]) => [path.resolve(p), m]));
    const files = out.modules ? Object.keys(out.modules) : out.diagnostics ? [...new Set([entry, ...out.diagnostics.map(d => d.file)])] : [entry];
    const b = { entry, target, moduleName, spa, lib, out, stamps: new Map(files.map(f => [f, mtime(f)])) };
    builds.set(key, b);
    return b;
  }
  const built = (file, target, moduleName, spa) =>
    [...builds.values()].filter(b => b.target === target && b.moduleName === moduleName && b.spa === spa && b.out.modules?.[file]);
  /** A dependency: from a build of a program that has it, rebuilt if that program changed. */
  function containing(file, target, moduleName, spa, root) {
    const has = built(file, target, moduleName, spa);
    const b = has.find(fresh) ?? has[0];
    if (b) return build(b.entry, target, moduleName, spa);
    // the entry's compile was skipped (Vitest's `fsModuleCache` served it), so find the program from the files
    let failed;
    for (const entry of entriesOf(file, root)) {
      const found = build(entry, target, moduleName, spa);
      if (found.out.modules?.[file]) return found;
      if (!failed && found.out.diagnostics) failed = found;   // the program holds it but does not compile: report why
    }
    if (failed) return failed;
    throw new Error(`${file} is imported as an .rx dependency, but no program under ${root} contains it`);
  }
  return {
    compile(_source, { id, moduleId, root, solid, addWatchFile }) {
      const file = path.resolve(id);
      if (root) lastRoot = path.resolve(root);
      const target = solid.generate === "ssr" ? "ssr" : solid.generate === "universal" ? "universal" : "dom";
      const moduleName = solid.moduleName ?? "@solidjs/web";
      // 08 CN-3d: a client-only build (no SSR, nothing hydrates) has nothing to show on a first load nothing holds
      const spa = target === "dom" && solid.hydratable === false;
      const dep = isDep(moduleId);
      const lib = new URLSearchParams(moduleId.split("?")[1] ?? "").has(LIB);
      if (!typed && !dep && (flag === "1" || process.env.NODE_ENV === "production")) {
        typed = true;
        const t = typecheck(file);
        // TY-1d: a check that was asked for (RX_TYPECHECK=1), or a TypeScript project's production build, fails when it
        // cannot run; a production build with no tsconfig.json is not a TypeScript project, and only says so
        const where = path.relative(process.cwd(), file);
        if (t?.missing === "checker" || (t?.missing === "tsconfig" && flag === "1"))
          throw new Error(`types not checked: ${t.missing === "checker" ? `no @reactivescript/language-server to run rx-tsc with (install it in the project)` : `no tsconfig.json above ${where}`}; set RX_TYPECHECK=0 to build without checking them (13 TY-1d)`);
        if (t?.missing) console.warn(`[reactivescript] types not checked: no tsconfig.json above ${where} (13 TY-1d)`);
        else if (t) throw new Error(`type errors (rx-tsc):\n${t}`);
      }
      const { entry, out } = dep ? containing(file, target, moduleName, spa, path.resolve(root ?? process.cwd())) : build(file, target, moduleName, spa, lib);
      if (out.diagnostics) throw new Error(report(out.diagnostics));
      if (out.error) throw new Error(out.error);
      const m = out.modules[file];
      for (const p of Object.keys(out.modules)) if (p !== file) addWatchFile(p);
      // CSS-4: each module links its own stylesheet, so a module several programs share links it once
      // CP-4d: a library's components by name, bound to the host's app (`import { PersonCard } from "./pages.rx?rx-lib"`);
      // the default export stays the module, for `components(pages)`. Appended, so the source map's lines still hold.
      const named = lib && file === entry && out.components?.length
        ? `\nimport { components as __rxComponents } from "@reactivescript/runtime";\nconst __rx = __rxComponents(module);\n${out.components.map(n => `export const ${n} = __rx.${n};`).join("\n")}\n`
        : "";
      return { code: tagDeps(m.code) + named, map: m.map, css: m.css ?? "" };
    },
  };
}
