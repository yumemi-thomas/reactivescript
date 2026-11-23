// MO-8j: strict declarations. `rx-verify --record` writes, beside `lib.d.rx`, `lib.verified.json`: for each row, by a
// hash of the row's text, each claim the row makes (`obligations`, as the crate's parser names them) with what was
// shown of it — `held`, `na` (it does not apply), `unverified`, `mismatch`. `rx-tsc --rx-strict` (or `"reactivescript":
// { "strict": true }` in the tsconfig) then refuses every row of a declaration the program imports that has a claim
// not recorded as held. A result is about one claim, by name: nothing answers for a whole row, and a row edited since
// the record was written is not verified any more (its hash changed).
const fs = require("node:fs");
const path = require("node:path");

const { rowsOf, hashOf, describe } = require("./rows.js");
/** The kinds of row that claim something running can check: fns, components, error classes and values; a host
 *  declaration's view (09 MO-14) and an import of it that names a component the host renders through (MO-14f). */
const CHECKED = new Set(["fn", "component", "error", "const", "host", "import"]);
const claimed = file => rowsOf(file).filter(x => CHECKED.has(x.kind) && x.obligations.length);
const RANK = { mismatch: 3, unverified: 2, held: 1, na: 0 };
const rowAt = (rows, line) => rows.find(x => line >= x.line && line <= x.end);

/** Each row's claims with what `results` show of them: `[{ row, claims: { ob: { status, what } } }]`. A result names
 *  its claim (`ob`; several for one run that could not tell them apart); the worst of a claim's results is its status.
 *  A claim of the row with no result is `unverified`. */
function claimsOf(file, results) {
  const rows = claimed(file); const by = new Map(rows.map(x => [x, {}]));
  for (const r of results) for (const ob of [].concat(r.ob)) {
    if (typeof ob !== "string" || !RANK.hasOwnProperty(r.status)) throw new Error(`rx-verify: a result that names no claim, or no status (${JSON.stringify(r).slice(0, 120)})`);
    const row = rowAt(rows, r.line); if (!row) continue;
    const claims = by.get(row), prev = claims[ob];
    if (!prev || RANK[r.status] > RANK[prev.status]) claims[ob] = { status: r.status, what: r.what };
    else if (prev.status === r.status && !r.quiet) prev.what += `; ${r.what}`;
  }
  for (const [row, claims] of by) for (const ob of row.obligations) claims[ob] ??= { status: "unverified", what: `${row.name}: ${describe(ob)} not checked by running${ob === "exists" ? "" : ": give it in a probe"}`, missing: true };
  return [...by].map(([row, claims]) => ({ row, claims }));
}
/** MO-8j: the claims no result answers, each as an `unverified` result: what rx-verify says of them. */
function unanswered(file, results) {
  return claimsOf(file, results).flatMap(({ row, claims }) => Object.entries(claims).filter(([, c]) => c.missing).map(([ob, c]) => ({ line: row.line, ob, status: "unverified", what: c.what })));
}
/** The meaning of a record: what rx-verify checked when it wrote one. A record from a version whose checks differ does
 *  not count. 8 (2026-11-26): a record holds each claim's own result — until then a row had one status, and a result
 *  that named no claim (the audit's summary on line 1, a `pure` read from the code) answered for every claim of the
 *  row it fell on; `uses(c)` is a claim for each context, shown by the hook failing without that context's provider
 *  and running with it (it was any throw or any warning with no provider); `rejects(E)` is a claim. */
const RECORD_VERSION = 8;
/** What a record was verified against: the library (an installed package's version, or the JS module's own text beside
 *  the declaration) and the probe file. A record made against other inputs does not count (the library moved under it). */
function inputsOf(file) {
  const { PIN, installed } = require("./versions.js");
  const dir = path.dirname(file), base = file.replace(/\.d\.rx$/, "");
  const inputs = {};
  for (const l of fs.readFileSync(file, "utf8").split("\n")) { const m = PIN.exec(l); if (m) inputs[`package ${m[1]}`] = installed(m[1], dir) ?? "not installed"; }
  const at = file.split(path.sep).lastIndexOf("rx-types");
  if (at >= 0) { const spec = file.split(path.sep).slice(at + 1).join("/").replace(/\.d\.rx$/, ""); const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]; inputs[`package ${pkg}`] = installed(pkg, dir) ?? "not installed"; }
  else { const js = require("./beside.js").jsOf(file); if (js) inputs[`module ${path.basename(js)}`] = hashOf(fs.readFileSync(js, "utf8")); }
  const probe = [".probe.mjs", ".probe.js"].map(x => base + x).find(f => fs.existsSync(f));
  inputs.probe = probe ? hashOf(fs.readFileSync(probe, "utf8")) : "none";
  return inputs;
}
const changedInputs = (was, now) => Object.keys({ ...was, ...now }).filter(k => (was ?? {})[k] !== now[k]);
const recordOf = file => file.replace(/\.d\.rx$/, ".verified.json");

/** Write the record of one rx-verify run: each row's claims, by the hash of the row's text. */
function writeRecord(file, results) {
  const rows = {};
  for (const { row, claims } of claimsOf(file, results)) rows[hashOf(row.text)] = { line: row.line, name: row.name, claims: Object.fromEntries(Object.entries(claims).map(([ob, c]) => [ob, { status: c.status, what: c.what }])) };
  const at = recordOf(file);
  fs.writeFileSync(at, JSON.stringify({ verifiedBy: "rx-verify", version: RECORD_VERSION, inputs: inputsOf(file), rows }, null, 2) + "\n");
  return at;
}

/** The rows of `file` strict mode refuses: not recorded, or with a claim that is not recorded as held — one the row
 *  makes as it is read now, or one a run found a mismatch in. */
function checkStrict(file) {
  const out = [];
  const at = recordOf(file);
  let rec = null; try { rec = JSON.parse(fs.readFileSync(at, "utf8")); } catch {}
  const moved = rec ? changedInputs(rec.inputs, inputsOf(file)) : [];
  const stale = rec && rec.version !== RECORD_VERSION;   // written by an rx-verify whose checks were different
  for (const row of claimed(file)) {
    const r = rec?.rows?.[hashOf(row.text)]; const claims = r?.claims ?? {};
    const bad = row.obligations.map(ob => [ob, claims[ob]]).find(([, c]) => !c || (c.status !== "held" && c.status !== "na")) ?? Object.entries(claims).find(([, c]) => c.status === "mismatch");
    if (r && !bad && !moved.length && !stale) continue;
    const why = !rec ? `nothing verified it: run \`rx-verify --record ${path.basename(file)}\` (with a probe beside it)`
      : stale ? `${path.basename(at)} was recorded by an older rx-verify, whose checks differ: run it again`
      : moved.length ? `${moved.join(", ")} changed since rx-verify recorded ${path.basename(at)}: run it again`
      : !r ? `it changed since rx-verify last recorded ${path.basename(at)}: run it again`
      : !bad[1] ? `${describe(bad[0])} is a claim of the row with no result in ${path.basename(at)}: run rx-verify again`
      : bad[1].status === "mismatch" ? `rx-verify found a mismatch (${bad[1].what.slice(0, 90)})`
      : `rx-verify could not check ${describe(bad[0])} (${bad[1].what.slice(0, 90)})`;
    out.push({ file, line: row.line, name: row.name, message: `${row.name}: ${why}` });
  }
  return out;
}

module.exports = { writeRecord, checkStrict, recordOf, claimsOf, unanswered, RECORD_VERSION };
