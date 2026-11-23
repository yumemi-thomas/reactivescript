// MO-8m: a draft's rows, held against the module they declare before the draft is written. `rx-declare` names the
// library's types in a row (`import("kit").Placement`, `Parameters<typeof import("kit").Select>[0]["placement"]`)
// instead of `any`; whether TypeScript accepts the row as that export's type is TY-6's question, asked here as rx-tsc
// asks it: the crate writes the boundary check for the draft's text (`boundary`), tsrs checks it in memory (src/checker.js), and
// each row an error lands on is named. Such a row is then written as every draft was (its `any`s), so a draft never
// brings a DECLARATION_MISMATCH of its own making.
const path = require("node:path");
const { checker, asLibrary } = require("./checker.js");

/** @param {string} text the draft; `first`: the lines before its rows; `rows`: its row entries (each one line, or TODO
 *  lines and a row) @returns {Map<string, string> | null} export name → TypeScript's reason, for each row it does not
 *  hold; null when there is no crate to check the draft with. A draft the crate cannot read is not that: no row of it
 *  could be held to the module, and every row would be written as every draft was, `any` for each type, with nothing
 *  said (a `readonly` prop did that to a whole library: 726 `any`s). It throws, with the line and the parser's reason. */
function failing(text, first, rows, spec, from, options, lib) {
  let b;
  const file = path.join(from, "__rx_declare__.d.rx");
  try { b = require("./rxc").boundary(file, spec, text); } catch { return null; }
  if (b && typeof b.error === "string") throw unreadable(spec, text, b.error);
  if (!b || typeof b.code !== "string") return null;
  const name = l => /^export\s+(?:(?:pure|server|client)\s+)*(?:fn|component|const|type|context|error)\s+([\w$.]+)/m.exec(l)?.[1];
  // the line each row entry starts on (1-based), so a check's line names its row
  const starts = []; let at = first + 1;
  for (const r of rows) { starts.push(at); at += r.split("\n").length; }
  const rowAt = line => { let i = -1; for (let k = 0; k < starts.length; k++) if (starts[k] <= line) i = k; return i < 0 ? undefined : name(rows[i]); };
  const bad = new Map();
  const codeLines = b.code.split("\n");
  const checks = [...b.checks].sort((x, y) => x.at - y.at);
  for (const dg of diagnostics(b.code, from, options, lib)) {
    const line = dg.line;
    // a type row (`export type Row<T> = …`) is its own line of the check; a value's row is its type's line, then its assignment's
    const alias = /^type\s+([A-Za-z_$][\w$]*)/.exec(codeLines[line - 1] ?? "")?.[1];
    const c = checks.find(x => x.at >= line);
    const n = alias && !alias.startsWith("__decl_") ? alias : c && rowAt(c.line);
    if (!n) return null;                                             // an error no row answers for: nothing is known
    if (!bad.has(n)) bad.set(n, dg.message.replace(/\n\s*/g, " ").slice(0, 1500));
  }
  return bad;
}

/** TypeScript's diagnostics of a check the crate wrote, by line: a package a row names is the one the library imports
 *  (MO-8o), resolved from the library's location, as rx-tsc holds it. */
function diagnostics(code, from, options, lib) {
  const ck = checker(from);
  const u = asLibrary(ck, { name: "__rx_declare__.rx-boundary.ts", code, beside: from, lib }, options);
  return ck.check({ roots: [u.file], files: new Map([[u.file, code]]), options: { ...options, noEmit: true }, resolutions: u.resolutions });
}

/** The draft's own text does not parse as a `.d.rx`: a defect of rx-declare (a row the notation cannot say must be left out
 *  as a comment, MO-8l), reported with the row it wrote and never papered over. */
function unreadable(spec, text, error) {
  const n = Number(/\bline (\d+)\b/.exec(error)?.[1]);
  const row = Number.isInteger(n) ? text.split("\n")[n - 1] : undefined;
  const e = new Error(`the draft for ${spec} cannot be read back as a .d.rx, so none of its rows can be checked against the module — ${error}${row !== undefined ? `\n    ${n} | ${row.length > 400 ? row.slice(0, 400) + " …" : row}` : ""}\nThis is a defect of rx-declare, not of ${spec}: please report it with the row above. \`rx-declare ${spec} --any\` drafts without naming the library's types.`);
  e.code = "RX_DRAFT_UNREADABLE"; e.line = Number.isInteger(n) ? n : undefined; e.parse = error;
  return e;
}

module.exports = { failing };
