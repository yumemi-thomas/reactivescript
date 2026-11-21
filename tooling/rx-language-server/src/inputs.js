// TY-1d: what a type-check read, by content. `record(out)` wraps Node's fs for the rest of the process: each file read is
// kept with the hash of the bytes as read (a file saved while the check runs, after it was read, is then different),
// each path looked for and absent as absent, each directory listed with its names. `write()` saves them to `out`.
// `stale(inputs)` answers, later and in another process, whether any of them is different now: a file with other
// content (an older mtime restored by a checkout, two files swapped with mv), one that appeared or vanished, a directory
// with other names (a file added that an `include` glob would take). Content, not mtimes, decides.
// A listing counts only the names TypeScript could take (revised 2026-11-22): the folders in it, which a glob may
// descend into, and the files with an extension the project's program holds (`takes`: TypeScript's, `.rx`, JavaScript's
// under `allowJs`, `.json` under `resolveJsonModule`, and `package.json`). With `"include": ["**/*"]` every folder is
// listed, and a README beside the sources, or the assets a build writes under `dist/`, are not inputs of a type-check.
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");

const hashOf = buf => crypto.createHash("sha1").update(buf).digest("hex");
const bytes = (v, enc) => Buffer.isBuffer(v) ? v : Buffer.from(String(v), typeof enc === "string" ? enc : enc?.encoding ?? "utf8");

function record(out) {
  const files = new Map(), absent = new Set(), dirs = new Map(), ignored = new Set([path.resolve(out)]);
  const real = { readFileSync: fs.readFileSync, existsSync: fs.existsSync, statSync: fs.statSync, lstatSync: fs.lstatSync, readdirSync: fs.readdirSync, writeFileSync: fs.writeFileSync };
  const key = p => typeof p === "string" ? path.resolve(p) : null;
  let takes = null;                                             // the extensions a listing counts; null: every name
  const seen = (p, there) => { const k = key(p); if (!k) return; if (!there) { if (!files.has(k) && !dirs.has(k)) absent.add(k); } else absent.delete(k); };
  fs.readFileSync = function (p, enc) {
    const v = real.readFileSync.apply(fs, arguments);
    const k = typeof p === "number" ? null : key(p);
    if (k && !files.has(k)) { files.set(k, hashOf(bytes(v, enc))); absent.delete(k); }
    return v;
  };
  for (const f of ["existsSync"]) fs[f] = function (p) { const r = real[f].apply(fs, arguments); seen(p, r); return r; };
  for (const f of ["statSync", "lstatSync"]) fs[f] = function (p) {
    let r; try { r = real[f].apply(fs, arguments); } catch (e) { seen(p, false); throw e; }
    seen(p, r !== undefined); return r;
  };
  fs.readdirSync = function (p) {
    const r = real.readdirSync.apply(fs, arguments);
    const k = key(p); if (k && !dirs.has(k)) { let typed = null; try { typed = real.readdirSync.call(fs, k, { withFileTypes: true }); } catch {} dirs.set(k, typed ?? r.map(e => typeof e === "string" ? { name: e } : e)); absent.delete(k); }
    return r;
  };
  const keep = ([p]) => !ignored.has(p);
  return {
    /** a file the run reads that is not an input of the check (rx-tsc's --rx-hosts list, removed after the run) */
    ignore(p) { ignored.add(path.resolve(p)); },
    /** the extensions of the files the project's program can hold: a listing counts those, and folders */
    takes(exts) { takes = [...exts]; },
    write() { real.writeFileSync(out, JSON.stringify({ files: Object.fromEntries([...files].filter(keep)), absent: [...absent].filter(p => !files.has(p) && !dirs.has(p) && !ignored.has(p)), dirs: Object.fromEntries([...dirs].filter(keep).map(([p, entries]) => [p, listingHash(entries, takes)])), ...(takes ? { takes } : {}) })); },
  };
}

/** What a folder's listing is, for the gate: every name, or — given the extensions the program can hold — its folders
 *  (and links, which may be folders) and the files TypeScript could take. */
function listingHash(entries, takes) {
  const counted = takes ? entries.filter(e => typeof e.isDirectory !== "function" || e.isDirectory() || e.isSymbolicLink() || e.name === "package.json" || takes.some(x => e.name.endsWith(x))) : entries;
  return hashOf(counted.map(e => e.name).sort().join("\0"));
}
/** A memo of content hashes by what `stat` says (device, inode, size, mtime and ctime — ctime cannot be set back), so a
 *  long-lived process hashes a file again only when it may have changed. */
const memo = new Map();
function contentHash(p) {
  let st; try { st = fs.statSync(p); } catch { return null; }
  if (!st.isFile()) return null;
  const k = `${st.dev}:${st.ino}:${st.size}:${st.mtimeMs}:${st.ctimeMs}`;
  const m = memo.get(p); if (m && m.k === k) return m.h;
  let h; try { h = hashOf(fs.readFileSync(p)); } catch { return null; }
  memo.set(p, { k, h }); return h;
}
/** Whether anything `inputs` (as `record` wrote it) holds is different now; also true when there is no record. */
function stale(inputs) {
  if (!inputs || !inputs.files) return true;
  for (const [p, h] of Object.entries(inputs.files)) if (contentHash(p) !== h) return true;
  for (const p of inputs.absent ?? []) if (fs.existsSync(p)) return true;
  for (const [p, h] of Object.entries(inputs.dirs ?? {})) { let entries; try { entries = fs.readdirSync(p, { withFileTypes: true }); } catch { return true; } if (listingHash(entries, inputs.takes ?? null) !== h) return true; }
  return false;
}
module.exports = { record, stale, contentHash };
