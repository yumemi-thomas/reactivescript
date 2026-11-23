// 09 MO-8s: what a module of the app's own takes from the library it stands over. A draft is the types' rows, and for a
// package the words rx-declare knows of its release (known.js). An app's module that only hands a library on — it
// exports the library's component again, renders it and nothing else, binds what a factory makes, or returns the fields
// of a hook's result as functions — says nothing the library's own rows do not say, so its rows take their words from
// them: `provides(router)` on the component that renders the router's provider, `uses(queryClient)` and `pure` on the
// hook that calls the library's, `pending fails(Error)` on the field that reads a store field known to wait.
//
// Each is read off the module's own text, and only in the shapes where it holds for every run (a single `return` of
// one element; a call at the top of the body, not behind a condition; a field that reads the result and does nothing
// else). Anything else is left as the types drafted it, with its TODO: this never guesses, it copies a word from the
// row it was written on. The library's rows are the project's declaration of the package where it has one (as the
// checker finds it), else known.js for the installed release.
const fs = require("node:fs");
const path = require("node:path");

const WORDS = /\s+((?:uses|provides|renders|nests|rejects)\([^()]*\)|instantiates)\s*$/;
/** A row's words after its signature (`uses(c)`, `provides(c)`, …), last first, and whether it is `pure`. */
function wordsOfRow(row) {
  const out = { pure: /^export\s+(?:(?:server|client)\s+)*pure\s+fn\b/.test(row), uses: [], provides: [], component: /^export\s+component\b/.test(row), makes: false };
  let rest = row;
  for (let m; (m = WORDS.exec(rest)); rest = rest.slice(0, m.index)) {
    const w = /^(uses|provides)\(([^()]*)\)$/.exec(m[1]); if (w) out[w[1]].unshift(...w[2].split(",").map(x => x.trim()).filter(Boolean));
    const r = /^renders\(([^()]*)\)$/.exec(m[1]); if (r) out.renders = r[1].trim();
  }
  out.makes = /\)\s*:\s*Component\s*$/.test(rest);   // a factory: it hands back a component, and the words are that component's
  return out;
}
/** A package's rows by export name, from the declaration the checker would read for `spec` at `file`, else known.js
 *  for the installed release: `{ rows: Map(name → row), contexts: Set, declared: bool (a declaration file has them),
 *  fields: { hook → { field → words } } }`. */
function libraryRows(spec, file, from) {
  const out = { rows: new Map(), contexts: new Set(), declares: new Set(), declared: false, fields: {} };
  const known = require("./known.js")[spec];
  const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
  let fits = false;
  if (known) { const v = require("./versions.js").installed(pkg, from); fits = !!v && require("./versions.js").satisfies(v, known.range); }
  if (fits) {
    for (const [n, row] of Object.entries(known.rows ?? {})) out.rows.set(n, row);
    for (const [n, w] of Object.entries(known.words ?? {})) if (!out.rows.has(n)) out.rows.set(n, `export ${w.pure ? "pure " : ""}fn ${n}()${w.after ? ` ${w.after}` : ""}`.replace(/^export (pure )?fn ([A-Z])/, (_, p, c) => `export component ${c}`));
    for (const c of known.contexts ?? []) out.contexts.add(c);
    // what a module of the app's own carries from a hook whose own row cannot say it (known.js, `wraps`)
    for (const [n, w] of Object.entries(known.wraps ?? {})) { out.rows.set(n, `export ${w.pure ? "pure " : ""}fn ${n}()${w.uses?.length ? ` uses(${w.uses.join(", ")})` : ""}${w.renders ? ` renders(${w.renders})` : ""}`); out.fields[n] = w.fields ?? {}; }
  }
  let decl; try { decl = require("./rxc").lookup(file, spec) ?? undefined; } catch { decl = undefined; }
  if (decl && fs.existsSync(decl)) {
    out.declared = true;
    for (const l0 of fs.readFileSync(decl, "utf8").split("\n")) {
      const l = l0.replace(/\/\/.*$/, "").trim();
      const c = /^export\s+context\s+([\w$]+)/.exec(l); if (c) { out.contexts.add(c[1]); out.declares.add(c[1]); continue; }
      const m = /^export\s+(?:(?:pure|server|client)\s+)*(?:fn|component)\s+([\w$.]+)/.exec(l); if (m) out.rows.set(m[1], l);
    }
  }
  return out;
}

