// MO-8v: the words src/infer.js proves from the code, written into a draft's rows. A row takes `pure` before `fn`,
// `handler` before a callback's function type (a parameter's, a field's of a record parameter, a prop's of a
// component), `draft` before a parameter the fn changes in place, `rejects(A | B)` after the signature, and
// `instantiates` where a proven `pure` fn makes Solid nodes; the question the draft asked about each is not written
// (a question that is answered "no" — a callback called while the call runs, a parameter never changed, a promise
// that rejects with no class of the module's — goes too). Each row that took a word has a line above it,
// `//@ inferred <export>: <words>`, so a word read off the code is told from one a person wrote: the row itself is
// the notation's, with no new word and no new form (MO-8r), and both checkers read it as any row (08 CN-8).
const path = require("node:path");

/** The row's parts: `{ head, name, open, close, params: [{ from, to, text }] }` — offsets into the line. */
function parseRow(line) {
  const m = /^export\s+((?:(?:pure|server|client)\s+)*)(fn|component)\s+([\w$.]+)/.exec(line); if (!m) return undefined;
  let i = m[0].length;
  const closeOf = (from, o, c) => {   // the index of the bracket that closes the one at `from`
    let d = 0;
    for (let k = from; k < line.length; k++) {
      const ch = line[k];
      if (ch === '"' || ch === "'" || ch === "`") { const q = ch; k++; while (k < line.length && line[k] !== q) { if (line[k] === "\\") k++; k++; } continue; }
      if (ch === "=" && line[k + 1] === ">") { k++; continue; }
      if (ch === o) d++; else if (ch === c) { d--; if (d === 0) return k; }
    }
    return -1;
  };
  if (line[i] === "<") { const e = closeOf(i, "<", ">"); if (e < 0) return undefined; i = e + 1; }
  if (line[i] !== "(") return undefined;
  const close = closeOf(i, "(", ")"); if (close < 0) return undefined;
  const params = split(line, i + 1, close, ",");
  return { words: m[1], kind: m[2], name: m[3], open: i, close, params };
}
/** The parts of `line[from, to)` between separators at depth 0: `[{ from, to, text }]`, each trimmed. */
function split(line, from, to, sep) {
  const out = []; let d = 0, start = from;
  const push = end => { let a = start, b = end; while (a < b && /\s/.test(line[a])) a++; while (b > a && /\s/.test(line[b - 1])) b--; if (b > a) out.push({ from: a, to: b, text: line.slice(a, b) }); };
  for (let k = from; k < to; k++) {
    const ch = line[k];
    if (ch === '"' || ch === "'" || ch === "`") { const q = ch; k++; while (k < to && line[k] !== q) { if (line[k] === "\\") k++; k++; } continue; }
    if (ch === "=" && line[k + 1] === ">") { k++; continue; }
    if ("([{<".includes(ch)) d++; else if (")]}>".includes(ch)) d--;
    else if (d === 0 && (ch === sep || (sep === ";" && ch === ","))) { push(k); start = k + 1; }
  }
  push(to); return out;
}
/** Of a parameter or a field, `name?: type`: `{ name, type: offset of the type, words }` (offsets into the line). */
function named(line, part) {
  const m = /^((?:(?:ref|draft|readonly)\s+)*)(\.\.\.)?([\w$]+)(\?)?\s*:\s*/.exec(part.text); if (!m) return undefined;
  return { words: m[1], rest: !!m[2], name: m[3], nameAt: part.from + m[1].length, type: part.from + m[0].length, end: part.to };
}
/** Whether the type at `at` is a function type written out: `(…) => …`. */
function fnTypeAt(line, at, end) {
  if (line[at] !== "(") return false;
  let d = 0;
  for (let k = at; k < end; k++) {
    const ch = line[k];
    if (ch === "=" && line[k + 1] === ">") { k++; continue; }
    if (ch === "(") d++; else if (ch === ")") { d--; if (d === 0) return /^\s*=>/.test(line.slice(k + 1, end)); }
  }
  return false;
}
/** The records written out in a type at depth 0 (`X & { a; b }`, `{ a; b }`): each as its fields. */
function records(line, from, to) {
  const out = []; let d = 0;
  for (let k = from; k < to; k++) {
    const ch = line[k];
    if (ch === '"' || ch === "'" || ch === "`") { const q = ch; k++; while (k < to && line[k] !== q) { if (line[k] === "\\") k++; k++; } continue; }
    if (ch === "=" && line[k + 1] === ">") { k++; continue; }
    if (ch === "{" && d === 0) { let e = k, dd = 0; for (; e < to; e++) { if (line[e] === "=" && line[e + 1] === ">") { e++; continue; } if ("([{<".includes(line[e])) dd++; else if (")]}>".includes(line[e])) { dd--; if (dd === 0) break; } } out.push(split(line, k + 1, e, ";")); k = e; continue; }
    if ("([<".includes(ch)) d++; else if (")]>".includes(ch)) d--;
  }
  return out;
}

