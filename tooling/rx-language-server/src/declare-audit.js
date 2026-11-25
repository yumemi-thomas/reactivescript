// MO-8w: a declaration's words, held against what the code shows. `rx-declare` writes a word only where the code proves it
// (src/words.js: compiler/words). This asks the same proof about the words a `.d.rx` already has, whoever wrote them, and
// sorts each into one of two:
//   proven        the code shows it: the word is one `rx-declare` would write (it is counted as read from the code,
//                 and `rx-verify` holds it to what the proof claims);
//   unproven      it does not: the reading stops at something it cannot see through, and says what (the thing a reviewer
//                 should check). It never says a word is false: a change of what a fn was given, on a line the reading
//                 reaches, may be on a path no call takes. A run shows that (rx-verify: a mismatch).
// Which words were read from the code is not written in the file:
// it is what this answers, from the code as it is installed now.
const path = require("node:path");
const { declares } = require("./load.js");

/** A row's words, as the crate read them (src/rows.js `facts`): each with the name it goes by here. */
function wordsOf(x) {
  const comp = x.kind === "component"; const f = x.facts;
  const handlers = comp ? f.props.filter(p => p.handler).map(p => ({ label: p.name, index: 0, field: p.name }))
    : (f.callbacks ?? []).filter(c => c.handler).map(c => ({ label: c.name, index: c.index, field: c.field ?? undefined }));
  const words = {
    pure: !!f.pure, handlers, drafts: comp ? [] : f.params.flatMap((p, index) => p.draft ? [{ name: p.name, index }] : []),
    rejects: x.obligations.includes("rejects") ? [...f.rejects].sort() : undefined, uses: f.uses ?? [], provides: f.provides ?? [], nests: f.nests && `${f.nests.kids} in ${f.nests.inside}`, renders: f.renders, instantiates: /\binstantiates\b/.test(x.text.replace(/"(?:[^"\\]|\\.)*"/g, "")),
  };
  words.all = [words.pure && "pure", ...handlers.map(h => `handler(${h.label})`), ...words.drafts.map(d => `draft(${d.name})`), words.rejects && `rejects(${words.rejects.join(" | ")})`, ...words.uses.map(n => `uses(${n})`), ...words.provides.map(n => `provides(${n})`), words.nests && `nests(${words.nests})`, words.renders && `renders(${words.renders})`, words.instantiates && "instantiates"].filter(Boolean);
  return words;
}