/** The module's own file for `spec` (`./router.tsx`, `./query.js`): its source, where it has one. */
function sourceOf(spec, from) {
  const at = path.resolve(from, spec);
  return [at, ...[".ts", ".tsx", ".js", ".jsx", ".mjs"].map(x => at.replace(/\.(m?[jt]sx?|c[jt]s)$/, "") + x)].find(f => fs.existsSync(f) && fs.statSync(f).isFile() && !f.endsWith(".d.ts"));
}

/** What the module's exports take from the libraries it imports: `Map(export name → { pure?, uses: [], provides: [],
 *  waits: { field → words }, from: [what it was read off] })`, and the contexts those words name (context → package). */
function carried(ts, spec, from) {
  const file = sourceOf(spec, from); const out = new Map(); const contexts = new Map();
  if (!file) return { out, contexts };
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true, /\.[jt]sx$/.test(file) || file.endsWith(".js") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const libs = new Map(); const lib = s => { if (!libs.has(s)) libs.set(s, libraryRows(s, file, from)); return libs.get(s); };
  const imports = new Map();   // a local name → { spec, name }
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || st.moduleSpecifier.text.startsWith(".") || st.importClause?.isTypeOnly) continue;
    const b = st.importClause?.namedBindings; if (!b || !ts.isNamedImports(b)) continue;
    for (const e of b.elements) if (!e.isTypeOnly) imports.set(e.name.text, { spec: st.moduleSpecifier.text, name: (e.propertyName ?? e.name).text });
  }
  /** The library row an expression names: an imported name, or a member of one (`Toast.List`). */
  const named = e => {
    const parts = []; let x = e;
    while (ts.isPropertyAccessExpression(x)) { parts.unshift(x.name.text); x = x.expression; }
    if (!ts.isIdentifier(x)) return undefined;
    const imp = imports.get(x.text); if (!imp) return undefined;
    const name = [imp.name, ...parts].join("."); const L = lib(imp.spec); const row = L.rows.get(name);
    return row ? { ...wordsOfRow(row), spec: imp.spec, name, lib: L } : undefined;
  };
  const note = (name, w, what) => {
    const at = out.get(name) ?? { uses: [], provides: [], waits: {}, reads: [], from: [] };
    for (const f of w.reads ?? []) if (!at.reads.includes(f)) at.reads.push(f);
    for (const k of ["uses", "provides"]) for (const c of w[k] ?? []) if (!at[k].includes(c)) { at[k].push(c); contexts.set(c, w.lib?.declares.has(c) ? w.spec : contexts.get(c) ?? null); }
    if (w.pure !== undefined) at.pure = (at.pure ?? true) && w.pure;
    Object.assign(at.waits, w.waits ?? {}); if (w.renders) at.renders = w.renders;
    at.from.push(what); out.set(name, at);
  };
  const tagOf = j => ts.isJsxElement(j) ? j.openingElement.tagName : ts.isJsxSelfClosingElement(j) ? j.tagName : undefined;
  const unparen = e => { while (e && ts.isParenthesizedExpression(e)) e = e.expression; return e; };
  /** A function's one result where its body is a single `return` (or an expression body): else undefined. */
  const oneReturn = fn => { if (!fn.body) return undefined; if (!ts.isBlock(fn.body)) return unparen(fn.body); const ss = fn.body.statements; return ss.length === 1 && ts.isReturnStatement(ss[0]) && ss[0].expression ? unparen(ss[0].expression) : undefined; };
  /** The component an expression renders and nothing else: `<C … />`, `<C>…</C>`, `createComponent(C, …)`. */
  const rendered = e => { const tag = e && tagOf(e); if (tag) return named(tag); if (e && ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "createComponent" && e.arguments[0]) return named(e.arguments[0]); return undefined; };
  /** A hook over a library's: `const q = lib(…)` at the top of the body, then a record of what `q` holds. */
  const hook = (name, fn) => {
    // `renders(H)` goes with the call where the fn hands its own parameters straight on: what it is given is what the library is given
    const own = new Set(fn.parameters.filter(p => ts.isIdentifier(p.name)).map(p => p.name.text));
    const straight = call => call.arguments.length > 0 && call.arguments.every(a => ts.isIdentifier(a) && own.has(a.text));
    if (!fn.body || !ts.isBlock(fn.body)) { const e = unparen(fn.body); if (e && ts.isCallExpression(e)) { const w = named(e.expression); if (w && !w.component && !w.makes) note(name, { ...w, renders: straight(e) ? w.renders : undefined }, `${w.name} of ${w.spec}`); } return; }
    const results = new Map(); let pure = true; const uses = [];
    for (const st of fn.body.statements) {
      if (ts.isVariableStatement(st)) { for (const d of st.declarationList.declarations) { const init = unparen(d.initializer); const w = init && ts.isCallExpression(init) ? named(init.expression) : undefined; if (w && !w.component && !w.makes) { if (ts.isIdentifier(d.name)) results.set(d.name.text, w); uses.push(w); pure &&= w.pure; } else pure = false; } continue; }
      if (ts.isReturnStatement(st)) {
        const r = unparen(st.expression);
        if (r && ts.isCallExpression(r)) { const w = named(r.expression); if (w && !w.component && !w.makes) { uses.push(w); pure &&= w.pure; if (w.renders && straight(r)) note(name, { renders: w.renders }, `${w.name} of ${w.spec}`); } else pure = false; continue; }
        if (!r || !(ts.isObjectLiteralExpression(r) || ts.isArrayLiteralExpression(r) || ts.isIdentifier(r))) { pure = false; continue; }
        // the record's fields: a function, a name, a read of a result — nothing that runs when the hook is called
        const inert = x => { x = unparen(x); return ts.isArrowFunction(x) || ts.isFunctionExpression(x) || ts.isIdentifier(x) || ts.isLiteralExpression(x) || (ts.isPropertyAccessExpression(x) && inert(x.expression)); };
        const waits = {}; const reads = [];
        if (ts.isObjectLiteralExpression(r)) for (const p of r.properties) {
          if (ts.isPropertyAssignment(p)) {
            if (!inert(p.initializer)) pure = false;
            // `data: () => q.data`: the field hands out what the library's result holds at that name
            const f = unparen(p.initializer); const body = f && ts.isArrowFunction(f) && !ts.isBlock(f.body) ? unparen(f.body) : undefined;
            if (body && ts.isPropertyAccessExpression(body) && ts.isIdentifier(body.expression) && results.has(body.expression.text) && ts.isIdentifier(p.name)) { const w = results.get(body.expression.text); const said = w.lib.fields?.[w.name]?.[body.name.text]; if (said) waits[p.name.text] = said; reads.push(p.name.text); }
          } else if (ts.isShorthandPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isGetAccessorDeclaration(p)) { /* a name, a function */ } else pure = false;
        } else if (ts.isArrayLiteralExpression(r) && !r.elements.every(inert)) pure = false;
        // (a field that only reads the library's result is an accessor of it: read as a value, `x.isFetching`, MO-10b)
        if (Object.keys(waits).length || reads.length) note(name, { waits, reads }, "a field of the library's result");
        continue;
      }
      pure = false;
    }
    if (uses.length) for (const w of uses) note(name, { uses: w.uses, provides: [], lib: w.lib, spec: w.spec }, `${w.name} of ${w.spec}`);
    if (uses.length && pure) note(name, { pure: true }, "it calls nothing else");
    else if (out.has(name)) out.get(name).pure = false;
  };
  const exported = st => st.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const st of sf.statements) {
    // export { Toast } / export { Toast as T } / export { Toast } from "kit"
    if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause)) {
      const fromSpec = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) && !st.moduleSpecifier.text.startsWith(".") ? st.moduleSpecifier.text : undefined;
      for (const e of st.exportClause.elements) {
        const src = fromSpec ? { spec: fromSpec, name: (e.propertyName ?? e.name).text } : imports.get((e.propertyName ?? e.name).text); if (!src) continue;
        const L = lib(src.spec);
        for (const [n, row] of L.rows) if (n === src.name || n.startsWith(`${src.name}.`)) note(e.name.text + n.slice(src.name.length), { ...wordsOfRow(row), pure: undefined, lib: L, spec: src.spec }, `${n} of ${src.spec}, exported again`);
      }
      continue;
    }
    if (!exported(st)) continue;
    if (ts.isFunctionDeclaration(st) && st.name) {
      const w = rendered(oneReturn(st));
      if (w?.component) note(st.name.text, { uses: w.uses, provides: w.provides, lib: w.lib, spec: w.spec }, `it renders ${w.name} of ${w.spec}, and nothing else`);
      else if (!/^[A-Z]/.test(st.name.text)) hook(st.name.text, st);
      continue;
    }
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue; const init = unparen(d.initializer);
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
        const w = rendered(oneReturn(init));
        if (w?.component) note(d.name.text, { uses: w.uses, provides: w.provides, lib: w.lib, spec: w.spec }, `it renders ${w.name} of ${w.spec}, and nothing else`);
        else if (!/^[A-Z]/.test(d.name.text)) hook(d.name.text, init);
      } else if (ts.isCallExpression(init)) {
        // `export const Router = createRouter(…)`: what a factory makes is the component its row describes
        const w = named(init.expression);
        if (w?.makes) note(d.name.text, { uses: w.uses, provides: w.provides, lib: w.lib, spec: w.spec }, `${w.name} of ${w.spec} makes it`);
      } else if (ts.isIdentifier(init) || ts.isPropertyAccessExpression(init)) {
        const w = named(init); if (w) note(d.name.text, { ...w, pure: undefined }, `${w.name} of ${w.spec}, under another name`);
      }
    }
  }
  return { out, contexts };
}