/** What the row's types say of each parameter of the export `name`, for the reading of its code: `plain` — the indexes
 *  whose type is a primitive (no promise can stand there); `opaque` — index → "self" where the type has function
 *  members of its own (a class's instance, a record of callbacks: a method call on it is no built-in's), "parts" where
 *  its elements or fields have. */
function paramTypes(ts, checker, mod, imp, name) {
  const [head, ...rest] = name.split(".");
  const sym0 = checker.getExportsOfModule(mod).find(s => s.name === head); if (!sym0) return {};
  const sym = sym0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym0) : sym0;
  let t = checker.getTypeOfSymbolAtLocation(sym, imp);
  for (const r of rest) { const q = t.getProperty(r); if (!q) return {}; t = checker.getTypeOfSymbolAtLocation(q, imp); }
  const sigs = checker.getNonNullableType(t).getCallSignatures(); if (!sigs.length) return {};
  const PRIM = ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike | ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void | ts.TypeFlags.EnumLike;
  const isPrim = x => x.isUnion() ? x.types.every(isPrim) : !!(x.flags & PRIM);
  const lib = d => { const f = d.getSourceFile(); return f.hasNoDefaultLib || /[\\/]typescript[\\/]lib[\\/]lib\.[\w.]+\.d\.ts$/.test(f.fileName); };
  const own = (x, depth = 0) => {
    if (depth > 3) return false;
    if (x.isUnion() || x.isIntersection()) return x.types.some(y => own(y, depth));
    if (x.flags & ts.TypeFlags.TypeParameter) { const c = checker.getBaseConstraintOfType(x); return !!c && c !== x && own(c, depth + 1); }
    if (!(x.flags & ts.TypeFlags.Object)) return false;
    if (x.getCallSignatures().length || checker.isArrayType(x) || checker.isTupleType(x)) return false;
    return x.getProperties().some(p => (p.declarations ?? []).some(d => !lib(d)) && checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(p, imp)).getCallSignatures().length > 0);
  };
  const parts = x => {
    if (x.isUnion() || x.isIntersection()) return x.types.some(parts);
    if (!(x.flags & ts.TypeFlags.Object)) return false;
    if (checker.isArrayType(x) || checker.isTupleType(x)) return checker.getTypeArguments(x).some(y => own(y) || parts(y));
    if (x.getCallSignatures().length) return false;
    const ps = x.getProperties(); if (ps.length > 60) return true;
    return ps.some(p => (p.declarations ?? []).some(d => !lib(d)) && own(checker.getTypeOfSymbolAtLocation(p, imp), 1));
  };
  const plain = new Set(), opaque = new Map();
  const n = Math.max(...sigs.map(g => g.getParameters().length));
  for (let i = 0; i < n; i++) {
    const ts_ = sigs.map(g => { const p = g.getParameters()[i]; if (!p) return undefined; const d = p.valueDeclaration; if (d && ts.isParameter(d) && d.dotDotDotToken) return null; return checker.getTypeOfSymbolAtLocation(p, imp); });
    if (ts_.every(x => x && isPrim(x))) plain.add(i);
    if (ts_.some(x => x && own(x))) opaque.set(i, "self"); else if (ts_.some(x => x === null || (x && parts(x)))) opaque.set(i, "parts");
  }
  return { plain, opaque };
}

/** @param {string[]} lines the draft's lines (rows, and the questions above them)
 *  @param {(name: string) => object} typesOf what the row's types say of a fn's parameters (`paramTypes`)
 *  @param {object[]} [why] filled with what was proven and what was refused, word by word (`rx-declare --why`)
 *  @returns {{ lines: string[], head: string[], count: { pure, handler, rejects, draft, instantiates } }} */
