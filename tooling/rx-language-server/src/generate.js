// MO-8l: generated declarations. A package an .rx program imports with no declaration in the project (`rx-types/`), the
// package or a shared `@rx-types` package (MO-8k) gets one drafted from its TypeScript types, written to
// `node_modules/.rx-types/<spec>.d.rx`, the last place the compiler looks. The Vite plugin, the language server and rx-tsc
// call `ensureDeclarations(entry)` before they read the program; `RX_GENERATE=0` (or the plugin's `generate: false`) turns
// it off. The draft is rx-declare's, from types alone (the package is not run). Its fns are io: a name is a convention, not
// a fact, so no draft guesses `pure` (an import nothing reviewed cannot make the checker accept more). What types cannot
// show is left out, and what the import says of it (`pure`, `fails …`, a side) stands. Where a component renders what it is given then takes the cautious reading
// (MO-11s); a hook's context (`uses`) and a field that waits or throws (`pending`, `fails`) go unchecked, failing at run
// time as they would in TypeScript, until a project declaration says them. Strict mode counts no generated row verified.
// A draft is redone when the installed version, the drafting rules or the types it was made from change; one that cannot be
// drafted (no types) is not written. A draft is written whole (renamed into place), and only under `.rx-types/`.
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { createRequire } = require("node:module");
const { lookup, declaration } = require("./rxc");
const { declare } = require("./declare.js");
const { installed } = require("./versions.js");

const IMPORT = /^\s*import\b([^"'`;]*?)\bfrom\s*["']([^"']+)["']/gm;
const GENERATED = /^\/\/@ generated (\S+)@(\S+) \(MO-8l, draft (\d+)(?:, types ([0-9a-f]+))?\)/;
const GENERATED_ANY = /^\/\/@ generated /;   // a draft this tooling wrote, under any rule
// The drafting rules a generated file was written under. A draft is kept only while the package's version and this both
// stand, so a change of rule (2: no fn is guessed `pure`; 3: a result is typed a step at a time, a disposer as `() => void`; 4: the library's types are named where a draft wrote `any`, MO-8m; 5: types are written as the library's declaration writes them, props by their type, a row for each signature, MO-8o to MO-8q; 6: no `any` is the draft's — a place at the row's type parameters, the last reading, MO-8q over whole drafts; 7: an export has one row, of several signatures the shortest, and no row says `signal` or `tracked` — the vocabulary pruned, MO-8i; 8: the words the package's code proves are written, and a property that may be absent is no method's row, MO-8v) redrafts what an earlier rule wrote. Bump it with any change to
// what a draft says. (9: the words read from JSX and from contexts — `handler` on a prop, `uses(c)`, `provides(c)` with their
// `export context` rows, MO-8w. 10: a component's props of many fields with no name are their place, MO-8o. 11: no `ref` in
// a record that may be absent, MO-10b. 12: no word off a name or a shape — `ref` and `instantiates` are the types' `Accessor` or
// proven by the code, MO-8v. 13: `instantiates` where the code makes what its owner keeps on every path. 14: that word beside a `ref`, MO-8l)
const FORMAT = 14;

const isBare = spec => !spec.startsWith(".") && !spec.startsWith("/") && !/\.(rx|css|scss|sass|less|json|svg|png|jpe?g|gif|webp|woff2?)$/.test(spec) && !/^(node:|virtual:|\0)/.test(spec);
const pkgOf = spec => spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];

/** Every package import of the program at `entry`, across its `.rx` modules (relative `.rx` imports followed): `[spec,
 *  importer]` for each module that imports it, since two modules of a workspace may resolve one specifier to two
 *  installed copies. */
function packageImportSites(entry, text) {
  const out = [];
  const seen = new Set(); const todo = [path.resolve(entry)];
  while (todo.length) {
    const f = todo.pop(); if (seen.has(f)) continue; seen.add(f);
    let src; try { src = text !== undefined && f === path.resolve(entry) ? text : fs.readFileSync(f, "utf8"); } catch { continue; }
    const mine = new Set();
    for (const m of src.matchAll(IMPORT)) {
      const spec = m[2];
      if (spec.endsWith(".rx") && (spec.startsWith(".") || spec.startsWith("/"))) todo.push(path.resolve(path.dirname(f), spec.split("?")[0]));
      else if (isBare(spec) && !mine.has(spec)) { mine.add(spec); out.push([spec, f]); }
    }
  }
  return out;
}
/** The package specifiers the program at `entry` imports, each with the first `.rx` module that imports it. */
function packageImports(entry, text) {
  const specs = new Map();
  for (const [spec, f] of packageImportSites(entry, text)) if (!specs.has(spec)) specs.set(spec, f);
  return specs;
}

