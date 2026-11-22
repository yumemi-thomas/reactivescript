// MO-8m: a draft's rows, held against the module they declare before the draft is written. `rx-declare` names the
// library's types in a row (`import("kit").Placement`, `Parameters<typeof import("kit").Select>[0]["placement"]`)
// instead of `any`; whether TypeScript accepts the row as that export's type is TY-6's question, asked here as rx-tsc
// asks it: the crate writes the boundary check for the draft's text (`boundary`), TypeScript checks it in memory, and
// each row an error lands on is named. Such a row is then written as every draft was (its `any`s), so a draft never
// brings a DECLARATION_MISMATCH of its own making.
const path = require("node:path");

/** @param {string} text the draft; `first`: the lines before its rows; `rows`: its row entries (each one line, or TODO
 *  lines and a row) @returns {Map<string, string> | null} export name → TypeScript's reason, for each row it does not
 *  hold; null when the draft could not be checked (no crate, or one that does not read it). */
function failing(ts, text, first, rows, spec, from, options, old) {
  let b;
  const file = path.join(from, "__rx_declare__.d.rx");
  try { b = require("./rxc").boundary(file, spec, text); } catch { return null; }
  if (!b || b.error || typeof b.code !== "string") return null;
  const name = l => /^export\s+(?:(?:pure|server|client|trusted)\s+)*(?:fn|component|const|type|context|error)\s+([\w$.]+)/m.exec(l)?.[1];
  // the line each row entry starts on (1-based), so a check's line names its row
  const starts = []; let at = first + 1;
  for (const r of rows) { starts.push(at); at += r.split("\n").length; }
  const rowAt = line => { let i = -1; for (let k = 0; k < starts.length; k++) if (starts[k] <= line) i = k; return i < 0 ? undefined : name(rows[i]); };
  const unit = path.join(from, "__rx_declare__.rx-boundary.ts");
  const host = ts.createCompilerHost(options);
  const { getSourceFile, fileExists, readFile } = host;
  host.getSourceFile = (f, lang, ...rest) => path.resolve(f) === unit ? ts.createSourceFile(f, b.code, lang) : getSourceFile.call(host, f, lang, ...rest);
  host.fileExists = f => path.resolve(f) === unit || fileExists.call(host, f);
  host.readFile = f => path.resolve(f) === unit ? b.code : readFile.call(host, f);
  const program = ts.createProgram([unit], { ...options, noEmit: true }, host, old);
  const sf = program.getSourceFile(unit);
  const bad = new Map();
  const codeLines = b.code.split("\n");
  const checks = [...b.checks].sort((x, y) => x.at - y.at);
  for (const dg of [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)]) {
    const line = dg.start === undefined ? 0 : sf.getLineAndCharacterOfPosition(dg.start).line + 1;
    // a type row (`export type Row<T> = …`) is its own line of the check; a value's row is its type's line, then its assignment's
    const alias = /^type\s+([A-Za-z_$][\w$]*)/.exec(codeLines[line - 1] ?? "")?.[1];
    const c = checks.find(x => x.at >= line);
    const n = alias && !alias.startsWith("__decl_") ? alias : c && rowAt(c.line);
    if (!n) return null;                                             // an error no row answers for: nothing is known
    if (!bad.has(n)) bad.set(n, ts.flattenDiagnosticMessageText(dg.messageText, " ").slice(0, 1500));
  }
  return bad;
}

module.exports = { failing };
