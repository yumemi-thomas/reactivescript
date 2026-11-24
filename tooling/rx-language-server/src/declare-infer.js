// MO-8v: the words src/infer.js proves from the code, written into a draft's rows. A row takes `pure` before `fn`,
// `handler` before a callback's function type (a parameter's, a field's of a record parameter, a prop's of a
// component), `draft` before a parameter the fn changes in place, `rejects(A | B)` after the signature, and
// `instantiates` where a proven `pure` fn makes Solid nodes (what is asked of the rest: questions.js). The row is
// the notation's, with no new word and no new form (MO-8r), and both checkers read it as any row (08 CN-8).
// MO-8w: `uses(c)` and `provides(c)` are written too, with the `export context` rows they name (a `uses` only beside
// a `provides` of the same draft), and no row has a line above it: the draft's head says once how many words were
// read, `--causes` says which by export, and src/declare-audit.js reads them from the code again for whoever asks.
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
  // `lists`: the parameters whose type is the language's own list — "pairs" where its items are lists too
  const listOf = x => { if (x.isUnion()) return Math.min(...x.types.map(listOf)); if (x.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) return 2; if (checker.isArrayType(x) || checker.isTupleType(x)) return checker.getTypeArguments(x).every(y => checker.isArrayType(y) || checker.isTupleType(y)) ? 2 : 1; const n = x.symbol?.name; return !x.symbol?.declarations?.every(lib) ? 0 : /^(Readonly)?Map$/.test(n) ? 2 : /^(Readonly)?Set$/.test(n) ? 1 : 0; };
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
  // `objects`: the parameters whose type has methods at all, the platform's among them (a socket, an element): an
  // object, not data
  const methods = (x, depth = 0) => { if (depth > 3) return false; if (x.isUnion() || x.isIntersection()) return x.types.some(y => methods(y, depth)); if (x.flags & ts.TypeFlags.TypeParameter) { const c = checker.getBaseConstraintOfType(x); return !!c && c !== x && methods(c, depth + 1); } if (!(x.flags & ts.TypeFlags.Object) || x.getCallSignatures().length || checker.isArrayType(x) || checker.isTupleType(x)) return false; return x.getProperties().some(p => checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(p, imp)).getCallSignatures().length > 0); };
  const lists = new Map(), plain = new Set(), opaque = new Map(), objects = new Set();
  const n = Math.max(...sigs.map(g => g.getParameters().length));
  for (let i = 0; i < n; i++) {
    const ts_ = sigs.map(g => { const p = g.getParameters()[i]; if (!p) return undefined; const d = p.valueDeclaration; if (d && ts.isParameter(d) && d.dotDotDotToken) return null; return checker.getTypeOfSymbolAtLocation(p, imp); });
    if (ts_.every(x => x && isPrim(x))) plain.add(i);
    else if (ts_.every(x => x && listOf(x))) lists.set(i, ts_.every(x => listOf(x) === 2) ? "pairs" : "list");
    if (ts_.some(x => x && methods(x))) objects.add(i);
    if (ts_.some(x => x && own(x))) opaque.set(i, "self"); else if (ts_.some(x => x === null || (x && parts(x)))) opaque.set(i, "parts");
  }
  return { plain, lists, opaque, objects };
}

/** The props of the component `name` that may hold a view — an element, a component, a function that gives one, a list
 *  or a record of them, a type that is not known: what `provides(c)` must show is rendered beneath the provider. */
