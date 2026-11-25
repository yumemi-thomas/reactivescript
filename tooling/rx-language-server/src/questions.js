// The questions a draft asks (`// TODO <export>: …`). One is asked only where its answer changes what a checker does, by
// one rule and no name:
//   - a word the code proves is written, and one it refutes is not: neither is asked about;
//   - a word that leaves the row's reading as it is (`reading`) is not asked about, nor is what no word of a row can say;
//   - where the code was read, a word is asked about only on a sign of it: an answer with no effect shown, or something
//     made, for `pure` and `instantiates`; a callback that answers nothing, kept or handed where it is not followed, for `handler`; an argument
//     written, for `draft`; a context every call reads that no row is shown to provide, for `uses` and `provides`. Where
//     it was not read, the words whose absence refuses a correct program are: `pure`, `handler`, `draft`.
// Each says what the row does now, what the word changes and why it is not proven (file:line). Of one row, the words
// whose absence refuses a correct program come first. test/infer.js and bench/generated.mjs (`readings`) hold it.
const { rowsOf } = require("./rows.js");
const { named, records } = require("./declare-infer.js");

/** A row as both checkers read it, from its `facts` (src/rows.js): two rows with one reading get one verdict in every
 *  program whose imports say nothing. An instantiation (MO-10a) is called where it is bound, so its `pure` and its
 *  `rejects` are not read; a closure given to an io fn is given where a closure may write already, so its `handler` is not. */
function reading(x) {
  if (x.props) return JSON.stringify(x);
  const { pure, side, rejects, instantiates, callbacks, ...rest } = x;
  if (instantiates) return JSON.stringify({ ...rest, callbacks });
  return JSON.stringify({ ...rest, pure, side, rejects: /^\s*Promise</.test(x.result ?? "") ? rejects : null, callbacks: pure ? callbacks : null });
}
const changes = (x, word) => reading({ ...x, ...word }) !== reading(x);
const asHandler = (x, label) => ({ callbacks: x.callbacks.map(c => c.name === label ? { ...c, handler: true } : c) });

/** Whether the code shows a fn not to be `pure`: what stopped the reading is something the fn does. */
const refuted = f => /^it (?:writes (?!a list)|changes what it was given|changes in place (?:a list that is not|what it was)|reads [\w$]+: the environment|asks for a random|calls a function that answers nothing)/.test(f.pure?.why?.why ?? "");
/** Whether the code shows a callback to be called while its fn runs, or never. */
const settled = h => !h || /^(?:called while the call runs|called in a computation|never called|called as the module loads)/.test(h.why ?? "");

/** Whether a callback answers nothing — called for what it does, as a handler is: its type, or a record's field's. */
function acts(type, field) {
  if (!type) return false;
  if (field) { const q = records(type, 0, type.length).flat().map(p => named(type, p)).find(q => q?.name === field); return !!q && acts(type.slice(q.type, q.end)); }
  let d = 0, at = -1; for (let i = 0; i < type.length; i++) { if (type[i] === "=" && type[i + 1] === ">") { if (!d) at = i + 2; i++; } else if ("([{<".includes(type[i])) d++; else if (")]}>".includes(type[i])) d--; }
  return at >= 0 && type.slice(at).split("|").some(t => /^[\s(]*(void|undefined|Promise<void>)[\s)]*$/.test(t));
}

