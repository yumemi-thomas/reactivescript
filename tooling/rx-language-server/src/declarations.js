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
  const base = abs.slice(0, -".d.ts".length);
  if (!real.existsSync(abs) && real.existsSync(base + ".d.rx") && JS.some(x => real.existsSync(base + x))) {
    const r = declaration(base + ".d.rx");
    if (r && typeof r.code === "string") text = r.code;
  }
  virtual.set(abs, text);
  return text;
}

const real = { existsSync: fs.existsSync, statSync: fs.statSync, readFileSync: fs.readFileSync, realpathSync: fs.realpathSync };
let installed = false;
function install() {
  if (installed) return; installed = true;
  const fakeStat = text => { const now = new Date(); return { isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false, size: Buffer.byteLength(text), mtime: now, mtimeMs: +now, ctime: now, birthtime: now, atime: now }; };
  fs.existsSync = function (p, ...rest) { return virtualText(p) !== null || real.existsSync.call(fs, p, ...rest); };
  fs.statSync = function (p, ...rest) { const t = virtualText(p); return t !== null ? fakeStat(t) : real.statSync.call(fs, p, ...rest); };
  fs.readFileSync = function (p, ...rest) {
    const t = virtualText(p); if (t === null) return real.readFileSync.call(fs, p, ...rest);
    const enc = typeof rest[0] === "string" ? rest[0] : rest[0]?.encoding;
    return enc ? t : Buffer.from(t);
  };
  const rp = function (p, ...rest) { return virtualText(p) !== null ? path.resolve(p) : real.realpathSync.call(fs, p, ...rest); };
  rp.native = function (p, ...rest) { return virtualText(p) !== null ? path.resolve(p) : real.realpathSync.native.call(fs, p, ...rest); };
  fs.realpathSync = rp;
}

/** Whether `p` is a `.d.ts` this module stands in for (TY-6 reports such a module as having no types of its own). */
const isVirtual = p => virtual.get(path.resolve(p)) != null;

module.exports = { install, isVirtual };
