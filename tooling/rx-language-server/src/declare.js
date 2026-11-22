// `rx-declare`: a draft `.d.rx` for a JS module, from its TypeScript types (09 MO-8, MO-10, MO-11, MO-12). What the
// types show is written as rows: an accessor parameter or result is `ref`, a function of props to a JSX element is a
// component, a `JSX.Element` prop is a `View`, a component-typed prop or result is `Component`, a tuple result keeps
// its `ref` parts, an `Error` subclass is an `error`. What types cannot show is left for a person, as a `TODO` comment
// on the line it concerns: whether a hook reads a context (`uses(…)`), whether a result's field waits or throws when
// read (`pending fails(…)`), what a promise rejects with. A fn is `pure` only where Solid's convention says a primitive
// is (`create*`, `use*`) or a config helper is (`define*`, `*Options`); everything else stays io, the row that cannot be wrong in the unsafe direction (R-io-4).
// `rx-tsc` then checks the draft against the same types (spec/13 TY-6).
const path = require("node:path");

/** A type's text, kept where it names nothing the draft cannot see; `any` otherwise (types are text to the checker). */
const KNOWN = new Set(["Promise", "Record", "Array", "ReadonlyArray", "Partial", "Readonly", "View", "Component", "Error", "Date", "Map", "Set", "Element", "HTMLElement", "Event"]);
/** The module's own exported type names that the draft declares (`export type Todo = import(…).Todo`): a row may name them. */
let OWN = new Set();
function text(ts, checker, t, at) {
  if (isJsxElement(ts, checker, t)) return "View";
  if (checker.isArrayType(t) && isJsxElement(ts, checker, checker.getTypeArguments(t)[0])) return "View[]";
  const s = checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias);
  if (plain(s)) return s;
  if (!CTX.refs) return ANY(cause(ts, checker, t));
  // MO-8m: what the draft cannot restate is named where the library declares it — by the name a module exports it
  // under, else by its place in the library's own declaration (`at`): text only TypeScript reads
  const r = leaf(ts, checker, t);
  if (r.text) return r.text;
  if (t.flags & ts.TypeFlags.Any) return ANY("vendor-any");
  if (at && !(t.flags & ts.TypeFlags.TypeParameter)) return at;
  return ANY(cause(ts, checker, t));
}
/** Whether a type's text names only what every draft can: primitives, the platform's types, the module's own plain types. */
const plain = s => (s.replace(/"[^"]*"|'[^']*'/g, "").match(/\b[A-Z][A-Za-z0-9_$]*\b/g) ?? []).every(n => KNOWN.has(n) || OWN.has(n)) && !/=>/.test(s);
/** A place in the library's declaration without `null` and `undefined`, where its type may be either. */
const present = (checker, t, at) => at && checker.getNonNullableType(t) !== t ? `NonNullable<${at}>` : at;
/** Whether a type has no plain text: what a draft wrote `any` for before it named the library's types (MO-8m). */
const unsaid = (ts, checker, t) => !isJsxElement(ts, checker, t) && !(checker.isArrayType(t) && isJsxElement(ts, checker, checker.getTypeArguments(t)[0])) && !plain(checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias));
/** A type's text with no `any` in it, or undefined. */
const whole = (ts, checker, t, at) => { const s = text(ts, checker, t, at); return /\bany\b/.test(s) ? undefined : s; };
/** A function type that is an exported function's own (`typeof import("lib").string`, where a schema keeps the function
 *  that made it): a place to take its parameters and result from, though it is overloaded or generic. */