function apply(ts, spec, from, lines, typesOf, why) {
  const inf = require("./infer.js").create(ts, { solid: process.env.RX_INFER_SOLID !== "0" });
  const exportedAs = l => /^export\s+(?:(?:pure|server|client)\s+)*(?:fn|component|const|type|context|error)\s+([\w$.]+)/.exec(l)?.[1];
  const out = []; const count = { pure: 0, handler: 0, rejects: 0, draft: 0, instantiates: 0 };
  const errors = new Set(lines.map(l => /^export error ([\w$]+)/.exec(l)?.[1]).filter(Boolean));
  const rel = f => path.relative(from, f).split(path.sep).join("/").replace(/^(?:\.\.\/)+node_modules\//, "").replace(/^node_modules\//, "");
  const at = w => `${rel(w.file)}:${w.line}`;
  const note = (name, word, ok, reason) => { if (why) why.push({ name, word, ok, why: reason }); };
  let unread;
  lines = lines.flatMap(l => l.split("\n"));   // (a component's question is written in its row's own element)
  for (let li = 0; li < lines.length; li++) {
    let line = lines[li];
    const row = line.startsWith("export ") ? parseRow(line) : undefined;
    if (!row || /\bserver\b/.test(row.words)) { out.push(line); continue; }
    let f; try { f = inf.exportFacts(spec, from, row.name, row.kind === "fn" ? typesOf(row.name) : {}); } catch (e) { f = { unread: `the code could not be read (${String(e?.message ?? e).slice(0, 120)})` }; }
    if (!f || f.unread) { unread ??= f?.unread; note(row.name, "*", false, f?.unread ?? "no code"); out.push(line); continue; }
    const took = []; const answered = { pure: false, rejects: false, events: new Set(), drafts: new Set(), draftNames: new Set() };
    // insertions into the row, applied from its end so that the offsets before them stand
    const ins = [];
    // ---- handler: a callback parameter, a callback field of a record parameter, a callback prop
    const ask = (index, field, label, typeAt) => {
      const h = f.handler(index, field);
      if (h.ok) { ins.push([typeAt, "handler "]); took.push(`handler(${label})`); count.handler++; answered.events.add(field ?? label); note(row.name, `handler(${label})`, true, [...new Set(h.uses.map(u => `${u.why} [${at(u)}]`))].slice(0, 3).join("; ")); return; }
      const bad = h.uses.find(u => u.how !== "later");
      if (!h.never && h.uses.every(u => u.how === "sync")) answered.events.add(field ?? label);   // called while the call runs: no handler, and no question
      note(row.name, `handler(${label})`, false, h.never ? "never called in the code that was read" : `${bad.how === "sync" ? "called while the call runs or in a computation" : bad.how === "reentry" ? "kept, and called whenever what holds it is called" : "it goes where it is not followed"}: ${bad.why} [${at(bad)}]`);
    };
    row.params.forEach((part, index) => {
      const p = named(line, part); if (!p || p.rest) return;
      if (/^handler\b/.test(line.slice(p.type))) return;
      if (row.kind === "fn" && fnTypeAt(line, p.type, p.end)) return ask(index, undefined, p.name, p.type);
      for (const fields of records(line, p.type, p.end)) for (const fp of fields) {
        const q = named(line, fp); if (!q || /^handler\b/.test(line.slice(q.type)) || !fnTypeAt(line, q.type, q.end)) continue;
        ask(index, q.name, row.kind === "component" ? q.name : `${p.name}.${q.name}`, q.type);
      }
      // ---- draft: a parameter the fn changes in place
      if (row.kind === "fn" && !/\b(ref|draft)\b/.test(p.words) && !fnTypeAt(line, p.type, p.end)) {
        const d = f.draft(index);
        if (d === "changes") { ins.push([p.nameAt, "draft "]); took.push(`draft(${p.name})`); count.draft++; answered.drafts.add(p.name); const w = f.draftWhy(index); note(row.name, `draft(${p.name})`, true, `${w.why} [${at(w)}]`); }
        else if (d === "never") { answered.drafts.add(p.name); note(row.name, `draft(${p.name})`, false, "never changed: every use of it only reads"); }
      }
    });
    // ---- pure
    if (row.kind === "fn" && !/\bpure\b/.test(row.words)) {
      if (f.pure) { took.push("pure"); count.pure++; answered.pure = true; note(row.name, "pure", true, f.makes ? "it only computes and makes Solid nodes of its own" : "it only computes"); }
      else { const w = f.why[0]; note(row.name, "pure", false, `${w.why} [${at(w)}]${w.via ? ` (called at ${at(w.via)})` : ""}`); }
    }
    // ---- rejects
    const tail = line.slice(row.close + 1);
    const promise = /^\s*:\s*Promise</.test(tail);
    if (row.kind === "fn" && promise && !/\brejects\(/.test(tail)) {
      if (f.rejects && f.rejects.every(n => errors.has(n))) {
        answered.rejects = true;
        if (f.rejects.length) { took.push(`rejects(${f.rejects.join(" | ")})`); count.rejects++; note(row.name, "rejects", true, `every throw the code reaches is of ${f.rejects.join(", ")}`); }
        else note(row.name, "rejects", false, "the code reaches no throw of a class: nothing to name, and the default (Error) stands");
      } else note(row.name, "rejects", false, f.rejects ? `it throws ${f.rejects.filter(n => !errors.has(n)).join(", ")}, which the draft has no \`export error\` row for` : f.rejectsWhy);
    }
    for (const [pos, text] of ins.sort((a, b) => b[0] - a[0])) line = line.slice(0, pos) + text + line.slice(pos);
    if (answered.pure && f.pure) line = line.replace(/^export\s+((?:(?:server|client)\s+)*)fn\b/, (_, w) => `export ${w}pure fn`);
    if (took.some(t => t.startsWith("rejects("))) line = `${line} rejects(${f.rejects.join(" | ")})`;
    // a proven `pure` fn that makes nodes is made once where it is bound (MO-10a): the word the draft writes by a name
    if (answered.pure && f.makes && !/\binstantiates\b/.test(line) && !/\bref\b/.test(line)) { line = `${line} instantiates`; took.push("instantiates"); count.instantiates++; }
    // the questions above the row that are answered now
    for (let k = out.length - 1; k >= 0 && out[k].startsWith(`// TODO ${row.name}: `); k--) {
      const q = out[k].slice(`// TODO ${row.name}: `.length);
      if (/^pure\?/.test(q) && answered.pure) out.splice(k, 1);
      else if (/^what does its promise reject with\?/.test(q) && answered.rejects) out.splice(k, 1);
      // what it hands back is a value the code builds there (a record written out, a function, a primitive): no store
      else if (/^is the result a store with fields that wait or throw/.test(q) && f.plain) { out.splice(k, 1); note(row.name, "result", true, "what it hands back is built where it is written: no store whose fields wait or throw"); }
      else if (/: called later, outside any computation\?/.test(q)) { const names = q.split(": called later")[0].split(", "); const left = names.filter(n => !answered.events.has(n)); if (!left.length) out.splice(k, 1); else if (left.length < names.length) out[k] = `// TODO ${row.name}: ${left.join(", ")}: called later, outside any computation? mark ${left.length > 1 ? "each" : "it"} \`handler (…) => …\`, so a closure there may write sources (MO-10g)`; }
      else if (/^does it change /.test(q)) { const names = [...q.split(" in place?")[0].matchAll(/`([\w$]+)`/g)].map(x => x[1]); const left = names.filter(n => !answered.drafts.has(n)); if (!left.length) out.splice(k, 1); else if (left.length < names.length) out[k] = `// TODO ${row.name}: does it change ${left.map(n => `\`${n}\``).join(" or ")} in place? mark that parameter \`draft ${left[0]}\`, and a store's draft is given to it as it is (MO-10i)`; }
    }
    // (a component's question is written on its row's own element, before the row)
    if (line.startsWith("// TODO ")) { /* not a row */ }
    if (took.length) out.push(`//@ inferred ${row.name}: ${took.join(", ")}`);
    out.push(line);
  }
  // a component's row carries its question in the same element (`// TODO X: onA, onB: …\nexport component X…`)
  const total = count.pure + count.handler + count.rejects + count.draft + count.instantiates;
  const head = total ? [`// Read from the code that runs (MO-8v): ${[["pure", count.pure], ["handler", count.handler], ["rejects", count.rejects], ["draft", count.draft], ["instantiates", count.instantiates]].filter(([, n]) => n).map(([w, n]) => `${n} ${w}`).join(", ")} — each on a row marked \`//@ inferred\`, proven and not guessed; \`rx-declare --why\` says how, and why not for every other row.`] : [];
  return { lines: out, head, count, unread: total ? undefined : unread };
}

module.exports = { apply, paramTypes, parseRow, named, fnTypeAt, records };
