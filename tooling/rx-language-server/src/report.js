// TypeScript's two ways of printing diagnostics (`--pretty` and not), over what src/checker.js answers. A place on an
// `.rx` is the module's own text (the checker knows only its projection), so the lines shown are read from the disk.
const fs = require("node:fs");
const path = require("node:path");

const KIND = ["warning", "error", "suggestion", "message"], COLOR = [93, 91, 90, 94];
const c = (n, s) => `\u001b[${n}m${s}\u001b[0m`;
const lines = new Map();
const lineOf = (f, n) => { if (!lines.has(f)) { try { lines.set(f, fs.readFileSync(f, "utf8").split(/\r\n|\r|\n/)); } catch { lines.set(f, []); } } return lines.get(f)[n - 1] ?? ""; };
const rel = f => path.relative(process.cwd(), f).split(path.sep).join("/");

function context(d, indent, color) {
  const from = d.line, to = Math.max(d.line, d.end?.line ?? d.line); let out = "";
  for (let n = from; n <= to; n++) {
    if (to - from >= 4 && n === from + 2) { out += `\n${indent}${c(7, "...")}`; n = to - 1; }
    const text = lineOf(d.file, n).replace(/\s+$/, "").replace(/\t/g, " "), w = String(to).length;
    const s = n === from ? d.column : 0, e = n === to ? Math.max(d.end?.column ?? s + 1, s + 1) : text.length;
    out += `\n${indent}${c(7, String(n).padStart(w))} ${text}\n${indent}${c(7, " ".repeat(w))} ${c(color, " ".repeat(s) + "~".repeat(Math.max(e - s, 1)))}`;
  }
  return out;
}

/** @param {import("./checker.js").plain[]} ds */
function report(ds, { pretty }) {
  lines.clear();
  if (!pretty) return ds.map(d => `${d.file === undefined ? "" : `${rel(d.file)}(${d.line},${d.column + 1}): `}${KIND[d.category]} TS${d.code}: ${d.message}\n`).join("");
  const at = d => `${c(96, rel(d.file))}:${c(93, d.line)}:${c(93, d.column + 1)}`;
  let out = "";
  for (const d of ds) {
    out += `${d.file === undefined ? "" : `${at(d)} - `}${c(COLOR[d.category], KIND[d.category])}${c(90, ` TS${d.code}: `)}${d.message}`;
    if (d.file !== undefined) out += `\n${context(d, "", COLOR[d.category])}`;
    for (const r of d.related) out += `\n\n  ${r.file === undefined ? "" : `${at(r)}`}${r.file === undefined ? "" : context(r, "    ", 96)}\n    ${r.message}`;
    out += "\n\n";
  }
  const errors = ds.filter(d => d.category === 1), files = new Set(errors.map(d => d.file).filter(Boolean));
  if (errors.length) out += `Found ${errors.length} error${errors.length === 1 ? "" : "s"}${files.size > 1 ? ` in ${files.size} files` : files.size ? ` in ${rel([...files][0])}` : ""}.\n\n`;
  return out;
}
module.exports = { report };
