#!/usr/bin/env node
// rx-lib — the library build (spec/09 MO-13e): a package written in `.rx`, compiled once, for `.rx` apps and for
// JavaScript (`.tsx`) Solid 2 apps alike. For every module the entries reach (`src/x.rx` → `dist/x.*`):
//
//   x.dom.js, x.ssr.js   the module compiled for the browser (hydratable) and for the server: a factory over the app
//                        (09 MO-1b), each importing its dependencies' factories
//   x.js, x.server.js    what an import of the package resolves to (the `browser` and `default` conditions; `node`,
//                        `deno` and `worker`): `__rx`, the factory an `.rx` app instantiates (MO-13c), and each export
//                        as a Solid library has it, bound to the page's app or the request's (the runtime's `library`)
//   x.d.rx               the signature the compiler printed (`//@ signature x.rx`): what an `.rx` app is checked against
//   x.rx.d.ts            the types of the module's projection (13 TY-4c), as rx-tsc emits them: what `.rx` reads
//   x.d.ts               the types of x.js: what TypeScript reads (a source is an accessor, a `ref` parameter one too)
//   x.css                the module's scoped styles, when it has any
//
// and, beside them, each JavaScript module an `.rx` module imports by a relative path (with its `.d.ts` and `.d.rx`),
// and `rx-prelude.d.ts`, the types the projections are written with. The package.json's `exports` are held to that
// layout: `rx-lib` fails and prints the map when they differ, `rx-lib --write` writes it.
//
// Usage: rx-lib [entry.rx …] [--root src] [--out dist] [--write] [--no-types]
//        entries: the arguments, else package.json's "reactivescript": { "entries": ["src/index.rx", …] }, else src/index.rx
//        RX_TSC: the rx-tsc to run (default: the project's @reactivescript/language-server); RXC: an `rxc` binary to
//        compile with (default: this package's Node-API build)
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const posix = p => p.split(path.sep).join("/");
const rel = (from, to) => { const r = posix(path.relative(path.dirname(from), to)); return r.startsWith(".") ? r : "./" + r; };

/** The program `entry` starts, compiled as a library for `target` (the crate's `app(…, library)`): its modules by path,
 *  with every module's printed signature. */
function compile(entry, target) {
  let text;
  if (process.env.RXC) {
    const r = spawnSync(process.env.RXC, ["app", entry, "--lib", "--target", target], { encoding: "utf8", maxBuffer: 1 << 28 });
    text = r.stdout;
  } else text = createRequire(import.meta.url)("./index.js").app(entry, target, "@solidjs/web", false, true);
  try { return JSON.parse(text); } catch { return { error: `the compiler gave no answer for ${entry}` }; }
}

/** A printed signature's rows, as the library's JavaScript exports them: `[name, kind, refs?]`. A context, a type and a
 *  server fn are not values a JS module can use (MO-13f): they are left to `.rx`. */