function viewProps(ts, checker, mod, imp, name) {
  const D = require("./declare.js");
  const [head, ...rest] = name.split(".");
  const sym0 = checker.getExportsOfModule(mod).find(s => s.name === head); if (!sym0) return { has: () => true, outside: () => true, surely: () => false };
  const sym = sym0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym0) : sym0;
  let t = checker.getTypeOfSymbolAtLocation(sym, imp);
  for (const r of rest) { const q = t.getProperty(r); if (!q) return { has: () => true, outside: () => true, surely: () => false }; t = checker.getTypeOfSymbolAtLocation(q, imp); }
  const sigs = checker.getNonNullableType(t).getCallSignatures(); if (!sigs.length) return { has: () => true, outside: () => true, surely: () => false };
  const out = new Set(); let all = false;
  const viewy = (x, d = 0) => {
    if (d > 3) return true;
    if (x.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter)) return true;
    if (x.isUnion() || x.isIntersection()) return x.types.some(y => viewy(y, d));
    if (D.isElement(ts, checker, x)) return true;
    if (!(x.flags & ts.TypeFlags.Object)) return false;
    const cs = x.getCallSignatures();
    if (cs.length) return cs.some(g => D.givesElement(ts, checker, g) || viewy(g.getReturnType(), d + 1));
    if (checker.isArrayType(x) || checker.isTupleType(x)) return checker.getTypeArguments(x).some(y => viewy(y, d + 1));
    const ps = x.getProperties(); if (ps.length > 40) return false;
    return ps.some(q => viewy(checker.getTypeOfSymbolAtLocation(q, imp), d + 1));
  };
  for (const g of sigs) { const p = g.getParameters()[0]; if (!p) continue; const pt = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(p, imp)); if (pt.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) { all = true; continue; } for (const q of pt.getProperties()) if (viewy(checker.getTypeOfSymbolAtLocation(q, imp))) out.add(q.name); }
  out.add("children");
  /** `outside(o)`: whether a use of the props outside a provider may be of a view — a field that may hold one, or the
   *  record whole, unless `omit` took every such field off it first. */
  // `surely(o)`: a use of a prop that is a view for certain — an element (`children`, a prop typed as one), which is
  // made where it is read; a function that gives a view is made where it is called, and is not one
  const sure = new Set();
  for (const g of sigs) { const p = g.getParameters()[0]; if (!p) continue; const pt = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(p, imp)); if (pt.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) continue; for (const q of pt.getProperties()) { const raw = checker.getTypeOfSymbolAtLocation(q, imp); const qt = checker.getNonNullableType(raw); if (D.isElement(ts, checker, raw) && !(qt.getCallSignatures().length && qt.getCallSignatures().every(c => c.getParameters().length > 0))) sure.add(q.name); } }
  return { has: f => all || out.has(f), surely: o => o.field !== null && sure.has(o.field), outside: o => o.field !== null ? all || out.has(o.field) : all || !o.except || [...out].some(n => !o.except.includes(n)) };
}

/** The parameters a row says are accessors (`ref list: T[]`): calling one answers the caller's value itself. */
const refsOf = (line, row) => new Set(row.params.map((part, i) => { const p = named(line, part); return p && /\bref\b/.test(p.words) ? i : -1; }).filter(i => i >= 0));

/** Whether a fn takes a tree it could nest (MO-11i): a parameter that is a record — or a list of records — with a
 *  component among its fields and a list of records among them. No such parameter, and `nests(…)` has nothing to say. */
function couldNest(ts, checker, mod, imp, name) {
  const D = require("./declare.js");
  const [head, ...rest] = name.split(".");
  const sym0 = checker.getExportsOfModule(mod).find(s => s.name === head); if (!sym0) return true;
  const sym = sym0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym0) : sym0;
  let t = checker.getTypeOfSymbolAtLocation(sym, imp);
  for (const r of rest) { const q = t.getProperty(r); if (!q) return true; t = checker.getTypeOfSymbolAtLocation(q, imp); }
  const elem = x => { x = checker.getNonNullableType(x); return checker.isArrayType(x) || checker.isTupleType(x) ? checker.getTypeArguments(x) : [x]; };
  const record = x => !!(x.flags & ts.TypeFlags.Object) && !x.getCallSignatures().length && !checker.isArrayType(x) && !checker.isTupleType(x);
  const tree = (x, d = 0) => {
    if (x.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter)) return true;
    if (x.isUnion() || x.isIntersection()) return x.types.some(y => tree(y, d));
    if (!record(x)) return false;
    const ps = x.getProperties(); if (ps.length > 80) return true;
    const types = ps.map(q => checker.getTypeOfSymbolAtLocation(q, imp));
    const comp = types.some(y => { const z = checker.getNonNullableType(y); return z.flags & ts.TypeFlags.Any || (z.isUnion() ? z.types : [z]).some(w => D.isComponent(ts, checker, w)); });
    const list = types.some(y => { const z = checker.getNonNullableType(y); return (checker.isArrayType(z) || checker.isTupleType(z)) && checker.getTypeArguments(z).some(w => record(checker.getNonNullableType(w)) || !!(w.flags & (ts.TypeFlags.Any | ts.TypeFlags.TypeParameter))); });
    return comp && list;
  };
  return checker.getNonNullableType(t).getCallSignatures().some(g => g.getParameters().some(p => elem(checker.getTypeOfSymbolAtLocation(p, imp)).some(x => tree(x))));
}

