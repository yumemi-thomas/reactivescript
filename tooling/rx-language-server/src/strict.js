// MO-8j: strict declarations. `rx-verify --record` writes, beside `lib.d.rx`, `lib.verified.json`: each row it ran, by a
// hash of the row's text, with what running showed (ok, n/a, unverified, mismatch). `rx-tsc --rx-strict` (or
// `"reactivescript": { "strict": true }` in the tsconfig) then refuses every row of a declaration the program imports
// that is not recorded as verified (or as not applicable), unless the row says `trusted`: trust becomes a word a reviewer
// reads, not the default. A row edited since the record was written is not verified any more (its hash changed).
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { rows: parsed } = require("./rxc");
/** The kinds of row running can check: fns, components, error classes and values. */
const CHECKED = new Set(["fn", "component", "error", "const"]);
/** A line without its `// comment`; a `//` inside a string literal is not one. */
function codeOf(line) {
  let q = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === "\\") i++; else if (ch === q) q = ""; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { q = ch; continue; }
    if (ch === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}
/** A declaration's rows, as the crate's parser reads them, each with its text: every line it spans (a multi-line props
 *  type included), comments dropped outside string literals, whitespace collapsed. Throws on a file that does not parse. */
function rowsOf(file) {
  const r = parsed(file);
  if (!r || r.error) throw new Error(`${path.basename(file)}: ${r?.error ?? "cannot read it"}`);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  return r.rows.filter(x => CHECKED.has(x.kind)).map(x => ({ ...x, text: lines.slice(x.line - 1, x.end).map(codeOf).join(" ").replace(/\s+/g, " ").trim() }));
}
/** What a record was verified against: the library (an installed package's version, or the JS module's own text beside
 *  the declaration) and the probe file. A record made against other inputs does not count (the library moved under it). */
function inputsOf(file) {
  const { PIN, installed } = require("./versions.js");
  const dir = path.dirname(file), base = file.replace(/\.d\.rx$/, "");
  const inputs = {};
  for (const l of fs.readFileSync(file, "utf8").split("\n")) { const m = PIN.exec(l); if (m) inputs[`package ${m[1]}`] = installed(m[1], dir) ?? "not installed"; }
  const at = file.split(path.sep).lastIndexOf("rx-types");
  if (at >= 0) { const spec = file.split(path.sep).slice(at + 1).join("/").replace(/\.d\.rx$/, ""); const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]; inputs[`package ${pkg}`] = installed(pkg, dir) ?? "not installed"; }
  else { const js = [".js", ".mjs", ".jsx", ".ts"].map(x => base + x).find(f => fs.existsSync(f)); if (js) inputs[`module ${path.basename(js)}`] = hashOf(fs.readFileSync(js, "utf8")); }
  const probe = [".probe.mjs", ".probe.js"].map(x => base + x).find(f => fs.existsSync(f));
  inputs.probe = probe ? hashOf(fs.readFileSync(probe, "utf8")) : "none";
  return inputs;
}
const changedInputs = (was, now) => Object.keys({ ...was, ...now }).filter(k => (was ?? {})[k] !== now[k]);
const hashOf = text => crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
const recordOf = file => file.replace(/\.d\.rx$/, ".verified.json");
const RANK = { fail: 3, unverified: 2, ok: 1, na: 0 };

/** Write the record of one rx-verify run: each row's worst status, by the hash of the row's text. */
function writeRecord(file, results) {
  const all = rowsOf(file);
  const rows = {};
  for (const r of results) {
    const row = all.find(x => r.line >= x.line && r.line <= x.end); if (!row) continue;
    const h = hashOf(row.text), prev = rows[h];
    if (!prev || RANK[r.status] > RANK[prev.status]) rows[h] = { line: row.line, status: r.status, what: r.what };
    else if (prev.status === r.status) prev.what += `; ${r.what}`;
  }
  const at = recordOf(file);
  fs.writeFileSync(at, JSON.stringify({ verifiedBy: "rx-verify", inputs: inputsOf(file), rows }, null, 2) + "\n");
  return at;
}

/** The rows of `file` strict mode refuses: not recorded (or recorded unverified or mismatched), and not `trusted` (as the
 *  parser read the row, so a type that only mentions the word is not trust). */
function checkStrict(file) {
  const out = [];
  const at = recordOf(file);
  let rec = null; try { rec = JSON.parse(fs.readFileSync(at, "utf8")); } catch {}
  const moved = rec ? changedInputs(rec.inputs, inputsOf(file)) : [];
  for (const row of rowsOf(file)) {
    if (row.trusted) continue;
    const r = rec?.rows?.[hashOf(row.text)];
    if (r && (r.status === "ok" || r.status === "na") && !moved.length) continue;
    const why = !rec ? `nothing verified it: run \`rx-verify --record ${path.basename(file)}\` (with a probe beside it)`
      : moved.length ? `${moved.join(", ")} changed since rx-verify recorded ${path.basename(at)}: run it again`
      : !r ? `it changed since rx-verify last recorded ${path.basename(at)}: run it again`
      : r.status === "fail" ? `rx-verify found a mismatch (${r.what.slice(0, 90)})`
      : `rx-verify could not check it (${r.what.slice(0, 90)})`;
    out.push({ file, line: row.line, name: row.name, message: `${row.name}: ${why}; or mark the row \`trusted\`` });
  }
  return out;
}

module.exports = { writeRecord, checkStrict, recordOf };
