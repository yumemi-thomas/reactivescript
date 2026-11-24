// `rx-declare`: a draft `.d.rx` for a JS module, from its TypeScript types (09 MO-8, MO-10, MO-11, MO-12). What the
// types show is written as rows: an accessor parameter or result is `ref`, a function of props to a JSX element is a
// component, a `JSX.Element` prop is a `View`, a component-typed prop or result is `Component`, a tuple result keeps
// its `ref` parts, an `Error` subclass is an `error`. What types cannot show is left for a person, as a `TODO` comment
// on the line it concerns: whether a hook reads a context (`uses(…)`), whether an accessor waits or fails where it is
// read (`pending`,
// `fails(…)` before its `ref`, MO-10l; a store whose plain fields wait has no row, and a module of the app's own hands
// each out as an accessor), what a promise rejects with. No word is
// written off a name, a shape or a judgment (MO-8v): those the code proves are added by declare-infer.js, and the rest stay
// off, the row that says least (a fn with no word is io, R-io-4).
// `rx-tsc` then checks the draft against the same types (spec/13 TY-6).
const path = require("node:path");

/** A type's text, kept where it names nothing the draft cannot see; `any` otherwise (types are text to the checker). */
const KNOWN = new Set(["Promise", "Record", "Array", "ReadonlyArray", "Partial", "Readonly", "View", "Component", "Error", "Date", "Map", "Set", "Event"]);   // not `Element`: Solid's JSX.Element prints under that name too (`string | Element`), and is a View
/** The module's own exported type names that the draft declares (`export type Todo = import(…).Todo`): a row may name them. */
let OWN = new Set();
function text(ts, checker, t, at, node) {
  if (isJsxElement(ts, checker, t)) return "View";
  if (checker.isArrayType(t) && isJsxElement(ts, checker, checker.getTypeArguments(t)[0])) return "View[]";
  // a type TypeScript could not resolve (an import the app's project has not) prints as `any`, and is not the library's
  if (t.flags & ts.TypeFlags.Any && t.intrinsicName === "error") return (CTX.decl && at) || ANY("unresolved");   // by its place: whatever the library's declaration is to the app's project
  const s = checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias);
  // MO-8o: the type as the library's own declaration writes it, each name by a module that exports it
  const d = CTX.refs ? declared(ts, checker, node, t) : undefined;
  if (d) return d;
  if (plain(s)) return inherited(s);
  if (!CTX.refs) return ANY(cause(ts, checker, t));
  // MO-8m: what the draft cannot restate is named where the library declares it — by the name a module exports it
  // under, else by its place in the library's own declaration (`at`): text only TypeScript reads
  const r = leaf(ts, checker, t);
  if (r.text) return r.text;
  if (t.flags & ts.TypeFlags.Any) return ANY("vendor-any");
  // a type parameter the row does not declare (its bound has no name) is, at its place, that bound
  if (at && (!(t.flags & ts.TypeFlags.TypeParameter) || (CTX.decl && !CTX.scope.has(t.symbol)))) return at;
  return ANY(cause(ts, checker, t));
}
/** MO-8q: an `any` the library's own type has is the library's, written as it is (and marked, so it is counted apart). */
const inherited = s => s.split(/("[^"]*"|'[^']*')/).map((x, i) => i % 2 ? x : x.replace(/\bany\b(?!\u00ab)/g, ANY("vendor-any"))).join("");
/** A text's `any`s that are the draft's own: every one but the library's (MO-8q). */
const introduced = s => (s.replace(/\bany\u00abvendor-any\u00bb/g, "").replace(/\u00ab[^\u00bb]*\u00bb/g, "").match(/\bany\b/g) ?? []).length;
/** Whether a type's text names only what every draft can: primitives, the platform's types, the module's own plain types. */
const plain = s => (s.replace(/"[^"]*"|'[^']*'/g, "").match(/\b[A-Z][A-Za-z0-9_$]*\b/g) ?? []).every(n => KNOWN.has(n) || OWN.has(n)) && !/=>/.test(s);
/** A place in the library's declaration without `null` and `undefined`, where its type may be either. */
const present = (checker, t, at) => at && checker.getNonNullableType(t) !== t ? `NonNullable<${at}>` : at;
/** Whether a type has no plain text: what a draft wrote `any` for before it named the library's types (MO-8m). */
const unsaid = (ts, checker, t) => !isJsxElement(ts, checker, t) && !(checker.isArrayType(t) && isJsxElement(ts, checker, checker.getTypeArguments(t)[0])) && !plain(checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias));
/** A type's text with no `any` in it, or undefined. */
const whole = (ts, checker, t, at, node) => { const s = text(ts, checker, t, at, node); return introduced(s) ? undefined : s; };
/** A function type that is an exported function's own (`typeof import("lib").string`, where a schema keeps the function
 *  that made it): a place to take its parameters and result from, though it is overloaded or generic. */
const valueOf = (ts, checker, t) => { const sym = checker.getNonNullableType(t).symbol; if (!sym || !(sym.flags & ts.SymbolFlags.Function)) return undefined; const r = nameOf(ts, checker, sym, 0, true); return r.text && /^import\(/.test(r.text) ? `typeof ${r.text}` : undefined; };
/** MO-8m: a callback's type (MO-10g) — its own signature where every part can be named; else its parameters and what
 *  it answers by its place in the library's declaration (`at`); else open. */
function callbackText(ts, checker, t, at, why = "callback", node) {
  if (CTX.refs) {
    const nn = checker.getNonNullableType(t);
    const sigs = nn.getCallSignatures();
    // a union of functions has no signature of its own (TypeScript's is the one that fits them all)
    const one = !(nn.flags & ts.TypeFlags.Union) || nn.types.filter(u => u.getCallSignatures().length).length === 1;
    if (one && sigs.length === 1 && !sigs[0].getTypeParameters()?.length && !checker.getTypePredicateOfSignature?.(sigs[0])) {
      const ps = [];
      for (const p of sigs[0].getParameters()) {
        const d = p.valueDeclaration; const isP = d && ts.isParameter(d);
        const pt = /^[A-Za-z_$][\w$]*$/.test(p.name) && p.name !== "this" ? whole(ts, checker, checker.getTypeOfSymbol(p), undefined, isP ? d.type : undefined) : undefined;
        if (!pt) { ps.length = 0; ps.push(null); break; }
        ps.push(`${isP && d.dotDotDotToken ? "..." : ""}${RESERVED.has(p.name) ? `${p.name}_` : p.name}${isP && (d.questionToken || d.initializer) ? "?" : ""}: ${pt}`);
      }
      const r = sigs[0].getReturnType();
      const rt = r.flags & ts.TypeFlags.Void ? "void" : whole(ts, checker, r, undefined, sigs[0].declaration?.type);
      if (ps[0] !== null && rt && new Set(sigs[0].getParameters().map(q => q.name)).size === ps.length) return `(${ps.join(", ")}) => ${rt}`;
    }
    // MO-8o: by the name the library declares the function type with (`ResizeHandler<T>`), where it has one: its
    // parameters and what it answers are that type's
    const named = declared(ts, checker, node, t, true);
    // a helper alias written out is the function type itself
    const fnOf = x => { const m = /^\((.*)\)$/s.exec(x); const y = m && !/^[^(]*\)/.test(m[1]) ? m[1] : x; return /^\([^]*\) => /.test(y) && !/^\([^()]*\)\[\]/.test(y) ? y : undefined; };
    const direct = n => !!n && (ts.isParenthesizedTypeNode(n) ? direct(n.type) : ts.isFunctionTypeNode(n) && !n.typeParameters?.length);
    if (named && !introduced(named) && one && sigs.length === 1 && (direct(node) ? !WORDS.test(named) : nn === t && fnOf(named))) return direct(node) ? named.replace(/^\((.*)\)$/s, (m, x) => /^[^(]*\)/.test(x) ? m : x) : fnOf(named);
    if (named && !introduced(named)) at = nn === t ? named : `NonNullable<${named}>`;
    else at = at ? present(checker, t, at) : valueOf(ts, checker, t);
    if (at) return `(...args: Parameters<${at}>) => ${CTX.decl && one && sigs.length === 1 && sigs[0].getReturnType().flags & ts.TypeFlags.Void ? "void" : `ReturnType<${at}>`}`;
  }
  return `(...args: ${ANY(why)}[]) => ${ANY(why)}`;
}
/** An `any` the draft writes, with why (read by `declare`'s `how.causes`, and taken out of the text). */
const ANY = why => `any«${why}»`;
const MARK = /«[^»]*»/g;
/** Why a type's text is not written — what in it a draft that restates types cannot say — as one cause, the first of:
 *  `vendor-any` (the library's own type is `any`), `generic` (it ranges over a type parameter; `generic-computed`
 *  where that is through a conditional, mapped, indexed or template type, or `keyof`), `computed` (such a type alone), `other-package` (it names a type another package
 *  declares), `internal-type` (a type of the library's that no module exports), `own-type` (a type the module exports,
 *  generic or beside a function type), `function-inside` (only a function type in it). */
function cause(ts, checker, t) {
  if (t.flags & ts.TypeFlags.Any) return "vendor-any";
  if (t.flags & ts.TypeFlags.TypeParameter) return "generic";
  let node;
  try { node = checker.typeToTypeNode(t, undefined, ts.NodeBuilderFlags.NoTruncation | ts.NodeBuilderFlags.UseAliasDefinedOutsideCurrentScope | ts.NodeBuilderFlags.IgnoreErrors); } catch { /* no node */ }
  if (!node) return "internal-type";
  const K = ts.SyntaxKind; const found = new Set();
  const own = CTX.mod?.declarations?.find(d => ts.isSourceFile(d)); const ownPkg = own && packageOf(own.fileName);
  const visit = n => {
    if (n.kind === K.AnyKeyword) found.add("vendor-any");
    else if (n.kind === K.ConditionalType || n.kind === K.MappedType || n.kind === K.TemplateLiteralType || n.kind === K.IndexedAccessType || n.kind === K.InferType || (n.kind === K.TypeOperator && n.operator === K.KeyOfKeyword)) found.add("computed");
    else if (n.kind === K.FunctionType || n.kind === K.ConstructorType) found.add("function-inside");
    else if (n.kind === K.TypeReference || n.kind === K.TypeQuery || n.kind === K.ImportType) {
      let e = n.kind === K.TypeReference ? n.typeName : n.kind === K.TypeQuery ? n.exprName : n.qualifier;
      while (e && ts.isQualifiedName(e)) e = e.left;
      let sym = e?.symbol; if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
      const file = sym?.declarations?.[0]?.getSourceFile();
      if (sym && sym.flags & ts.SymbolFlags.TypeParameter) found.add("generic");
      else if (!file) found.add("internal-type");
      else if (isLibFile(file.fileName) || !ts.isExternalModule(file)) { /* the platform's: every draft names it */ }
      else if (sym && CTX.mod && exportsOf(ts, checker, CTX.spec).has(sym)) found.add("own-type");
      else if (file === own || (ownPkg && packageOf(file.fileName) === ownPkg)) found.add("internal-type");
      else found.add("other-package");
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  if (found.has("generic") && found.has("computed")) return "generic-computed";   // a conditional or mapped type TypeScript cannot resolve until the parameter is known
  return ["generic", "computed", "other-package", "internal-type", "own-type", "function-inside", "vendor-any"].find(c => found.has(c)) ?? "internal-type";
}
/** What a draft is made in: the module, where it is imported from, the type parameters its row declares (`scope`),
 *  whether types are named where the library declares them (`refs`). */
let CTX = { refs: false, scope: new Set() };

const isLibFile = f => /\/typescript\/lib\/lib\.[^/]*\.d\.ts$/.test(f);
/** The package a declaration file belongs to (`…/node_modules/@scope/name/…`, or the nearest package.json's name), or undefined. */
const packages = new Map();
function packageOf(f) {
  const m = /^.*\/node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(f)?.[1]; if (m) return m;
  // a linked package (a workspace's, a `file:` dependency): its real path has no node_modules, its package.json has its name
  for (let dir = path.dirname(f); ; dir = path.dirname(dir)) {
    if (packages.has(dir)) return packages.get(dir);
    let name; try { name = JSON.parse(require("node:fs").readFileSync(path.join(dir, "package.json"), "utf8")).name; } catch { /* none here */ }
    if (name || path.dirname(dir) === dir) { packages.set(dir, name); return name; }
  }
}
/** The exports of the module `spec` resolves to from where the draft is made: each exported symbol (an alias followed
 *  to what it names) to its name there. Empty when the import does not resolve: the app could not write it either. */
function exportsOf(ts, checker, spec) {
  if (CTX.exports.has(spec)) return CTX.exports.get(spec);
  const map = new Map(); CTX.exports.set(spec, map);
  const r = spec === CTX.spec ? undefined : require("./library-resolve.js").resolveAsLibrary(ts, spec, CTX.lib, CTX.entry, CTX.options, CTX.host, CTX.cache);   // as the library resolves it: nested under it or hoisted, the same module
  const sf = r && CTX.program.getSourceFile(r.resolvedFileName);
  const mod = spec === CTX.spec ? CTX.mod : sf && checker.getSymbolAtLocation(sf);
  if (mod) for (const e of checker.getExportsOfModule(mod)) { const y = e.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(e) : e; if (e.name !== "default" && !map.has(y)) map.set(y, e.name); }
  return map;
}
/** The packages the declared module's own declaration files import from, in the order they do. */
function imported(ts) {
  if (CTX.imports) return CTX.imports;
  const out = new Set();
  const start = CTX.mod.declarations?.find(d => ts.isSourceFile(d));
  const own = start && packageOf(start.fileName);
  for (const sf of CTX.program.getSourceFiles()) {
    if (sf !== start && !(own && !CTX.spec.startsWith(".") && packageOf(sf.fileName) === own)) continue;
    for (const st of sf.statements) if ((ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) && !/^[./]/.test(st.moduleSpecifier.text)) out.add(st.moduleSpecifier.text);
  }
  return CTX.imports = [...out];
}
/** MO-8m: how a row names a symbol of the library's types: a type parameter the row declares, a global (the
 *  platform's, an ambient declaration) by its name, the module's own exported type by the alias the draft declares for
 *  it, any other by `import("<module>").<name>` where a module the app can import exports it — the module being declared,
 *  else the package that declares it. undefined: no module exports it (an internal type). */
function nameOf(ts, checker, sym0, args, value) {
  const sym = sym0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym0) : sym0;
  if (sym.flags & ts.SymbolFlags.TypeParameter) return CTX.scope.has(sym) ? { text: tpName(sym) } : { why: "generic" };
  const decl = sym.declarations?.[0]; const file = decl?.getSourceFile();
  if (!file) return { why: "named-type" };
  // a global, under the namespaces it is in (`Intl.LocalesArgument`)
  const global = () => { const names = [sym.name]; for (let up = sym.parent; up && up.flags & ts.SymbolFlags.Namespace && !up.declarations?.some(d => ts.isSourceFile(d) || (ts.isModuleDeclaration(d) && d.flags & ts.NodeFlags.GlobalAugmentation)); up = up.parent) names.unshift(up.name); return { text: names.join(".") }; };
  if (isLibFile(file.fileName) || !ts.isExternalModule(file)) return global();
  const inGlobal = n => { for (let x = n; x; x = x.parent) if (ts.isModuleDeclaration(x) && x.flags & ts.NodeFlags.GlobalAugmentation) return true; return false; };
  if (inGlobal(decl)) return global();
  const pkg = packageOf(file.fileName);
  // where to look: the module being declared; the packages its own declarations import from, as they write them (a
  // library that takes `Accessor` from "solid-js" names it so, whichever package declares it); the declaring package
  for (const spec of new Set([CTX.spec, ...imported(ts), ...(pkg ? [pkg] : [])])) {
    const name = exportsOf(ts, checker, spec).get(sym);
    if (!name) continue;
    // the module's own type, as the draft's alias row declares it: bare where the alias takes what is written
    if (spec === CTX.spec && !value && OWN_ALL.has(name)) { const [least, most] = OWN_ALL.get(name); if (args >= least && args <= most) return { text: name }; }
    return { text: `import(${JSON.stringify(spec)}).${name}` };
  }
  // a member of a namespace (`JSX.Element`): by its namespace
  const up = sym.parent;
  if (up && up.flags & ts.SymbolFlags.Namespace && !(up.flags & ts.SymbolFlags.ValueModule && up.declarations?.some(d => ts.isSourceFile(d)))) {
    const r = nameOf(ts, checker, up, 0, value); if (r.text) return { text: `${r.text}.${sym.name}` };
  }
  // MO-8o: any other module the app can import that exports it — a subpath of the package (`kit/internals`), a package
  // the library depends on — under the name it has there (a bundle's `Store$1` is `Store` to whoever imports it)
  const w = CTX.decl && wider(ts, sym, pkg);
  if (w) return { text: `import(${JSON.stringify(w.spec)}).${w.name}` };
  return { why: "named-type" };
}
/** A row's type parameter by its name; a bundle's rename (`TEntries$1`) by the name it was written with, where no
 *  other parameter of the row has it. */
const tpName = sym => CTX.rename?.get(sym) ?? sym.name;
/** MO-8o: the modules of a package an app can import — its main entry and every subpath its package.json exports
 *  (`./v2`, `./v2/internals`, a `./*` pattern by the folders it matches) — as import specifiers. The package is the one
 *  the library being declared has (found from where that library is installed, then from where the draft is made), so
 *  what a draft names does not depend on whether the install hoisted a dependency. */
function subpathsOf(ts, pkg) {
  const fs = require("node:fs");
  const dir = require("./library-resolve.js").packageDir(pkg, CTX.lib, CTX.entry);
  if (!dir) return { specs: [], deps: [] };
  let json; try { json = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")); } catch { return { specs: [], deps: [] }; }
  const specs = new Set([pkg]);
  const ex = json.exports;
  const leaves = v => typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(leaves) : v && typeof v === "object" ? Object.values(v).flatMap(leaves) : [];
  if (ex && typeof ex === "object" && !Array.isArray(ex)) for (const [k, v] of Object.entries(ex)) {
    if (!k.startsWith("./") || /\.(json|css)$/.test(k)) continue;
    if (!k.includes("*")) { specs.add(pkg + k.slice(1)); continue; }
    // a pattern: what its targets match on disk
    const [kpre, kpost] = k.slice(2).split("*");
    for (const target of leaves(v).filter(x => x.includes("*") && x.startsWith("./"))) {
      const [pre, post] = target.slice(2).split("*");
      const base = path.join(dir, path.dirname(pre + "x")); const head = path.basename(pre + "x").slice(0, -1);
      let names = []; try { names = fs.readdirSync(base); } catch { /* no such folder */ }
      for (const n of names) { if (!n.startsWith(head)) continue; const star = n.slice(head.length); const hit = post.startsWith("/") ? star : star.endsWith(post) ? star.slice(0, star.length - post.length) : undefined; if (hit === undefined || !hit || !fs.existsSync(path.join(base, post.startsWith("/") ? n + post : n))) continue; specs.add(`${pkg}/${kpre}${hit}${kpost}`); if (specs.size > 400) break; }
    }
  }
  return { specs: [...specs], deps: Object.keys({ ...json.dependencies, ...json.peerDependencies }) };
}
/** MO-8o: where a package exports each declaration, over all its modules: declaration (file and position) → the
 *  specifiers and names it can be imported by, the main entry first, then the shortest subpath. Read in a program of
 *  its own (a subpath the declared module does not import is not in the draft's), so a symbol is found by where it is
 *  declared. */
const WIDE = new Map();
function wideIndex(ts, pkg) {
  // (kept for the process, which the language server's outlives an install: by the package.json it was read with)
  const at = require("./library-resolve.js").packageDir(pkg, CTX.lib, CTX.entry); let stamp = ""; try { stamp = String(require("node:fs").statSync(path.join(at, "package.json")).mtimeMs); } catch { /* not installed */ }
  const key = `${path.dirname(CTX.entry)}\0${pkg}\0${at}\0${stamp}`;
  if (WIDE.has(key)) return WIDE.get(key);
  const { specs, deps } = subpathsOf(ts, pkg);
  const files = new Map();
  for (const spec of specs) { const r = require("./library-resolve.js").resolveAsLibrary(ts, spec, CTX.lib, CTX.entry, CTX.options, CTX.host, CTX.cache); if (r && /\.d\.[cm]?ts$|\.tsx?$/.test(r.resolvedFileName)) files.set(spec, r.resolvedFileName); }
  const index = new Map();
  if (files.size) {
    const program = ts.createProgram([...new Set(files.values())], { ...CTX.options, noEmit: true }, CTX.host, CTX.program);
    const checker = program.getTypeChecker();
    for (const [spec, file] of [...files].sort((a, b) => (a[0] === pkg ? 0 : 1) - (b[0] === pkg ? 0 : 1) || a[0].length - b[0].length || (a[0] < b[0] ? -1 : 1))) {
      const sf = program.getSourceFile(file); const mod = sf && checker.getSymbolAtLocation(sf); if (!mod) continue;
      for (const e of checker.getExportsOfModule(mod)) {
        if (e.name === "default") continue;
        let y = e; try { if (e.flags & ts.SymbolFlags.Alias) y = checker.getAliasedSymbol(e); } catch { continue; }
        for (const d of y.declarations ?? []) { const k = `${d.getSourceFile().fileName}:${d.pos}:${d.kind}`; if (!index.has(k)) index.set(k, { spec, name: e.name }); }   // with its kind: a file re-exported as a namespace (`export * as Point from "./Point"`) begins where its first declaration does
      }
    }
  }
  const out = { index, deps };
  WIDE.set(key, out);
  return out;
}
const keyOf = sym => { const d = sym.declarations?.[0]; return d && `${d.getSourceFile().fileName}:${d.pos}:${d.kind}`; };
/** MO-8o: a module that exports `sym`, beyond the one being declared and those its declarations import from: a subpath
 *  of the declared module's package, one of the package that declares it, then (for a type another package declares)
 *  the packages the library depends on. */
function wider(ts, sym, pkg) {
  const k = keyOf(sym); if (!k) return undefined;
  const own = CTX.spec.startsWith(".") ? undefined : CTX.spec.startsWith("@") ? CTX.spec.split("/").slice(0, 2).join("/") : CTX.spec.split("/")[0];
  const tried = new Set();
  const look = p => { if (!p || tried.has(p)) return undefined; tried.add(p); return wideIndex(ts, p).index.get(k); };
  let hit = look(own) ?? look(pkg);
  if (!hit && own && pkg && pkg !== own) for (const d of wideIndex(ts, own).deps) { hit = look(d); if (hit) break; }
  return hit;
}
const WORDS = /\b(?:handler|pending|ref|draft)\s+[\w({[]|\bfails\s*\(/;
/** MO-8m: a type as text only TypeScript reads — the library's own names (`nameOf`), the platform's, primitives and
 *  literals, arrays, tuples, unions and intersections of those, with their type arguments. `{ text }`, or `{ why }` where
 *  some part cannot be named. A record or a function type is not such a text where the checker would read it as a row
 *  (the whole type, or a member of its union): those are written a step at a time by what calls this. */
function leaf(ts, checker, t, open = false) {
  let node;
  try { node = checker.typeToTypeNode(t, undefined, ts.NodeBuilderFlags.NoTruncation | ts.NodeBuilderFlags.UseAliasDefinedOutsideCurrentScope | ts.NodeBuilderFlags.IgnoreErrors); } catch { return { why: "named-type" }; }
  if (!node) return { why: "named-type" };
  return print(ts, checker, node, open);
}
/** Whether two types are one: the same, or each assignable to the other with the same text. */
const sameType = (ts, checker, a, b) => a === b || (checker.typeToString(a, undefined, ts.TypeFormatFlags.NoTruncation) === checker.typeToString(b, undefined, ts.TypeFormatFlags.NoTruncation) && checker.isTypeAssignableTo(a, b) && checker.isTypeAssignableTo(b, a));
/** MO-8o: a type as the library's own declaration writes it — the annotation of a parameter, a result, a prop or a field
 *  (`node`, in the library's `.d.ts`) — with each name it uses rewritten to a module the app can import it from
 *  (`ObjectSchema<TEntries, undefined>` is `import("valibot").ObjectSchema<TEntries, undefined>`), and its type
 *  parameters as the row declares them. undefined where a name has no such module, or where the annotation is not the
 *  type at hand (`t`: a field of a generic type is declared in the type's own parameters, not the row's). */
function declared(ts, checker, node, t, open = false) {
  if (!CTX.decl || !node || node.pos < 0) return undefined;
  if (t) { let dt; try { dt = checker.getTypeFromTypeNode(node); } catch { return undefined; } // (an optional parameter that is a type parameter, `initial?: I`, is asked for without its `undefined`: `NonNullable<I>` there is `I`)
    if (!sameType(ts, checker, dt, t) && !sameType(ts, checker, dt, checker.getNonNullableType(t)) && !(dt.flags & ts.TypeFlags.TypeParameter && sameType(ts, checker, checker.getNonNullableType(dt), t))) return undefined; }
  const r = print(ts, checker, node, open);
  return r.text;
}
/** The type argument of an annotation that is the type at hand (`Accessor<T>`'s `T` for what the accessor reads). */
function innerNode(ts, checker, node, t) {
  if (!CTX.decl || !node || node.pos < 0) return undefined;
  if (ts.isParenthesizedTypeNode(node)) return innerNode(ts, checker, node.type, t);
  if (ts.isFunctionTypeNode(node) && !node.parameters.length) return node.type;
  if (ts.isUnionTypeNode(node)) { for (const m of node.types) { const r = innerNode(ts, checker, m, t); if (r) return r; } return undefined; }
  if (ts.isTypeReferenceNode(node)) for (const a of node.typeArguments ?? []) { try { if (sameType(ts, checker, checker.getTypeFromTypeNode(a), t)) return a; } catch { /* not a type */ } }
  return undefined;
}
function print(ts, checker, node, open = false, given) {
  const K = ts.SyntaxKind;
  const real = node.pos >= 0;   // a node of the library's own declaration (not one TypeScript built for a resolved type)
  const symOf = e => e.symbol ?? (real ? checker.getSymbolAtLocation(e) : undefined);
  const FAIL = {}; let why;
  const fail = w => { why = w; throw FAIL; };
  const key = n => ts.isIdentifier(n) ? n.text : ts.isStringLiteral(n) || ts.isNumericLiteral(n) ? JSON.stringify(n.text) : fail("anonymous");
  const locals = new Set();   // the parameters a computed type declares itself: a mapped type's key, `infer U`
  const subs = given ? [given] : [];   // the parameters of a helper alias written out in place, each as what it was given
  const entity = (e, args, value) => {
    // in the library's declaration a qualified name is found whole (`v.GenericSchema` through `import * as v`)
    if (real && ts.isQualifiedName(e)) { const s0 = checker.getSymbolAtLocation(e.right); const r0 = s0 && nameOf(ts, checker, s0, args, value); if (r0?.text) return r0.text; }
    const parts = []; while (ts.isQualifiedName(e)) { parts.unshift(e.right.text); e = e.left; }
    if (!parts.length && !value && locals.has(e.text)) return e.text;
    const sym = symOf(e);
    if (!sym) return fail("named-type");
    if (!parts.length && subs.length) { for (let i = subs.length - 1; i >= 0; i--) if (subs[i].has(sym)) { const x = subs[i].get(sym); return /[|&]|=>| extends /.test(x) ? `(${x})` : x; } }
    // the last name's symbol says most (a namespace's member is found through it); the builder gives each identifier its own
    const r = nameOf(ts, checker, sym, parts.length ? 0 : args, value);
    if (!r.text) return fail(r.why);
    return [r.text, ...parts].join(".");
  };
  const list = (ns, top) => ns.map(n => p(n, top));
  const p = (n, top) => {
    switch (n.kind) {
      case K.AnyKeyword: return ANY("vendor-any");   // MO-8q: the library's own `any`, as it is
      case K.StringKeyword: case K.NumberKeyword: case K.BooleanKeyword: case K.BigIntKeyword: case K.UndefinedKeyword: case K.NullKeyword: case K.VoidKeyword: case K.NeverKeyword: case K.UnknownKeyword: case K.ObjectKeyword: case K.SymbolKeyword:
        return ts.tokenToString(n.kind);
      case K.LiteralType: {
        const l = n.literal;
        if (l.kind === K.NullKeyword) return "null"; if (l.kind === K.TrueKeyword) return "true"; if (l.kind === K.FalseKeyword) return "false";
        if (ts.isStringLiteral(l)) return JSON.stringify(l.text);
        if (ts.isNumericLiteral(l) || ts.isBigIntLiteral?.(l)) return l.text;
        if (ts.isPrefixUnaryExpression(l) && ts.isNumericLiteral(l.operand)) return `-${l.operand.text}`;
        return fail("anonymous");
      }
      case K.ParenthesizedType: return `(${p(n.type, top)})`;
      case K.ArrayType: { const e = p(n.elementType, false); return `${/[|&]|=>|^(keyof|readonly|typeof) /.test(e) && !/^\(.*\)$/.test(e) ? `(${e})` : e}[]`; }
      case K.TupleType: return `[${list(n.elements, false).join(", ")}]`;
      case K.NamedTupleMember: return `${n.dotDotDotToken ? "..." : ""}${n.name.text}${n.questionToken ? "?" : ""}: ${p(n.type, false)}`;
      case K.OptionalType: return `${p(n.type, false)}?`;
      case K.RestType: return `...${p(n.type, false)}`;
      case K.UnionType: {
        // a value or a function of something (`boolean | ((page: number) => boolean)`): the checker reads a function
        // type where a type is one, and this is not — written with what is no function first, it is TypeScript's text
        const fn = x => ts.isParenthesizedTypeNode(x) ? fn(x.type) : ts.isFunctionTypeNode(x);
        if (top && real && n.types.some(fn) && n.types.some(x => !fn(x) && x.kind !== K.UndefinedKeyword && !(x.kind === K.LiteralType && x.literal.kind === K.NullKeyword))) {
          const rest = n.types.filter(x => !fn(x)), fns = n.types.filter(fn);
          return [...list(rest, top), ...fns.map(x => { const y = p(x, false); return /^\(.*\)$/s.test(y) && !/^\([^()]*\) =>/.test(y) ? y : `(${y})`; })].join(" | ");
        }
        return list(n.types, top).join(" | ");
      }
      case K.IntersectionType: return list(n.types, false).join(" & ");
      case K.TypeOperator: return `${ts.tokenToString(n.operator)} ${p(n.type, false)}`;
      case K.IndexedAccessType: return `${p(n.objectType, false)}[${p(n.indexType, false)}]`;
      case K.TypeQuery: return `typeof ${entity(n.exprName, 0, true)}`;
      case K.ImportType: {
        // the library's own `import("./x").T`: by a module the app can import it from
        if (!real || !n.qualifier) return fail("named-type");
        const q = ts.isQualifiedName(n.qualifier) ? n.qualifier.right : n.qualifier;
        const s0 = checker.getSymbolAtLocation(q); if (!s0) return fail("named-type");
        const args = n.typeArguments?.length ?? 0;
        const r = nameOf(ts, checker, s0, args, !!n.isTypeOf); if (!r.text) return fail(r.why);
        return `${n.isTypeOf ? "typeof " : ""}${r.text}${args ? `<${list(n.typeArguments, false).join(", ")}>` : ""}`;
      }
      case K.TypeReference: {
        const args = n.typeArguments?.length ?? 0;
        let name;
        try { name = entity(n.typeName, args, false); }
        catch (e) {
          // a name of the library's declaration that no module exports (a helper alias, `Many<T>`): what it stands
          // for, where that can be written (`T | T[]`)
          if (e !== FAIL || !real || subs.length >= 4) throw e;
          const first = ts.isQualifiedName(n.typeName) ? n.typeName.right : n.typeName;
          let y = checker.getSymbolAtLocation(first); if (y && y.flags & ts.SymbolFlags.Alias) y = checker.getAliasedSymbol(y);
          const d = y?.declarations?.[0];
          // an interface of fields, with nothing it extends, is the record of them
          const record = d && ts.isInterfaceDeclaration(d) && y.declarations.length === 1 && !d.heritageClauses?.length && d.members.length <= 16 && d.members.every(m => ts.isPropertySignature(m) && m.type);
          if (!d || !(ts.isTypeAliasDeclaration(d) || record)) throw e;
          const map = new Map();
          (d.typeParameters ?? []).forEach((q, i) => { const a = n.typeArguments?.[i] ?? q.default; const sy = checker.getSymbolAtLocation(q.name); if (!a || !sy) throw e; map.set(sy, p(a, false)); });
          subs.push(map);
          try {
            if (record) return `{ ${d.members.map(m => `${m.modifiers?.some(x => x.kind === K.ReadonlyKeyword) ? "readonly " : ""}${key(m.name)}${m.questionToken ? "?" : ""}: ${p(m.type, false)}`).join("; ")} }`;
            const r = p(d.type, top); return !top && /[|&]|=>| extends /.test(r) ? `(${r})` : r;
          } finally { subs.pop(); }
        }
        if (name === "JSX.Element" || /\)\.JSX\.Element$/.test(name)) return "View";
        return args ? `${name}<${list(n.typeArguments, false).join(", ")}>` : name;
      }
      case K.TypeLiteral: {
        if (top) return fail("anonymous");   // a record the checker would read field by field: the caller's to write
        return `{ ${n.members.map(m => {
          if (ts.isPropertySignature(m) && m.type) return `${m.modifiers?.some(x => x.kind === K.ReadonlyKeyword) ? "readonly " : ""}${key(m.name)}${m.questionToken ? "?" : ""}: ${p(m.type, false)}`;
          if (ts.isIndexSignatureDeclaration(m) && m.parameters.length === 1 && m.parameters[0].type && m.type) return `[${m.parameters[0].name.text}: ${p(m.parameters[0].type, false)}]: ${p(m.type, false)}`;
          return fail("anonymous");
        }).join("; ")} }`;
      }
      case K.FunctionType: {
        if (top || (n.typeParameters?.length && !real)) return fail(top ? "function-inside" : "generic");
        // a generic function type's own parameters are its own (`<T>(x: T) => T`, in the library's declaration)
        const mine = (n.typeParameters ?? []).map(q => q.name.text).filter(x => !locals.has(x));
        for (const x of mine) locals.add(x);
        const tps = n.typeParameters?.length ? `<${n.typeParameters.map(q => `${q.name.text}${q.constraint ? ` extends ${p(q.constraint, false)}` : ""}${q.default ? ` = ${p(q.default, false)}` : ""}`).join(", ")}>` : "";
        const ps = n.parameters.map(q => ts.isIdentifier(q.name) && q.type && q.name.text !== "this" ? `${q.dotDotDotToken ? "..." : ""}${q.name.text}${q.questionToken ? "?" : ""}: ${p(q.type, false)}` : fail("anonymous"));
        const out = `${tps}(${ps.join(", ")}) => ${p(n.type, false)}`;
        for (const x of mine) locals.delete(x);
        return out;
      }
      // MO-8m: a computed type is written as the library computes it — TypeScript's text, which neither checker reads
      // (a conditional over a row's type parameter, a mapped tuple, a template of a literal)
      case K.ConditionalType: {
        const c = p(n.checkType, false);
        const before = new Set(locals);
        const collect = x => { if (x.kind === K.InferType) locals.add(x.typeParameter.name.text); ts.forEachChild(x, collect); };
        collect(n.extendsType);
        const e = p(n.extendsType, false), yes = p(n.trueType, false);
        for (const l of [...locals]) if (!before.has(l)) locals.delete(l);
        const wrap = x => /[|&]|=>| extends /.test(x) && !/^\(.*\)$/.test(x) ? `(${x})` : x;
        return `${wrap(c)} extends ${wrap(e)} ? ${yes} : ${p(n.falseType, false)}`;
      }
      case K.InferType: return `infer ${n.typeParameter.name.text}${n.typeParameter.constraint ? ` extends ${p(n.typeParameter.constraint, false)}` : ""}`;
      case K.MappedType: {
        const k = n.typeParameter.name.text; const had = locals.has(k);
        const over = n.typeParameter.constraint ? p(n.typeParameter.constraint, false) : fail("anonymous");
        locals.add(k);
        const mod = (t, w) => !t ? "" : t.kind === K.PlusToken ? `+${w}` : t.kind === K.MinusToken ? `-${w}` : w;
        const as = n.nameType ? ` as ${p(n.nameType, false)}` : "";
        const v = n.type ? p(n.type, false) : fail("anonymous");
        if (!had) locals.delete(k);
        const ro = mod(n.readonlyToken, "readonly");
        return `{ ${ro ? `${ro} ` : ""}[${k} in ${over}${as}]${mod(n.questionToken, "?")}: ${v} }`;
      }
      case K.TemplateLiteralType: {
        const q = x => x.replace(/[`\\]|\$\{/g, m => `\\${m}`);
        return "`" + q(n.head.text) + n.templateSpans.map(sp => "${" + p(sp.type, false) + "}" + q(sp.literal.text)).join("") + "`";
      }
      // a predicate, as the library writes it (`input is T`, `asserts input is T`): what a function answers
      case K.TypePredicate: {
        if (!real || !ts.isIdentifier(n.parameterName)) return fail("anonymous");
        return `${n.assertsModifier ? "asserts " : ""}${n.parameterName.text}${n.type ? ` is ${p(n.type, false)}` : ""}`;
      }
      default: return fail("anonymous");   // `this`, a method or call signature of a record written in place
    }
  };
  try {
    // a predicate is written where it is a callback's answer; what a fn itself answers stays `boolean` or `void`, as
    // TypeScript resolves it (a row's result is read for its shape, and a declaration may say less: 13 TY-6b)
    if (node.kind === K.TypePredicate) return { why: "anonymous" };
    const s = p(node, !open);
    if (s.replace(MARK, "").length > (real ? 8000 : 320)) return { why: "large" };
    if (WORDS.test(s) || /^(View|Component)\b/.test(s) && s !== "View" && s !== "View[]") return { why: "anonymous" };
    return { text: s };
  } catch (e) { if (e !== FAIL) throw e; return { why }; }
}
let OWN_ALL = new Map();
/** The most props a component's row writes out where their type has no name. */
const FIELDS = 24;
/** The annotation a parameter, a prop or a field is declared with, in the library's declaration. */
const annotation = (ts, sym) => { const d = sym?.valueDeclaration ?? sym?.declarations?.[0]; return d && (ts.isParameter(d) || ts.isPropertySignature(d) || ts.isPropertyDeclaration(d)) ? d.type : undefined; };
/** MO-8d, MO-8m: a signature's type parameters as the library declares them — `<const S extends string, T = S>` — each
 *  bound and default named as `leaf` names a type; "" where one cannot be (the row then has none, and what ranges over
 *  them is said some other way). Sets the row's scope. */
function typeParams(ts, checker, symbols, used) {
  CTX.scope = new Set(symbols);
  // a bundle's rename of a parameter (`TEntries$1`) is written as it was, where that is no other parameter's name
  CTX.rename = new Map();
  for (const sym of symbols) { const base = sym.name.replace(/\$\d+$/, ""); if (base && base !== sym.name && !symbols.some(o => o !== sym && (o.name === base || o.name.replace(/\$\d+$/, "") === base))) CTX.rename.set(sym, base); }
  const out = [];
  for (const sym of symbols) {
    const tp = { symbol: sym };
    const d = sym.declarations?.[0];
    if (!d || !ts.isTypeParameterDeclaration(d)) { CTX.scope = new Set(); return ""; }
    const part = n => { if (!n) return ""; return declared(ts, checker, n, undefined, true) ?? leaf(ts, checker, checker.getTypeFromTypeNode(n), true).text; };
    let c = part(d.constraint); const def = part(d.default);
    if (c === "unknown") c = "";   // a bound that resolves to `unknown` (`TData extends RowData`, an alias of it) bounds nothing
    if (c === undefined || def === undefined) { CTX.scope = new Set(); return ""; }
    out.push([tpName(sym), `${d.modifiers?.some(m => m.kind === ts.SyntaxKind.ConstKeyword) ? "const " : ""}${tpName(sym)}${c ? ` extends ${c}` : ""}${def ? ` = ${def}` : ""}`]);
  }
  if (!used) return `<${out.map(x => x[1]).join(", ")}>`;
  // `used` (a text): only the parameters it names, and those their bounds name, are the row's (a polymorphic kit's
  // element parameter ranges over no prop the row writes)
  const names = t => new Set(t.replace(/"[^"]*"/g, "").match(/[A-Za-z_$][\w$]*/g) ?? []);
  const keep = new Set(); let grew = true; let text = used;
  while (grew) { grew = false; const ns = names(text); for (const [n, t] of out) if (!keep.has(n) && ns.has(n)) { keep.add(n); text += " " + t; grew = true; } }
  const kept = out.filter(x => keep.has(x[0]));
  for (const sym of [...CTX.scope]) if (!keep.has(tpName(sym))) CTX.scope.delete(sym);
  return kept.length ? `<${kept.map(x => x[1]).join(", ")}>` : "";
}

/** The name of the package a folder is in. */
const PACKAGES = new Map();
function packageOf(dir) {
  if (!PACKAGES.has(dir)) { let n; try { n = JSON.parse(require("node:fs").readFileSync(path.join(dir, "package.json"), "utf8")).name; } catch { /* none here */ } PACKAGES.set(dir, n ?? (path.dirname(dir) === dir ? undefined : packageOf(path.dirname(dir)))); }
  return PACKAGES.get(dir);
}
/** Whether the library's types say a function of nothing is an accessor: Solid's own `Accessor<T>` (`SourceAccessor<T>`),
 *  a union with one (`MaybeAccessor<T>`), or an alias of one (`type Options<T> = Accessor<…>`). One that is only shaped as
 *  one (`() => T`) may be called for what it does — an abort signal made at each call, an id counted — so a result's part
 *  is drafted `ref` where the code shows a reader (declare-infer.js), and a parameter is the function it is. */
function named(ts, checker, t0) {
  const solid = y => /^(solid-js|@solidjs\/signals)$/.test(packageOf(path.dirname(y.declarations?.[0]?.getSourceFile().fileName ?? "/")) ?? "");
  const alias = (y, d = 0) => {
    if (!y || d > 4) return false;
    if (y.flags & ts.SymbolFlags.Alias) y = checker.getAliasedSymbol(y);
    if (/^(Source)?Accessor$/.test(y.name) && solid(y)) return true;
    const n = y.declarations?.find(ts.isTypeAliasDeclaration)?.type;
    return !!n && ts.isTypeReferenceNode(n) && alias(checker.getSymbolAtLocation(ts.isQualifiedName(n.typeName) ? n.typeName.right : n.typeName), d + 1);
  };
  const t = checker.getNonNullableType(t0);
  return [t0, t, ...(t.types ?? [])].some(x => alias(x.aliasSymbol) || alias(x.symbol));
}
const shaped = (ts, checker, t, at) => { if (CTX.shaped && !named(ts, checker, t)) CTX.shaped.add(at); return true; };
/** An accessor: one call signature, no parameters (Solid's `Accessor<T>`). Returns what it reads, or undefined. */
function accessorOf(ts, checker, t) {
  t = checker.getNonNullableType(t);
  // `MaybeAccessor<T>` (`T | Accessor<T>`): it takes an accessor, so `.rx` passes one (a live value, MO-10a)
  if (t.flags & ts.TypeFlags.Union) { const a = t.types.map(x => accessorOf(ts, checker, x)).find(Boolean); if (a) return a; }
  // Solid 2's own getter (`SourceAccessor<T>`, what `createSignal` hands back) is an accessor with a brand: a property
  // named by a symbol is no field of a value
  if (t.getConstructSignatures().length || t.getProperties().some(q => !q.name.startsWith("__@"))) return undefined;
  const sigs = t.getCallSignatures();
  if (sigs.length !== 1 || sigs[0].getParameters().length) return undefined;
  const r = sigs[0].getReturnType();
  if (r.flags & ts.TypeFlags.Void) return undefined;   // `() => void` is a callback, not an accessor
  // nor is a function of nothing that answers a promise of nothing (`exit: () => Promise<void>`, `requestPermission`):
  // there is nothing to read, so it is called for what it does (drafted `ref`, a read of the field would have called it)
  if (checker.typeToString(r) === "Promise<void>") return undefined;
  return r;
}
// Solid's JSX.Element is a union with null and undefined: its name, not its members, says it is an element
// (by its declaration: the DOM's `Element`, `HTMLElement`, a function of an element, are not)
const isJsxElement = (ts, checker, t) => {
  const u = checker.getNonNullableType(t);
  for (const x of [t, u]) {
    const sym = x.aliasSymbol ?? x.symbol;
    const file = sym?.declarations?.[0]?.getSourceFile().fileName ?? "";
    if (sym?.name === "Element" && !/\/typescript\/lib\/lib\./.test(file)) return true;
  }
  return false;
};
const isElement = isJsxElement;
/** Whether a signature gives a JSX element: by its result's type, or — where the app's project cannot resolve what the
 *  library's declaration names (`import("solid-js/web").JSX.Element`, from a package the app has another version of) —
 *  by the name the library wrote: `JSX.Element` is an element whoever declares it. */
const givesElement = (ts, checker, s) => {
  const r = s.getReturnType();
  if (isElement(ts, checker, r)) return true;
  // a render prop generic in what it gives (`children: (item: Accessor<T>) => U`, `U extends JSX.Element`) gives an element
  if (r.flags & ts.TypeFlags.TypeParameter) { const c = checker.getBaseConstraintOfType(r); if (c && isElement(ts, checker, c)) return true; }
  const n = s.declaration?.type;
  return !!(r.flags & ts.TypeFlags.Any) && r.intrinsicName === "error" && !!n && n.pos >= 0 && /(^|[.\s])JSX\.Element$/.test(n.getText());
};
/** A component: a callable whose signatures take at most props and give a JSX element. */
function isComponent(ts, checker, t) {
  const sigs = checker.getNonNullableType(t).getCallSignatures();
  return sigs.length > 0 && sigs.every(s => s.getParameters().length <= 1 && givesElement(ts, checker, s));
}
// a plain function: callable, with nothing else on it (a callable with properties, like a form action, is a value)
const isFn = (checker, t) => { const u = checker.getNonNullableType(t); return u.getCallSignatures().length > 0 && !u.getProperties().length; };

/** A function's type as it is written, where every part of it can be: its parameters by name and type (`any` for a type
 *  the draft cannot name), what it answers (`void`, a promise, a primitive, a type the draft can name). undefined for an
 *  overloaded or generic one, or a parameter that is a pattern. The same type as the library's wherever it says more
 *  than `any`, so rx-tsc holds it (TY-6). */
function fnText(ts, checker, t) {
  const sigs = checker.getNonNullableType(t).getCallSignatures();
  if (sigs.length !== 1 || sigs[0].getTypeParameters()?.length) return undefined;
  const ps = [];
  // a part that is itself a function or a record (`(id: string) => () => void`) has no text as a row's own type would
  // (the checker would read it); inside a function's signature it is TypeScript's, as the library declares it
  const said = (x, n) => { const a = text(ts, checker, x, undefined, n); if (!CTX.decl || !introduced(a)) return a; const o = declared(ts, checker, n, x, true); return o && !introduced(o) ? (/^\([^]*\) => /.test(o) || /=>/.test(o) && /[|&]/.test(o) ? `(${o})` : o) : a; };
  for (const p of sigs[0].getParameters()) {
    const d = p.valueDeclaration;
    if (!/^[A-Za-z_$][\w$]*$/.test(p.name) || p.name === "this") return undefined;
    if (d && ts.isParameter(d) && d.dotDotDotToken) { ps.push(`...${p.name}: ${ANY("rest")}[]`); continue; }
    const opt = d && ts.isParameter(d) && (d.questionToken || d.initializer) ? "?" : "";
    const pt = checker.getTypeOfSymbol(p);
    ps.push(`${RESERVED.has(p.name) ? `${p.name}_` : p.name}${opt}: ${said(opt ? checker.getNonNullableType(pt) : pt, annotation(ts, p))}`);
  }
  const r = sigs[0].getReturnType(); const rs = checker.typeToString(r);
  const named = said(r, sigs[0].declaration?.type);
  const rt = r.flags & ts.TypeFlags.Void ? "void" : /^Promise</.test(rs) && /^any\u00ab/.test(named) ? `Promise<${named}>` : named;
  return `(${ps.join(", ")}) => ${rt}`;
}
function propText(ts, checker, p, at, precise = false, obj) {
  const t = checker.getTypeOfSymbolAtLocation(p, at);
  const here = obj && CTX.refs ? `${obj}[${JSON.stringify(p.name)}]` : undefined;   // the prop, in the library's own declaration
  const opt = p.flags & ts.SymbolFlags.Optional ? "?" : "";
  const fnSigs = checker.getNonNullableType(t).getCallSignatures();
  if (p.name === "children" && fnSigs.length && fnSigs.every(s => givesElement(ts, checker, s)))
    return `children${opt}: (${fnSigs[0].getParameters().map((q, i) => `${q.name}: ${(CTX.refs && (whole(ts, checker, checker.getTypeOfSymbol(q), undefined, annotation(ts, q)) ?? (here && fnSigs.length === 1 ? `Parameters<${present(checker, t, here)}>[${i}]` : undefined))) || ANY("render-prop")}`).join(", ")}) => View`;   // MO-11k: a render prop, written `{view (…) { … }}`
  // a function of nothing that gives an element is called with no props: a render prop, not a component (`Component`
  // takes props, and TypeScript does not hold a function of one argument where the library calls with none)
  if (CTX.decl && fnSigs.length && fnSigs.every(s => !s.getParameters().length && givesElement(ts, checker, s))) return `${p.name}${opt}: () => View`;
  if (isComponent(ts, checker, t) && !isElement(ts, checker, t)) return `${p.name}${opt}: Component`;
  if (/^(as|component)$/.test(p.name) && checker.getNonNullableType(t).isUnion?.() && checker.getNonNullableType(t).types.some(u => isComponent(ts, checker, u))) return `${p.name}${opt}: string | Component`;   // a polymorphic \`as\`: a tag or a component (MO-11c)
  if (isElement(ts, checker, t)) return `${p.name}${opt}: View`;
  if (isFn(checker, t)) return `${p.name}${opt}: ${(precise && fnText(ts, checker, t)) || callbackText(ts, checker, t, here, "callback", annotation(ts, p))}`;   // a callback (MO-10g)
  // MO-11c (2026-11-24): a record or a list of components — each component in the literal the prop is given is applied there
  if (obj !== undefined || CTX.decl) { const held = heldComponents(ts, checker, t, at); if (held) { const all = `${p.name}${opt}: ${held.all}`; HELD_ONLY.set(all.replace(MARK, ""), `${p.name}${opt}: ${held.only}`); return all; } }
  return `${p.name}${opt}: ${text(ts, checker, t, here, annotation(ts, p))}`;
}

/** An options object the library declares (not a primitive's methods, a class instance or an array): its callbacks matter. */
function ownObject(ts, t, checker) {
  if (!(t.flags & ts.TypeFlags.Object) || t.getCallSignatures().length) return false;
  if (checker && (checker.isTupleType(t) || checker.isArrayType(t))) return false;   // a tuple (a Signal) or an array is written whole
  if (t.getProperties().some(q => q.name.startsWith("__@"))) return false;          // an iterable (`[Symbol.iterator]`) is not a record
  if (t.symbol?.flags & ts.SymbolFlags.Class) return false;
  const decl = t.symbol?.declarations?.[0];
  const file = decl?.getSourceFile().fileName ?? "";
  return !!t.getProperties().length && !/\/typescript\/lib\/lib\./.test(file) && !t.getProperties().some(q => q.name.startsWith("#"));
}
/** Whether a record of an object's fields can be what the library takes: every field it requires has a name a row can
 *  write (a `~standard` or `"data-x"` it requires cannot be left out of the record, and the type's own name says it). */
const sayable = (ts, t) => t.getProperties().every(q => /^[A-Za-z_$][\w$]*$/.test(q.name) || q.flags & ts.SymbolFlags.Optional);
const RESERVED = new Set(["ref", "fn", "pure", "component", "context", "error", "type", "const", "export"]);
/** A Solid signal, `[getter, setter]` (Solid 2's getter is a branded accessor): what it holds, or undefined. A type
 *  parameter is looked at through its constraint, a union through its members. No word of a row says a parameter takes
 *  one (MO-10h was `signal init: T`): the draft keeps the library's type and says where the signal is made (MO-10c). */
function signalOf(ts, checker, t) {
  const c = t.flags & ts.TypeFlags.TypeParameter ? checker.getBaseConstraintOfType(t) : t;
  if (!c) return undefined;
  if (c.flags & ts.TypeFlags.Union) { for (const u of c.types) { const r = signalOf(ts, checker, u); if (r) return r; } return undefined; }
  if (!checker.isTupleType(c)) return undefined;
  const [get, set] = checker.getTypeArguments(c);
  const g = get && checker.getNonNullableType(get).getCallSignatures().find(x => !x.getParameters().length);
  if (!g || !set || !checker.getNonNullableType(set).getCallSignatures().length) return undefined;
  return g.getReturnType();
}
/** Whether `s` is one type's text: no `,` outside its brackets (a parameter list would have one). */
function oneType(s) {
  let d = 0;
  for (let i = 0; i < s.length; i++) { const c = s[i]; if ("([{<".includes(c)) d++; else if (")]}".includes(c) || (c === ">" && s[i - 1] !== "=")) d--; else if (c === "," && d === 0) return false; }
  return d === 0;
}
/** MO-11c (2026-11-24): a prop that holds components in a record or a list (`builtins: { Heading?: … }`, an MDX
 *  provider's `components`, a tab strip's panels) — written as the checker reads it, each component a `Component`:
 *  `{ all, only }`, the record with every field, and with its component fields alone (what a row adds to a type the
 *  library names, MO-8o). undefined: the type holds none where a row can say so. */
function heldComponents(ts, checker, t, at, depth = 0) {
  const u = checker.getNonNullableType(t);
  const comp = x => isComponent(ts, checker, x) && !isElement(ts, checker, x) && checker.getNonNullableType(x).getCallSignatures().every(g => g.getParameters().length === 1);
  if (depth > 1 || u.isUnion?.() || u.getCallSignatures().length) return undefined;
  if (checker.isArrayType(u)) {
    const e = checker.getTypeArguments(u)[0]; if (!e) return undefined;
    if (comp(e)) return { all: "Component[]", only: "Component[]" };
    const r = heldComponents(ts, checker, e, at, depth + 1); return r && { all: `${r.all}[]`, only: `${r.only}[]` };
  }
  if (!(u.flags & ts.TypeFlags.Object) || checker.isTupleType(u) || u.symbol?.flags & ts.SymbolFlags.Class) return undefined;
  const ix = checker.getIndexInfoOfType(u, ts.IndexKind.String);
  if (ix && comp(ix.type) && !u.getProperties().length) return { all: "Record<string, Component>", only: "Record<string, Component>" };
  const ps = u.getProperties(); if (!ps.length || ps.length > 80 || !ps.every(q => /^[A-Za-z_$][\w$]*$/.test(q.name))) return undefined;
  const file = u.symbol?.declarations?.[0]?.getSourceFile().fileName ?? ""; if (/\/typescript\/lib\/lib\./.test(file)) return undefined;
  const of = q => checker.getTypeOfSymbolAtLocation(q, at);
  if (!ps.some(q => comp(of(q)))) return undefined;
  // a record of components is data: an object that also has functions of its own — a route (`notFoundRoute`, with
  // `update`, `addChildren`, its hooks, and a `Link` among them) — is an instance of something, and written `{ Link:
  // Component }` it is no type the library accepts (2026-11-24: that one prop had TypeScript refuse the whole named
  // reading of <RouterProvider>, whose row then fell to its props' place, thirteen parts)
  // (a function of nothing that gives an element is a component with no props, written as the library types it:
  // solid-marked's `Break?: () => JSX.Element` beside its `Heading?: Component<…>`)
  const view = x => { const r = accessorOf(ts, checker, x); return !!r && isElement(ts, checker, r); };
  if (ps.some(q => { const x = of(q); return !comp(x) && !view(x) && isFn(checker, x); })) return undefined;
  const o = q => q.flags & ts.SymbolFlags.Optional ? "?" : "";
  const only = ps.filter(q => comp(of(q))).map(q => `${q.name}${o(q)}: Component`);
  const all = ps.map(q => comp(of(q)) ? `${q.name}${o(q)}: Component` : propText(ts, checker, q, at));
  return { all: `{ ${all.join("; ")} }`, only: `{ ${only.join("; ")} }` };
}
/** Whether the checker may read something of a prop: it holds a function, a view or a component, and nothing beside it. */
function readsOf(ts, checker, p, at) {
  const as = checker.getTypeOfSymbolAtLocation(p, at), t = checker.getNonNullableType(as);
  if (isElement(ts, checker, as)) return true;
  const all = t.flags & ts.TypeFlags.Union ? t.types : [t];
  return all.every(x => x.getCallSignatures().length) || all.some(x => isElement(ts, checker, x) || isComponent(ts, checker, x)) || !!heldComponents(ts, checker, t, at);
}
/** The records `heldComponents` wrote whole, by their text: the same with the component fields alone. */
const HELD_ONLY = new Map();
function paramText(ts, checker, p, at, generic = false, here) {
  const t = checker.getTypeOfSymbolAtLocation(p, at);
  const node = annotation(ts, p);   // MO-8o: the parameter as the library declares it
  const opt = p.valueDeclaration && ts.isParameter(p.valueDeclaration) && (p.valueDeclaration.questionToken || p.valueDeclaration.initializer) ? "?" : "";   // MO-8e
  const name = RESERVED.has(p.name) ? `${p.name}_` : p.name;   // a parameter's name is only a name: never a row word (`ref`)
  const read0 = accessorOf(ts, checker, t), read = read0 && (named(ts, checker, t) || isElement(ts, checker, read0)) ? read0 : undefined;
  // MO-11u (2026-11-24): a function of nothing that gives an element is no accessor of a value — the library renders it
  // (a component with no props, a render function: sonner's `toast(() => <Saved />)`). The parameter takes a view, or
  // such a function, and a call of the fn is a call, not an instantiation
  if (read && isElement(ts, checker, read)) { const u = checker.getNonNullableType(t); return `${name}${opt}: ${u.flags & ts.TypeFlags.Union && u.types.some(x => !x.getCallSignatures().length) ? "View | " : ""}(() => View)`; }
  if (read) {
    // an accessor of an options object the library declares: its callbacks are typed as functions, as a plain options
    // parameter's are (what marks one `handler` is written on it)
    const ro = checker.getNonNullableType(read);
    if (!generic && ownObject(ts, ro, checker) && sayable(ts, ro) && ro.getProperties().length <= 24 && ro.getProperties().some(q => isFn(checker, checker.getTypeOfSymbolAtLocation(q, at))))
      return `ref ${name}${opt}: { ${ro.getProperties().filter(q => /^[A-Za-z_$][\w$]*$/.test(q.name)).map(q => propText(ts, checker, q, at, true)).join("; ")} }`;
    // MO-8q (2026-11-24): the same record where the fn has type parameters of its own, in the reading that carries them
    // (`named`): its fields range over them by name (`queryFn: () => Promise<TData>`), so the record is written, and
    // said by its place only where a field has no text. TypeScript holds the reading or the next one is taken.
    if (generic && CTX.named && CTX.decl && ownObject(ts, ro, checker) && sayable(ts, ro) && ro.getProperties().length <= 24 && ro.getProperties().some(q => isFn(checker, checker.getTypeOfSymbolAtLocation(q, at)))) {
      const rec = `ref ${name}${opt}: { ${ro.getProperties().filter(q => /^[A-Za-z_$][\w$]*$/.test(q.name)).map(q => propText(ts, checker, q, at, true)).join("; ")} }`;
      if (!introduced(rec) && !byPlace(rec)) return rec;
    }
    // what the accessor reads, by its place where it has no name: what the parameter answers when called
    const fnAt = here && CTX.decl ? (checker.getNonNullableType(t).flags & ts.TypeFlags.Union ? `Extract<${present(checker, t, here)}, () => unknown>` : present(checker, t, here)) : undefined;
    return `ref ${name}${opt}: ${text(ts, checker, read, fnAt && `ReturnType<${fnAt}>`, innerNode(ts, checker, node, read))}`;
  }
  // a callback (MO-10g); one whose type is a predicate, or ranges over the signature's type parameters, is written `any`
  if (isFn(checker, t)) {
    // a parameter that is one of the row's type parameters is that parameter (its bound's signature is not it)
    const own = checker.getNonNullableType(t);
    if (CTX.decl && own.flags & ts.TypeFlags.TypeParameter && CTX.scope.has(own.symbol)) { const said = declared(ts, checker, node, t, true); if (said && !introduced(said)) return `${name}${opt}: ${said}`; }
    if (!checker.getNonNullableType(t).getCallSignatures().some(s => checker.getTypePredicateOfSignature?.(s))) {
      const c = callbackText(ts, checker, t, here, "callback", node);
      // MO-11c, MO-11u: a parameter that is a component (it takes props and gives an element) is written `Component<P>`,
      // the same type under its own name — what the fn is given is then read as what it is
      { const k = isComponent(ts, checker, t) && !isElement(ts, checker, t) ? /^\(([A-Za-z_$][\w$]*): ([^]*)\) => View$/.exec(c) : null;
        if (k && oneType(k[2])) return `${name}${opt}: Component<${k[2]}>`; }
      // the last reading (`whole`): a callback with no name is its place as it stands — taken apart
      // (`(...args: Parameters<P>) => ReturnType<P>`) it is the function at its bounds, which TypeScript may not hold
      return `${name}${opt}: ${CTX.whole && here && (byPlace(c) || introduced(c)) ? present(checker, t, here) : c}`;
    }
    // a predicate is no `=> boolean` (a function that answers a boolean is not one): as the library declares it, else by its place
    const said = declared(ts, checker, node, t, true);
    return `${name}${opt}: ${said && !introduced(said) ? said : (CTX.decl && here) || ANY("predicate")}`;
  }
  const obj = checker.getNonNullableType(t);
  if (ownObject(ts, obj, checker) && sayable(ts, obj) && obj.getProperties().some(q => isFn(checker, checker.getTypeOfSymbolAtLocation(q, at)))) {
    const rec = `${name}${opt}: { ${obj.getProperties().filter(q => /^[A-Za-z_$][\w$]*$/.test(q.name)).map(q => propText(ts, checker, q, at, false, present(checker, t, here))).join("; ")} }`;   // its callbacks are typed as functions
    // MO-8q: where a field has no text (a predicate, a function generic in itself), the options by the name the library
    // declares them with, or by their place, before an `any` of the draft's
    const whole_ = CTX.decl && introduced(rec) ? whole(ts, checker, opt ? checker.getNonNullableType(t) : t, opt ? present(checker, t, here) : here, node) : undefined;
    // the last reading: options with a field said by its place (a method generic in itself, taken apart, is the function
    // at its bounds, which TypeScript may not hold) are the library's own, whole, at their place
    if (!whole_ && CTX.whole && here && (byPlace(rec) || introduced(rec))) return `${name}${opt}: ${opt ? present(checker, t, here) : here}`;
    return whole_ ? `${name}${opt}: ${whole_}` : rec;
  }
  return `${name}${opt}: ${text(ts, checker, opt ? checker.getNonNullableType(t) : t, opt ? present(checker, t, here) : here, node)}`;   // `?` already says it may be absent
}

/** What a type may also be: ` | undefined`, ` | null`, from its union members. */
const nullish = (ts, t) => !(t.flags & ts.TypeFlags.Union) ? "" : (t.types.some(x => x.flags & ts.TypeFlags.Undefined) ? " | undefined" : "") + (t.types.some(x => x.flags & ts.TypeFlags.Null) ? " | null" : "");
/** EF-5a: what undoes a call — a function that takes nothing and answers nothing, as TypeScript resolves the type (a
 *  library's own name for it, `VoidFunction`, is that function). */
const isDisposer = (ts, checker, t) => { const u = checker.getNonNullableType(t); const sigs = u.getCallSignatures(); return !u.getProperties().length && !u.getConstructSignatures().length && sigs.length === 1 && !sigs[0].getParameters().length && !sigs[0].getTypeParameters()?.length && !!(sigs[0].getReturnType().flags & ts.TypeFlags.Void); };
/** A function's type where it is a result's part: what it answers is said when it is nothing (`void`), a promise or a
 *  primitive — the evidence MO-10b and MO-10k read; its parameters are left open. */
function fnResultText(ts, checker, t, here) {
  const all = fnText(ts, checker, t);
  const sigs = checker.getNonNullableType(t).getCallSignatures();
  here = CTX.refs ? present(checker, t, here) ?? valueOf(ts, checker, t) : undefined;
  if (all && !(CTX.decl && here && introduced(all))) return all;   // MO-8q: its place before an `any` of the draft's
  if (sigs.length !== 1) return here ? `(...args: Parameters<${here}>) => ReturnType<${here}>` : `(...args: ${ANY("overload")}[]) => ${ANY("overload")}`;
  const whole = atDefaults(ts, checker, sigs[0]); if (whole) return whole;
  const r = sigs[0].getReturnType();                                // what ranges over its type parameters is `any` (text)
  const rs = checker.typeToString(r);
  const rt = r.flags & ts.TypeFlags.Void ? "void" : rs === "Promise<void>" ? "Promise<void>" : /^Promise</.test(rs) ? `Promise<${ANY("method-result")}>` : text(ts, checker, r);
  const said = /^(void|Promise<void>|Promise<any\u00ab[^\u00bb]*\u00bb>|string|number|boolean)$/.test(rt);
  // what the checker reads stays as it was (nothing, a promise, a primitive); the rest is the library's own, by its place
  if (here) return `(...args: Parameters<${here}>) => ${!said ? `ReturnType<${here}>` : /^Promise<any/.test(rt) ? `Promise<Awaited<ReturnType<${here}>>>` : rt}`;
  return `(...args: ${ANY("method-params")}[]) => ${said ? rt : ANY("method-result")}`;
}
/** MO-8o: a generic method's signature as it stands when nothing chooses its type parameters — each at its default,
 *  else its bound, else `unknown` — written from the library's own declaration: `invalidateQueries<T extends QueryKey =
 *  QueryKey>(filters?: InvalidateQueryFilters<T>)` is `(filters?: InvalidateQueryFilters<QueryKey>) => Promise<void>`.
 *  undefined where a part cannot be named. */
function atDefaults(ts, checker, sig) {
  const d = sig.declaration; const tps = sig.getTypeParameters() ?? [];
  if (!CTX.decl || !d || !tps.length || !d.parameters) return undefined;
  const map = new Map();
  for (const tp of tps) {
    const td = tp.symbol?.declarations?.[0]; if (!td || !ts.isTypeParameterDeclaration(td)) return undefined;
    const n = td.default ?? td.constraint;
    const r = n ? print(ts, checker, n, true, map) : { text: "unknown" };
    if (!r.text || introduced(r.text)) return undefined;
    map.set(tp.symbol, r.text);
  }
  const ps = [];
  for (const q of d.parameters) {
    if (!ts.isIdentifier(q.name) || !q.type || q.name.text === "this") return undefined;
    const r = print(ts, checker, q.type, true, map); if (!r.text || introduced(r.text)) return undefined;
    ps.push(`${q.dotDotDotToken ? "..." : ""}${RESERVED.has(q.name.text) ? `${q.name.text}_` : q.name.text}${q.questionToken || q.initializer ? "?" : ""}: ${r.text}`);
  }
  const rt = sig.getReturnType().flags & ts.TypeFlags.Void ? { text: "void" } : d.type ? print(ts, checker, d.type, true, map) : {};
  if (!rt.text || introduced(rt.text) || checker.getTypePredicateOfSignature?.(sig)) return undefined;
  return `(${ps.join(", ")}) => ${rt.text}`;
}
/** A zero-argument function field that is called, by its name (`getPageCount()`, `isActive()`); any other is read as an accessor. */
const CALLED = /^(get|is|has|can|should|will|to|as|find|make|create|use|on|do|run)[A-Z0-9_]/;
/** MO-10b, MO-10k: a result's type a step at a time, where the library declares a small object — every field it has, an
 *  accessor `ref`, a function with what it answers — or an instance of a class, by the methods that answer nothing or
 *  a primitive (the object stays the library's own: no accessor part is declared on it). undefined: not such a type. */
function structural(ts, checker, t, depth = 0, here, refs = depth === 0) {   // `refs`: its fields are where `ref` is read
  const at = q => here && CTX.refs ? `${present(checker, t, here)}[${JSON.stringify(q.name)}]` : undefined;
  const u = checker.getNonNullableType(t);
  if (!(u.flags & ts.TypeFlags.Object) || u.getCallSignatures().length || checker.isTupleType(u) || checker.isArrayType(u)) return undefined;
  const decl = u.symbol?.declarations?.[0];
  if (/\/typescript\/lib\/lib\./.test(decl?.getSourceFile().fileName ?? "")) return undefined;   // a Promise, a Map, an Element: the platform's
  const props = u.getProperties().filter(q => /^[A-Za-z_$][\w$]*$/.test(q.name) && !(q.flags & ts.SymbolFlags.Prototype) && !q.name.startsWith("_"));
  const typeOf = q => checker.getTypeOfSymbol(q);
  const opt = q => q.flags & ts.SymbolFlags.Optional ? "?" : "";
  if (u.symbol?.flags & ts.SymbolFlags.Class) {
    // a method is declared where the checker reads what it answers: nothing, a promise, a primitive (decided without `here`)
    const ms = props.filter(q => isFn(checker, typeOf(q))).filter(q => { const f = fnResultText(ts, checker, typeOf(q)); return !/=> any\u00ab[^\u00bb]*\u00bb$/.test(f); }).map(q => [q, fnResultText(ts, checker, typeOf(q), at(q))]);
    return ms.length && ms.length <= 64 ? `{ ${ms.map(([q, f]) => `${q.name}${opt(q)}: ${f}`).join("; ")} }` : undefined;
  }
  if (!props.length || props.length > 32 || u.getProperties().some(q => q.name.startsWith("__@") || q.name.startsWith("#"))) return undefined;
  const field = q => {
    const qt = typeOf(q);
    if (isDisposer(ts, checker, qt)) return "() => void";
    const read = accessorOf(ts, checker, qt);
    // MO-10b: only the result's own fields are declared accessors; one nested deeper is a value — the function it is
    if (read && !refs) return `() => ${text(ts, checker, read, at(q) && `ReturnType<${at(q)}>`, innerNode(ts, checker, annotation(ts, q), read))}`;
    if (read && refs) shaped(ts, checker, qt, q.name);
    if (read) return CALLED.test(q.name) ? `() => ${(st => st ? st + nullish(ts, read) : text(ts, checker, read))(structural(ts, checker, read, depth + 1))}` : `ref ${text(ts, checker, read, at(q) && `ReturnType<${at(q)}>`, innerNode(ts, checker, annotation(ts, q), read))}`;
    if (isFn(checker, qt)) return fnResultText(ts, checker, qt, at(q));
    const st = depth < 2 ? structural(ts, checker, qt, depth + 1, at(q)) : undefined;
    return st ? st + (CTX.refs ? nullish(ts, qt) : "") : text(ts, checker, qt, at(q), annotation(ts, q));
  };
  return `{ ${props.map(q => `${q.name}${opt(q)}: ${field(q)}`).join("; ")} }`;
}
/** The tuple a result's annotation writes: itself, under `readonly` or parentheses, or what an alias with no type
 *  parameters stands for (`MutationObserverReturn`), so each part is read where the library declares it. */
function tupleNode(ts, checker, node, depth = 0) {
  if (!node || node.pos < 0 || depth > 4) return undefined;
  if (ts.isTupleTypeNode(node)) return node;
  if (ts.isTypeOperatorNode(node) || ts.isParenthesizedTypeNode(node)) return tupleNode(ts, checker, node.type, depth + 1);
  if (ts.isTypeReferenceNode(node) && !node.typeArguments?.length) {
    let y = checker.getSymbolAtLocation(ts.isQualifiedName(node.typeName) ? node.typeName.right : node.typeName);
    if (y && y.flags & ts.SymbolFlags.Alias) y = checker.getAliasedSymbol(y);
    const d = y?.declarations?.[0];
    if (d && ts.isTypeAliasDeclaration(d) && !d.typeParameters?.length) return tupleNode(ts, checker, d.type, depth + 1);
  }
  return undefined;
}
/** A tuple's function part (a signal's setter): what it takes, where it can be named and it answers nothing. */
const setter = (ts, checker, x, node, at) => { const c = CTX.refs ? callbackText(ts, checker, x, CTX.decl ? at : undefined, "function-result", node) : ""; return (CTX.decl ? !introduced(c) && c : /\) => void$/.test(c) && !/\bany\b/.test(c)) ? c : `(...args: ${ANY("function-result")}[]) => void`; };
/** What a result written a step at a time says that the checker reads (MO-10b): a part that is an accessor, a function
 *  that answers nothing or a promise. Without one, the type's own name says as much, and is written (MO-8o). */
const EVIDENCE = /\bref\s|=>\s*(?:void\b|Promise<)/;
const byPlace = s => /\b(?:Parameters|ReturnType)</.test(s);
function resultText(ts, checker, t, todos, generic = false, here, node) {
  if (isComponent(ts, checker, t) && !isElement(ts, checker, t)) return "Component";
  const read = accessorOf(ts, checker, t);
  if (read) shaped(ts, checker, t, "");
  if (read) return `ref ${text(ts, checker, read, CTX.decl && here ? `ReturnType<${here}>` : undefined, innerNode(ts, checker, node, read))}`;   // MO-8q: what the accessor answers, by its place, before an `any`
  if (isDisposer(ts, checker, t)) return nullish(ts, t) ? `(() => void)${nullish(ts, t)}` : "() => void";   // EF-5a: the checker holds a call to keeping it
  if (isFn(checker, t)) return generic && !CTX.decl ? ANY("generic") : `(${callbackText(ts, checker, t, here, "function-result", node)})${nullish(ts, t)}`;   // a function part is io (MO-10b); it may be absent
  const tuple = checker.getNonNullableType(t);
  // a tuple of fixed parts, each read as a part (a rest or an optional element is the type's own text)
  if (checker.isTupleType(tuple) && (tuple.target?.elementFlags ?? []).every(f => f & ts.ElementFlags.Required) && (!CTX.decl || tuple === t)) {
    const ro = tuple.target?.readonly ? "readonly " : "";   // MO-10b: `as const` results stay read-only
    // the parts as the library's declaration writes them, where it writes a tuple of as many
    const tn = tupleNode(ts, checker, node);
    const parts = tn && tn.elements.length === checker.getTypeArguments(tuple).length ? tn.elements.map(e => ts.isNamedTupleMember(e) ? e.type : e) : [];
    // MO-8q: a part with no text of its own — a record written in place (`[value, { stop, start }]`), a type that ranges
    // over an alias's parameters — is the record as the library writes it (an accessor in it is a value: MO-10b declares
    // the result's own parts), else its place in the library's result
    const partAt = i => here && CTX.refs ? `${here}[${i}]` : undefined;
    const value = (x, i) => {
      const said = text(ts, checker, x, undefined, parts[i]);
      if (!CTX.decl || !introduced(said)) return said;
      const open = declared(ts, checker, parts[i], x, true);
      return open && !introduced(open) ? open : partAt(i) ?? said;
    };
    return `${ro}[${checker.getTypeArguments(tuple).map((x, i) => accessorOf(ts, checker, x) && shaped(ts, checker, x, String(i)) ? `ref ${text(ts, checker, accessorOf(ts, checker, x), CTX.decl && partAt(i) ? `ReturnType<${partAt(i)}>` : undefined, innerNode(ts, checker, parts[i], accessorOf(ts, checker, x)))}` : isFn(checker, x) ? (generic && !CTX.decl ? ANY("generic") : setter(ts, checker, x, parts[i], partAt(i))) : value(x, i)).join(", ")}]`;
  }
  let s = text(ts, checker, t, here, node);
  // a promise is said to be one, whatever it answers (MO-10b reads it): by its place, else of `any`
  if (CTX.refs && /^Promise</.test(checker.typeToString(t)) && !/^Promise</.test(s)) s = s === here ? `Promise<Awaited<${here}>>` : /^any\u00ab[^\u00bb]*\u00bb$/.test(s) ? `Promise<${s}>` : s;
  if (/^Promise</.test(checker.typeToString(t))) todos.push("what does its promise reject with? add rejects(<classes>) (default Error)");
  else {
    if (ownObject(ts, t, checker)) todos.push("is the result a store with fields that wait or throw when read? a row cannot say so (MO-8r): hand each such field out as a function from a module of the app's own, declared `pending fails(Error) ref` (MO-10l)");
    // (one that may be absent, `{ … } | null`, is no record to the notation: `ref` is read in the record alone, so its
    // accessors are the functions they are)
    // what the type does not say as text (it names the library's own types) is said a step at a time
    // MO-8o: a result the library names is written by that name, unless its parts say what the checker reads
    if (unsaid(ts, checker, t)) { const st = structural(ts, checker, t, 0, here, !nullish(ts, t)); if (st && !(CTX.decl && !introduced(s) && (introduced(st) || (CTX.whole && byPlace(st)) || (!EVIDENCE.test(st) && (!byPlace(s) || byPlace(st)))))) { s = st + nullish(ts, t); if (/\bref /.test(st)) todos.push("its fields drafted `ref` are read as values (`x.items`); one the app calls instead (`x.items()`) is a function, `() => T` (MO-10b)"); } }
  }
  return s;
}

/** MO-10l: a drafted fn row with `pending` or `fails(…)` written before the `ref` parts `waits` names — `""` the whole
 *  result, else a tuple's index or a record's field. A part the row does not draft as `ref` is left as it is. */
function withWaits(row, waits) {
  const open = row.indexOf("(", row.search(/\bfn\s+[\w$.]+/)); if (open < 0) return row;
  let d = 0, close = -1;
  for (let j = open; j < row.length; j++) { const c = row[j]; if ("([{<".includes(c)) d++; else if (")]}>".includes(c) && !(c === ">" && row[j - 1] === "=")) { if (--d === 0) { close = j; break; } } }
  const m = close < 0 ? null : /^\s*:\s*/.exec(row.slice(close + 1)); if (!m) return row;
  const at = close + 1 + m[0].length;
  const tail = /\s(?:uses\(|provides\(|nests\(|instantiates\b|rejects\()/.exec(row.slice(at));
  const ret = tail ? row.slice(at, at + tail.index) : row.slice(at), rest = tail ? row.slice(at + tail.index) : "";
  const split = (t, seps) => { const out = []; let k = 0, from = 0; for (let j = 0; j < t.length; j++) { const c = t[j]; if ("([{<".includes(c)) k++; else if (")]}>".includes(c) && !(c === ">" && t[j - 1] === "=")) k--; else if (k === 0 && seps.includes(c)) { out.push(t.slice(from, j)); from = j + 1; } } out.push(t.slice(from)); return out; };
  // (`words` of "" take the word off: the function of nothing the part is)
  const mark = (part, words) => words === undefined || !/^\s*ref\s/.test(part) ? part : words ? part.replace(/^(\s*)ref\s/, `$1${words} ref `) : part.replace(/^(\s*)ref\s+/, "$1() => ");
  let out = ret;
  if (/^ref\s/.test(ret)) { out = mark(ret, waits[""]); if (waits[""] === "") out = `(${out})`; }
  else if (ret.startsWith("[") && ret.endsWith("]")) out = `[${split(ret.slice(1, -1), ",").map((x, i) => mark(x, waits[String(i)])).join(",")}]`;
  else if (ret.startsWith("{") && ret.endsWith("}")) out = `{${split(ret.slice(1, -1), ";").map(f => { const c = f.indexOf(":"); if (c < 0) return f; const key = f.slice(0, c).trim().replace(/^readonly\s+/, "").replace(/\?$/, ""); return `${f.slice(0, c + 1)}${mark(f.slice(c + 1), waits[key])}`; }).join(";")}}`;
  return row.slice(0, at) + out + rest;
}
/** What the checker reads of a fn's row, without its types: which parameters carry a word or are a function or a
 *  record of functions, and what kind of thing the result is. Two signatures with one shape are one row to the checker. */
function shapeOf(row) {
  const di = require("./declare-infer.js"); const r = di.parseRow(row); if (!r) return row;
  const ps = r.params.map((part, i) => { const p = di.named(row, part); if (!p) return `${i}:?`; const k = p.rest ? "rest" : di.fnTypeAt(row, p.type, p.end) ? "fn" : di.records(row, p.type, p.end).some(fs => fs.some(fp => { const q = di.named(row, fp); return q && (di.fnTypeAt(row, q.type, q.end) || /^(?:handler|ref)\b/.test(row.slice(q.type))); })) ? "record" : /^Component\b/.test(row.slice(p.type)) ? "component" : ""; return k || p.words.trim() ? `${i}:${p.words.trim()}${k}` : ""; }).filter(Boolean);
  const tail = row.slice(r.close + 1).replace(/^\s*:\s*/, "");
  const ret = /^ref\b/.test(tail) ? "ref" : /^Promise</.test(tail) ? "promise" : /^void\b/.test(tail) ? "void" : /^Component\b/.test(tail) ? "component" : /^\(/.test(tail) ? "fn" : /^[[{]/.test(tail) ? (/\bref\b/.test(tail) ? "parts-ref" : "parts") : "value";
  return `${ps.join(",")}|${ret}|${/\binstantiates\b/.test(tail) ? "i" : ""}`;
}
/** @returns {string} the draft `.d.rx` for `spec`, imported from `from` (a directory). */
function declare(ts, spec, from, options = {}, how = {}) {
  const host = ts.createCompilerHost({ strict: true, skipLibCheck: true, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve, jsxImportSource: "@solidjs/web", ...options });
  const entry = path.join(from, "__rx_declare__.ts");
  const code = `import * as __m from ${JSON.stringify(spec)};\nexport { __m };\n`;
  const { getSourceFile, fileExists } = host;
  const parsed = new Map();   // a file is parsed once for the draft: its program and the packages'
  host.getSourceFile = (f, ...rest) => path.resolve(f) === entry ? ts.createSourceFile(f, code, ts.ScriptTarget.ES2022) : parsed.get(f) ?? (parsed.set(f, getSourceFile.call(host, f, ...rest)), parsed.get(f));
  host.fileExists = f => path.resolve(f) === entry || fileExists.call(host, f);
  const program = ts.createProgram([entry], { strict: true, skipLibCheck: true, noEmit: true, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve, jsxImportSource: "@solidjs/web", ...options }, host);
  CTX = { refs: false, scope: new Set() };
  const shapedBy = new Map();   // an export → the parts of its result that are only shaped as accessors
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(entry);
  const imp = sf.statements[0];
  const mod = checker.getSymbolAtLocation(imp.moduleSpecifier);
  if (!mod) throw new Error(`${spec}: no TypeScript types found from ${from}`);
  // the library's own file: what its rows name is resolved from here (MO-8o), not from the app's folder
  const lib = spec.startsWith(".") ? undefined : mod.declarations?.[0]?.getSourceFile().fileName;
  const out = [`// Drafted by rx-declare from ${spec}'s TypeScript types. Check every TODO, then delete it; rx-tsc checks the rest (TY-6).`];
  if (!spec.startsWith(".")) {                                                            // MO-8f: pinned to the version it was drafted from
    const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    const v = require("./versions.js").installed(pkg, from); if (v) out.push(`//@ for ${pkg} ^${v}`);
  }
  const opts = { strict: true, skipLibCheck: true, noEmit: true, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve, jsxImportSource: "@solidjs/web", ...options };
  const real = JSON.stringify(spec);
  /** The rows, with the library's types named where it declares them (`refs`, MO-8m) or left `any` (as every draft was). */
  const rows = (mode, roots) => {   // `roots`: of these exports alone
  const refs = !!mode;
  const out = [];
  const contexts = [];
  const lines = [];
  const placed = new Set();   // the components whose props are their place
  const wide = new Set();   // the components whose props are written out though they are more than a row should hold
  CTX = { refs, cache: require("./library-resolve.js").resolutions(ts, opts, host), decl: !!mode.decl, whole: !!mode.whole, named: !!mode.named, spec, entry, lib, options: opts, host, program, mod, scope: new Set(), exports: new Map() };
  // the module's own types, each with how many type arguments its alias row takes (at least, at most): a row names one
  // bare where what it writes fits. As the library declares them, until a row's bounds turn out not to be nameable
  OWN_ALL = new Map(checker.getExportsOfModule(mod).map(s0 => [s0.name, s0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s0) : s0]).filter(([, y]) => y.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface) && !(y.flags & ts.SymbolFlags.Value)).map(([n, y]) => { const tp = y.declarations?.[0]?.typeParameters ?? []; return [n, refs ? [tp.filter(q => !q.default).length, tp.length] : tp.some(q => !q.default) ? [tp.length, tp.length] : [0, 0]]; }));
  const aliases = new Map();
  for (const s0 of checker.getExportsOfModule(mod)) {
    const sym = s0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s0) : s0; const name = s0.name;
    if (!(sym.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface)) || sym.flags & ts.SymbolFlags.Value) continue;
    const tp = sym.declarations?.[0]?.typeParameters ?? [];
      const ps = tp.some(p => !p.default) ? tp.map(p => p.name.text) : [];   // one whose parameters all have defaults is named bare
      // MO-8m: with its parameters' bounds and defaults as the library declares them, where they can be named, so the
      // alias is a type TypeScript accepts (`Row<T>` for a `Row<T extends object>` was an error of the draft's own)
      const full = refs && tp.length ? typeParams(ts, checker, tp.map(p => checker.getSymbolAtLocation(p.name)).filter(Boolean)) : "";
      CTX.scope = new Set();
      if (full) { OWN_ALL.set(name, [tp.filter(p => !p.default).length, tp.length]); aliases.set(name, `export type ${name}${full} = import(${JSON.stringify(spec)}).${name}<${tp.map(p => { const y = checker.getSymbolAtLocation(p.name); return (y && CTX.rename?.get(y)) ?? p.name.text; }).join(", ")}>`); continue; }
      // bounds that cannot be named: no alias TypeScript would accept, so a row names the type in place, `import(…).T<…>`
      if (refs && ps.length && tp.some(p => p.constraint)) { OWN_ALL.delete(name); aliases.set(name, `// ${name}<${tp.map(p => p.name.text).join(", ")}>: a type of ${spec} whose parameters' bounds are not exported: name it in place, import(${JSON.stringify(spec)}).${name}<…>`); continue; }
      OWN_ALL.set(name, [ps.length, ps.length]);
      aliases.set(name, `export type ${name}${ps.length ? `<${ps.join(", ")}>` : ""} = import(${JSON.stringify(spec)}).${name}${ps.length ? `<${ps.join(", ")}>` : ""}`);

  }
  OWN = new Set(checker.getExportsOfModule(mod).map(s0 => [s0.name, s0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s0) : s0]).filter(([, y]) => y.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface) && !(y.flags & ts.SymbolFlags.Value) && !(y.declarations?.[0]?.typeParameters ?? []).length).map(([n]) => n));
  // MO-8t: an export's own methods — `toaster.show`, `toast.success` — each drafted as a fn is, after its object. A
  // method is a property the library's own types declare (not what every function, array or string has) whose type is
  // called and is no component; one step down, and no further. A property that may be absent (`_refreshRoute?: () => …`,
  // `F | undefined`) is no method: a row would say it can be called as it stands, and TypeScript does not hold that row
  // (it was drafted, not held, and written with `any` for every type: 33 for TanStack Router's `_replaceRouteChunk`)
  const methodsOf = (base, bt) => bt.getProperties().filter(q => /^[a-z_$][\w$]*$/.test(q.name) && !/^(toString|toJSON|valueOf|toLocaleString)$/.test(q.name) && (q.declarations ?? []).length && (q.declarations ?? []).every(d => !program.isSourceFileDefaultLibrary(d.getSourceFile()))).map(q => ({ member: true, name: `${base}.${q.name}`, sym: q, t: checker.getTypeOfSymbolAtLocation(q, imp) })).filter(m => m.t.getCallSignatures().length > 0 && !m.t.getConstructSignatures().length && !isComponent(ts, checker, m.t));
  const work = checker.getExportsOfModule(mod).map(sym0 => ({ sym0 }));
  for (let wi = 0; wi < work.length; wi++) {
    const item = work[wi]; const sym0 = item.sym0;
    if (roots && !item.member && !roots.has(sym0.name) && !aliases.has(sym0.name)) continue;
    const sym = item.member ? item.sym : sym0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym0) : sym0;
    const name = item.member ? item.name : sym0.name;
    const leafName = name.split(".").pop();
    if (!item.member) {
    // MO-8u (2026-11-25): a module's default export is the export named `default`, and its row is named so: an `.rx`
    // module imports it as JavaScript does, `import { default as x } from "…"`. (Until then the draft said to hand it
    // out by name from a JS helper, and every such module had one.)
    if (sym.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface) && !(sym.flags & ts.SymbolFlags.Value)) {
      const tp = sym.declarations?.[0]?.typeParameters ?? [];
      // a generic type is declared with its parameters by name: its bounds name the library's own types, which the
      // import states for it (`export type Table<T> = import(…).Table<T>`)
      lines.push(aliases.get(name));
      continue;
    }
    if (!(sym.flags & ts.SymbolFlags.Value)) continue;
    }
    const t = item.member ? item.t : checker.getTypeOfSymbolAtLocation(sym, imp);
    if (!item.member && sym.flags & ts.SymbolFlags.Class) {
      const inst = checker.getDeclaredTypeOfSymbol(sym);
      if (checker.getBaseTypes(inst)?.some(b => /\bError\b/.test(checker.typeToString(b)))) lines.push(`export error ${name}`);
      else lines.push(`// TODO: ${name} is a class: construct it in a JS helper and declare that fn`);
      continue;
    }
    if (!item.member && /^Context</.test(checker.typeToString(t))) { contexts.push(name); continue; }
    const sigs = (item.member ? checker.getNonNullableType(t) : t).getCallSignatures();
    // a component's declaration: its props, those a .d.rx can name (an `aria-label` is passed as any undeclared prop is, MO-11b)
    const componentOf = (as, ct) => {
      const all = ct.getCallSignatures();
      const first = componentRow(as, ct, all[0], all.length === 1);
      // MO-8q: of several signatures, the last is the one a place reads (`Parameters<typeof Kit.Block>[0]`)
      if (!(mode.decl && mode.paths && all.length > 1 && introduced(first))) return first;
      const lastRow = componentRow(as, ct, all[all.length - 1], true);
      return introduced(lastRow) ? first : lastRow;
    };
    const componentRow = (as, ct, csig, single) => {
      const p = csig.getParameters()[0];
      const pt = p ? checker.getTypeOfSymbolAtLocation(p, imp) : undefined;
      // the props, in the library's own declaration: `Parameters<typeof import("kit").Dialog["Content"]>[0]`
      // MO-8d: a generic component's type parameters, as the library declares them, so a prop that ranges over them is
      // written (`value?: Option`); where a bound cannot be named the row has none, as a generic fn's
      const ctps = mode.generics && single && csig.getTypeParameters()?.length ? typeParams(ts, checker, csig.getTypeParameters().map(q => q.symbol)) : "";
      const [root, ...rest] = as.split(".");
      const at = args => present(checker, pt, `Parameters<typeof import(${real}).${root}${rest.map(m => `[${JSON.stringify(m)}]`).join("")}${args}>[0]`);
      const here = mode.paths && pt && single ? at("") : undefined;
      const fields = pt ? checker.getNonNullableType(pt).getProperties().filter(q => /^[A-Za-z_$][\w$]*$/.test(q.name)) : [];
      // MO-8o: the props by the type the library declares them with, and after it only the fields the checker reads
      // something of — a function type (a callback, a render prop), a `Component`, a `View`: any other prop is the type's
      // (props the library writes as a record in place are that record: there is no type to name)
      const pn = p && annotation(ts, p);
      let named = mode.decl && pn && !ts.isTypeLiteralNode(pn) && single ? declared(ts, checker, pn, undefined, true) : undefined;
      // props no module has a name for, of more fields than a reader can use (a part's own beside every attribute of its
      // element), are the library's by their place — at the row's type parameters — with the same fields after it. (The
      // readings that do not take the declaration's annotations write the record whole still, for a component TypeScript
      // does not hold at its place: `anys` ranks it after.)
      if (mode.decl && pt && single && !named && fields.length > FIELDS) { named = at(ctps ? `<${csig.getTypeParameters().map(q => tpName(q.symbol)).join(", ")}>` : ""); placed.add(as); }
      let props = fields.filter(q => !named || readsOf(ts, checker, q, imp)).map(q => propText(ts, checker, q, imp, false, here));
      // the last reading (MO-8q): props with a field that has no text are the library's own, by their place, and the
      // record after them holds the fields that do
      if (mode.whole && here && !named && introduced(props.join("; "))) { named = here; props = props.filter(x => !introduced(x)); }
      if (!named && props.length > FIELDS) wide.add(as);
      // a type that itself ends in a record (`RangeProps & { fallback?: T }`) is written in parentheses: a record that
      // closes the props is the row's own, the fields that carry words (MO-8o), and this one is the library's text
      if (named && /\}\s*$/.test(named.replace(MARK, ""))) named = `(${named})`;
      // (MO-11t: and a prop that takes a view, other than `children` — a component given to it by name is applied there)
      // (MO-11c: and a prop that holds components in a record or a list, with its component fields alone)
      if (named) props = props.filter(x => /^[\w$]+\??: (?:Component$|string \| Component$|\(.*=>)/.test(x.replace(MARK, "")) || /^(?!children\b)[\w$]+\??: (?:View|View \| undefined|string \| View)$/.test(x.replace(MARK, "")) || HELD_ONLY.has(x.replace(MARK, ""))).map(x => HELD_ONLY.get(x.replace(MARK, "")) ?? x);
      // MO-10g: a prop's function type is pure unless it says `handler`, whatever its name, so an event-like name is only
      // a suggestion here, never the word
      const events = [...new Set(props.map(x => /^(on[A-Z][\w$]*)\??\s*:\s*\(/.exec(x)?.[1]).filter(Boolean))];
      // only the parameters a prop names are the row's (the element parameter of a polymorphic `as` is not one)
      const ctpsUsed = ctps ? typeParams(ts, checker, csig.getTypeParameters().map(q => q.symbol), `${named ?? ""} ${props.join("; ")}`) : "";
      CTX.scope = new Set();
      const row = `export component ${as}${ctpsUsed}(props: ${named ? `${named}${props.length ? ` & { ${props.join("; ")} }` : ""}` : `{ ${props.join("; ")} }`})`;
      return events.length ? `// TODO ${as}: ${events.join(", ")}: called later, outside any computation? mark ${events.length > 1 ? "each" : "it"} \`handler (…) => …\`, so a closure there may write sources (MO-10g)\n${row}` : row;
    };
    // MO-11q: a kit's compound parts on one object (`Dialog.Trigger`), the object a component itself or not
    const members = /^[A-Z]/.test(name) ? t.getProperties().filter(q => /^[A-Z]/.test(q.name)).map(q => [q.name, checker.getTypeOfSymbolAtLocation(q, imp)]).filter(([, mt]) => isComponent(ts, checker, mt)) : [];
    const memberLines = () => { for (const [m, mt] of members) lines.push(componentOf(`${name}.${m}`, mt)); };
    if (!sigs.length) {
      if (members.length) { memberLines(); continue; }
      lines.push(`export const ${name}: typeof import(${JSON.stringify(spec)}).${name}`);   // MO-8g: a value
      if (!item.member && !checker.isArrayType(t)) work.splice(wi + 1, 0, ...methodsOf(name, t));   // MO-8t: and its methods, each a row
      continue;
    }
    if (!item.member && (/^[A-Z]/.test(name) || name === "default") && isComponent(ts, checker, t)) {   // (a default export has no capital to go by: it is a component by what it is)
      if (/Provider$/.test(name)) lines.push(`// TODO ${name}: does it provide a context to its children? add provides(<context>) (MO-12c)`);
      lines.push(componentOf(name, t));
      if (members.length) { lines.push(`// TODO ${name}: its parts likely read a context it provides: add provides(<context>) to it and uses(<context>) to them (MO-12)`); memberLines(); }
      continue;
    }
    const shortest = [...sigs].sort((a, b) => a.getParameters().length - b.getParameters().length)[0];   // the shortest overload: the common form
    if (sigs.length > 1) overloaded.add(name);
    const rowOf = (sig, todos, last = false) => {
    const params = [...sig.getParameters()];
    const isRest = p => !!p?.valueDeclaration && ts.isParameter(p.valueDeclaration) && !!p.valueDeclaration.dotDotDotToken;
    const generic = !!sig.getTypeParameters()?.length;   // MO-8d: what ranges over type parameters is loosened (TY-6 checks the rest)
    // MO-8m: the row's own type parameters, as the library declares them, so a type that ranges over them is written
    const tps = mode.generics && generic ? typeParams(ts, checker, sig.getTypeParameters().map(q => q.symbol)) : "";
    // a part the draft cannot name is said by its place in the library's own signature — where it has one signature
    // (beside type parameters the place is the signature at its bounds: TypeScript says below whether the row holds)
    // MO-8q: beside the row's own type parameters the place is the signature *at* them — `typeof import("kit").f<T, U>`
    // (an instantiation expression) — so a part with no name is still exactly the library's, and of an overloaded fn
    // where one signature alone takes that many type arguments
    const tpNames = tps ? sig.getTypeParameters().map(q => tpName(q.symbol)) : [];
    const takes = (g, n) => { const ps = g.getTypeParameters() ?? []; return ps.length > 0 && ps.length >= n && ps.filter(q => !q.symbol?.declarations?.[0]?.default).length <= n; };
    const place = !mode.paths ? undefined
      : tps && mode.decl && sigs.filter(g => takes(g, tpNames.length)).length === 1 ? `typeof import(${real}).${name}<${tpNames.join(", ")}>`
      : sigs.length === 1 || last ? `typeof import(${real}).${name}` : undefined;   // `last`: of several signatures, the one TypeScript reads `Parameters<typeof f>` from
    const ps = params.map((p, i) => isRest(p) ? `...${p.name}: ${(refs && (whole(ts, checker, checker.getTypeOfSymbolAtLocation(p, imp), undefined, annotation(ts, p)))) || `${ANY("rest")}[]`}` : paramText(ts, checker, p, imp, generic, place && !params.some(isRest) ? `Parameters<${place}>[${i}]` : undefined));   // MO-8h: a rest parameter (`pipe(...items)`)
    // MO-10g: a function type is pure unless marked `handler`; one named like an event is likely called later — a
    // suggestion for a person, not a row (the name is a convention, not a fact)
    { const sg = params.filter(p => signalOf(ts, checker, checker.getTypeOfSymbolAtLocation(p, imp))); if (sg.length) todos.push(`${sg.map(p => `\`${p.name}\``).join(", ")} takes a Solid signal (a getter and a setter), and an .rx program has none to pass: make it in a module of the app's own, \`export const x = (init, …) => ${name}(createSignal(init), …)\`, and declare that — its result is a reader and a setter (MO-10c)`); }
    const events = [...ps.join("; ").matchAll(/(?:^|[\s{;,(])(on[A-Z][\w$]*)\??\s*:\s*\(/g)].map(m => m[1]);
    if (events.length) todos.push(`${[...new Set(events)].join(", ")}: called later, outside any computation? mark ${events.length > 1 ? "each" : "it"} \`handler (…) => …\`, so a closure there may write sources (MO-10g)`);
    if (!shapedBy.has(name)) shapedBy.set(name, new Set()); CTX.shaped = shapedBy.get(name);
    const ret = resultText(ts, checker, sig.getReturnType(), todos, generic, place && `ReturnType<${place}>`, sig.declaration?.type);
    CTX.shaped = undefined; CTX.scope = new Set();
    const primitive = /^(create|use)[A-Z]/.test(leafName);
    const config = /^define[A-Z]|[a-z]Options$/.test(leafName);   // a config helper (`defineRoute`, `queryOptions`): pure by convention
    if (/^use[A-Z]/.test(leafName)) todos.unshift("which context does this hook read? add uses(<context>) (MO-12b)");
    const factory = ret === "Component";
    // MO-11u: a fn that is given a component (as a parameter, or in a record it takes) renders it somewhere: types do
    // not say where, so it is asked
    { const viewFn = x => { const r = accessorOf(ts, checker, x); return !!r && isElement(ts, checker, r); };   // a function of nothing giving an element: rendered, as a component with no props is
      const isC = x => viewFn(x) || (isComponent(ts, checker, x) && !isElement(ts, checker, x) && checker.getNonNullableType(x).getCallSignatures().every(g => g.getParameters().length === 1));
      const given = params.filter(p => { const pt = checker.getTypeOfSymbolAtLocation(p, imp); const o = checker.getNonNullableType(pt); return isC(pt) || (!o.getCallSignatures().length && !!(o.flags & ts.TypeFlags.Object) && !checker.isArrayType(o) && o.getProperties().length <= 80 && o.getProperties().some(q => isC(checker.getTypeOfSymbolAtLocation(q, imp)))); });
      if (given.length && !factory) todos.push(`${given.map(p => `\`${p.name}\``).join(", ")} ${given.length > 1 ? "are" : "is"} given a component: where does the library render it? If beneath a component this module exports, name that component, \`renders(<Component>)\` (MO-11u); with no word it is checked under a root of its own, where nothing above the call reaches it (MO-11s)`); }
    if (factory) todos.unshift("does its component provide a context, or nest what it is given? add provides(<context>), nests(<kids> in <component>) (MO-12c, MO-11i)");
    // RFC 26: a name is a convention, not a fact, so it suggests `pure` (a TODO for a person) and never writes it: a draft
    // states only what the types show, and an unreviewed row stays io, the checker's cautious reading (R-io-4)
    if (primitive || factory || config) todos.push(`pure? its name is a ${factory ? "factory's" : config ? "config helper's" : "primitive's"} (${factory ? "it hands back a Component" : config ? "define…/…Options" : "create…/use…"}): if calling it writes nothing but its own state, write \`pure fn\` (MO-8a)`);
    // MO-10i (2026-11-22): a fn that answers nothing and takes an array or a record can only act by changing what it is
    // given (or the world): whether it does is not in its type, so it is asked
    if (sig.getReturnType().flags & ts.TypeFlags.Void) {
      const mutable = params.filter(p => { const pt = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(p, imp)); return !isFn(checker, pt) && !accessorOf(ts, checker, pt) && !!(pt.flags & (ts.TypeFlags.Object | ts.TypeFlags.TypeParameter)) && !/^(readonly |Readonly(Array)?<)/.test(checker.typeToString(pt)); });
      if (mutable.length) todos.push(`does it change ${mutable.map(p => `\`${p.name}\``).join(" or ")} in place? mark that parameter \`draft ${mutable[0].name}\`, and a store's draft is given to it as it is (MO-10i)`);
    }
    return `export fn ${name}${tps}(${ps.join(", ")}): ${ret}`;   // (`instantiates` is read from the code, never off a name: declare-infer.js)
    };
    // an export has one row (MO-8b): of several signatures the shortest, the common form — the checker reads the row's
    // words, which are the fn's, and TypeScript types a call from the library's own overloads (13 TY-4b)
    let todos = [];
    let fnRows = [rowOf(shortest, todos)];
    // a note, not a question: said among the questions only where the signatures differ in what the checker reads (a
    // parameter that is a callback or an accessor in one and not in another, a result that is a reader in one); where
    // they agree, the row says all the checker reads of every one of them, and the note is --explain's
    if (sigs.length > 1) {
      const note = `${sigs.length} signatures in the library's types: this row is one of them (an export has one row, MO-8b); a call is typed by the library's own`;
      const shapes = new Set(sigs.map(g => { try { return shapeOf(rowOf(g, []).replace(MARK, "")); } catch { return "?"; } }));
      CTX.scope = new Set();
      if (shapes.size > 1) todos.push(note); else if (how.notes) how.notes.push(`${name}: ${note}`);
    }
    // MO-8q: where the signatures' rows would hold an `any` of the draft's (a bound with no name, so nothing to range
    // over), the fn is the one signature that can be said without: the shortest alone, else its last signature, each
    // part by its place — the signature `Parameters<typeof f>` is TypeScript's reading of
    if (mode.decl && sigs.length > 1 && (mode.whole || introduced(fnRows.join("\n")))) {
      const t1 = [], t2 = [];
      const alone = rowOf(shortest, t1), lastRow = mode.paths ? rowOf(sigs[sigs.length - 1], t2, true) : undefined;
      if (!introduced(alone) && !mode.whole) { fnRows = [alone]; todos = t1; }
      else if (lastRow && !introduced(lastRow)) { fnRows = [lastRow]; todos = t2; }
    }
    // MO-8t: a method that answers a value is read as one unless its row says `fn`, and a draft never guesses `pure`:
    // the row is io as drafted, and the question is asked where the name suggests a read
    if (item.member && /^(get|is|has|peek|read|list|count|find)([A-Z]|$)/.test(leafName) && !(sigs[0].getReturnType().flags & ts.TypeFlags.Void)) todos.push("pure? its name is a read's (get…/is…/has…): if calling it writes nothing, write `pure fn` — as drafted it is io, called from a handler or an action (MO-8t)");
    for (const t of todos) lines.push(`// TODO ${name}: ${t}`);   // on lines of their own: a declaration's line is read to its end
    lines.push(...fnRows);
    if (!item.member) work.splice(wi + 1, 0, ...methodsOf(name, t));   // MO-8t: a fn's own methods (`toast.success`), each a row
  }
  return { out, lines, contexts, wide, placed };
  };
  const overloaded = new Set();   // the fns with several signatures: a row is one of them (the shortest), and has no one place
  const exportedIn = l => /^export\s+(?:(?:pure|server|client)\s+)*(?:fn|component|const|type|context|error)\s+([\w$.]+)/m.exec(l)?.[1] ?? /^\/\/ TODO ([\w$.]+):/.exec(l)?.[1];
  let head, lines, contexts, plainRows;
  const plain = () => plainRows ??= rows(false);   // the rows every draft had
  if (how.refs !== false) {
    // MO-8m: a row that names the library's types is kept where TypeScript holds it against the module (TY-6, checked
    // here as rx-tsc will); one it does not hold is the row every draft had, with its `any`s.
    // A row has several readings: its type parameters carried or not, a part with no name said by its place in the
    // library's declaration or not. It takes, of the readings TypeScript holds, the one that leaves the fewest `any`s
    // (the earlier of two alike), and the row every draft had where it holds none
    const strip = ls => ls.map(l => l.replace(MARK, ""));
    const group = ls => { const by = new Map(); for (const l of ls) { const n = exportedIn(l); if (n) by.set(n, [...(by.get(n) ?? []), l]); } return by; };
    const check = r => require("./declare-check.js").failing([...out, ...r.out, ...strip(r.lines)].join("\n") + "\n", out.length + r.out.length, strip(r.lines), spec, from, opts, lib);
    // fewest `any`s of the draft's own (MO-8q: the library's are not the draft's), then fewest parts said by their place;
    // the last reading says least (only before an `any`), and props written out past `FIELDS` come after their place
    const anys = (n, ls, i) => introduced(ls.join("\n")) * 1000 + (ls.join("\n").match(/\b(?:Parameters|ReturnType)</g) ?? []).length + (MODES[i].whole ? 500 : 0) + (cands[i].wide.has(n) ? 400 : 0);
    // MO-8o: first as the library's declaration writes its types (`decl`), then as MO-8m read them
    // and last (MO-8q) the reading that names nothing it cannot: no type parameters, every part without a name by its
    // place as it stands — a row TypeScript holds wherever the fn has a signature to read, so no `any` is the draft's
    const MODES = [{ generics: true, paths: true, decl: true, named: true }, { generics: true, paths: true, decl: true }, { generics: true, paths: false, decl: true }, { generics: true, paths: true }, { generics: true, paths: false }, { generics: false, paths: true }, { generics: false, paths: false }, { generics: false, paths: true, decl: true, whole: true }];
    const cands = [rows(MODES[0])], first = cands[0];
    let bad = check(first);
    // the first reading, where it holds whole — most modules — says the most, and no other is made
    // (and where it does not, of the rows it left something to say of)
    const groups = [group(first.lines)];
    const least = n => first.placed.has(n) ? 1 : 0;
    if (bad && (bad.size || how.readings)) {
      const roots = how.readings ? undefined : new Set([...groups[0]].filter(([n, ls]) => bad.has(n) || anys(n, ls, 0) > least(n)).map(([n]) => n.split(".")[0]));
      for (const mode of MODES.slice(1)) { const r = rows(mode, roots); cands.push(r); groups.push(group(r.lines)); }
    }
    // --readings <export>: each reading of that export's row, and what TypeScript says of it
    if (bad && how.readings) cands.forEach((r, i) => { const b = i ? check(r) : bad; for (const [n, ls] of groups[i]) if (how.readings.names.includes(n)) how.readings.out.push({ name: n, reading: JSON.stringify(MODES[i]), rows: ls, bad: b ? b.get(n) ?? null : "not checked" }); });
    if (bad && bad.size) {
      // each row is checked in the readings that would say more than one TypeScript holds already, the best of them first,
      // and beside the rows of the first reading its text stands on (the types it names, the object a method is of, the component a word names)
      const took = new Map(), why = new Map(bad), open = new Map();
      for (const [n, ls] of groups[0]) {
        const held = !bad.has(n), k0 = held ? anys(n, ls, 0) : Infinity;
        if (held) took.set(n, ls);
        const seen = new Set([ls.join("\n")]), next = [];
        for (let i = 1; i < cands.length; i++) { const r = groups[i].get(n), k = r && anys(n, r, i); if (!r || k >= k0 || seen.has(r.join("\n"))) continue; seen.add(r.join("\n")); next.push({ ls: r, k, i }); }
        if (next.length) open.set(n, next.sort((a, b) => a.k - b.k || a.i - b.i));
      }
      let plainBy; const bare = n => (plainBy ??= group(plain().lines)).get(n);
      while (open.size) {
        const kept = new Set([...groups[0].keys()].filter(n => open.has(n) || /^export (?:type|context|error)\b/m.test(groups[0].get(n).join("\n"))));
        const of = n => open.has(n) ? open.get(n)[0].ls : took.get(n) ?? bare(n) ?? groups[0].get(n);
        for (const n of kept) for (const m of `${n} ${of(n).join(" ")}`.match(/[\w$]+/g)) if (groups[0].has(m)) kept.add(m);   // (a set is walked as it grows)
        const r = { ...first, lines: [...groups[0].keys()].filter(n => kept.has(n)).flatMap(of) };
        bad = check(r); if (!bad) break;
        for (const [n, next] of [...open]) {
          if (!bad.has(n)) { took.set(n, next[0].ls); why.delete(n); open.delete(n); continue; }
          if (!took.has(n)) why.set(n, bad.get(n));
          next.shift(); if (!next.length) open.delete(n);
        }
      }
      if (bad) {
        if (how.unheld) for (const [n, w] of why) how.unheld[n] = w;
        const picked = () => { const done = new Set(); return first.lines.flatMap(l => { const n = exportedIn(l); if (!n) return [l]; if (done.has(n)) return []; done.add(n); return took.get(n) ?? bare(n) ?? []; }); };
        lines = picked();
        // a type the module exports, written otherwise than the rows that name it were checked beside: the rows once more
        if ([...groups[0]].some(([n, ls]) => /^export type\b/m.test(ls.join("\n")) && took.get(n) !== ls)) { for (const [n, w] of check({ ...first, lines }) ?? []) { took.delete(n); if (how.unheld) how.unheld[n] = w; } lines = picked(); }
        head = first.out; contexts = first.contexts;
      }
    }
    else if (bad) { lines = first.lines; head = first.out; contexts = first.contexts; }
    if (!bad) ({ out: head, lines, contexts } = plain());
    if (!bad && how.unheld) how.unheld["*"] = "the draft could not be checked against the module (no crate to read it with): written as every draft was";
  } else ({ out: head, lines, contexts } = plain());
  out.push(...head);
  // a part only shaped as an accessor is `ref` where the code shows a reader (declare-infer.js), else the function it is
  const unshaped = (line, name, reads) => [...shapedBy.get(name) ?? []].reduce((l, at) => reads(at) ? l : withWaits(l, { [at]: "" }), line);
  if (how.infer === false) lines = lines.map(l => { const n = exportedIn(l); return n ? l.split("\n").map(x => x.startsWith("export ") ? unshaped(x, n, () => false) : x).join("\n") : l; });
  // MO-8v: the words the code that runs proves — `pure`, `handler`, `draft`, `rejects(E)` — written into the rows;
  // the question each answers is not asked (declare-infer.js, infer.js)
  if (how.infer !== false) {
    const di = require("./declare-infer.js");
    const r = di.apply(ts, spec, from, lines, name => { try { return di.paramTypes(ts, checker, mod, imp, name); } catch { return {}; } }, how.why, { unshaped, contexts, couldNest: name => { try { return di.couldNest(ts, checker, mod, imp, name); } catch { return true; } }, views: name => { try { return di.viewProps(ts, checker, mod, imp, name); } catch { return { has: () => true, outside: () => true, surely: () => false }; } } });
    lines = r.lines; out.push(...r.head);
    contexts = contexts.filter(c => !r.named.has(c));   // (a context a row names is declared: no question about it)
    if (how.inferred) Object.assign(how.inferred, r.count, { unread: r.unread, words: r.words });
  }
  // why each `any` left is one (--explain): what the type holds that the row cannot say; in a row of an overloaded fn,
  // where a type with no name would else be said by its place, that the fn has no one signature to take it from
  if (how.causes) for (const l of lines) { const n = exportedIn(l); for (const m of l.matchAll(/any\u00ab([^\u00bb]*)\u00bb/g)) how.causes.push({ name: n, cause: how.refs !== false && overloaded.has(n) && /^(internal-type|generic|generic-computed|callback|function-result)$/.test(m[1]) ? "overload" : m[1] }); }
  // …and for each row, every `any` it writes in the order it writes them, with its cause (null: written by hand): what tells, place by place, the library's own `any`s from the others (`--causes`: `rows`)
  if (how.anyRows) for (const l of lines) { if (!exportedIn(l) || l.startsWith("//")) continue; const text = l.replace(/^export\s+(?:(?:pure|server|client)\s+)*(?:fn|component|const|type|context|error)\s+[\w$.]+/, "").split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/).filter((_, i) => i % 2 === 0).join("\"\""); how.anyRows.push({ name: exportedIn(l), row: l.replace(/\u00ab[^\u00bb]*\u00bb/g, "").trim(), anys: [...text.matchAll(/\bany\b(?:\u00ab([^\u00bb]*)\u00bb)?/g)].map(m => m[1] ?? null) }); }
  // MO-8q: the parts of each row said by their place in the library's declaration, counted apart
  if (how.places) for (const l of lines) { const n = exportedIn(l); const k = (l.match(/\b(?:Parameters|ReturnType)</g) ?? []).length; if (n && k) how.places[n] = (how.places[n] ?? 0) + k; }
  // MO-8q: an `any` the draft wrote where the library has a type is said on the row it is in, with why: it is for a
  // person to name (or the row to leave out), not a type the library has
  if (how.refs !== false) for (let i = lines.length - 1; i >= 0; i--) {
    const n = exportedIn(lines[i]); if (!n || lines[i].startsWith("//")) continue;
    const why = [...lines[i].matchAll(/any\u00ab([^\u00bb]*)\u00bb/g)].map(m => m[1]).filter(c => c !== "vendor-any");
    if (why.length) lines.splice(i, 0, `// TODO ${n}: ${why.length} \`any\` here ${why.length === 1 ? "is" : "are"} the draft's, not the library's (${[...new Set(why.map(c => overloaded.has(n) && /^(internal-type|generic|generic-computed|callback|function-result)$/.test(c) ? "overload" : c))].join(", ")}): name the type, or leave the row out (MO-8q)`);
  }
  for (let i = 0; i < lines.length; i++) lines[i] = lines[i].replace(/\u00ab[^\u00bb]*\u00bb/g, "");
  if (contexts.length) out.push(`// TODO: the module's contexts (${contexts.join(", ")}): name each with \`export context <name>\` and add uses(<name>) to the hooks that read it (MO-12)`);
  return [...out, ...lines].join("\n") + "\n";
}

module.exports = { declare, withWaits, isElement, isComponent, givesElement };
