// MO-8w: a declaration's words, held against what the code shows. `rx-declare` reads `pure`, `handler`, `draft`,
// `rejects(E)`, `uses(c)` and `provides(c)` from the JavaScript an import resolves to (src/infer.js) and writes a word
// only where the code proves it. This asks the same reading about the words a `.d.rx` already has, whoever wrote
// them, and sorts each into one of three:
//   proven        the code shows it: the word is one `rx-declare` would write (it is counted as read from the code,
//                 and `rx-verify` holds it to what the reading claims);
//   contradicted  the code shows the opposite — a `pure` fn that changes its argument in place, a `handler` that is
//                 called while the fn runs, a `draft` parameter that is never changed, a `rejects(E)` that throws another
//                 class of the module, a `uses(c)` on a fn that reads no context, a `provides(c)` whose children are
//                 made outside the provider;
//   unproven      neither: the reading stops at something it cannot see through, and says what (the thing a reviewer
//                 should check).
// Which words were read from the code is therefore not written in the file (it was, a line a row: `//@ inferred`):
// it is what this answers, from the code as it is installed now.
const path = require("node:path");
const di = require("./declare-infer.js");
const { declares } = require("./load.js");

/** A TypeScript program over an import of `spec` from `from`: what the row's types say of a fn's parameters. */
function typesFor(ts, spec, from) {
  const options = { strict: true, skipLibCheck: true, noEmit: true, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve, jsxImportSource: "@solidjs/web", allowJs: true };
  const host = ts.createCompilerHost(options);
  const entry = path.join(from, "__rx_audit__.ts");
  const code = `import * as __m from ${JSON.stringify(spec)};\nexport { __m };\n`;
  const { getSourceFile, fileExists } = host;
  host.getSourceFile = (f, ...rest) => path.resolve(f) === entry ? ts.createSourceFile(f, code, ts.ScriptTarget.ES2022) : getSourceFile.call(host, f, ...rest);
  host.fileExists = f => path.resolve(f) === entry || fileExists.call(host, f);
  const program = ts.createProgram([entry], options, host);
  const checker = program.getTypeChecker(); const imp = program.getSourceFile(entry).statements[0];
  const mod = checker.getSymbolAtLocation(imp.moduleSpecifier);
  return mod ? { checker, mod, imp } : undefined;
}

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
function audit(ts, spec, from, rowsIn) {
  const inf = require("./infer.js").create(ts, { solid: process.env.RX_INFER_SOLID !== "0" });
  let types; try { types = typesFor(ts, spec, from); } catch { types = undefined; }
  const typesOf = name => { try { return types ? di.paramTypes(ts, types.checker, types.mod, types.imp, name) : {}; } catch { return {}; } };
  const viewsOf = name => { try { return types ? di.viewProps(ts, types.checker, types.mod, types.imp, name) : { has: () => true, outside: () => true, surely: () => false }; } catch { return { has: () => true, outside: () => true, surely: () => false }; } };
  const rel = f => path.relative(from, f).split(path.sep).join("/").replace(/^(?:\.\.\/)+node_modules\//, "").replace(/^node_modules\//, "");
  const at = w => w?.file ? ` [${rel(w.file)}:${w.line}]` : "";
  // a context's name in the file ↔ the context the code makes: fixed by the first row that pairs them, held by the rest
  const ctxOfName = new Map(), nameOfCtx = new Map();
  const pair = (names, ctxs) => {
    // by the pairs already made, then one to one where a single name and a single context are left
    const left = names.filter(n => !ctxOfName.has(n)), free = ctxs.filter(c => !nameOfCtx.has(c.key));
    if (left.length === 1 && free.length === 1) { ctxOfName.set(left[0], free[0].key); nameOfCtx.set(free[0].key, left[0]); }
    return names.map(n => ctxs.find(c => ctxOfName.get(n) === c.key));
  };
  const rows = []; let unread;
  const pending = [];
  for (const row of rowsIn) {
    if (row.kind !== "fn" && row.kind !== "component") continue;
    const x = row.facts, w = wordsOf(row); if (!w.all.length) continue;
    const out = { name: row.name, line: row.line, kind: row.kind, words: [] };
    const say = (word, verdict, why) => out.words.push({ word, verdict, why });
    rows.push(out);
    if (x.side === "server") { for (const n of w.all) say(n, "unproven", "a server fn's row: its code is the server's, and is not read"); continue; }
    const types = row.kind === "fn" ? typesOf(row.name) : {};
    let f; try { f = inf.exportFacts(spec, from, row.name, row.kind === "fn" ? { ...types, refs: new Set(x.params.flatMap((p, k) => p.ref ? [k] : [])) } : {}); } catch (e) { f = { unread: `the code could not be read (${String(e?.message ?? e).slice(0, 120)})` }; }
    if (!f || f.unread) { unread ??= f?.unread; for (const n of w.all) say(n, "unproven", `not read: ${f?.unread ?? "no code"}`); continue; }
    if (w.pure) {
      if (f.pure) say("pure", "proven", f.makes ? "it only computes and makes Solid nodes of its own" : "it only computes");
      else {
        // a change in place of what it was given contradicts the word where that is data — a list, a record: what a
        // caller may hold in a source. An object with methods of its own (a socket whose `close` is wrapped, an
        // element) changed in place is a person's to judge, as a listener registered on it is
        const hard = f.why.find(x => x.param && (x.params ?? []).some(i => !types.objects?.has(i)));
        const soft = f.why.find(x => x.param);
        const x = hard ?? soft ?? f.why[0];
        say("pure", hard ? "contradicted" : "unproven", `${x.why}${at(x)}${!hard && soft ? " — an object with methods of its own, not data: check that the change is one its caller expects" : ""}`);
      }
    }
    for (const h of w.handlers) {
      const r = f.handler(h.index, h.field);
      if (r.ok) say(`handler(${h.label})`, "proven", [...new Set(r.uses.map(u => `${u.why}${at(u)}`))].slice(0, 2).join("; "));
      else { const sync = r.uses.find(u => u.how === "sync"); const bad = sync ?? r.uses.find(u => u.how !== "later"); say(`handler(${h.label})`, sync ? "contradicted" : "unproven", r.never ? "never called in the code that was read" : `${bad.how === "sync" ? "called while the call runs or in a computation" : bad.how === "reentry" ? "kept, and called whenever what holds it is called" : "it goes where it is not followed"}: ${bad.why}${at(bad)}`); }
    }
    for (const d of w.drafts) {
      const r = row.kind === "fn" ? f.draft(d.index) : undefined;
      if (r === "changes") { const x = f.draftWhy(d.index); say(`draft(${d.name})`, "proven", `${x.why}${at(x)}`); }
      else if (r === "never") say(`draft(${d.name})`, "contradicted", "never changed: every use of it only reads");
      else say(`draft(${d.name})`, "unproven", "a write through a name that may hold something else, one after the call, or an argument given to code that is not read");
    }
    if (w.rejects) {
      const names = w.rejects;
      if (!f.rejects) say(`rejects(${names.join(" | ")})`, "unproven", f.rejectsWhy ?? "what it throws is not read");
      else { const extra = f.rejects.filter(n => !names.includes(n)), missing = names.filter(n => !f.rejects.includes(n) && n !== "Error"); say(`rejects(${names.join(" | ")})`, !extra.length && !missing.length ? "proven" : "contradicted", extra.length ? `it throws ${extra.join(", ")}, which the row does not name` : missing.length ? `every throw the code reaches is read, and none is of ${missing.join(", ")}` : `every throw the code reaches is of ${f.rejects.join(", ") || "no class"}`); }
    }
    if (w.instantiates) say("instantiates", f.pure && f.makes ? "proven" : "unproven", f.pure && f.makes ? "a pure fn that makes Solid nodes" : "a word a name suggests: not read from the code");
    // contexts: paired once every row is read (a name is tied to a context by the row that has one of each)
    if (w.uses.length || w.provides.length) pending.push({ out, w, f, row, say });
    if (w.nests) say(`nests(${w.nests})`, "unproven", "how a component the fn makes nests what it is given is not read");
    if (w.renders) say(`renders(${w.renders})`, "unproven", "where the library renders what it is given is not read: a value kept in the module's state is followed no further");
  }
  // rows with one name and one context first: they fix the names
  for (const pass of [0, 1]) for (const p of pending) {
    const { w, f, row, say } = p;
    if (w.uses.length && !p.usesDone) {
      const names = w.uses; const u = f.uses; const complete = !u.may.length && !u.opaque.length;
      if (pass === 0 && !(names.length === 1 && u.must.length === 1)) { /* later */ }
      else {
        p.usesDone = true;
        const got = pair(names, u.must);
        names.forEach((n, i) => {
          const c = got[i];
          if (c) return say(`uses(${n})`, "proven", `useContext(${c.name ?? "…"}) on every path, with no default to answer${at(c.at)}`);
          // (only of a name another row ties to a context Solid makes: a library that keeps a scope of its own —
          // not `createContext` — is declared with the same words, and the reading does not follow it)
          if (complete && ctxOfName.has(n) && !u.must.some(x => !nameOfCtx.has(x.key))) return say(`uses(${n})`, "contradicted", u.must.length ? `every call it makes is read: the contexts it reads are ${u.must.map(x => nameOfCtx.get(x.key) ?? x.name).join(", ")}` : "every call it makes is read, and none asks for a context that has no default");
          if (complete && !ctxOfName.has(n)) return say(`uses(${n})`, "unproven", "every call it makes is read, and none reads a context Solid makes: if the library keeps a scope of its own, the reading does not follow it — check that the fn fails where nothing provides it (rx-verify runs that)");
          const d = u.may[0] ? { why: `it reads ${u.may[0].name ?? "a context"} on some path only, or when what it hands back is called`, ...u.may[0].at } : u.opaque[0];
          say(`uses(${n})`, "unproven", d ? `${d.why}${at(d)}` : "which context the name stands for is not shown");
        });
      }
    }
    if (pass === 1 && w.provides.length) {
      const names = w.provides;
      if (row.kind !== "component") { for (const n of names) say(`provides(${n})`, "unproven", "a fn's row: what the component it makes provides is not read"); continue; }
      const pv = f.provides(0); const views = viewsOf(row.name);
      const okOf = x => x.inside.length && !x.outside.some(o => views.outside(o));
      const got = pair(names, pv.list.map(x => x.ctx));
      names.forEach((n, i) => {
        const x = got[i] && pv.list.find(y => y.ctx.key === got[i].key);
        if (x && okOf(x)) return say(`provides(${n})`, "proven", `everything it is given is rendered among <${x.ctx.name ?? "the context"} value>'s children${at(x.inside[0])}`);
        // contradicted where a prop that is a view for certain (an element: `children`) is read outside the provider,
        // which makes it there; a prop that only may hold one, or a function that gives one, is a person's to check
        if (x) { const sure = x.outside.find(q => views.surely(q)); const o = sure ?? x.outside.find(q => views.outside(q)); return say(`provides(${n})`, sure ? "contradicted" : "unproven", o ? `${o.field === null ? "its props go" : `${o.field} is read`} outside the provider: ${o.why}${at(o)}${sure ? "" : o.field === null ? " — check that no view among them is rendered outside it" : ` — check that ${o.field} holds no view, or (a function) is called only among the provider's children`}` : "nothing it is given is rendered beneath the provider"); }
        if (!pv.list.length && pv.clean && ctxOfName.has(n)) return say(`provides(${n})`, "contradicted", "it renders no provider: every element and component it renders is read");
        if (!pv.list.length && pv.clean) return say(`provides(${n})`, "unproven", "it renders no provider of a context Solid makes: if the library keeps a scope of its own, the reading does not follow it — check that what it is given runs with the scope set (rx-verify mounts it)");
        say(`provides(${n})`, "unproven", pv.list.length ? "which context the name stands for is not shown" : "it renders a component that is not read, or its props go where they are not followed");
      });
    }
  }
  return { rows, unread };
}

/** A declaration file's words, each sorted (`audit`), or undefined where the file declares no JS module that is found
 *  (a host declaration, a package written in `.rx`). */
function auditFile(ts, file) {
  const fs = require("node:fs"); const raw = fs.readFileSync(file, "utf8");
  if (/^\s*export\s+default\s+component\b/m.test(raw) || /^\s*\/\/@\s*signature\b/m.test(raw)) return undefined;
  const d = declares(file); if (!d) return undefined;
  let rows; try { rows = require("./rows.js").rowsOf(file); } catch { return undefined; }
  return { ...audit(ts, d.spec, d.from, rows), spec: d.spec, from: d.from };
}

module.exports = { audit, auditFile };