/** What the draft of `spec` was made from: a hash of the declaration file TypeScript resolves the import to, of every
 *  declaration file that one reaches by relative imports, re-exports and references (an `index.d.ts` is often only
 *  `export * from "./parts"`), of the entry file of each package it names, and of its package.json. A package that
 *  changes at the same version (a linked workspace package, a local patch) is redrafted. */
function typesStamp(ts, spec, from) {
  try {
    const options = { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowJs: false };
    const cache = require("./library-resolve.js").resolutions(ts, options, ts.sys);
    const resolve = (name, file) => ts.resolveModuleName(name, file, options, ts.sys, cache).resolvedModule?.resolvedFileName;
    const entry = resolve(spec, from);
    if (!entry) return "";
    const h = crypto.createHash("sha256");
    const seen = new Set(); const todo = [[entry, true]];
    while (todo.length) {
      const [f, follow] = todo.shift(); if (seen.has(f)) continue; seen.add(f);
      let text; try { text = fs.readFileSync(f, "utf8"); } catch { continue; }
      h.update(text).update("\0");
      if (!follow || seen.size > 2000) continue;   // another package's entry stands for it; a bound on what one draft reads
      const pre = ts.preProcessFile(text, true, true);
      for (const r of pre.referencedFiles) todo.push([path.resolve(path.dirname(f), r.fileName), true]);
      for (const i of pre.importedFiles) { const to = resolve(i.fileName, f); if (to) todo.push([to, i.fileName.startsWith(".")]); }
    }
    for (let d = path.dirname(entry); ; d = path.dirname(d)) {
      if (fs.existsSync(path.join(d, "package.json"))) { h.update(fs.readFileSync(path.join(d, "package.json"), "utf8")); break; }
      if (path.dirname(d) === d) break;
    }
    return h.digest("hex").slice(0, 12);
  } catch { return ""; }
}

/** Whether `spec` names a file of its own under `.rx-types/`: a package name and plain path segments. One with `.` or
 *  `..` segments (`kit/../../src/x`), an empty one or a backslash would put the draft elsewhere: beside a source file,
 *  where it would be read as that module's declaration (MO-8a), or outside the project. */
const plainSpec = spec => !spec.includes("\\") && spec.split("/").every(seg => seg !== "" && seg !== "." && seg !== "..");

/** Write `text` to `file` whole or not at all: to a file of this process's beside it, then renamed over it, so another
 *  reader (the editor's server beside a build) never reads half a draft. */
function writeWhole(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  try { fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); }
  finally { fs.rmSync(tmp, { force: true }); }
}

/** The directory whose node_modules holds `pkg`, resolved from `dir` as Node would. */
function rootOf(pkg, dir) {
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, "node_modules", pkg, "package.json"))) return d;
    if (path.dirname(d) === d) return undefined;
  }
}

function typescriptFor(dir) {
  // (TypeScript 7's package has no API in process: types are then read with the one this package depends on)
  try { const ts = createRequire(path.join(dir, "package.json"))("typescript"); if (typeof ts.createProgram === "function") return ts; } catch { /* none */ }
  return require("typescript");
}

/** The draft with each row the .d.rx parser refuses left out as a comment, so one row types put beyond the notation does
 *  not cost the package its declaration. */
function parsing(text, file) {
  // tried in a file of its own beside the draft, so a reader of the draft never sees a trial (one row, or none)
  const trial = file.replace(/\.d\.rx$/, "") + `.${process.pid}.trial.d.rx`;
  const ok = t => { fs.writeFileSync(trial, t); const r = declaration(trial); return !(r && r.error); };
  try {
    if (ok(text)) return text;
    const lines = text.split("\n");
    const out = lines.map(l => /^export\b/.test(l) && !ok(l + "\n") ? `// left out, the .d.rx notation cannot say it: ${l}` : l);
    return out.join("\n");
  } finally { fs.rmSync(trial, { force: true }); }
}