/** The draft's lines with the words carried in, the TODOs they answer taken out, and the contexts they name declared:
 *  `{ lines, head }`. */
function carry(ts, spec, from, lines, withWaits) {
  let found; try { found = carried(ts, spec, from); } catch { return { lines, head: [] }; }
  const { out, contexts } = found; if (!out.size) return { lines, head: [] };
  const exportedAs = l => /^export\s+(?:(?:pure|server|client)\s+)*(?:fn|component|const|type|context|error)\s+([\w$.]+)/.exec(l)?.[1];
  const took = []; const used = new Set();
  lines = lines.flatMap(l => l.split("\n"));   // (a row drafted with a TODO above it is one entry of two lines)
  for (const [name, w] of out) {
    const i = lines.findIndex(l => exportedAs(l) === name); if (i < 0 || /^export\s+const\b/.test(lines[i])) continue;
    let l = lines[i]; const before = l;
    if (w.pure && /^export fn /.test(l)) l = l.replace(/^export fn /, "export pure fn ");
    // in the result (after the parameters): `isFetching: () => boolean` → `isFetching: ref boolean`
    if (w.reads.length) { const cut = l.lastIndexOf("): "); if (cut > 0) l = l.slice(0, cut) + w.reads.reduce((t, f) => t.replace(new RegExp(`([{;] )${f.replace(/\$/g, "\\$")}: \\(\\) => `), `$1${f}: ref `), l.slice(cut)); }
    if (Object.keys(w.waits).length) l = withWaits(l, w.waits);
    // (`renders(H)` names a component of the same declaration: carried where the module exports H too)
    const hosted = w.renders && /^export fn /.test(l.replace(/^export pure fn /, "export fn ")) && !/\brenders\(/.test(l) && lines.some(x => exportedAs(x) === w.renders);
    const add = [w.uses.length && !/\buses\(/.test(l) ? `uses(${w.uses.join(", ")})` : "", w.provides.length && !/\bprovides\(/.test(l) ? `provides(${w.provides.join(", ")})` : "", hosted ? `renders(${w.renders})` : ""].filter(Boolean);
    // (a hook that reads a context is not instantiated twice for it: the word the types' draft wrote for a primitive stays)
    if (add.length) l = `${l} ${add.join(" ")}`;
    if (l === before) continue;
    lines[i] = l; took.push(`${name} (${[...new Set(w.from)].join("; ")})`);
    for (const c of [...w.uses, ...w.provides]) used.add(c);
    // the questions the words answer
    const answered = [w.uses.length && /which context does this hook read\?/, (w.uses.length || w.provides.length) && /does it provide a context to its children\?|its parts likely read a context it provides|does its component provide a context/, w.pure && /^pure\? /, Object.keys(w.waits).length && /is the result a store with fields that wait or throw/, hosted && /is given a component: where does the library render it\?/].filter(Boolean);
    for (let j = lines.length - 1; j >= 0; j--) { const t = new RegExp(`^// TODO ${name.replace(/[.$]/g, "\\$&")}: (.*)$`).exec(lines[j]); if (t && answered.some(a => a.test(t[1]))) lines.splice(j, 1); }
  }
  if (!took.length) return { lines, head: [] };
  const head = [`// Carried from the library's own rows (MO-8s: the module hands these on, and says what they say): ${took.join(", ")}.`];
  for (const c of used) { const pkg = contexts.get(c); head.push(pkg ? `export context ${c} from ${JSON.stringify(pkg)}` : `export context ${c}`); }
  return { lines, head };
}

module.exports = { carry, carried, wordsOfRow };