const valueOf = (ts, checker, t) => { const sym = checker.getNonNullableType(t).symbol; if (!sym || !(sym.flags & ts.SymbolFlags.Function)) return undefined; const r = nameOf(ts, checker, sym, 0, true); return r.text && /^import\(/.test(r.text) ? `typeof ${r.text}` : undefined; };
/** MO-8m: a callback's type (MO-10g) — its own signature where every part can be named; else its parameters and what
 *  it answers by its place in the library's declaration (`at`); else open. */
function callbackText(ts, checker, t, at, why = "callback") {
  if (CTX.refs) {
    const sigs = checker.getNonNullableType(t).getCallSignatures();
    if (sigs.length === 1 && !sigs[0].getTypeParameters()?.length && !checker.getTypePredicateOfSignature?.(sigs[0])) {
      const ps = [];
      for (const p of sigs[0].getParameters()) {
        const d = p.valueDeclaration; const isP = d && ts.isParameter(d);
        const pt = /^[A-Za-z_$][\w$]*$/.test(p.name) && p.name !== "this" ? whole(ts, checker, checker.getTypeOfSymbol(p)) : undefined;
        if (!pt) { ps.length = 0; ps.push(null); break; }
        ps.push(`${isP && d.dotDotDotToken ? "..." : ""}${RESERVED.has(p.name) ? `${p.name}_` : p.name}${isP && (d.questionToken || d.initializer) ? "?" : ""}: ${pt}`);
      }
      const r = sigs[0].getReturnType();
      const rt = r.flags & ts.TypeFlags.Void ? "void" : whole(ts, checker, r);
      if (ps[0] !== null && rt && new Set(sigs[0].getParameters().map(q => q.name)).size === ps.length) return `(${ps.join(", ")}) => ${rt}`;
    }
    at = at ? present(checker, t, at) : valueOf(ts, checker, t);
    if (at) return `(...args: Parameters<${at}>) => ReturnType<${at}>`;
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
  const r = spec === CTX.spec ? undefined : ts.resolveModuleName(spec, CTX.entry, CTX.options, CTX.host).resolvedModule;
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
  if (sym.flags & ts.SymbolFlags.TypeParameter) return CTX.scope.has(sym) ? { text: sym.name } : { why: "generic" };
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
    const r = nameOf(ts, checker, up, 0, value); return r.text ? { text: `${r.text}.${sym.name}` } : r;
  }
  return { why: "named-type" };
}
const WORDS = /\b(?:handler|tracked|pending|renders|ref|signal|draft)\s+[\w({[]|\bfails\s*\(/;
/** MO-8m: a type as text only TypeScript reads — the library's own names (`nameOf`), the platform's, primitives and
 *  literals, arrays, tuples, unions and intersections of those, with their type arguments. `{ text }`, or `{ why }` where
 *  some part cannot be named. A record or a function type is not such a text where the checker would read it as a row
 *  (the whole type, or a member of its union): those are written a step at a time by what calls this. */
function leaf(ts, checker, t, open = false) {
  const K = ts.SyntaxKind;
  let node;
  try { node = checker.typeToTypeNode(t, undefined, ts.NodeBuilderFlags.NoTruncation | ts.NodeBuilderFlags.UseAliasDefinedOutsideCurrentScope | ts.NodeBuilderFlags.IgnoreErrors); } catch { return { why: "named-type" }; }
  if (!node) return { why: "named-type" };
  const FAIL = {}; let why;
  const fail = w => { why = w; throw FAIL; };
  const key = n => ts.isIdentifier(n) ? n.text : ts.isStringLiteral(n) || ts.isNumericLiteral(n) ? JSON.stringify(n.text) : fail("anonymous");
  const locals = new Set();   // the parameters a computed type declares itself: a mapped type's key, `infer U`
  const entity = (e, args, value) => {
    const parts = []; while (ts.isQualifiedName(e)) { parts.unshift(e.right.text); e = e.left; }
    if (!parts.length && !value && locals.has(e.text)) return e.text;
    if (!e.symbol) return fail("named-type");
    // the last name's symbol says most (a namespace's member is found through it); the builder gives each identifier its own
    const r = nameOf(ts, checker, e.symbol, parts.length ? 0 : args, value);
    if (!r.text) return fail(r.why);
    return [r.text, ...parts].join(".");
  };
  const list = (ns, top) => ns.map(n => p(n, top));
  const p = (n, top) => {
    switch (n.kind) {
      case K.AnyKeyword: return fail("vendor-any");
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
      case K.UnionType: return list(n.types, top).join(" | ");
      case K.IntersectionType: return list(n.types, false).join(" & ");
      case K.TypeOperator: return `${ts.tokenToString(n.operator)} ${p(n.type, false)}`;
      case K.IndexedAccessType: return `${p(n.objectType, false)}[${p(n.indexType, false)}]`;
      case K.TypeQuery: return `typeof ${entity(n.exprName, 0, true)}`;
      case K.TypeReference: {
        const args = n.typeArguments?.length ?? 0;
        const name = entity(n.typeName, args, false);
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
        if (top || n.typeParameters?.length) return fail(top ? "function-inside" : "generic");
        const ps = n.parameters.map(q => ts.isIdentifier(q.name) && q.type && q.name.text !== "this" ? `${q.dotDotDotToken ? "..." : ""}${q.name.text}${q.questionToken ? "?" : ""}: ${p(q.type, false)}` : fail("anonymous"));
        return `(${ps.join(", ")}) => ${p(n.type, false)}`;
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
      default: return fail("anonymous");   // a predicate, `this`, a method or call signature of a record written in place
    }
  };
  try {
    const s = p(node, !open);
    if (s.length > 320) return { why: "large" };
    if (WORDS.test(s) || /^(View|Component)\b/.test(s) && s !== "View" && s !== "View[]") return { why: "anonymous" };
    return { text: s };
  } catch (e) { if (e !== FAIL) throw e; return { why }; }
}
let OWN_ALL = new Map();
/** MO-8d, MO-8m: a signature's type parameters as the library declares them — `<const S extends string, T = S>` — each
 *  bound and default named as `leaf` names a type; "" where one cannot be (the row then has none, and what ranges over
 *  them is said some other way). Sets the row's scope. */
function typeParams(ts, checker, symbols, used) {
  CTX.scope = new Set(symbols);
  const out = [];
  for (const sym of symbols) {
    const tp = { symbol: sym };
    const d = sym.declarations?.[0];
    if (!d || !ts.isTypeParameterDeclaration(d)) { CTX.scope = new Set(); return ""; }
    const part = n => { if (!n) return ""; const r = leaf(ts, checker, checker.getTypeFromTypeNode(n), true); return r.text; };
    let c = part(d.constraint); const def = part(d.default);
    if (c === "unknown") c = "";   // a bound that resolves to `unknown` (`TData extends RowData`, an alias of it) bounds nothing
    if (c === undefined || def === undefined) { CTX.scope = new Set(); return ""; }
    out.push([tp.symbol.name, `${d.modifiers?.some(m => m.kind === ts.SyntaxKind.ConstKeyword) ? "const " : ""}${tp.symbol.name}${c ? ` extends ${c}` : ""}${def ? ` = ${def}` : ""}`]);
  }
  if (!used) return `<${out.map(x => x[1]).join(", ")}>`;
  // `used` (a text): only the parameters it names, and those their bounds name, are the row's (a polymorphic kit's
  // element parameter ranges over no prop the row writes)
  const names = t => new Set(t.replace(/"[^"]*"/g, "").match(/[A-Za-z_$][\w$]*/g) ?? []);
  const keep = new Set(); let grew = true; let text = used;
  while (grew) { grew = false; const ns = names(text); for (const [n, t] of out) if (!keep.has(n) && ns.has(n)) { keep.add(n); text += " " + t; grew = true; } }
  const kept = out.filter(x => keep.has(x[0]));
  for (const sym of [...CTX.scope]) if (!keep.has(sym.name)) CTX.scope.delete(sym);
  return kept.length ? `<${kept.map(x => x[1]).join(", ")}>` : "";
}

/** An accessor: one call signature, no parameters (Solid's `Accessor<T>`). Returns what it reads, or undefined. */
function accessorOf(ts, checker, t) {
  t = checker.getNonNullableType(t);
  // `MaybeAccessor<T>` (`T | Accessor<T>`): it takes an accessor, so `.rx` passes one (a live value, MO-10a)
  if (t.flags & ts.TypeFlags.Union) { const a = t.types.map(x => accessorOf(ts, checker, x)).find(Boolean); if (a) return a; }
  if (t.getConstructSignatures().length || t.getProperties().length) return undefined;
  const sigs = t.getCallSignatures();
  if (sigs.length !== 1 || sigs[0].getParameters().length) return undefined;
  const r = sigs[0].getReturnType();
  return r.flags & ts.TypeFlags.Void ? undefined : r;   // `() => void` is a callback, not an accessor
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
/** A component: a callable whose signatures take at most props and give a JSX element. */
function isComponent(ts, checker, t) {
  const sigs = checker.getNonNullableType(t).getCallSignatures();
  return sigs.length > 0 && sigs.every(s => s.getParameters().length <= 1 && isElement(ts, checker, s.getReturnType()));
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
  for (const p of sigs[0].getParameters()) {
    const d = p.valueDeclaration;
    if (!/^[A-Za-z_$][\w$]*$/.test(p.name) || p.name === "this") return undefined;
    if (d && ts.isParameter(d) && d.dotDotDotToken) { ps.push(`...${p.name}: ${ANY("rest")}[]`); continue; }
    const opt = d && ts.isParameter(d) && (d.questionToken || d.initializer) ? "?" : "";
    const pt = checker.getTypeOfSymbol(p);
    ps.push(`${RESERVED.has(p.name) ? `${p.name}_` : p.name}${opt}: ${text(ts, checker, opt ? checker.getNonNullableType(pt) : pt)}`);
  }
  const r = sigs[0].getReturnType(); const rs = checker.typeToString(r);
  const named = text(ts, checker, r);
  const rt = r.flags & ts.TypeFlags.Void ? "void" : /^Promise</.test(rs) && /^any\u00ab/.test(named) ? `Promise<${named}>` : named;
  return `(${ps.join(", ")}) => ${rt}`;
}
function propText(ts, checker, p, at, precise = false, obj) {
  const t = checker.getTypeOfSymbolAtLocation(p, at);
  const here = obj && CTX.refs ? `${obj}[${JSON.stringify(p.name)}]` : undefined;   // the prop, in the library's own declaration
  const opt = p.flags & ts.SymbolFlags.Optional ? "?" : "";
  const fnSigs = checker.getNonNullableType(t).getCallSignatures();
  if (p.name === "children" && fnSigs.length && fnSigs.every(s => isElement(ts, checker, s.getReturnType())))
    return `children${opt}: (${fnSigs[0].getParameters().map((q, i) => `${q.name}: ${(CTX.refs && (whole(ts, checker, checker.getTypeOfSymbol(q)) ?? (here && fnSigs.length === 1 ? `Parameters<${present(checker, t, here)}>[${i}]` : undefined))) || ANY("render-prop")}`).join(", ")}) => View`;   // MO-11k: a render prop, written `{view (…) { … }}`
  if (isComponent(ts, checker, t) && !isElement(ts, checker, t)) return `${p.name}${opt}: Component`;
  if (/^(as|component)$/.test(p.name) && checker.getNonNullableType(t).isUnion?.() && checker.getNonNullableType(t).types.some(u => isComponent(ts, checker, u))) return `${p.name}${opt}: string | Component`;   // a polymorphic \`as\`: a tag or a component (MO-11c)
  if (isElement(ts, checker, t)) return `${p.name}${opt}: View`;
  if (isFn(checker, t)) return `${p.name}${opt}: ${(precise && fnText(ts, checker, t)) || callbackText(ts, checker, t, here)}`;   // a callback (MO-10g)
  return `${p.name}${opt}: ${text(ts, checker, t, here)}`;
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
const RESERVED = new Set(["ref", "signal", "fn", "pure", "component", "context", "error", "type", "const", "export"]);
/** MO-10h: a Solid signal, `[getter, setter]` (Solid 2's getter is a branded accessor): what it holds, or undefined. A type
 *  parameter is looked at through its constraint, a union through its members. */
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
function paramText(ts, checker, p, at, generic = false, here) {
  const t = checker.getTypeOfSymbolAtLocation(p, at);
  const opt = p.valueDeclaration && ts.isParameter(p.valueDeclaration) && (p.valueDeclaration.questionToken || p.valueDeclaration.initializer) ? "?" : "";   // MO-8e
  const name = RESERVED.has(p.name) ? `${p.name}_` : p.name;   // a parameter's name is only a name: never a row word (`ref`)
  const held = signalOf(ts, checker, t);
  if (held) return `signal ${name}${opt}: ${text(ts, checker, held)}`;   // MO-10h: the program passes the value, the compiler the signal
  const read = accessorOf(ts, checker, t);
  if (read) {
    // an accessor of an options object the library declares: its callbacks are typed as functions, as a plain options
    // parameter's are (what marks one `handler` or `tracked` is written on it)
    const ro = checker.getNonNullableType(read);
    if (!generic && ownObject(ts, ro, checker) && ro.getProperties().length <= 24 && ro.getProperties().some(q => isFn(checker, checker.getTypeOfSymbolAtLocation(q, at))))
      return `ref ${name}${opt}: { ${ro.getProperties().filter(q => /^[A-Za-z_$][\w$]*$/.test(q.name)).map(q => propText(ts, checker, q, at, true)).join("; ")} }`;
    return `ref ${name}${opt}: ${text(ts, checker, read)}`;
  }
  // a callback (MO-10g); one whose type is a predicate, or ranges over the signature's type parameters, is written `any`
  if (isFn(checker, t)) return checker.getNonNullableType(t).getCallSignatures().some(s => checker.getTypePredicateOfSignature?.(s)) ? `${name}${opt}: ${ANY("predicate")}` : `${name}${opt}: ${callbackText(ts, checker, t, here)}`;
  const obj = checker.getNonNullableType(t);
  if (ownObject(ts, obj, checker) && obj.getProperties().some(q => isFn(checker, checker.getTypeOfSymbolAtLocation(q, at)))) {
    return `${name}${opt}: { ${obj.getProperties().filter(q => !CTX.refs || /^[A-Za-z_$][\w$]*$/.test(q.name)).map(q => propText(ts, checker, q, at, false, present(checker, t, here))).join("; ")} }`;   // its callbacks are typed as functions
  }
  return `${name}${opt}: ${text(ts, checker, opt ? checker.getNonNullableType(t) : t, opt ? present(checker, t, here) : here)}`;   // `?` already says it may be absent
}

/** What a type may also be: ` | undefined`, ` | null`, from its union members. */
const nullish = (ts, t) => !(t.flags & ts.TypeFlags.Union) ? "" : (t.types.some(x => x.flags & ts.TypeFlags.Undefined) ? " | undefined" : "") + (t.types.some(x => x.flags & ts.TypeFlags.Null) ? " | null" : "");
/** EF-5a: what undoes a call — a function that takes nothing and answers nothing, as TypeScript resolves the type (a
 *  library's own name for it, `VoidFunction`, is that function). */
const isDisposer = (ts, checker, t) => { const u = checker.getNonNullableType(t); const sigs = u.getCallSignatures(); return !u.getProperties().length && !u.getConstructSignatures().length && sigs.length === 1 && !sigs[0].getParameters().length && !sigs[0].getTypeParameters()?.length && !!(sigs[0].getReturnType().flags & ts.TypeFlags.Void); };
/** A function's type where it is a result's part: what it answers is said when it is nothing (`void`), a promise or a
 *  primitive — the evidence MO-10b and MO-10k read; its parameters are left open. */
function fnResultText(ts, checker, t, here) {
  const all = fnText(ts, checker, t); if (all) return all;
  const sigs = checker.getNonNullableType(t).getCallSignatures();
  here = CTX.refs ? present(checker, t, here) ?? valueOf(ts, checker, t) : undefined;
  if (sigs.length !== 1) return here ? `(...args: Parameters<${here}>) => ReturnType<${here}>` : `(...args: ${ANY("overload")}[]) => ${ANY("overload")}`;
  const r = sigs[0].getReturnType();                                // what ranges over its type parameters is `any` (text)
  const rs = checker.typeToString(r);
  const rt = r.flags & ts.TypeFlags.Void ? "void" : rs === "Promise<void>" ? "Promise<void>" : /^Promise</.test(rs) ? `Promise<${ANY("method-result")}>` : text(ts, checker, r);
  const said = /^(void|Promise<void>|Promise<any\u00ab[^\u00bb]*\u00bb>|string|number|boolean)$/.test(rt);
  // what the checker reads stays as it was (nothing, a promise, a primitive); the rest is the library's own, by its place
  if (here) return `(...args: Parameters<${here}>) => ${!said ? `ReturnType<${here}>` : /^Promise<any/.test(rt) ? `Promise<Awaited<ReturnType<${here}>>>` : rt}`;
  return `(...args: ${ANY("method-params")}[]) => ${said ? rt : ANY("method-result")}`;
}
/** A zero-argument function field that is called, by its name (`getPageCount()`, `isActive()`); any other is read as an accessor. */
const CALLED = /^(get|is|has|can|should|will|to|as|find|make|create|use|on|do|run)[A-Z0-9_]/;
/** MO-10b, MO-10k: a result's type a step at a time, where the library declares a small object — every field it has, an
 *  accessor `ref`, a function with what it answers — or an instance of a class, by the methods that answer nothing or
 *  a primitive (the object stays the library's own: no accessor part is declared on it). undefined: not such a type. */
function structural(ts, checker, t, depth = 0, here) {
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
    const ms = props.filter(q => isFn(checker, typeOf(q))).filter(q => !/=> any\u00ab[^\u00bb]*\u00bb$/.test(fnResultText(ts, checker, typeOf(q)))).map(q => [q, fnResultText(ts, checker, typeOf(q), at(q))]);
    return ms.length && ms.length <= 64 ? `{ ${ms.map(([q, f]) => `${q.name}${opt(q)}: ${f}`).join("; ")} }` : undefined;
  }
  if (!props.length || props.length > 32 || u.getProperties().some(q => q.name.startsWith("__@") || q.name.startsWith("#"))) return undefined;
  const field = q => {
    const qt = typeOf(q);
    if (isDisposer(ts, checker, qt)) return "() => void";
    const read = accessorOf(ts, checker, qt);
    if (read) return CALLED.test(q.name) ? `() => ${structural(ts, checker, read, depth + 1) ?? text(ts, checker, read)}` : `ref ${text(ts, checker, read)}`;
    if (isFn(checker, qt)) return fnResultText(ts, checker, qt, at(q));
    const st = depth < 2 ? structural(ts, checker, qt, depth + 1, at(q)) : undefined;
    return st ? st + (CTX.refs ? nullish(ts, qt) : "") : text(ts, checker, qt, at(q));
  };
  return `{ ${props.map(q => `${q.name}${opt(q)}: ${field(q)}`).join("; ")} }`;
}
/** A tuple's function part (a signal's setter): what it takes, where it can be named and it answers nothing. */
const setter = (ts, checker, x) => { const c = CTX.refs ? callbackText(ts, checker, x) : ""; return /\) => void$/.test(c) && !/\bany\b/.test(c) ? c : `(...args: ${ANY("function-result")}[]) => void`; };
function resultText(ts, checker, t, todos, generic = false, here) {
  if (isComponent(ts, checker, t) && !isElement(ts, checker, t)) return "Component";
  const read = accessorOf(ts, checker, t);
  if (read) return `ref ${text(ts, checker, read)}`;
  if (isDisposer(ts, checker, t)) return nullish(ts, t) ? `(() => void)${nullish(ts, t)}` : "() => void";   // EF-5a: the checker holds a call to keeping it
  if (isFn(checker, t)) return generic ? ANY("generic") : `(${callbackText(ts, checker, t, here, "function-result")})${nullish(ts, t)}`;   // a function part is io (MO-10b); it may be absent
  const tuple = checker.getNonNullableType(t);
  if (checker.isTupleType(tuple)) {
    const ro = tuple.target?.readonly ? "readonly " : "";   // MO-10b: `as const` results stay read-only
    return `${ro}[${checker.getTypeArguments(tuple).map(x => accessorOf(ts, checker, x) ? `ref ${text(ts, checker, accessorOf(ts, checker, x))}` : isFn(checker, x) ? (generic ? ANY("generic") : setter(ts, checker, x)) : text(ts, checker, x)).join(", ")}]`;
  }
  let s = text(ts, checker, t, here);
  // a promise is said to be one, whatever it answers (MO-10b reads it): by its place, else of `any`
  if (CTX.refs && /^Promise</.test(checker.typeToString(t)) && !/^Promise</.test(s)) s = s === here ? `Promise<Awaited<${here}>>` : /^any\u00ab[^\u00bb]*\u00bb$/.test(s) ? `Promise<${s}>` : s;
  if (/^Promise</.test(checker.typeToString(t))) todos.push("what does its promise reject with? add rejects(<classes>) (default Error)");
  else {
    if (ownObject(ts, t, checker)) todos.push("is the result a store with fields that wait or throw when read? mark them `pending fails(<classes>)` (MO-10f)");
    // what the type does not say as text (it names the library's own types) is said a step at a time
    if (unsaid(ts, checker, t)) { const st = structural(ts, checker, t, 0, here); if (st) { s = st + nullish(ts, t); if (/\bref /.test(st)) todos.push("its fields drafted `ref` are read as values (`x.items`); one the app calls instead (`x.items()`) is a function, `() => T` (MO-10b)"); } }
  }
  return s;
}

/** @returns {string} the draft `.d.rx` for `spec`, imported from `from` (a directory). `how.known: false`: from the types
 *  alone, without what known.js says of the library (a generated declaration, MO-8l: nothing a person reviewed). */
function declare(ts, spec, from, options = {}, how = {}) {
  const host = ts.createCompilerHost({ strict: true, skipLibCheck: true, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve, jsxImportSource: "@solidjs/web", ...options });
  const entry = path.join(from, "__rx_declare__.ts");
  const code = `import * as __m from ${JSON.stringify(spec)};\nexport { __m };\n`;
  const { getSourceFile, fileExists } = host;
  host.getSourceFile = (f, ...rest) => path.resolve(f) === entry ? ts.createSourceFile(f, code, ts.ScriptTarget.ES2022) : getSourceFile.call(host, f, ...rest);
  host.fileExists = f => path.resolve(f) === entry || fileExists.call(host, f);
  const program = ts.createProgram([entry], { strict: true, skipLibCheck: true, noEmit: true, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve, jsxImportSource: "@solidjs/web", ...options }, host);
  CTX = { refs: false, scope: new Set() };
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(entry);
  const imp = sf.statements[0];
  const mod = checker.getSymbolAtLocation(imp.moduleSpecifier);
  if (!mod) throw new Error(`${spec}: no TypeScript types found from ${from}`);
  const out = [`// Drafted by rx-declare from ${spec}'s TypeScript types. Check every TODO, then delete it; rx-tsc checks the rest (TY-6).`];
  if (!spec.startsWith(".")) {                                                            // MO-8f: pinned to the version it was drafted from
    const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    const v = require("./versions.js").installed(pkg, from); if (v) out.push(`//@ for ${pkg} ^${v}`);
  }
  const opts = { strict: true, skipLibCheck: true, noEmit: true, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve, jsxImportSource: "@solidjs/web", ...options };
  const real = JSON.stringify(spec);
  /** The rows, with the library's types named where it declares them (`refs`, MO-8m) or left `any` (as every draft was). */
  const rows = mode => {
  const refs = !!mode;
  const out = [];
  const contexts = [];
  const lines = [];
  CTX = { refs, spec, entry, options: opts, host, program, mod, scope: new Set(), exports: new Map() };
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
      if (full) { OWN_ALL.set(name, [tp.filter(p => !p.default).length, tp.length]); aliases.set(name, `export type ${name}${full} = import(${JSON.stringify(spec)}).${name}<${tp.map(p => p.name.text).join(", ")}>`); continue; }
      // bounds that cannot be named: no alias TypeScript would accept, so a row names the type in place, `import(…).T<…>`
      if (refs && ps.length && tp.some(p => p.constraint)) { OWN_ALL.delete(name); aliases.set(name, `// ${name}<${tp.map(p => p.name.text).join(", ")}>: a type of ${spec} whose parameters' bounds are not exported: name it in place, import(${JSON.stringify(spec)}).${name}<…>`); continue; }
      OWN_ALL.set(name, [ps.length, ps.length]);
      aliases.set(name, `export type ${name}${ps.length ? `<${ps.join(", ")}>` : ""} = import(${JSON.stringify(spec)}).${name}${ps.length ? `<${ps.join(", ")}>` : ""}`);

  }
  OWN = new Set(checker.getExportsOfModule(mod).map(s0 => [s0.name, s0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s0) : s0]).filter(([, y]) => y.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface) && !(y.flags & ts.SymbolFlags.Value) && !(y.declarations?.[0]?.typeParameters ?? []).length).map(([n]) => n));
  for (const sym0 of checker.getExportsOfModule(mod)) {
    const sym = sym0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym0) : sym0;
    const name = sym0.name;
    if (name === "default") { lines.push(`// TODO: the module's default export: import it by name in a JS helper (\`export { default as x } from …\`) and declare that`); continue; }
    if (sym.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface) && !(sym.flags & ts.SymbolFlags.Value)) {
      const tp = sym.declarations?.[0]?.typeParameters ?? [];
      // a generic type is declared with its parameters by name: its bounds name the library's own types, which the
      // import states for it (`export type Table<T> = import(…).Table<T>`)
      lines.push(aliases.get(name));
      continue;
    }
    if (!(sym.flags & ts.SymbolFlags.Value)) continue;
    const t = checker.getTypeOfSymbolAtLocation(sym, imp);
    if (sym.flags & ts.SymbolFlags.Class) {
      const inst = checker.getDeclaredTypeOfSymbol(sym);
      if (checker.getBaseTypes(inst)?.some(b => /\bError\b/.test(checker.typeToString(b)))) lines.push(`export error ${name}`);
      else lines.push(`// TODO: ${name} is a class: construct it in a JS helper and declare that fn`);
      continue;
    }
    if (/^Context</.test(checker.typeToString(t))) { contexts.push(name); continue; }
    const sigs = t.getCallSignatures();
    // a component's declaration: its props, those a .d.rx can name (an `aria-label` is passed as any undeclared prop is, MO-11b)
    const componentOf = (as, ct) => {
      const p = ct.getCallSignatures()[0].getParameters()[0];
      const pt = p ? checker.getTypeOfSymbolAtLocation(p, imp) : undefined;
      // the props, in the library's own declaration: `Parameters<typeof import("kit").Dialog["Content"]>[0]`
      // MO-8d: a generic component's type parameters, as the library declares them, so a prop that ranges over them is
      // written (`value?: Option`); where a bound cannot be named the row has none, as a generic fn's
      const csig = ct.getCallSignatures()[0];
      const ctps = mode.generics && ct.getCallSignatures().length === 1 && csig.getTypeParameters()?.length ? typeParams(ts, checker, csig.getTypeParameters().map(q => q.symbol)) : "";
      const [root, ...rest] = as.split(".");
      const here = mode.paths && pt && ct.getCallSignatures().length === 1 ? present(checker, pt, `Parameters<typeof import(${real}).${root}${rest.map(m => `[${JSON.stringify(m)}]`).join("")}>[0]`) : undefined;
      const props = pt ? checker.getNonNullableType(pt).getProperties().filter(q => /^[A-Za-z_$][\w$]*$/.test(q.name)).map(q => propText(ts, checker, q, imp, false, here)) : [];
      // MO-10g: a prop's function type is pure unless it says `handler`, whatever its name, so an event-like name is only
      // a suggestion here, never the word
      const events = [...new Set(props.map(x => /^(on[A-Z][\w$]*)\??\s*:\s*\(/.exec(x)?.[1]).filter(Boolean))];
      // only the parameters a prop names are the row's (the element parameter of a polymorphic `as` is not one)
      const ctpsUsed = ctps ? typeParams(ts, checker, csig.getTypeParameters().map(q => q.symbol), props.join("; ")) : "";
      CTX.scope = new Set();
      const row = `export component ${as}${ctpsUsed}(props: { ${props.join("; ")} })`;
      return events.length ? `// TODO ${as}: ${events.join(", ")}: called later, outside any computation? mark ${events.length > 1 ? "each" : "it"} \`handler (…) => …\`, so a closure there may write sources (MO-10g)\n${row}` : row;
    };
    // MO-11q: a kit's compound parts on one object (`Dialog.Trigger`), the object a component itself or not
    const members = /^[A-Z]/.test(name) ? t.getProperties().filter(q => /^[A-Z]/.test(q.name)).map(q => [q.name, checker.getTypeOfSymbolAtLocation(q, imp)]).filter(([, mt]) => isComponent(ts, checker, mt)) : [];
    const memberLines = () => { for (const [m, mt] of members) lines.push(componentOf(`${name}.${m}`, mt)); };
    if (!sigs.length) {
      if (members.length) { memberLines(); continue; }
      lines.push(`export const ${name}: typeof import(${JSON.stringify(spec)}).${name}`); continue;   // MO-8g: a value
    }
    if (/^[A-Z]/.test(name) && isComponent(ts, checker, t)) {
      if (/Provider$/.test(name)) lines.push(`// TODO ${name}: does it provide a context to its children? add provides(<context>) (MO-12c)`);
      lines.push(componentOf(name, t));
      if (members.length) { lines.push(`// TODO ${name}: its parts likely read a context it provides: add provides(<context>) to it and uses(<context>) to them (MO-12)`); memberLines(); }
      continue;
    }
    const sig = [...sigs].sort((a, b) => a.getParameters().length - b.getParameters().length)[0];   // the shortest overload: the common form
    const params = [...sig.getParameters()];
    const optional = p => { const d = p.valueDeclaration; return !!d && ts.isParameter(d) && !!(d.questionToken || d.initializer || d.dotDotDotToken); };
    const isRest = p => !!p?.valueDeclaration && ts.isParameter(p.valueDeclaration) && !!p.valueDeclaration.dotDotDotToken;
    void optional;
    const generic = !!sig.getTypeParameters()?.length;   // MO-8d: what ranges over type parameters is loosened (TY-6 checks the rest)
    if (sigs.length > 1) overloaded.add(name);
    // MO-8m: the row's own type parameters, as the library declares them, so a type that ranges over them is written
    const tps = mode.generics && generic ? typeParams(ts, checker, sig.getTypeParameters().map(q => q.symbol)) : "";
    // a part the draft cannot name is said by its place in the library's own signature — where it has one signature
    // (beside type parameters the place is the signature at its bounds: TypeScript says below whether the row holds)
    const place = mode.paths && sigs.length === 1 ? `typeof import(${real}).${name}` : undefined;
    const ps = params.map((p, i) => isRest(p) ? `...${p.name}: ${(refs && (whole(ts, checker, checker.getTypeOfSymbolAtLocation(p, imp)))) || `${ANY("rest")}[]`}` : paramText(ts, checker, p, imp, generic, place && !params.some(isRest) ? `Parameters<${place}>[${i}]` : undefined));   // MO-8h: a rest parameter (`pipe(...items)`)
    const todos = [];
    // MO-10g: a function type is pure unless marked `handler`; one named like an event is likely called later — a
    // suggestion for a person, not a row (the name is a convention, not a fact)
    const events = [...ps.join("; ").matchAll(/(?:^|[\s{;,(])(on[A-Z][\w$]*)\??\s*:\s*\(/g)].map(m => m[1]);
    if (events.length) todos.push(`${[...new Set(events)].join(", ")}: called later, outside any computation? mark ${events.length > 1 ? "each" : "it"} \`handler (…) => …\`, so a closure there may write sources (MO-10g)`);
    const ret = resultText(ts, checker, sig.getReturnType(), todos, generic, place && `ReturnType<${place}>`);
    CTX.scope = new Set();
    const primitive = /^(create|use)[A-Z]/.test(name);
    const config = /^define[A-Z]|[a-z]Options$/.test(name);   // a config helper (`defineRoute`, `queryOptions`): pure by convention
    if (/^use[A-Z]/.test(name)) todos.unshift("which context does this hook read? add uses(<context>) (MO-12b)");
    const factory = ret === "Component";
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
    for (const t of todos) lines.push(`// TODO ${name}: ${t}`);   // on lines of their own: a declaration's line is read to its end
    lines.push(`export fn ${name}${tps}(${ps.join(", ")}): ${ret}${primitive && !/\bref\b/.test(ps.join(" ") + ret) && !factory ? " instantiates" : ""}`);
  }
  // what types cannot show, for a library rx-declare has been checked against (known.js): its rows for the exports
  // the installed version has, in place of the drafted ones
  const known = how.known === false || spec.startsWith(".") ? undefined : require("./known.js")[spec];
  if (known) {
    const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    const v = require("./versions.js").installed(pkg, from);
    if (v && require("./versions.js").satisfies(v, known.range)) {
      const exportedAs = l => /^export\s+(?:(?:pure|server|client|trusted)\s+)*(?:fn|component|const|type|context|error)\s+([\w$.]+)/.exec(l)?.[1];
      const has = new Set(checker.getExportsOfModule(mod).map(s0 => s0.name));
      const took = [];
      for (const [name, row] of Object.entries(known.rows ?? {})) {
        if (!has.has(name)) continue;
        for (let i = lines.length - 1; i >= 0; i--) if (exportedAs(lines[i]) === name || lines[i].startsWith(`// TODO ${name}:`)) lines.splice(i, 1);
        lines.push(row); took.push(name);
      }
      for (const [name, w] of Object.entries(known.words ?? {})) {
        const i = lines.findIndex(l => exportedAs(l) === name); if (i < 0) continue;
        let l = lines[i]; if (w.drop) l = l.replace(new RegExp(`\\s+${w.drop}$`), ""); if (w.pure) l = l.replace(/^export fn /, "export pure fn "); if (w.after) l = `${l} ${w.after}`;
        lines[i] = l; took.push(name);
        for (let j = lines.length - 1; j >= 0; j--) if (lines[j].startsWith(`// TODO ${name}:`)) lines.splice(j, 1);
      }
      if (took.length) {
        out.push(`// Known of ${pkg} ${known.range} (what its types cannot show, checked by running it): ${took.join(", ")}.`);
        for (const c of known.contexts ?? []) out.push(`export context ${c}`);
        contexts.length = 0;
      }
    }
  }
  return { out, lines, contexts };
  };
  const overloaded = new Set();   // the fns with several signatures: a row is one of them (the shortest), and has no one place
  const exportedIn = l => /^export\s+(?:(?:pure|server|client|trusted)\s+)*(?:fn|component|const|type|context|error)\s+([\w$.]+)/m.exec(l)?.[1] ?? /^\/\/ TODO ([\w$.]+):/.exec(l)?.[1];
  let { out: head, lines, contexts } = rows(false);
  if (how.refs !== false) {
    // MO-8m: a row that names the library's types is kept where TypeScript holds it against the module (TY-6, checked
    // here as rx-tsc will); one it does not hold is the row every draft had, with its `any`s
    // four readings of a row: its type parameters carried or not, a part with no name said by its place in the library's
    // declaration or not. Each reading is checked whole; a row takes, of the readings TypeScript holds, the one that
    // leaves the fewest `any`s (the earlier of two alike), and the row every draft had where it holds none
    const strip = ls => ls.map(l => l.replace(MARK, ""));
    const group = ls => { const by = new Map(); for (const l of ls) { const n = exportedIn(l); if (n) by.set(n, [...(by.get(n) ?? []), l]); } return by; };
    const check = r => require("./declare-check.js").failing(ts, [...out, ...r.out, ...strip(r.lines)].join("\n") + "\n", out.length + r.out.length, strip(r.lines), spec, from, opts, program);
    const fall = (r, bad, to) => { const by = group(to); const kept = [], done = new Set(); for (const l of r.lines) { const n = exportedIn(l); if (!n || !bad.has(n)) kept.push(l); else if (!done.has(n)) { done.add(n); kept.push(...(by.get(n) ?? [])); } } return { ...r, lines: kept }; };
    const anys = ls => (strip(ls).join("\n").match(/\bany\b/g) ?? []).length;
    const cands = [{ generics: true, paths: true }, { generics: true, paths: false }, { generics: false, paths: true }, { generics: false, paths: false }].map(mode => rows(mode));
    const bads = [];
    for (const r of cands) { const b = check(r); if (!b) break; bads.push(b); if (!b.size && bads.length === 1) break; }   // the first reading held whole: it says the most
    if (bads.length === 1 && !bads[0].size) { lines = cands[0].lines; head = cands[0].out; contexts = cands[0].contexts; }
    else if (bads.length === cands.length) {
      const groups = cands.map(r => group(r.lines)), plain = group(lines);
      const picked = { ...cands[0], lines: [] }, done = new Set(), why = new Map();
      for (const l of cands[0].lines) {
        const n = exportedIn(l);
        if (!n) { picked.lines.push(l); continue; }
        if (done.has(n)) continue; done.add(n);
        let best;
        for (let i = 0; i < cands.length; i++) { const ls = groups[i].get(n); if (!ls || bads[i].has(n)) continue; const k = anys(ls); if (!best || k < best.k) best = { k, ls }; }
        if (!best) why.set(n, bads[bads.length - 1].get(n));
        picked.lines.push(...(best ? best.ls : plain.get(n) ?? []));
      }
      // the rows together, once more: a row that holds beside one reading's rows holds beside another's, and this says so
      const bad = check(picked) ?? new Map();
      for (const [n, w] of [...why, ...bad]) if (how.unheld) how.unheld[n] = w;
      const kept = bad.size ? fall(picked, bad, lines) : picked;
      lines = kept.lines; head = kept.out; contexts = kept.contexts;
    }
    else if (how.unheld) how.unheld["*"] = "the draft could not be checked against the module (no crate to read it with): written as every draft was";
  }
  out.push(...head);
  // why each `any` left is one (--explain): what the type holds that the row cannot say; in a row of an overloaded fn,
  // where a type with no name would else be said by its place, that the fn has no one signature to take it from
  if (how.causes) for (const l of lines) { const n = exportedIn(l); for (const m of l.matchAll(/any\u00ab([^\u00bb]*)\u00bb/g)) how.causes.push({ name: n, cause: how.refs !== false && overloaded.has(n) && /^(internal-type|generic|generic-computed|callback|function-result)$/.test(m[1]) ? "overload" : m[1] }); }
  for (let i = 0; i < lines.length; i++) lines[i] = lines[i].replace(/\u00ab[^\u00bb]*\u00bb/g, "");
  if (contexts.length) out.push(`// TODO: the module's contexts (${contexts.join(", ")}): name each with \`export context <name>\` and add uses(<name>) to the hooks that read it (MO-12)`);
  return [...out, ...lines].join("\n") + "\n";
}

module.exports = { declare };
