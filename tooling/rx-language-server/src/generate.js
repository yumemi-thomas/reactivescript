// MO-8l: generated declarations. A package an .rx program imports with no declaration in the project (`rx-types/`), the
// package or a shared `@rx-types` package (MO-8k) gets one drafted from its TypeScript types, written to
// `node_modules/.rx-types/<spec>.d.rx`, the last place the compiler looks. The Vite plugin, the language server and rx-tsc
// call `ensureDeclarations(entry)` before they read the program; `RX_GENERATE=0` (or the plugin's `generate: false`) turns
// it off. The draft is rx-declare's, from types alone (the package is not run): a `create*`/`use*` fn is pure and the rest
// io. What types cannot show is left out. Where a component renders what it is given then takes the cautious reading
// (MO-11s); a hook's context (`uses`) and a field that waits or throws (`pending`, `fails`) go unchecked, failing at run
// time as they would in TypeScript, until a project declaration says them. Strict mode counts no generated row verified.
// A draft is redone when the installed version changes; one that cannot be drafted (no types) is not written.
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { lookup, declaration } = require("./rxc");
const { declare } = require("./declare.js");
const { installed } = require("./versions.js");

const IMPORT = /^\s*import\b([^"'`;]*?)\bfrom\s*["']([^"']+)["']/gm;
const GENERATED = /^\/\/@ generated (\S+)@(\S+)/;

const isBare = spec => !spec.startsWith(".") && !spec.startsWith("/") && !/\.(rx|css|scss|sass|less|json|svg|png|jpe?g|gif|webp|woff2?)$/.test(spec) && !/^(node:|virtual:|\0)/.test(spec);
const pkgOf = spec => spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];

/** The package specifiers the program at `entry` imports, across its `.rx` modules (relative `.rx` imports followed). */
function packageImports(entry, text) {
  const specs = new Map();   // spec → the first .rx module that imports it
  const seen = new Set(); const todo = [path.resolve(entry)];
  while (todo.length) {
    const f = todo.pop(); if (seen.has(f)) continue; seen.add(f);
    let src; try { src = text !== undefined && f === path.resolve(entry) ? text : fs.readFileSync(f, "utf8"); } catch { continue; }
    for (const m of src.matchAll(IMPORT)) {
      const spec = m[2];
      if (spec.endsWith(".rx") && (spec.startsWith(".") || spec.startsWith("/"))) todo.push(path.resolve(path.dirname(f), spec.split("?")[0]));
      else if (isBare(spec) && !specs.has(spec)) specs.set(spec, f);
    }
  }
  return specs;
}

/** The directory whose node_modules holds `pkg`, resolved from `dir` as Node would. */
function rootOf(pkg, dir) {
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, "node_modules", pkg, "package.json"))) return d;
    if (path.dirname(d) === d) return undefined;
  }
}

function typescriptFor(dir) {
  try { return createRequire(path.join(dir, "package.json"))("typescript"); } catch { return require("typescript"); }
}

/** The draft with each row the .d.rx parser refuses left out as a comment, so one row types put beyond the notation does
 *  not cost the package its declaration. */
function parsing(text, file) {
  const ok = t => { fs.writeFileSync(file, t); const r = declaration(file); return !(r && r.error); };
  if (ok(text)) return text;
  const lines = text.split("\n");
  const out = lines.map(l => /^export\b/.test(l) && !ok(l + "\n") ? `// left out, the .d.rx notation cannot say it: ${l}` : l);
  return out.join("\n");
}

/** Draft what `entry`'s program imports and nothing declares. Returns what it did, one entry per package specifier:
 *  `{ spec, file, status: "written" | "current" | "declared" | "failed", reason? }`. */
function ensureDeclarations(entry, options = {}) {   // options.text: the entry's text as an editor has it
  if (process.env.RX_GENERATE === "0" || options.generate === false) return [];
  const out = [];
  for (const [spec, from] of packageImports(entry, options.text)) {
    const found = lookup(from, spec);
    const pkg = pkgOf(spec);
    if (found && !/[\\/]node_modules[\\/]\.rx-types[\\/]/.test(found)) { out.push({ spec, file: found, status: "declared" }); continue; }
    const dir = path.dirname(from);
    const root = rootOf(pkg, dir); if (!root) continue;   // not installed: the bundler reports it
    const version = installed(pkg, dir) ?? "0.0.0";
    const file = path.join(root, "node_modules", ".rx-types", ...spec.split("/")) + ".d.rx";
    if (found && path.resolve(found) === file) {
      const head = GENERATED.exec(fs.readFileSync(file, "utf8"));
      if (head && head[1] === pkg && head[2] === version) { out.push({ spec, file, status: "current" }); continue; }
    }
    let text;
    try { text = declare(typescriptFor(dir), spec, dir); }
    catch (e) { out.push({ spec, file, status: "failed", reason: e.message }); continue; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    text = parsing(text, file);
    fs.writeFileSync(file, [
      `//@ generated ${pkg}@${version} (MO-8l): drafted from ${spec}'s TypeScript types, the package not run. What types`,
      `// cannot show is left out: a component it is given is checked under a root of its own (MO-11s), a hook's context and`,
      `// a field that waits or throws are not checked. To say them, write rx-types/${spec}.d.rx, which comes first (MO-8k):`,
      `// npx rx-declare ${spec} --out rx-types/${spec}.d.rx (it also runs the package to find the contexts).`,
      text.trimEnd(),
      "",
    ].join("\n"));
    out.push({ spec, file, status: "written" });
  }
  return out;
}

module.exports = { ensureDeclarations, packageImports, parsing };
