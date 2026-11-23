// A declaration file's rows, as the crate's parser reads them (`rxc` rows, compiler/src/serve.rs): the one reader of
// what a row means for every tool here — rx-verify, the strict record, the audit, the benchmark. Each row: its `name`
// and `kind`, the lines it spans, what running must show (`obligations`, each a claim under a name of its own), what it
// says (`facts`: its words, its parameters or props, its callbacks, the parts of its result) and its `text`.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { rows: parsed } = require("./rxc");

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
/** `text` with each run of whitespace outside a string literal made one space, and a string literal kept as written:
 *  `"a  b"` and `"a b"` are different types. */
function collapse(text) {
  let out = "", q = "", gap = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { out += ch; if (ch === "\\" && i + 1 < text.length) out += text[++i]; else if (ch === q) q = ""; continue; }
    if (/\s/.test(ch)) { gap = true; continue; }
    if (gap && out) out += " "; gap = false;
    out += ch;
    if (ch === '"' || ch === "'" || ch === "`") q = ch;
  }
  return out;
}
/** The rows of `file` (or of `text`, a declaration not yet written), each with its text on one line: every line it
 *  spans, comments dropped outside string literals, whitespace collapsed outside them. Throws on a file that does not
 *  parse. A printed signature (`//@ signature`) has no rows to ask about. */
function rowsOf(file, text) {
  const r = parsed(file, text);
  if (!r || r.error) throw new Error(`${path.basename(file)}: ${r?.error ?? "cannot read it"}`);
  const lines = (text ?? fs.readFileSync(file, "utf8")).split("\n");
  return r.rows.map(x => ({ ...x, text: collapse(lines.slice(x.line - 1, x.end).map(codeOf).join(" ")).trim() }));
}
const hashOf = text => crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);

/** A claim's name for a word as it is written in a row (`handler(onDone)`, `uses(theme)`): the obligation it is checked
 *  under; undefined for a word that is no claim of its own (`instantiates`). */
function claimOf(word) {
  const m = /^([a-z]+)(?:\((.*)\))?$/.exec(word); if (!m) return undefined;
  switch (m[1]) {
    case "pure": case "rejects": case "draft": return m[1];
    case "handler": return `callbacks:${m[2]}`;
    case "uses": case "provides": return `${m[1]}:${m[2]}`;
    case "nests": case "renders": return "placement";
    default: return undefined;
  }
}
/** A claim, in words. */
function describe(ob) {
  const [kind, at] = ob.split(/:(.*)/s);
  const AT = { through: c => `the host rendering through ${c}`, provides: c => `provides(${c})`, uses: c => `uses(${c})`, callbacks: c => `callback ${c} (handler or pure)` };
  const WHAT = { exists: "the export", pure: "pure", rejects: "rejects(…)", fields: "its result's parts (ref, pending, fails)", fails: "fails(…)", draft: "draft", placement: "where it renders what it is given (a factory, nests, renders(H), a component in a prop)" };
  return at ? (AT[kind] ?? (x => `${kind} ${x}`))(at) : WHAT[ob] ?? ob;
}

module.exports = { rowsOf, hashOf, claimOf, describe };