/** What a question is about, for who counts them. */
const kindOf = q => /`pure fn`|`instantiates`/.test(q) ? "pure" : /`handler /.test(q) ? "handler" : /`draft /.test(q) ? "draft" : /`renders\(/.test(q) ? "renders" : /`nests\(/.test(q) ? "nests" : /`uses\(/.test(q) ? "uses" : /`rejects\(/.test(q) ? "rejects" : /signatures/.test(q) ? "overloads" : /`any` here/.test(q) ? "any" : "other";

/** The draft's lines with its questions. A row may have lines of candidates above it (`// TODO <export>: {…}`, what
 *  declare.js saw in its types); those asked about become questions, the rest go.
 *  @param {(name: string) => object | undefined} factsOf the reading of an export's code (src/words.js)
 *  @param {{ at?, provided? }} more */
function ask(lines, factsOf, more = {}) {
  const rows = facts(lines), out = [];
  const errors = rows.some(r => r.kind === "error"), comps = rows.some(r => r.kind === "component");
  const byName = new Map(rows.map(r => [r.name, r]));
  const contexts = openContexts(rows, factsOf, more);
  let held = [];
  for (const line of lines) {
    const c = /^\/\/ TODO ([\w$.]+): (\{.*\})$/.exec(line);
    if (c) { held.push(JSON.parse(c[2])); continue; }
    const row = /^export\s/.test(line) ? byName.get(/^export\s+(?:(?:pure|server|client)\s+)*(?:fn|component)\s+([\w$.]+)/.exec(line)?.[1]) : undefined;
    if (row) for (const q of questions(row, held)) out.push(`// TODO ${row.name}: ${q}`);
    for (const h of row ? held.filter(h => h.ask === "note") : []) out.push(`// ${row.name}: ${h.text}`);
    held = [];
    out.push(line);
  }
  return out;

  function questions(row, seen) {
    const x = row.facts, f0 = factsOf(row.name), f = f0 && !f0.unread ? f0 : undefined;
    if (x.side === "server") return [];
    const unread = () => `. Not read: ${(f0?.unread ?? "drafted from the types alone").replace(/ \(a value made by a call .*?\)/, "")}`;
    const because = w => w ? `. Not proven: ${w.why.split(", which is not proven: ").pop().replace(/^(?:[\w$]+: )+(?=[a-z])/, "")}${w.file && more.at ? ` (${more.at(w)})` : ""}` : unread();
    const q = [], said = k => seen.find(s => s.ask === k), list = ns => ns.map(n => `\`${n}\``).join(", ");
    if (row.kind === "component") {
      const open = x.props.filter(p => p.function && !p.handler && !p.render && !p.component && !p.components && acts(p.type));
      handlers(open.map(p => ({ label: p.name, index: 0, field: p.name })));
    } else {
      // ---- pure, instantiates: the call itself
      const makes = !!f?.pure?.makes;
      const result = x.result?.trim(), disposer = /^\(\s*\)\s*=>\s*(void|undefined)$/.test(result ?? "");
      const pure = result !== "void" && !x.params.some(p => p.draft) && changes(x, { pure: true }) && !(f && refuted(f));
      const owned = makes && !disposer && !/^Promise\b/.test(result ?? "") && changes(x, { instantiates: true });
      const words = [pure && "`pure fn` if it only computes", owned && "`instantiates` if every call makes what its owner keeps"].filter(Boolean);
      if (words.length) q.push(`io as drafted, refused in a view or an equation. ${words.join(", ")}${because(f && (pure ? f.pure?.why : f.instantiates))}`);
      // ---- handler: where the row, as it is or with the word asked above, reads its callbacks
      const as = pure ? { ...x, pure: true } : owned ? { ...x, instantiates: true } : x;
      handlers(x.callbacks.filter(c => !c.handler && acts(x.params[c.index]?.type, c.field) && changes(as, asHandler(as, c.name))).map(c => ({ label: c.name, index: c.index, field: c.field ?? undefined })));
      // ---- draft
      const given = (said("draft")?.params ?? []).map(n => [n, x.params.findIndex(p => p.name === n || p.name === `${n}_`)]).filter(([, i]) => i >= 0 && !x.params[i].draft && (!f ? !/=>/.test(x.params[i].type ?? "") : (/^it changes (?:what it was given|in place)/.test(f.pure?.why?.why ?? "") && !f.draft?.[i])));
      if (given.length) q.push(`${list(given.map(g => g[0]))}: a store's draft is refused there. \`draft ${given[0][0]}\` if the fn changes it in place${because(f && { why: "a write that may reach it" })}`);
      // ---- renders, nests: where a component it is given is placed
      const r = comps && x.shape !== "comp" && !x.renders && (said("renders")?.params ?? []).map(n => [n, x.params.findIndex(p => p.name === n || p.name === `${n}_`)]).filter(([, i]) => i < 0 || !f || !/^called (?:while the call runs|in a computation)/.test(f.handlers?.[i]?.why ?? ""));
      if (r && r.length) q.push(`${list(r.map(g => g[0]))}: a component given there is checked under a root of its own. \`renders(<Component>)\` names the component of this module it is rendered beneath${because(f && (f.handlers?.[r[0][1]]?.why ? f.handlers[r[0][1]] : { why: "where it goes is not followed" }))}`);
      if (x.shape === "comp" && !x.nests && couldNest(x)) q.push("the components it is given are checked each alone. `nests(<kids> in <component>)` if the component it makes nests them");
    }
    // ---- contexts (one question a context, at the first row that reads it)
    for (const c of contexts.get(row.name) ?? []) q.push(c);
    // ---- rejects
    if (row.kind === "fn" && errors && changes(x, { rejects: ["?"] }) && !x.rejects?.length && !(f && f.rejects && f.rejects.length === 0)) q.push(`its promise rejects with Error as far as a \`catch\` knows. \`rejects(<classes>)\` names them${f ? `. Not proven: ${f.rejects ? "it throws a class with no row" : "what it throws is not shown to be of a class of the module's"}` : unread()}`);
    if (said("overloads")) q.push(`one of ${said("overloads").n} signatures, and they differ in what the checker reads (a callback, a \`ref\`, what it answers): write the row of the one the app calls`);
    return q;

    function handlers(cbs) {
      const open = cbs.map(c => { if (!f) return c; const h = f.handlers?.[c.field === undefined ? String(c.index) : `${c.index}.${c.field}`]; return !h || h.ok || settled(h) ? undefined : { ...c, w: h }; }).filter(Boolean);
      if (open.length) q.push(`${open.map(c => c.label).join(", ")}: a closure there may not write a source. \`handler (…) => …\` if it is called later, outside any computation${because(f && open[0].w)}`);
    }
  }
}

/** Whether a fn takes a tree it could nest (MO-11i): a record written out with a function or a component among its fields
 *  and a list among them, or a type that is not written out. */
const couldNest = x => x.params.some(p => !p.type || !/^[\s({]/.test(p.type) ? !/^(?:string|number|boolean|bigint|symbol|undefined|null|unknown)\b/.test(p.type ?? "") : records(p.type, 0, p.type.length).some(fs => fs.some(f => /=>|\bComponent\b/.test(f.text)) && fs.some(f => /\[\]|Array</.test(f.text))));

/** The contexts every call of some row reads and no row is shown to provide: row → its questions. */
function openContexts(rows, factsOf, more) {
  const by = new Map();
  for (const row of rows) {
    if (row.kind !== "fn" && row.kind !== "component") continue;
    const f = factsOf(row.name); if (!f || f.unread) continue;
    for (const c of f.uses ?? []) if (!more.provided?.has(c.key)) { const o = by.get(c.key) ?? { c, readers: [] }; o.readers.push(row.name); by.set(c.key, o); }
  }
  const out = new Map();
  for (const { c, readers } of by.values()) {
    const who = readers.length > 3 ? `${readers.slice(0, 3).join(", ")} and ${readers.length - 3} more` : readers.join(", "), at = more.at?.(c);
    const text = `${who} read${readers.length > 1 ? "" : "s"} ${c.name ?? "a context"}, and a call with no provider above it is accepted. \`uses(<context>)\` there, \`provides(<context>)\` on what provides it, \`export context <context>\`. Not proven: no component here is shown to provide it${at ? ` (${at})` : ""}`;
    out.set(readers[0], [...(out.get(readers[0]) ?? []), text]);
  }
  return out;
}

/** Each row of the lines, as the crate reads it; a row it refuses is none. */
function facts(lines) {
  const code = lines.filter(l => !l.startsWith("//")).map(l => l.replace(/«[^»]*»/g, ""));
  try { return rowsOf("draft.d.rx", code.join("\n") + "\n"); } catch { /* one row of it */ }
  const base = code.filter(l => /^export (?:pure )?(?:const|context|error|type)\b/.test(l));
  return code.flatMap(l => { for (const before of [[], base]) try { return rowsOf("draft.d.rx", [...before.filter(b => b !== l), l].join("\n") + "\n").slice(-1); } catch { /* refused */ } return []; });
}

module.exports = { ask, reading, changes, kindOf };
