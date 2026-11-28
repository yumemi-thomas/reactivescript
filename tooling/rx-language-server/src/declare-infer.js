// MO-8v, MO-8w: the words the code proves, written into a draft's rows. The proof is the crate's (compiler/words,
// DESIGN.md there says what each word's is); this asks it once for the whole draft and writes the answers into the text of
// the rows: `pure` before `fn`, `handler` before a callback's function type (a parameter's, a field's of a record parameter,
// a prop's of a component), `instantiates`, `uses(c)`, `provides(c)` after the
// signature, `ref` on a part only shaped as an accessor, and the `export context` rows they name (a `uses` only beside a
// `provides` of the same draft). No row has a line above it: the draft's head says once how many words were read, `--why`
// says the proof of each, and src/declare-audit.js asks again for whoever wonders.
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

/** What is asked of a row's code: its callbacks (by parameter, or by field of a record one) and the parts shaped as accessors. */
function asks(line, row) {
  const handlers = [];
  row.params.forEach((part, index) => {
    const p = named(line, part); if (!p || p.rest) return;
    if (row.kind === "fn" && fnTypeAt(line, p.type, p.end)) { handlers.push({ index, field: null, label: p.name, at: p.type }); return; }
    if (/^handler\b/.test(line.slice(p.type))) return;
    for (const fields of records(line, p.type, p.end)) for (const fp of fields) {
      const q = named(line, fp); if (!q || /^handler\b/.test(line.slice(q.type)) || !fnTypeAt(line, q.type, q.end)) continue;
      handlers.push({ index, field: q.name, label: row.kind === "component" ? q.name : `${p.name}.${q.name}`, at: q.type });
    }
  });
  return handlers;
}
/** The word `ref` in a row: before a type (`: ref T`, `[ref T`) or a parameter's name (`(ref x: T`), not a field of that name. */
const REF_WORD = /(?:^|[^\w$.])ref\s+(?![:?])/;
const pkgRoot = f => { for (let d = path.dirname(f); ; d = path.dirname(d)) { if (require("node:fs").existsSync(path.join(d, "package.json"))) return d; if (path.dirname(d) === d) return d; } };

const notMade = (result, name) => /^(?:Promise\b|\(\s*\)\s*=>\s*(?:void|undefined)\s*$|VoidFunction\s*$)/.test(result) ? "it hands back a promise, or what undoes the call: called in a handler or an effect as well" : /^[A-Z]/.test(name) ? "a component's name" : undefined;
/** Whether the row's call is an instantiation (MO-10a): a `ref`, or the word itself, written or about to be. */
const instantiating = (line, row, f) => {
  const tail = line.slice(row.close + 1), result = /^\s*:\s*(.*)$/s.exec(tail)?.[1] ?? "";
  if (/\s(?:instantiates$|uses\([^()]*\)$)/.test(tail) || (f.instantiates?.ok && !notMade(result, row.name))) return true;
  if (row.params.some(part => /\bref\s/.test(named(line, part)?.words ?? ""))) return true;
  const t = result.trim().replace(/^readonly\s+/, "");
  const reads = x => /^ref\s/.test(x.replace(/^(?:readonly\s+)?[\w$]+\??:\s*/, ""));
  return /^ref\s/.test(t) || (t[0] === "[" && split(t, 1, t.lastIndexOf("]"), ",").some(x => reads(x.text))) || (t[0] === "{" && split(t, 1, t.lastIndexOf("}"), ";").some(x => /^(?:readonly\s+)?[\w$]+\??:/.test(x.text) && reads(x.text)));
};
/** Whether the part of a result at `path` (the whole, a tuple's item, a record's field) is written a function that answers
 *  nothing, or a promise: one a view may not call. */