export function exportsOf(signature) {
  const out = [];
  for (const raw of signature.split("\n")) {
    const t = raw.trim(); let m;
    if (!t.startsWith("export ")) continue;
    const s = t.slice(7);
    if ((m = /^type\s+([\w$]+)/.exec(s))) out.push([m[1], "type"]);
    else if ((m = /^context\s+([\w$]+)/.exec(s))) out.push([m[1], "context"]);
    else if ((m = /^server\s+(?:pure\s+)?fn\s+([\w$]+)/.exec(s))) out.push([m[1], "server"]);
    else if ((m = /^action\s+([\w$]+)/.exec(s))) out.push([m[1], "action"]);
    else if ((m = /^error\s+([\w$]+)/.exec(s))) out.push([m[1], "error"]);
    else if ((m = /^source\s+([\w$]+)/.exec(s))) out.push([m[1], "accessor"]);
    else if ((m = /^component\s+([\w$]+)/.exec(s))) out.push([m[1], "component"]);
    else if ((m = /^pure\s+fn\s+([\w$]+)\s*\((.*?)\)\s*(?::[^)]*?)?(?:rejects\([^)]*\))?\s*(instantiates)?\s*(?:uses\([^)]*\))?$/.exec(s))) {
      const refs = splitTop(m[2]).map(p => /^ref\s/.test(p));
      out.push([m[1], refs.some(Boolean) || m[3] ? "primitive" : "fn", refs]);
    }
    else if ((m = /^([\w$]+)\s*(?::.*)?$/.exec(s))) out.push([m[1], "accessor"]);
  }
  return out;
}
function splitTop(s) {
  const out = []; let depth = 0, cur = "";
  for (const ch of s) { if ("({[<".includes(ch)) depth++; if (")}]>".includes(ch)) depth--; if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** The context keys of a printed signature that leave the package: a key is a path relative to the signature's module
 *  (MO-13b), and one that goes through `node_modules` names another package's module where it happened to be installed. */
export function foreignKeys(signature) {
  const out = new Set();
  for (const m of signature.matchAll(/\b(?:uses|provides|retains)\(([^)]*)\)/g)) for (const k of m[1].split(",").map(x => x.trim()).filter(Boolean)) if (/(^|\/)node_modules\//.test(k)) out.add(k);
  // MO-11u: and the component a fn `renders(…)` beneath, named the same way in `hosts(<key> …)` and `export renders <key> from …`
  for (const m of signature.matchAll(/(?:\bhosts\(|;\s*|^export renders\s+)((?:\.{1,2}\/)?[^\s();,]*node_modules\/[^\s();,]*#[\w$.]+)/gm)) out.add(m[1]);
  return [...out];
}
/** The keys of a printed signature — a context's, a host's (MO-11u) — that name a file outside what the package ships:
 *  a path from the signature's module (`moduleFile`) that leaves `root`. A package's own declaration of another package
 *  (`rx-types/` beside its sources) is such a file: an app that installs the package has another declaration of that
 *  library, under another key, and the two never meet (MO-13b). */
export function leavingKeys(signature, moduleFile, root) {
  const out = new Set(); const keys = [];
  for (const m of signature.matchAll(/\b(?:uses|provides|retains|catches)\(([^)]*)\)/g)) keys.push(...m[1].split(",").map(x => x.trim()).filter(Boolean));
  for (const m of signature.matchAll(/(?:\bhosts\(|;\s*|^export renders\s+)((?:\.{1,2}\/)[^\s();,]*#[\w$.]+)/gm)) keys.push(m[1]);
  for (const k of keys) { const file = k.split("#")[0]; if (!/^\.{1,2}\//.test(file) || !k.includes("#")) continue; if (path.relative(root, path.resolve(path.dirname(moduleFile), file)).startsWith("..")) out.add(k); }
  return [...out];
}
const VALUES = new Set(["accessor", "action", "error", "component", "primitive", "fn"]);
/** x.js / x.server.js: the factory, and each export bound to the page's app (the runtime's `library`, MO-13g); `id`
 *  names the module (`<package>/<module>`), for the root it is instantiated in (MO-13h). */
function wrapper(name, factory, exports, id, css) {
  const vals = exports.filter(([, k]) => VALUES.has(k));
  // the module's scoped styles (07 CSS-4): what the browser's import resolves to imports its stylesheet, for the app's
  // bundler to link (it was written and exported, and nothing linked it); the server's build has no stylesheet to load
  return `// compiled by ReactiveScript from ${name}.rx — do not edit (spec/09 MO-13e)\n` + (css ? `import ${JSON.stringify(css)};\n` : "") +
    `import { library as __library } from "@reactivescript/runtime";\nimport __rx from ${JSON.stringify(factory)};\n` +
    `/** The module as an .rx app instantiates it: once per app (MO-13c). */\nexport { __rx };\nconst __lib = __library(__rx, ${JSON.stringify(id)});\n` +
    vals.map(([n]) => n === "default" ? `export default __lib.default;` : `export const ${n} = __lib.${n};`).join("\n") + "\n";
}
/** x.d.ts: the types of x.js, from the projection's (x.rx.d.ts): a source or an equation is an accessor, an instantiating
 *  fn takes each `ref` parameter as one and hands one back, an error class makes its instances and is what `instanceof` tests. */
function declaration(name, exports) {
  const rx = JSON.stringify(`./${name}.rx.js`);
  const lines = [`// the types of ${name}.js, for TypeScript — do not edit (spec/09 MO-13e). An .rx module reads ${name}.d.rx and ${name}.rx.d.ts.`, `import type * as __m from ${rx};`];
  if (exports.some(([, k]) => k === "primitive")) lines.push(`type __Refs<A extends unknown[], R extends boolean[]> = { [K in keyof A]: K extends keyof R ? (R[K] extends true ? () => A[K] : A[K]) : A[K] };`);
  lines.push(`/** The module as an .rx app instantiates it (MO-13c). */`, `export declare const __rx: (rt: unknown) => Record<string, unknown>;`);
  for (const [n, kind, refs] of exports) {
    if (kind === "type") lines.push(`export type { ${n} } from ${rx};`);
    else if (kind === "accessor") lines.push(`export declare const ${n}: () => typeof __m.${n};`);
    else if (kind === "action" || kind === "fn") lines.push(`export declare const ${n}: typeof __m.${n};`);
    else if (kind === "component") lines.push(n === "default" ? `declare const __default: typeof __m.default;\nexport default __default;` : `export declare const ${n}: typeof __m.${n};`);
    else if (kind === "primitive") lines.push(`export declare const ${n}: (...args: __Refs<Parameters<typeof __m.${n}>, [${refs.join(", ")}]>) => () => ReturnType<typeof __m.${n}>;`);
    else if (kind === "error") lines.push(`export declare const ${n}: typeof __m.${n} & { [Symbol.hasInstance](e: unknown): e is __m.${n} };\nexport type ${n} = __m.${n};`);
  }
  return lines.join("\n") + "\n";
}

/** The `exports` entry of one module: Solid's conditions, as `@solidjs/web` and the runtime pick a build. */
export function exportEntry(dist, name) {
  const at = f => `./${posix(path.join(dist, f))}`;
  return { types: at(`${name}.d.ts`), worker: at(`${name}.server.js`), browser: at(`${name}.js`), deno: at(`${name}.server.js`), node: at(`${name}.server.js`), default: at(`${name}.js`) };
}
const exportKey = name => name === "index" ? "." : "./" + name.replace(/\/index$/, "");

/** Build the package at `dir`. `{ ok, problems: [text], files: [path], exports }`. */
export function build(dir, { entries, root, out = "dist", write = false, types = true, log = () => {} } = {}) {
  const problems = []; const files = [];
  const pkgFile = path.join(dir, "package.json");
  const pkg = existsSync(pkgFile) ? JSON.parse(readFileSync(pkgFile, "utf8")) : {};
  entries = (entries?.length ? entries : pkg.reactivescript?.entries ?? ["src/index.rx"]).map(e => path.resolve(dir, e));
  for (const e of entries) if (!existsSync(e)) return { ok: false, problems: [`${path.relative(dir, e)}: no such entry`], files, exports: {} };
  root = path.resolve(dir, root ?? pkg.reactivescript?.root ?? commonDir(entries));
  const dist = path.resolve(dir, out);
  const nameOf = file => { const r = posix(path.relative(root, file)); if (r.startsWith("..")) throw new Error(`${path.relative(dir, file)} is outside the root ${path.relative(dir, root) || "."}: every module of a package is under one folder (--root)`); return r.replace(/\.rx$/, ""); };
  const put = (name, text) => { const f = path.join(dist, name); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, text); files.push(f); };

  // 1. compile every entry for both targets; a module two entries reach is one module
  const modules = new Map();   // path → { dom, ssr, signature }
  const diagnostics = [];
  for (const entry of entries) for (const target of ["dom", "ssr"]) {
    const r = compile(posix(entry), target);
    if (r.diagnostics) { for (const d of r.diagnostics) diagnostics.push(`${path.relative(dir, d.file ?? entry)}:${d.line}: error ${d.code} [${d.rule}] ${d.msg ?? d.message}`); continue; }
    if (r.error || !r.modules) { problems.push(r.error ?? `${entry}: not compiled`); continue; }
    for (const [p, m] of Object.entries(r.modules)) { const x = modules.get(p) ?? {}; x[target] = m; x.signature = r.signatures?.[p]; modules.set(p, x); }
  }
  if (diagnostics.length || problems.length) return { ok: false, problems: [...new Set(diagnostics), ...problems], files, exports: {} };

  rmSync(dist, { recursive: true, force: true });
  const js = new Set();   // the JavaScript modules the .rx modules import by a relative path
  const names = new Map([...modules.keys()].map(p => [p, nameOf(p)]));
  for (const [p, m] of modules) {
    const name = names.get(p); const base = path.basename(name);
    for (const target of ["dom", "ssr"]) {
      // a dependency's factory is its own compiled module; a JS module beside it is shipped as it is
      const code = m[target].code.replace(/from "(\.{1,2}\/[^"]+)"/g, (all, spec) => {
        if (spec.endsWith(".rx")) return `from "${spec.slice(0, -3)}.${target}.js"`;
        const f = resolveJs(path.resolve(path.dirname(p), spec)); if (f) js.add(f); else problems.push(`${path.relative(dir, p)}: imports ${spec}, which is no JavaScript file: a package ships JavaScript (build it first)`);
        return all;
      });
      let map = m[target].map;
      if (map) { try { const j = JSON.parse(map); j.sourcesContent = (j.sources ?? []).map(s => { try { return readFileSync(path.resolve(path.dirname(p), s), "utf8"); } catch { try { return readFileSync(p, "utf8"); } catch { return null; } } }); j.sources = (j.sources ?? []).map(() => rel(path.join(dist, `${name}.${target}.js`), p)); map = JSON.stringify(j); } catch { /* as it is */ } }
      put(`${name}.${target}.js`, `${code.trimEnd()}\n${map ? `//# sourceMappingURL=${base}.${target}.js.map\n` : ""}`);
      if (map) put(`${name}.${target}.js.map`, map);
    }
    const exports = exportsOf(m.signature);
    for (const [n, k] of exports) if (k === "server") problems.push(`${path.relative(dir, p)}: exports the server fn ${n}: a server fn is extracted by the app's bundler from the app's own modules, and a compiled package cannot carry one (MO-13f) — export a fn the app wraps in a server fn of its own`);
    const id = pkg.name ? `${pkg.name}/${name}` : name;   // the module's name: its root's id, the same on both sides (MO-13h)
    put(`${name}.js`, wrapper(base, `./${base}.dom.js`, exports, id, m.dom.css ? `./${base}.css` : undefined));
    for (const key of foreignKeys(m.signature)) problems.push(`${path.relative(dir, p)}: its signature names a context of another package (${key}): a context's key is a path from this module, right only where that package is installed as it was when this one was built (hoisted or not, linked, in a store) — take the context's value as a prop or provide it from a component of this package (MO-13b; the same of a component a fn renders its arguments beneath, MO-11u: show the toast, or mount the toaster, from the app)`);
    // (found 2026-11-24, built: a package that calls solid-sonner's toast, declared in its own rx-types/, was built "ok"
    // with `export renders ../rx-types/solid-sonner.d.rx#Toaster` in its signature — a file it does not ship, and a key no
    // application of the app's <Toaster /> has: in the app its toast was held to nothing above it, in silence)
    for (const key of leavingKeys(m.signature, p, root)) if (!foreignKeys(m.signature).includes(key)) problems.push(`${path.relative(dir, p)}: its signature names ${key}, which is outside what the package ships (${path.relative(dir, root) || "."}): a key is a path from this module, and an app that installs the package declares that library itself, under another key — so what this module provides, reads or renders beneath it would meet nothing of the app's. Take the value as a prop, or leave the call to the app: export the component and let the app show it, or mount the toaster (MO-13b, MO-11u)`);
    put(`${name}.server.js`, wrapper(base, `./${base}.ssr.js`, exports, id));
    put(`${name}.d.rx`, m.signature);
    put(`${name}.d.ts`, declaration(base, exports));
    if (m.dom.css) put(`${name}.css`, m.dom.css);
    if (js.has(path.join(root, `${name}.js`))) problems.push(`${name}.rx and ${name}.js would both be ${path.relative(dir, dist)}/${name}.js: rename one`);
  }
  // 2. the JavaScript the modules import, with what declares it (and what that JavaScript imports beside it)
  for (const f of js) {
    for (const m of readFileSync(f, "utf8").matchAll(/(?:from\s*|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)) { const g = resolveJs(path.resolve(path.dirname(f), m[1])); if (g) js.add(g); }
    const r = posix(path.relative(root, f)); if (r.startsWith("..")) { problems.push(`${path.relative(dir, f)} is outside the root: a package ships what is under it`); continue; }
    const stem = f.replace(/\.(m?js|cjs)$/, "");
    for (const [from, to] of [[f, r], [`${stem}.d.ts`, r.replace(/\.(m?js|cjs)$/, ".d.ts")], [`${f}.d.rx`, `${r}.d.rx`], [`${stem}.d.rx`, r.replace(/\.(m?js|cjs)$/, ".d.rx")]]) if (existsSync(from)) { const t = path.join(dist, to); mkdirSync(path.dirname(t), { recursive: true }); copyFileSync(from, t); files.push(t); }
  }
  // 3. the projections' types (13 TY-4c): rx-tsc's declarations of the modules, which is the package's type-check too
  if (types) {
    const r = emitTypes(dir, root, [...modules.keys()]);
    if (r.problem) problems.push(r.problem);
    else {
      let prelude = null;
      for (const p of modules.keys()) {
        const name = names.get(p); const from = path.join(r.out, `${name}.rx.d.ts`);
        if (!existsSync(from) || (!readFileSync(from, "utf8").trim() && exportsOf(modules.get(p).signature).length)) { problems.push(`rx-tsc wrote no declaration for ${path.relative(dir, p)} (it needs the package's dependencies installed: a node_modules above it)`); continue; }
        // the prelude the projection is written with is shipped beside the modules, as one file
        const text = readFileSync(from, "utf8").replace(/(from\s*|import\()(["'])([^"']*[\\/]\.reactivescript[\\/]prelude)(?:\.d\.ts|\.js)?\2/g, (_, a, q, at) => { prelude ??= at; return `${a}${q}${rel(path.join(dist, `${name}.rx.d.ts`), path.join(dist, "rx-prelude.js"))}${q}`; });
        put(`${name}.rx.d.ts`, text);
      }
      if (prelude) put("rx-prelude.d.ts", readFileSync(prelude + ".d.ts", "utf8"));
      rmSync(r.tmp, { recursive: true, force: true });
    }
  }
  // 4. the exports map: every entry, by Solid's conditions
  const wanted = {};
  for (const e of entries) { const name = names.get(posix(e)) ?? nameOf(e); wanted[exportKey(name)] = exportEntry(path.relative(dir, dist), name); if (modules.get(posix(e))?.dom.css) wanted[`${exportKey(name) === "." ? "./index" : exportKey(name)}.css`] = `./${posix(path.join(path.relative(dir, dist), `${name}.css`))}`; }
  const has = pkg.exports && typeof pkg.exports === "object" ? pkg.exports : {};
  const peers = { "solid-js": "^2.0.0", "@solidjs/web": "^2.0.0", "@reactivescript/runtime": "*" };
  const missingPeers = Object.keys(peers).filter(n => !pkg.peerDependencies?.[n] && !pkg.dependencies?.[n]);
  const differs = Object.entries(wanted).filter(([k, v]) => JSON.stringify(has[k]) !== JSON.stringify(v)).map(([k]) => k);
  if (write && (differs.length || missingPeers.length)) {
    pkg.exports = { ...has, ...wanted };
    if (missingPeers.length) pkg.peerDependencies = { ...pkg.peerDependencies, ...Object.fromEntries(missingPeers.map(n => [n, peers[n]])) };
    writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + "\n"); log(`package.json: exports${missingPeers.length ? " and peerDependencies" : ""} written`);
  } else {
    if (differs.length) problems.push(`package.json: "exports" does not name what was built for ${differs.join(", ")} — it should hold (rx-lib --write writes it):\n${JSON.stringify(Object.fromEntries(differs.map(k => [k, wanted[k]])), null, 2)}`);
    if (missingPeers.length) problems.push(`package.json: ${missingPeers.join(", ")} ${missingPeers.length === 1 ? "is" : "are"} not among the package's peerDependencies: the compiled modules import ${missingPeers.length === 1 ? "it" : "them"}, and an app must have one copy (rx-lib --write adds ${JSON.stringify(Object.fromEntries(missingPeers.map(n => [n, peers[n]])))})`);
  }
  return { ok: !problems.length, problems, files, exports: wanted };
}

const commonDir = files => { let d = path.dirname(files[0]); while (!files.every(f => f.startsWith(d + path.sep))) d = path.dirname(d); return d; };
const resolveJs = base => [base, `${base}.js`, `${base}.mjs`, path.join(base, "index.js")].find(f => /\.(m?js|cjs)$/.test(f) && existsSync(f));

/** rx-tsc's declarations of `files` (the modules' projections), into a folder of their own. */
function emitTypes(dir, root, files) {
  let bin = process.env.RX_TSC;
  if (!bin) { try { bin = createRequire(path.join(dir, "package.json")).resolve("@reactivescript/language-server/bin/tsc.js"); } catch { return { problem: "the types of a package are its projection's, emitted by rx-tsc: install @reactivescript/language-server in the package (or build with --no-types, for a package no TypeScript reads)" }; }
  }
  const out = mkdtempSync(path.join(dir, ".rx-lib-"));
  const cfg = path.join(out, "tsconfig.json");
  const base = existsSync(path.join(dir, "tsconfig.json")) ? { extends: "../tsconfig.json" } : {};
  writeFileSync(cfg, JSON.stringify({ ...base, compilerOptions: { ...(base.extends ? {} : { jsx: "preserve", jsxImportSource: "@solidjs/web", strict: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", skipLibCheck: true, lib: ["ES2023", "DOM", "DOM.Iterable"], types: [] }), allowImportingTsExtensions: true, noEmit: false, declaration: true, emitDeclarationOnly: true, declarationMap: false, composite: false, incremental: false, outDir: "./types", rootDir: posix(path.relative(out, root)) || "." }, include: [], files: files.map(f => posix(path.relative(out, f))) }));
  const r = spawnSync(process.execPath, [bin, "-p", cfg], { cwd: dir, encoding: "utf8", env: process.env });
  if (r.status !== 0) { rmSync(out, { recursive: true, force: true }); return { problem: `rx-tsc refused the package:\n${(r.stdout + r.stderr).trim()}` }; }
  return { out: path.join(out, "types"), tmp: out };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const taken = new Set(["--root", "--out"].flatMap(n => args.includes(n) ? [args.indexOf(n) + 1] : []));
  const entries = args.filter((a, i) => !a.startsWith("--") && !taken.has(i));
  const dir = process.cwd();
  const r = build(dir, { entries, root: opt("--root"), out: opt("--out") ?? "dist", write: args.includes("--write"), types: !args.includes("--no-types"), log: s => console.log(s) });
  for (const p of r.problems) console.error(p);
  if (r.ok) console.log(`rx-lib: ${Object.keys(r.exports).join(", ")} → ${r.files.length} files in ${opt("--out") ?? "dist"}`);
  process.exit(r.ok ? 0 : 1);
}