/** @param {object[]} rowsIn the declaration's rows (src/rows.js)  @returns {{ rows: { name, line, words: { word, verdict, why }[] }[], unread?: string }} */
function audit(spec, from, rowsIn, text) {
  const { words } = require("./words.js");
  const rel = f => path.relative(from, f).split(path.sep).join("/").replace(/^(?:\.\.\/)+node_modules\//, "").replace(/^node_modules\//, "");
  const at = w => w?.file ? ` [${rel(w.file)}:${w.line}]` : "";
  const asked = rowsIn.filter(r => (r.kind === "fn" || r.kind === "component") && r.facts.side !== "server").map(r => ({ row: r, w: wordsOf(r) })).filter(x => x.w.all.length);
  let r; try { r = words(spec, from, asked.map(({ row, w }) => ({ name: row.name, kind: row.kind, handlers: w.handlers.map(h => [h.index, h.field ?? null]), refs: [] })), [], text); } catch (e) { r = { unread: `the code could not be read (${String(e?.message ?? e).slice(0, 120)})`, exports: {} }; }
  // a context's name in the file ↔ the context the code makes: fixed by the first row that pairs them, held by the rest
  const ctxOfName = new Map(), nameOfCtx = new Map();
  const pair = (names, ctxs) => {
    const left = names.filter(n => !ctxOfName.has(n)), free = ctxs.filter(c => !nameOfCtx.has(c.key));
    if (left.length === 1 && free.length === 1) { ctxOfName.set(left[0], free[0].key); nameOfCtx.set(free[0].key, left[0]); }
    return names.map(n => ctxs.find(c => ctxOfName.get(n) === c.key));
  };
  const rows = [], pending = [];
  for (const row of rowsIn) {
    if (row.kind !== "fn" && row.kind !== "component") continue;
    const x = row.facts, w = wordsOf(row); if (!w.all.length) continue;
    const out = { name: row.name, line: row.line, kind: row.kind, words: [] };
    const say = (word, verdict, why) => out.words.push({ word, verdict, why });
    rows.push(out);
    if (x.side === "server") { for (const n of w.all) say(n, "unproven", "a server fn's row: its code is the server's, and is not read"); continue; }
    const f = r.unread ? { unread: r.unread } : r.exports[row.name] ?? { unread: "no code of that name" };
    if (f.unread) { for (const n of w.all) say(n, "unproven", `not read: ${f.unread}`); continue; }
    const why = f.pure?.why;
    // (a row that is an instantiation says which functions it answers do something, MO-10b: rx-declare reads that off the row it writes)
    const left = f.pure?.ok ? f.pure.parts?.[0] : undefined;
    if (w.pure) say("pure", f.pure?.ok && !left ? "proven" : "unproven", left ? `a function it answers (${left.path.join(".") || "itself"}) is not shown to only compute: ${left.why}${at(left)}` : `${why?.why ?? "not read"}${at(why)}`);
    for (const h of w.handlers) { const v = f.handlers?.[h.field === undefined ? String(h.index) : `${h.index}.${h.field}`]; say(`handler(${h.label})`, v?.ok ? "proven" : "unproven", `${v?.why ?? f.unplaced ?? "not read"}${at(v)}`); }
    for (const d of w.drafts) say(`draft(${d.name})`, "unproven", "whether the code changes what it is given in place, and keeps nothing of it, is not read");
    if (w.rejects) say(`rejects(${w.rejects.join(" | ")})`, "unproven", "what it throws is not read");
    if (w.instantiates) say("instantiates", f.instantiates?.ok ? "proven" : "unproven", `${f.instantiates?.why ?? f.unplaced ?? "not read"}${at(f.instantiates)}`);
    if (w.uses.length || w.provides.length) pending.push({ w, f, row, say });
    if (w.nests) say(`nests(${w.nests})`, "unproven", "how a component the fn makes nests what it is given is not read");
    if (w.renders) say(`renders(${w.renders})`, "unproven", "where the library renders what it is given is not read: a value kept in the module's state is followed no further");
  }
  // rows with one name and one context first: they fix the names
  for (const pass of [0, 1]) for (const p of pending) {
    const { w, f, row, say } = p, uses = f.uses ?? [], list = f.provides?.ok ? f.provides.list : [];
    if (w.uses.length && !p.usesDone && (pass === 1 || (w.uses.length === 1 && uses.length === 1))) {
      p.usesDone = true;
      const got = pair(w.uses, uses);
      w.uses.forEach((n, i) => say(`uses(${n})`, got[i] ? "proven" : "unproven", got[i] ? `useContext(${got[i].name}) on every path, with no default to answer${at(got[i])}` : uses.length ? "which context the name stands for is not shown" : "no context is shown to be read on every path: check that the fn fails where nothing provides it (rx-verify runs that)"));
    }
    if (w.provides.length && !p.providesDone && (pass === 1 || (w.provides.length === 1 && list.length === 1))) {
      p.providesDone = true;
      const got = pair(w.provides, list);
      w.provides.forEach((n, i) => say(`provides(${n})`, got[i] ? "proven" : "unproven", got[i] ? "everything it is given that may be a view is rendered among the provider's children" : row.kind !== "component" ? "a fn's row: what the component it makes provides is not read" : `${f.provides?.why?.why ?? "which context the name stands for is not shown"}${at(f.provides?.why)}`));
    }
  }
  return { rows, unread: r.unread };
}

/** A declaration file's words, each sorted (`audit`), or undefined where the file declares no JS module that is found
 *  (a host declaration, a package written in `.rx`). */
function auditFile(file) {
  const fs = require("node:fs"); const raw = fs.readFileSync(file, "utf8");
  if (/^\s*export\s+default\s+component\b/m.test(raw) || /^\s*\/\/@\s*signature\b/m.test(raw)) return undefined;
  const d = declares(file); if (!d) return undefined;
  let rows; try { rows = require("./rows.js").rowsOf(file); } catch { return undefined; }
  return { ...audit(d.spec, d.from, rows, () => require("./rxc.js").declaration(file).code), spec: d.spec, from: d.from };
}

module.exports = { audit, auditFile };
