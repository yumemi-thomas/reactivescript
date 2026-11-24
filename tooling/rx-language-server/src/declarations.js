// TY-4b in rx-tsc: a JS module with a `.d.rx` beside it and no TypeScript types of its own is typed by its declaration.
// TypeScript resolves `import "./router.js"` to `router.d.ts`; where that file does not exist but `router.d.rx` and
// `router.js` do, the file system the checker reads (src/program.js `overlay`) answers for it with the `.d.ts` the crate
// writes from the `.d.rx` (as `rxc project` does). Only the checker's reads see these files; nothing is written to disk.
const fs = require("node:fs");
const path = require("node:path");
const { declaration } = require("./rxc");
const { declarationOf } = require("./beside.js");

// TypeScript asks for the declaration of `lib.js` as `lib.d.ts`, of `lib.mjs` as `lib.d.mts` and of `lib.cjs` as `lib.d.cts`
const DECL = [[".d.ts", [".jsx", ".js", ".mjs"]], [".d.mts", [".mjs"]], [".d.cts", [".cjs"]]];   // `.jsx` first: `view.jsx.d.rx` names it
const virtual = new Map();   // path of a .d.ts that does not exist → its text, or null when it is not one of ours

/** The `.d.ts` text for `p`, when `p` is a missing `.d.ts` (`.d.mts`, `.d.cts`) that a `.d.rx` beside a JS module stands for. */
function virtualText(p) {
  if (typeof p !== "string") return null;
  const kind = DECL.find(([x]) => p.endsWith(x));
  if (!kind) return null;
  if (kind[0] !== ".d.ts") return besideJs(path.resolve(p), kind);
  const abs = path.resolve(p);
  if (virtual.has(abs)) return virtual.get(abs);
  let text = null;
  // CP-4d: `import { PersonCard } from "./pages.rx?rx-lib"` in a JS host is typed by the module's projection: TypeScript
  // looks for `pages.rx?rx-lib.d.ts`, which answers with the module's exported components (and, as its default, the
  // module itself for `components(pages)`)
  // … and `import Person from "./routes/people.rx?rx-page"`, a route file's page: the same, its default the module's
  // default component
  for (const q of [LIB, PAGE]) if (abs.endsWith(q + ".d.ts")) {
    const rx = abs.slice(0, -(q + ".d.ts").length);
    if (rx.endsWith(".rx") && !rx.endsWith(".d.rx") && real.existsSync(rx)) text = libDeclaration(rx, q === PAGE);
    virtual.set(abs, text);
    return text;
  }
  // MO-8k: a package with no types of its own, declared by the project (`rx-types/`), a shared `@rx-types/` package or a
  // generated `.rx-types/` file: TypeScript falls back to `node_modules/@types/<scope>__<name>`, which answers with it
  const at = typesPath(abs);
  if (at && !real.existsSync(abs)) {
    const d = packageDeclaration(at.root, at.spec);
    if (d) { const r = declaration(d); if (r && typeof r.code === "string") text = r.code; }
    virtual.set(abs, text);
    return text;
  }
  return besideJs(abs, kind);
}
/** TY-4b: the declaration TypeScript asks for beside a JS module (`[ext, its JS extensions]`), from the `.d.rx` there. */
function besideJs(abs, [ext, js]) {
  if (virtual.has(abs)) return virtual.get(abs);
  let text = null;
  const base = abs.slice(0, -ext.length);
  // the JS modules this `.d.ts` stands for, each declared as the crate finds it (`old.cjs.d.rx`, then `old.d.rx`)
  const exists = f => real.existsSync(f);
  const dts = real.existsSync(abs) ? undefined : js.map(x => base + x).filter(exists).map(f => declarationOf(f, exists)).find(Boolean);
  if (dts) {
    const r = declaration(dts);
    if (r && typeof r.code === "string") text = r.code;
  }
  virtual.set(abs, text);
  return text;
}

/** `<root>/node_modules/@types/<m>/<sub>.d.ts` → the package specifier it types, and the directory above node_modules. */
function typesPath(abs) {
  const m = /^(.*)[\\/]node_modules[\\/]@types[\\/]([^\\/]+)(?:[\\/](.+))?$/.exec(abs);
  if (!m) return null;
  const pkg = m[2].includes("__") ? "@" + m[2].replace("__", "/") : m[2];
  const rest = (m[3] ?? "").replace(/\\/g, "/").replace(/\.d\.ts$/, "").replace(/(^|\/)index$/, "");
  if (m[3] === undefined) return { root: m[1], spec: pkg, dir: true };
  if (!m[3].endsWith(".d.ts")) return null;
  return { root: m[1], spec: rest ? `${pkg}/${rest}` : pkg };
}
/** Whether the package installed for `root` ships TypeScript types: a `types`/`typings` field, a `types` condition in its
 *  exports, or an `index.d.ts`. The `@types` fallback below is for a package that has none. */