/** @param {string[]} lines the draft's lines (rows, and the questions above them)
 *  @param {(name: string) => object} typesOf what the row's types say of a fn's parameters (`paramTypes`)
 *  @param {object[]} [why] filled with what was proven and what was refused, word by word (`rx-declare --why`)
 *  @returns {{ lines: string[], head: string[], count: { pure, handler, rejects, draft, instantiates } }} */
function apply(ts, spec, from, lines, typesOf, why, more = {}) {
  const inf = require("./infer.js").create(ts, { solid: process.env.RX_INFER_SOLID !== "0" });
  // ---- contexts (MO-8w): a context a row names is declared by an `export context` row of the draft's own. One the
  // module exports is named after its export (`RouterContext` → router), any other after the name the code binds it to,
  // or after the provider or the hook that names it first. A module that has context rows already (a module
  // of the app's own that carries a library's) keeps them: nothing is named beside them.
  const hasContexts = lines.some(l => /^export context\b/.test(l));
  const ctxNames = new Map(), ctxRows = [];
  const taken = new Set(lines.flatMap(l => l.split("\n")).map(l => /^export\s+(?:(?:pure|server|client)\s+)*(?:fn|component|const|type|context|error)\s+([\w$.]+)/.exec(l)?.[1]).filter(Boolean));
  const exportedCtx = new Map();   // a context's key → the name the module exports it by
  for (const n of more.contexts ?? []) { try { const k = inf.contextKey(spec, from, n); if (k && !exportedCtx.has(k)) exportedCtx.set(k, n); } catch { /* not read */ } }
  const ownFiles = (() => { try { return inf.targets(spec, from); } catch { return []; } })();
  const pkgRoot = f => { for (let d = path.dirname(f); ; d = path.dirname(d)) { if (require("node:fs").existsSync(path.join(d, "package.json"))) return d; if (path.dirname(d) === d) return d; } };
  const roots = new Set(ownFiles.map(pkgRoot));
  /** Whether a context is the module's own to declare: made in the package's own files (a relative module: in the file itself). */
  const ownCtx = c => !hasContexts && (spec.startsWith(".") ? ownFiles.includes(c.m.file) : roots.has(pkgRoot(c.m.file)));
  const nameCtx = (c, rowName) => {
    if (ctxNames.has(c.key)) return ctxNames.get(c.key);
    const leaf = rowName.split(".").pop(); const strip = x => x.replace(/(Context|Ctx)$/, "");
    let base = exportedCtx.get(c.key) ?? c.name;
    if (!base || !strip(base) || /^(ctx|context|c)$/i.test(base)) base = /^(.+)Provider$/.exec(leaf)?.[1] ?? /^use(.+?)(?:Context)?$/.exec(leaf)?.[1] ?? leaf;
    // (`MDXContext` → mdx, `URLState` → urlState: a leading run of capitals is one word)
    let n = strip(base).replace(/^[^A-Za-z_$]+/, "").replace(/^[A-Z]+(?![a-z])|^[A-Z]+(?=[A-Z][a-z])|^[A-Z]/, w => w.toLowerCase()) || "context";
    // two contexts of one name (a kit's `ItemContext` in two of its files): the second by its file, `ratingItem`
    if (taken.has(n)) { const file = path.basename(c.m.file).replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9]+(.)?/g, (_, ch) => (ch ?? "").toUpperCase()).replace(/^[^A-Za-z_$]+/, "").replace(/^./, ch => ch.toLowerCase()); const q = file && !n.toLowerCase().startsWith(file.toLowerCase()) ? `${file}${n[0].toUpperCase()}${n.slice(1)}` : n; n = q; for (let k = 2; taken.has(n); k++) n = `${q}${k}`; }
    taken.add(n); ctxNames.set(c.key, n); ctxRows.push(`export context ${n}`);
    return n;
  };
  const words = {};             // export → the words read from the code (the benchmark's and rx-verify's count)
  const exportedAs = l => /^export\s+(?:(?:pure|server|client)\s+)*(?:fn|component|const|type|context|error)\s+([\w$.]+)/.exec(l)?.[1];
  const out = []; const count = { pure: 0, handler: 0, rejects: 0, draft: 0, instantiates: 0, uses: 0, provides: 0, ref: 0 };
  const errors = new Set(lines.map(l => /^export error ([\w$]+)/.exec(l)?.[1]).filter(Boolean));
  // (a package's file by the package: the same wherever it is installed)
  const rel = f => /[\\/]node_modules[\\/]/.test(f) ? f.split(/[\\/]node_modules[\\/]/).pop().split(path.sep).join("/") : path.relative(from, f).split(path.sep).join("/");
  const at = w => `${rel(w.file)}:${w.line}`;
  const note = (name, word, ok, reason) => { if (why) why.push({ name, word, ok, why: reason }); };
  let unread;
  const factsOf = new Map();
  const facts = (line, row) => { if (factsOf.has(row.name)) return factsOf.get(row.name); let f; try { f = inf.exportFacts(spec, from, row.name, row.kind === "fn" ? { ...typesOf(row.name), refs: refsOf(line, row) } : {}); } catch (e) { f = { unread: `the code could not be read (${String(e?.message ?? e).slice(0, 120)})` }; } factsOf.set(row.name, f); return f; };
  const viewsOf = new Map(); const views = name => { if (!viewsOf.has(name)) viewsOf.set(name, more.views ? more.views(name) : { has: () => true, outside: () => true, surely: () => false }); return viewsOf.get(name); };
  /** The contexts a component is shown to provide: a provider of it written in the code, and every prop that may hold
   *  a view rendered among that provider's children. */
  const providedBy = (row, f) => f.provides(0).list.filter(x => ownCtx(x.ctx) && x.inside.length && !x.outside.some(o => views(row.name).outside(o)));
  // a `uses(c)` is written only beside a `provides(c)` of the same draft: a context no row is shown to provide would
  // refuse every program that calls the hook, the correct ones with them (its provider is then a component the
  // reading did not get through, or another module's), and the question stays
  const provided = new Set();
  for (const l of lines) { const row = l.startsWith("export ") ? parseRow(l) : undefined; if (!row || row.kind !== "component" || /\b(uses|provides)\(/.test(l.slice(row.close + 1))) continue; const f = facts(l, row); if (!f || f.unread) continue; try { for (const x of providedBy(row, f)) provided.add(x.ctx.key); } catch { /* not read */ } }
  for (let li = 0; li < lines.length; li++) {
    let line = lines[li];
    let row = line.startsWith("export ") ? parseRow(line) : undefined;
    if (row?.kind === "fn" && more.unshaped) { const g = facts(line, row); line = more.unshaped(line, row.name, at => { let ok = false; try { ok = !!g && !g.unread && g.reads(at); } catch { /* not read */ } if (ok) count.ref++; note(row.name, `ref${at ? `(${at})` : ""}`, ok, ok ? "a reader: it only computes, from what Solid's nodes hold" : "only shaped as an accessor: the code does not show that calling it only reads"); return ok; }); row = parseRow(line); }
    if (!row || /\bserver\b/.test(row.words)) { out.push(line); continue; }
    const f = facts(line, row);
    if (!f || f.unread) { unread ??= f?.unread; note(row.name, "*", false, f?.unread ?? "no code"); out.push(line); continue; }
    const took = [];
    // insertions into the row, applied from its end so that the offsets before them stand
    const ins = [];
    // ---- handler: a callback parameter, a callback field of a record parameter, a callback prop
    const ask = (index, field, label, typeAt) => {
      const h = f.handler(index, field);
      if (h.ok) { ins.push([typeAt, "handler "]); took.push(`handler(${label})`); count.handler++; note(row.name, `handler(${label})`, true, [...new Set(h.uses.map(u => `${u.why} [${at(u)}]`))].slice(0, 3).join("; ")); return; }
      const bad = h.uses.find(u => u.how !== "later");
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
        if (d === "changes") { ins.push([p.nameAt, "draft "]); took.push(`draft(${p.name})`); count.draft++; const w = f.draftWhy(index); note(row.name, `draft(${p.name})`, true, `${w.why} [${at(w)}]`); }
        else if (d === "never") note(row.name, `draft(${p.name})`, false, "never changed: every use of it only reads");
      }
    });
    // ---- pure
    if (row.kind === "fn" && !/\bpure\b/.test(row.words)) {
      if (f.pure) { took.push("pure"); count.pure++; note(row.name, "pure", true, f.makes ? "its own code only computes, and makes Solid nodes of its own" : "its own code only computes"); }
      else { const w = f.why[0]; note(row.name, "pure", false, `${w.why} [${at(w)}]${w.via ? ` (called at ${at(w.via)})` : ""}`); }
    }
    // ---- rejects
    const tail = line.slice(row.close + 1);
    const promise = /^\s*:\s*Promise</.test(tail);
    if (row.kind === "fn" && promise && !/\brejects\(/.test(tail)) {
      if (f.rejects && f.rejects.every(n => errors.has(n))) {
        if (f.rejects.length) { took.push(`rejects(${f.rejects.join(" | ")})`); count.rejects++; note(row.name, "rejects", true, `every throw the code reaches is of ${f.rejects.join(", ")}`); }
        else note(row.name, "rejects", false, "the code reaches no throw of a class: nothing to name, and the default (Error) stands");
      } else note(row.name, "rejects", false, f.rejects ? `it throws ${f.rejects.filter(n => !errors.has(n)).join(", ")}, which the draft has no \`export error\` row for` : f.rejectsWhy);
    }
    for (const [pos, text] of ins.sort((a, b) => b[0] - a[0])) line = line.slice(0, pos) + text + line.slice(pos);
    if (took.includes("pure")) line = line.replace(/^export\s+((?:(?:server|client)\s+)*)fn\b/, (_, w) => `export ${w}pure fn`);
    if (took.some(t => t.startsWith("rejects("))) line = `${line} rejects(${f.rejects.join(" | ")})`;
    // a proven `pure` fn that makes nodes is made once where it is bound (MO-10a): the word the draft writes by a name
    // (one that is not `pure`: where it makes what its owner keeps on every path, whatever else it does — MO-10a's word says
    // where the call is made, not what it changes. One that hands back an undo, or a promise, is called elsewhere
    // too; a capital is a component's, by 07 §4). A `ref` implies the word; a generated declaration writes it where it
    // is proven, since a type alone refuses no call in a handler there (MO-8l)
    const makes = row.kind === "fn" && !/\binstantiates\b/.test(line) && (more.written || !/\bref\b/.test(line)) && (f.pure || !/^[A-Z]/.test(row.name));
    const not = !makes || f.pure ? undefined : /^\s*:\s*(?:Promise\b|\(\s*\)\s*=>\s*(?:void|undefined)\s*$|VoidFunction\s*$)/.test(tail) ? { why: "it hands back a promise, or what undoes the call: called in a handler or an effect as well" } : f.unbound();
    if (makes && !f.pure) note(row.name, "instantiates", !not, not ? `${not.why}${not.file ? ` [${at(not)}]` : ""}` : "it makes what its owner keeps, on every path that returns");
    if (makes && (f.pure ? took.includes("pure") && f.makes : !not)) { line = `${line} instantiates`; took.push("instantiates"); count.instantiates++; }
    // ---- uses(c): a context every call reads, and throws without; provides(c): a provider around all it is given
    if (!/\b(uses|provides)\(/.test(line.slice(row.close + 1))) {
      const u = f.uses; const must = u.must.filter(c => ownCtx(c) && provided.has(c.key));
      const doubt = [...u.may.map(c => ({ why: `it reads ${c.name ?? "a context"} on some path only, or when what it hands back is called`, ...c.at })), ...u.must.filter(c => !ownCtx(c)).map(c => ({ why: `it reads ${c.name ?? "a context"}, which another module makes`, ...c.at })), ...u.must.filter(c => ownCtx(c) && !provided.has(c.key)).map(c => ({ why: `it reads ${c.name ?? "a context"} on every path, and no component of this module is shown to provide it (its provider is another module's, or one the reading does not get through)`, ...c.at })), ...u.opaque];
      if (must.length) { const ns = must.map(c => nameCtx(c, row.name)); line = `${line.replace(/ instantiates$/, "")} uses(${ns.join(", ")})`; for (const n of ns) { took.push(`uses(${n})`); count.uses++; } note(row.name, `uses(${ns.join(", ")})`, true, must.map(c => `useContext(${c.name ?? "…"}) on every path, with no default to answer [${at(c.at)}]`).join("; ")); }
      if (doubt.length) note(row.name, "uses", false, `${doubt[0].why} [${at(doubt[0])}]`); else if (!must.length) note(row.name, "uses", false, "it reads no context: every call it makes is read, and none asks for one");
      if (row.kind === "component") {
        const pv = f.provides(0); const yes = providedBy(row, f).filter(x => pv.list.some(y => y.ctx.key === x.ctx.key));
        for (const x of pv.list) if (!yes.some(y => y.ctx.key === x.ctx.key)) { const o = x.outside.find(q => views(row.name).outside(q)); note(row.name, `provides(${x.ctx.name ?? "…"})`, false, !ownCtx(x.ctx) ? "the context is another module's" : o ? `${o.field === null ? "its props go" : `${o.field} is read`} outside the provider: ${o.why} [${at(o)}]` : "nothing it is given is rendered beneath the provider"); }
        if (yes.length) { const ns = yes.map(x => nameCtx(x.ctx, row.name)); line = `${line} provides(${ns.join(", ")})`; for (const n of ns) { took.push(`provides(${n})`); count.provides++; } note(row.name, `provides(${ns.join(", ")})`, true, yes.map(x => `everything it is given is rendered among <${x.ctx.name ?? "the context"} value>'s children [${at(x.inside[0])}]`).join("; ")); }
      }
    }
    if (took.length) words[row.name] = took;
    out.push(line);
  }
  if (ctxRows.length) { const at0 = out.findIndex(l => !l.startsWith("//") || /^\/\/ TODO /.test(l)); out.splice(at0 < 0 ? 0 : at0, 0, ...ctxRows); }
  const total = Object.values(count).reduce((a, b) => a + b, 0);
  // one line for the whole draft (MO-8w): which words were read is not written row by row — it is what the code shows,
  // and `rx-verify` and `rx-declare --why` say it again from the code whenever they are asked
  const head = total ? [`// Read from the code that runs (MO-8v): ${Object.entries(count).filter(([, n]) => n).map(([w, n]) => `${n} ${w}`).join(", ")} — read, not guessed. Which words, and how: \`rx-declare --why\`; \`rx-verify\` tells them from the words written by hand, and runs each.`] : [];
  return { lines: out, head, count, words, unread: total ? undefined : unread, facts: name => factsOf.get(name), provided, outside: (name, o) => views(name).outside(o), at };
}

module.exports = { apply, paramTypes, viewProps, couldNest, refsOf, parseRow, named, fnTypeAt, records };
