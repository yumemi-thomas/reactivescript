// MO-8j: strict declarations. `rx-verify --record` writes, beside `lib.d.rx`, `lib.verified.json`: each row it ran, by a
// hash of the row's text, with what running showed (ok, n/a, unverified, mismatch). `rx-tsc --rx-strict` (or
// `"reactivescript": { "strict": true }` in the tsconfig) then refuses every row of a declaration the program imports
// that is not recorded as verified (or as not applicable), unless the row says `trusted`: trust becomes a word a reviewer
// reads, not the default. A row edited since the record was written is not verified any more (its hash changed).
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

/** The rows a declaration file exports that running can check: fns, components, error classes and values. */
const ROW = /^\s*export\s+(?:(?:server|client)\s+)?(?:pure\s+)?(fn|component|error|const)\s+([A-Za-z_$][\w$.]*)/;
const textOf = l => l.replace(/\/\/.*$/, "").trim();
const hashOf = l => crypto.createHash("sha256").update(textOf(l)).digest("hex").slice(0, 16);
const recordOf = file => file.replace(/\.d\.rx$/, ".verified.json");
const RANK = { fail: 3, unverified: 2, ok: 1, na: 0 };

/** Write the record of one rx-verify run: each line's worst status, by the row's hash. */
function writeRecord(file, results) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const rows = {};
  for (const r of results) {
    const l = lines[r.line - 1]; if (l === undefined || !ROW.test(l)) continue;
    const h = hashOf(l), prev = rows[h];
    if (!prev || RANK[r.status] > RANK[prev.status]) rows[h] = { line: r.line, status: r.status, what: r.what };
    else if (prev.status === r.status) prev.what += `; ${r.what}`;
  }
  const at = recordOf(file);
  fs.writeFileSync(at, JSON.stringify({ verifiedBy: "rx-verify", rows }, null, 2) + "\n");
  return at;
}

/** The rows of `file` strict mode refuses: not recorded (or recorded unverified or mismatched), and not `trusted`. */
function checkStrict(file) {
  const out = [];
  const at = recordOf(file);
  let rec = null; try { rec = JSON.parse(fs.readFileSync(at, "utf8")); } catch {}
  fs.readFileSync(file, "utf8").split("\n").forEach((l, i) => {
    const m = ROW.exec(l); if (!m) return;
    if (/\btrusted\b/.test(textOf(l).replace(/\([^)]*\)|\{[^}]*\}/g, ""))) return;   // the row says it is taken on trust
    const r = rec?.rows?.[hashOf(l)];
    if (r && (r.status === "ok" || r.status === "na")) return;
    const why = !rec ? `nothing verified it: run \`rx-verify --record ${path.basename(file)}\` (with a probe beside it)`
      : !r ? `it changed since rx-verify last recorded ${path.basename(at)}: run it again`
      : r.status === "fail" ? `rx-verify found a mismatch (${r.what.slice(0, 90)})`
      : `rx-verify could not check it (${r.what.slice(0, 90)})`;
    out.push({ file, line: i + 1, name: m[2], message: `${m[2]}: ${why}; or mark the row \`trusted\`` });
  });
  return out;
}

module.exports = { writeRecord, checkStrict, recordOf };