const ownTypes = new Map();
function hasOwnTypes(root, pkg) {
  for (let dir = root; ; dir = path.dirname(dir)) {
    const at = path.join(dir, "node_modules", pkg);
    const f = path.join(at, "package.json");
    if (real.existsSync(f)) {
      if (ownTypes.has(f)) return ownTypes.get(f);
      let has = false;
      try { const j = JSON.parse(real.readFileSync.call(fs, f, "utf8")); has = !!(j.types || j.typings || real.existsSync(path.join(at, "index.d.ts")) || /"types"\s*:/.test(JSON.stringify(j.exports ?? {}))); } catch { /* unreadable: no types */ }
      ownTypes.set(f, has); return has;
    }
    if (path.dirname(dir) === dir) return false;
  }
}
/** MO-8k, as the crate's `declaration_for` looks (the package's own .d.rx is TY-4b's case beside its file): the project's
 *  `rx-types/<spec>.d.rx` in `root` or above, a shared `node_modules/@rx-types/…`, a generated `node_modules/.rx-types/…`. */
function packageDeclaration(root, spec) {
  const seg = spec.split("/"); const n = spec.startsWith("@") ? 2 : 1;
  if (hasOwnTypes(root, seg.slice(0, n).join("/"))) return null;   // TY-4b: a package with types of its own is typed by them, whatever declares its rows (`@rx-types/solid-js`)
  const shared = seg.slice(0, n).join("/").replace(/^@/, "").replace("/", "__"); const sub = seg.slice(n).join("/") || "index";
  for (const rel of [`rx-types/${spec}.d.rx`, `node_modules/@rx-types/${shared}/${sub}.d.rx`, `node_modules/.rx-types/${spec}.d.rx`])
    for (let dir = root; ; dir = path.dirname(dir)) { const f = path.join(dir, rel); if (real.existsSync(f)) return f; if (path.dirname(dir) === dir) break; }
  return null;
}
/** Whether `p` is a directory TypeScript probes on the way to such a `.d.ts` (`node_modules/@types`, `…/@types/<m>`). */
function virtualDir(p) {
  if (typeof p !== "string") return false;
  const abs = path.resolve(p);
  if (real.existsSync(abs)) return false;
  if (/[\\/]node_modules[\\/]@types$/.test(abs)) return true;
  const at = typesPath(abs);
  return !!(at && at.dir && packageDeclaration(at.root, at.spec));
}

const LIB = "?rx-lib", PAGE = "?rx-page";
/** The `.d.ts` of `rx` imported `?rx-lib`: its exported components, as its projection types them; `page` (`?rx-page`),
 *  with the module's default component as its default. */
function libDeclaration(rx, page = false) {
  const src = real.readFileSync.call(fs, rx, "utf8");
  const names = [...src.matchAll(/^export\s+(?:default\s+)?component\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  const dflt = /^export\s+default\s+component\s+([A-Za-z_$][\w$]*)/m.exec(src)?.[1];
  const from = JSON.stringify("./" + path.basename(rx));
  // CP-4d (2026-11-25): … and its exported records (`export route = { loader: …, validateSearch: … }`), each a plain
  // record of functions to JavaScript, typed as the module's own
  const records = [...src.matchAll(/^export\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]*)?=\s*\{/gm)].map(m => m[1]);
  const named = `import type * as M from ${from};\n${[...names, ...records].map(n => `export declare const ${n}: typeof M.${n};`).join("\n")}\n`;
  if (page) return named + (dflt ? `declare const page: typeof M.${dflt};\nexport default page;\n` : "");
  return named + `declare const module: (rt: unknown) => { ${names.map(n => `${n}: typeof M.${n}`).join("; ")} };\nexport default module;\n`;
}

const real = { existsSync: fs.existsSync, readFileSync: fs.readFileSync };
/** Whether `p` is a `.d.ts` this module stands in for (TY-6 reports such a module as having no types of its own). */
const isVirtual = p => virtual.get(path.resolve(p)) != null;

/** What was found is not kept past a change of the disk. */
const forget = () => { virtual.clear(); ownTypes.clear(); };

module.exports = { virtualText, virtualDir, isVirtual, forget };