function acts(result, path) {
  const fn = t => /^\(.*\)$/s.test(t) && !fnTypeAt(t, 0, t.length) ? fn(t.slice(1, -1).trim()) : fnTypeAt(t, 0, t.length) && /=>\s*(?:void|Promise<[^]*>)\s*$/.test(t) && !/\|/.test(t.replace(/^\([^]*\)\s*=>/, ""));
  const t = result.trim().replace(/^readonly\s+/, "");
  if (!path.length) return fn(t);
  if (path.length > 1) return false;
  if (t[0] === "[" && t.endsWith("]")) { const x = split(t, 1, t.length - 1, ",")[Number(path[0])]; return !!x && fn(x.text.replace(/^[\w$]+\??:\s*/, "")); }
  if (t[0] === "{" && t.endsWith("}")) { const x = split(t, 1, t.length - 1, ";").find(y => new RegExp(`^(?:readonly\\s+)?${path[0].replace(/\$/g, "\\$")}\\??:`).test(y.text)); return !!x && fn(x.text.replace(/^(?:readonly\s+)?[\w$]+\??:\s*/, "")); }
  return false;
}

/** Whether `text` is one function type in parentheses and nothing else: `((x: T) => U)`. `((x: T) => U) | undefined`, a
 *  function that may be absent, is not (a part that may be absent is no bare function). */
function wrappedFn(text) {
  if (text[0] !== "(" || text[text.length - 1] !== ")") return false;
  let d = 0;
  for (let k = 0; k < text.length; k++) {
    const ch = text[k];
    if (ch === '"' || ch === "'" || ch === "`") { const q = ch; k++; while (k < text.length && text[k] !== q) { if (text[k] === "\\") k++; k++; } continue; }
    if (ch === "=" && text[k + 1] === ">") { k++; continue; }
    if ("([{<".includes(ch)) d++; else if (")]}>".includes(ch)) { d--; if (d === 0 && k < text.length - 1) return false; }
  }
  const inner = text.slice(1, -1).trim();
  return fnTypeAt(inner, 0, inner.length) || wrappedFn(inner);
}

/** MO-10b (2026-11-26): where in `result` the function type of the part at `path` begins — the whole result, an item of
 *  its tuple or a field of its record — or -1: no function type is written there for a word to stand before. */
function fnPartAt(result, path) {
  const lead = result.length - result.trimStart().length, t = result.trim(), ro = /^readonly\s+/.exec(t)?.[0].length ?? 0, body = t.slice(ro);
  // a function type written out, or one in parentheses (a whole result is drafted `((x: T) => U)`): the word stands
  // before either, and both checkers read it there (`io ((x: T) => U)`)
  const at = (text, from) => fnTypeAt(text, 0, text.length) || wrappedFn(text) ? from : -1;
  if (!path.length) return ro ? -1 : at(t, lead);
  if (path.length > 1) return -1;
  if (body[0] === "[" && body.endsWith("]")) { const x = split(body, 1, body.length - 1, ",")[Number(path[0])]; if (!x) return -1; const l = /^[\w$]+\??:\s*/.exec(x.text)?.[0].length ?? 0; return at(x.text.slice(l), lead + ro + x.from + l); }
  if (body[0] === "{" && body.endsWith("}")) { const x = split(body, 1, body.length - 1, ";").find(y => new RegExp(`^(?:readonly\\s+)?${path[0].replace(/\$/g, "\\$")}\\??:`).test(y.text)); if (!x) return -1; const l = /^(?:readonly\s+)?[\w$]+\??:\s*/.exec(x.text)[0].length; return at(x.text.slice(l), lead + ro + x.from + l); }
  return -1;
}