/** Draft what `entry`'s program imports and nothing declares. Returns what it did, one entry per package specifier:
 *  `{ spec, file, status: "written" | "current" | "declared" | "failed", reason? }`. */
function ensureDeclarations(entry, options = {}) {   // options.text: the entry's text as an editor has it
  if (process.env.RX_GENERATE === "0" || options.generate === false) return [];
  const out = [];
  // one draft per installed copy and subpath, as each importer resolves the specifier: deduplicated after resolving
  const done = new Set();
  for (const [spec, from] of packageImportSites(entry, options.text)) {
    const found = lookup(from, spec);
    const pkg = pkgOf(spec);
    if (found && !/[\\/]node_modules[\\/]\.rx-types[\\/]/.test(found)) { const k = `declared\0${path.resolve(found)}`; if (!done.has(k)) { done.add(k); out.push({ spec, file: found, status: "declared" }); } continue; }
    const dir = path.dirname(from);
    const root = rootOf(pkg, dir); if (!root) continue;   // not installed: the bundler reports it
    const key = `${path.resolve(root, "node_modules", pkg)}\0${spec}`;
    if (done.has(key)) continue;
    done.add(key);
    const version = installed(pkg, dir) ?? "0.0.0";
    const home = path.join(root, "node_modules", ".rx-types");
    const file = path.join(home, ...spec.split("/")) + ".d.rx";
    // a draft is written under .rx-types/ and nowhere else
    if (!plainSpec(spec) || !file.startsWith(home + path.sep)) { out.push({ spec, file: null, status: "failed", reason: `${spec} is not a package path a draft can be written for (MO-8l)` }); continue; }
    const stamp = typesStamp(typescriptFor(dir), spec, from);
    if (found && path.resolve(found) === file) {
      const head = GENERATED.exec(fs.readFileSync(file, "utf8"));
      if (head && head[1] === pkg && head[2] === version && Number(head[3]) === FORMAT && (head[4] ?? "") === stamp) { out.push({ spec, file, status: "current" }); continue; }
    }
    let text;
    // MO-8v: with the words the package's code proves (`pure`, `handler`, `draft`, `rejects(E)`), each marked: they are
    // read, not guessed, so an import nothing reviewed still makes the checker accept nothing the code does not show
    try { text = declare(typescriptFor(dir), spec, dir, {}, { infer: process.env.RX_DECLARE_INFER !== "0", written: true }); }
    catch (e) {
      // a draft written for another version or under other rules is not kept when it cannot be redone: its rows (an
      // earlier rule's guessed `pure`) would still be read, so the import falls back to undeclared, the cautious reading
      let removed = false;
      if (found && path.resolve(found) === file && GENERATED_ANY.test(fs.readFileSync(file, "utf8"))) { fs.rmSync(file); removed = true; }
      out.push({ spec, file, status: "failed", reason: e.message, ...(removed ? { removed } : {}) });
      continue;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    text = parsing(text, file);
    writeWhole(file, [
      `//@ generated ${pkg}@${version} (MO-8l, draft ${FORMAT}${stamp ? `, types ${stamp}` : ""}): drafted from ${spec}'s TypeScript types, the package not run. Its fns are io`,
      `// (no draft guesses \`pure\`: a word is written only where the package's code proves it, MO-8v; \`import pure\` says it);`,
      `// a component it is given is checked under a root of its own (MO-11s); a hook's context and`,
      `// a field that waits or throws are not checked. To say them, write rx-types/${spec}.d.rx, which comes first (MO-8k):`,
      `// npx rx-declare ${spec} --out rx-types/${spec}.d.rx.`,
      text.trimEnd(),
      "",
    ].join("\n"));
    out.push({ spec, file, status: "written" });
  }
  if (out.some(x => x.status === "written" || x.status === "failed")) require("./checker.js").closeAll();   // the process that asked may live through the next install
  return out;
}

module.exports = { ensureDeclarations, packageImports, packageImportSites, parsing };
