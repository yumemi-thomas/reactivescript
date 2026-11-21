// TY-4b in rx-tsc: a JS module with a `.d.rx` beside it and no TypeScript types of its own is typed by its declaration.
// TypeScript resolves `import "./router.js"` to `router.d.ts`; where that file does not exist but `router.d.rx` and
// `router.js` do, the file system answers for it with the `.d.ts` the crate writes from the `.d.rx` (as `rxc project`
// does). Only `rx-tsc` installs this, in its own process; nothing is written to disk.
const fs = require("node:fs");
const path = require("node:path");
const { declaration } = require("./rxc");

const JS = [".js", ".mjs", ".jsx"];
const virtual = new Map();   // path of a .d.ts that does not exist → its text, or null when it is not one of ours

/** The `.d.ts` text for `p`, when `p` is a missing `.d.ts` that a `.d.rx` beside a JS module stands for. */
function virtualText(p) {
  if (typeof p !== "string" || !p.endsWith(".d.ts")) return null;
  const abs = path.resolve(p);
  if (virtual.has(abs)) return virtual.get(abs);
  let text = null;
  // CP-4d: `import { PersonCard } from "./pages.rx?rx-lib"` in a JS host is typed by the module's projection: TypeScript
  // looks for `pages.rx?rx-lib.d.ts`, which answers with the module's exported components (and, as its default, the
  // module itself for `components(pages)`)
  if (abs.endsWith(LIB + ".d.ts")) {
    const rx = abs.slice(0, -(LIB + ".d.ts").length);
    if (rx.endsWith(".rx") && !rx.endsWith(".d.rx") && real.existsSync(rx)) text = libDeclaration(rx);
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
  const base = abs.slice(0, -".d.ts".length);
  if (!real.existsSync(abs) && real.existsSync(base + ".d.rx") && JS.some(x => real.existsSync(base + x))) {
    const r = declaration(base + ".d.rx");
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
/** MO-8k, as the crate's `declaration_for` looks (the package's own .d.rx is TY-4b's case beside its file): the project's
 *  `rx-types/<spec>.d.rx` in `root` or above, a shared `node_modules/@rx-types/…`, a generated `node_modules/.rx-types/…`. */
function packageDeclaration(root, spec) {
  const seg = spec.split("/"); const n = spec.startsWith("@") ? 2 : 1;
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

const LIB = "?rx-lib";
/** The `.d.ts` of `rx` imported `?rx-lib`: its exported components, as its projection types them. */
function libDeclaration(rx) {
  const names = [...real.readFileSync.call(fs, rx, "utf8").matchAll(/^export\s+(?:default\s+)?component\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  const from = JSON.stringify("./" + path.basename(rx));
  return `import type * as M from ${from};\n${names.map(n => `export declare const ${n}: typeof M.${n};`).join("\n")}\n` +
    `declare const module: (rt: unknown) => { ${names.map(n => `${n}: typeof M.${n}`).join("; ")} };\nexport default module;\n`;
}

const real = { existsSync: fs.existsSync, statSync: fs.statSync, readFileSync: fs.readFileSync, realpathSync: fs.realpathSync };
let installed = false;
function install() {
  if (installed) return; installed = true;
  const fakeStat = text => { const now = new Date(); return { isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false, size: Buffer.byteLength(text), mtime: now, mtimeMs: +now, ctime: now, birthtime: now, atime: now }; };
  const dirStat = () => { const now = new Date(); return { isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false, size: 0, mtime: now, mtimeMs: +now, ctime: now, birthtime: now, atime: now }; };
  fs.existsSync = function (p, ...rest) { return virtualText(p) !== null || virtualDir(p) || real.existsSync.call(fs, p, ...rest); };
  fs.statSync = function (p, ...rest) { const t = virtualText(p); return t !== null ? fakeStat(t) : virtualDir(p) ? dirStat() : real.statSync.call(fs, p, ...rest); };
  fs.readFileSync = function (p, ...rest) {
    const t = virtualText(p); if (t === null) return real.readFileSync.call(fs, p, ...rest);
    const enc = typeof rest[0] === "string" ? rest[0] : rest[0]?.encoding;
    return enc ? t : Buffer.from(t);
  };
  const rp = function (p, ...rest) { return virtualText(p) !== null || virtualDir(p) ? path.resolve(p) : real.realpathSync.call(fs, p, ...rest); };
  rp.native = function (p, ...rest) { return virtualText(p) !== null || virtualDir(p) ? path.resolve(p) : real.realpathSync.native.call(fs, p, ...rest); };
  fs.realpathSync = rp;
}

/** Whether `p` is a `.d.ts` this module stands in for (TY-6 reports such a module as having no types of its own). */
const isVirtual = p => virtual.get(path.resolve(p)) != null;

module.exports = { install, isVirtual };