/** MO-10b: whether a row's line marks the part of its result at `path` `io`. */
function ioMarked(line, path) {
  const row = parseRow(line); if (!row) return false;
  const t = (/^\s*:\s*(.*)$/s.exec(line.slice(row.close + 1))?.[1] ?? "").trim().replace(/^readonly\s+/, "");
  const io = x => /^io\s+\(/.test(x);
  if (!path.length) return io(t);
  if (path.length > 1) return false;
  if (t[0] === "[") { const end = t.lastIndexOf("]"); const x = split(t, 1, end, ",")[Number(path[0])]; return !!x && io(x.text.replace(/^[\w$]+\??:\s*/, "")); }
  if (t[0] === "{") { const end = t.lastIndexOf("}"); const x = split(t, 1, end, ";").find(y => new RegExp(`^(?:readonly\\s+)?${path[0].replace(/\$/g, "\\$")}\\??:`).test(y.text)); return !!x && io(x.text.replace(/^(?:readonly\s+)?[\w$]+\??:\s*/, "")); }
  return false;
}

/** @param {string[]} lines the draft's lines (rows, and the questions above them)
 *  @param {object[]} [why] filled with what was proven and what was refused, word by word (`rx-declare --why`)
 *  @param {{ unshaped?, contexts?, written? }} more `unshaped(line, name, reads)`: the row with each part only shaped as an
 *  accessor the function it is, where `reads(path)` does not say it is a reader
 *  @returns {{ lines: string[], head: string[], count: object, words: object, unread?: string, facts: (name) => object | undefined }} */
function apply(spec, from, lines, why, more = {}) {
  const hasContexts = lines.some(l => /^export context\b/.test(l));
  const rows = lines.map(l => l.startsWith("export ") ? parseRow(l) : undefined);
  const ask = [];
  lines.forEach((l, i) => {
    const row = rows[i]; if (!row || /\bserver\b/.test(row.words) || ask.some(a => a.name === row.name)) return;
    const refs = []; if (row.kind === "fn" && more.unshaped) more.unshaped(l, row.name, at => { refs.push(at); return true; });
    // (a view or a function that gives one, `(() => View)`, is no callback of the row's: how it is called is a question's)
    const views = row.params.flatMap((part, i) => row.kind === "fn" && /^\(\(/.test(l.slice(named(l, part)?.type ?? l.length)) ? [[i, null]] : []);
    ask.push({ name: row.name, kind: row.kind, handlers: [...asks(l, row).map(h => [h.index, h.field]), ...views], refs });
  });
  let r; try { r = require("./words.js").words(spec, from, ask, more.contexts ?? []); } catch (e) { r = { unread: `the code could not be read (${String(e?.message ?? e).slice(0, 160)})`, exports: {}, contexts: {} }; }
  const facts = name => r.unread ? { unread: r.unread } : r.exports[name] ?? { unread: "no code of that name" };

  // ---- contexts (MO-8w): a context a row names is declared by an `export context` row of the draft's own. One the module
  // exports is named after its export, any other after the name the code binds it to. A module that has context rows already
  // keeps them: nothing is named beside them.
  const ctxNames = new Map(), ctxRows = [], taken = new Set(lines.flatMap(l => l.split("\n")).map(l => /^export\s+(?:(?:pure|server|client)\s+)*(?:fn|component|const|type|context|error)\s+([\w$.]+)/.exec(l)?.[1]).filter(Boolean));
  const exportedCtx = new Map(Object.entries(r.contexts ?? {}).map(([n, k]) => [k, n]));
  const files = r.files ?? [], roots = new Set(files.map(pkgRoot));
  /** Whether a context is the module's own to declare: made in the package's own files (a relative module: in the file itself). */
  const ownCtx = c => !hasContexts && (spec.startsWith(".") ? files.includes(c.of) : roots.has(pkgRoot(c.of)));
  const nameCtx = (c, rowName) => {
    if (ctxNames.has(c.key)) return ctxNames.get(c.key);
    const leaf = rowName.split(".").pop(), strip = x => x.replace(/(Context|Ctx)$/, "");
    let base = exportedCtx.get(c.key) ?? c.name;
    if (!base || !strip(base) || /^(ctx|context|c)$/i.test(base)) base = /^(.+)Provider$/.exec(leaf)?.[1] ?? /^use(.+?)(?:Context)?$/.exec(leaf)?.[1] ?? leaf;
    let n = strip(base).replace(/^[^A-Za-z_$]+/, "").replace(/^[A-Z]+(?![a-z])|^[A-Z]+(?=[A-Z][a-z])|^[A-Z]/, w => w.toLowerCase()) || "context";
    if (taken.has(n)) { const file = path.basename(c.of).replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9]+(.)?/g, (_, ch) => (ch ?? "").toUpperCase()).replace(/^[^A-Za-z_$]+/, "").replace(/^./, ch => ch.toLowerCase()); const q = file && !n.toLowerCase().startsWith(file.toLowerCase()) ? `${file}${n[0].toUpperCase()}${n.slice(1)}` : n; n = q; for (let k = 2; taken.has(n); k++) n = `${q}${k}`; }
    taken.add(n); ctxNames.set(c.key, n); ctxRows.push(`export context ${n}`);
    return n;
  };
  const provided = new Set(rows.flatMap(row => { if (row?.kind !== "component") return []; const f = facts(row.name); return f.provides?.ok ? f.provides.list.filter(ownCtx).map(c => c.key) : []; }));

  const rel = f => /[\\/]node_modules[\\/]/.test(f) ? f.split(/[\\/]node_modules[\\/]/).pop().split(path.sep).join("/") : path.relative(require("node:fs").realpathSync(from), f).split(path.sep).join("/");
  const at = w => w?.file ? `${rel(w.file)}:${w.line}` : "";
  const placed = w => w?.file ? ` [${at(w)}]` : "";
  const note = (name, word, ok, reason) => { if (why) why.push({ name, word, ok, why: reason }); };
  const words = {}, out = [], count = { pure: 0, handler: 0, instantiates: 0, uses: 0, provides: 0, ref: 0 };
  let unread;
  for (let line of lines) {
    let row = line.startsWith("export ") ? parseRow(line) : undefined;
    const f = row && !/\bserver\b/.test(row.words) ? facts(row.name) : undefined;
    if (row?.kind === "fn" && more.unshaped) {
      line = more.unshaped(line, row.name, p => { const ok = !!f && !f.unread && !!f.refs?.includes(p); if (ok) count.ref++; note(row.name, `ref${p ? `(${p})` : ""}`, ok, ok ? "every return hands out there what Solid made: a memo, or a signal's getter" : "only shaped as an accessor: the code does not show that calling it only reads"); return ok; });
      row = parseRow(line);
    }
    if (!f) { out.push(line); continue; }
    if (f.unread) { if (r.unread) unread ??= f.unread; note(row.name, "*", false, f.unread); out.push(line); continue; }
    const took = [], ins = [];
    for (const h of asks(line, row)) {
      const v = f.handlers?.[h.field === null ? String(h.index) : `${h.index}.${h.field}`]; if (!v) continue;
      note(row.name, `handler(${h.label})`, v.ok, `${v.why ?? ""}${placed(v)}`);
      if (v.ok) { ins.push([h.at, "handler "]); took.push(`handler(${h.label})`); count.handler++; }
    }
    const tail = line.slice(row.close + 1), result = /^\s*:\s*(.*)$/s.exec(tail)?.[1] ?? "";
    if (row.kind === "fn" && !/\bpure\b/.test(row.words)) {
      // a function of what it answers that is not shown to only compute: the row says it is one that does something, where a
      // call of it in a view is refused (MO-10b: bound by a name, or of a record's field that answers nothing), or the fn is not pure
      // …or, where the row writes that part a function type, the row marks it `io` and stays pure: calling the fn only
      // computes, and the function it answers is called from a handler or an action (MO-10b, 2026-11-26)
      const acting = p => instantiating(line, row, f) && p.callable && acts(result, p.path);
      const marks = (f.pure?.parts ?? []).filter(p => !acting(p) && p.callable && fnPartAt(result, p.path) >= 0);
      const left = (f.pure?.parts ?? []).find(p => !acting(p) && !marks.includes(p));
      const pure = f.pure?.ok && !left;
      if (pure) for (const at of [...new Set(marks.map(p => line.length - result.length + fnPartAt(result, p.path)))]) { ins.push([at, "io "]); took.push("io"); count.io = (count.io ?? 0) + 1; }
      note(row.name, "pure", !!pure, left ? `a function it answers (${left.path.join(".") || "itself"}) is not shown to only compute: ${left.why}${placed(left)}` : `${f.pure?.why?.why ?? "not read"}${placed(f.pure?.why)}`);
      if (pure) { took.push("pure"); count.pure++; }
    }
    for (const [pos, text] of ins.sort((a, b) => b[0] - a[0])) line = line.slice(0, pos) + text + line.slice(pos);
    if (took.includes("pure")) line = line.replace(/^export\s+((?:(?:server|client)\s+)*)fn\b/, (_, w) => `export ${w}pure fn`);
    // a call that hands back a promise, or what undoes it, is made in an action or an effect too; a capital is a component's (07 §4)
    // (the word `ref`, before a type or a parameter's name: a field may be named `ref`, `{ ref: (el: T) => void }`)
    const makes = row.kind === "fn" && !/\binstantiates\b/.test(line) && (more.written || !REF_WORD.test(line));
    if (makes && f.instantiates) {
      const not = notMade(result, row.name);
      const ok = f.instantiates.ok && !not;
      note(row.name, "instantiates", ok, not ?? `${f.instantiates.why}${placed(f.instantiates)}`);
      if (ok) { line = `${line} instantiates`; took.push("instantiates"); count.instantiates++; }
    }
    // an effect with no `instantiates` beside it belongs to no one: the row says neither
    if (took.includes("pure") && f.pure.owned && !/\binstantiates\b/.test(line) && !REF_WORD.test(line)) { line = line.replace(/^export\s+((?:(?:server|client)\s+)*)pure fn\b/, (_, w) => `export ${w}fn`); took.splice(took.indexOf("pure"), 1); count.pure--; note(row.name, "pure", false, "it makes an effect or a cleanup, and the row does not say it is made once"); }
    if (!/\b(uses|provides)\(/.test(line.slice(row.close + 1))) {
      const must = (f.uses ?? []).filter(c => ownCtx(c) && provided.has(c.key));
      if (must.length) { const ns = must.map(c => nameCtx(c, row.name)); line = `${line.replace(/ instantiates$/, "")} uses(${ns.join(", ")})`; if (took.includes("instantiates")) { took.splice(took.indexOf("instantiates"), 1); count.instantiates--; } for (const n of ns) { took.push(`uses(${n})`); count.uses++; } note(row.name, `uses(${ns.join(", ")})`, true, must.map(c => `useContext(${c.name}) on every path, with no default to answer${placed(c)}`).join("; ")); }
      else if (f.uses?.length) note(row.name, "uses", false, `it reads ${f.uses[0].name} on every path, and no component of this module is shown to provide it${placed(f.uses[0])}`);
      if (row.kind === "component" && f.provides) {
        const own = f.provides.ok ? f.provides.list.filter(ownCtx) : [];
        if (own.length) { const ns = own.map(c => nameCtx(c, row.name)); line = `${line} provides(${ns.join(", ")})`; for (const n of ns) { took.push(`provides(${n})`); count.provides++; } note(row.name, `provides(${ns.join(", ")})`, true, "everything it is given that may be a view is rendered among the provider's children"); }
        else note(row.name, "provides", false, f.provides.ok ? "the context is another module's" : `${f.provides.why?.why ?? ""}${placed(f.provides.why)}`);
      }
    }
    if (took.length) words[row.name] = took;
    out.push(line);
  }
  if (ctxRows.length) { const at0 = out.findIndex(l => !l.startsWith("//") || /^\/\/ TODO /.test(l)); out.splice(at0 < 0 ? 0 : at0, 0, ...ctxRows); }
  const total = Object.values(count).reduce((a, b) => a + b, 0);
  const head = total ? [`// Read from the code that runs (MO-8v): ${Object.entries(count).filter(([, n]) => n).map(([w, n]) => `${n} ${w}`).join(", ")} — read, not guessed. Which words, and how: \`rx-declare --why\`; \`rx-verify\` tells them from the words written by hand, and runs each.`,
    `// Read as it is loaded by \`import\`, under Node, and under Vite's client and server builds, development and production, with the \`solid\` condition and without${r.conditions?.length ? `; and under ${r.conditions.map(c => `\`${c}\``).join(", ")}` : ""}. What \`require\` loads is not read.`] : [];
  return { lines: out, head, count, words, unread: total ? undefined : unread, facts, provided, at };
}

/** Whether a row's line says of the function part at `p.path` what `pure` needs said of one not shown to only compute
 *  (MO-10b): it is marked `io`, or the row is an instantiation and writes the part a function that answers nothing or a
 *  promise, which a view may not call. What the writer above takes, for whoever reads a row already written (the audit). */
function partSaid(line, p, f) {
  if (ioMarked(line, p.path)) return true;
  const row = parseRow(line); if (!row || !p.callable) return false;
  const result = /^\s*:\s*(.*)$/s.exec(line.slice(row.close + 1))?.[1] ?? "";
  return instantiating(line, row, f ?? {}) && acts(result.replace(/\s+(?:instantiates|(?:uses|provides|rejects|nests|renders)\([^()]*\))(?=\s|$)/g, ""), p.path);
}

module.exports = { apply, parseRow, named, fnTypeAt, records, ioMarked, partSaid };
