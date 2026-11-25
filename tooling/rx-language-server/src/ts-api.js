// The types a draft reads, through tsrs's API (declare.js). tsrs answers about a type, a symbol or a signature it holds; this
// gives each the shape the draft's code is written in — `t.symbol`, `t.types`, `symbol.declarations` as nodes — one object a
// type, with what was asked of it kept, so that a question is sent once. The library's own declarations are tsrs's nodes, as
// they are. One program is made for a draft, with the entry that imports the module as `__m`; asked from there tsrs itself
// writes each name a row may use (`__m.T`, `import("pkg").T`): `named` finds the symbol a written name is.
const path = require("node:path");
const { checker: checkerOf, tsrs, bare } = require("./checker.js");

let ast;
/** tsrs's enums and node tests, under the names TypeScript has them by. */
function api() {
  if (ast) return ast;
  const t = tsrs(), a = require(require.resolve("tsrs/ast"));
  ast = { ...a, TypeFlags: t.TypeFlags, SymbolFlags: t.SymbolFlags, NodeBuilderFlags: t.NodeBuilderFlags, TypeFormatFlags: t.TypeFormatFlags, ElementFlags: t.ElementFlags, IndexKind: t.IndexKind ?? { String: 0, Number: 1 }, SignatureKind: t.SignatureKind, isParameter: a.isParameterDeclaration, isPropertySignature: a.isPropertySignatureDeclaration ?? a.isPropertySignature, forEachChild: (n, f) => n.forEachChild(f), isExternalModule: sf => !!sf.externalModuleIndicator };
  ast.SymbolFlags = { ...ast.SymbolFlags };
  return ast;
}
const OPTIONS = { strict: true, skipLibCheck: true, noEmit: true, moduleResolution: 100, allowImportingTsExtensions: true, module: 99, target: 9, jsx: 1, jsxImportSource: "@solidjs/web", types: [] };

/** The last program opened, kept until another is: tsrs parses a file again that no program it holds has. */
let kept;
/** A program over `spec` as imported from `from`: `{ ts, checker, program, mod, imp, entry, options, resolve, other, dispose }`. */
function open(spec, from, more = {}) {
  const ts = api(), ck = checkerOf(from), options = { ...OPTIONS, ...more };
  const entry = path.join(from, "__rx_declare__.ts"), code = `import * as __m from ${JSON.stringify(spec)};\nexport { __m };\n`;
  const made = ck.program({ roots: [entry], files: new Map([[entry, code]]), options });
  const opened = [made];
  const p = wrap(ts, made.program);
  const sf = made.program.getSourceFile(entry), imp = sf.statements[0];
  return {
    ts, ...p, imp, sf, entry, options, mod: p.checker.getSymbolAtLocation(imp.moduleSpecifier),
    /** Where the library's own module resolves a name: from a file of the library first, then from the draft's folder. */
    resolve: (s, lib) => (lib && bare(s) && ck.resolve(s, path.dirname(lib), options)) || ck.resolve(s, from, options),
    /** A program of its own over files (a package's other modules). */
    other: files => { const m = ck.program({ roots: files, options }); opened.push(m); return wrap(ts, m.program); },
    dispose: () => { for (const m of opened.slice(1)) m.dispose(); try { kept?.dispose(); } catch { /* its process was closed */ } kept = made; },
  };
}

function wrap(ts, program) {
  const ch = program.checker ?? program.getProject().checker, project = program.getProject();
  const types = new Map(), syms = new Map(), sigs = new Map(), ofNode = new Map();
  const ty = r => r === undefined || r === null ? undefined : types.get(r.id) ?? (types.set(r.id, new Type(r)), types.get(r.id));
  const sy = r => r === undefined || r === null ? undefined : syms.get(r.id) ?? (syms.set(r.id, new Symbol_(r)), syms.get(r.id));
  const sg = r => r === undefined || r === null ? undefined : sigs.get(r.id) ?? (sigs.set(r.id, new Signature(r)), sigs.get(r.id));
  const node = h => { try { return h?.resolve(project); } catch { return undefined; } };
  const lazy = (o, k, f) => { const v = f(); Object.defineProperty(o, k, { value: v, enumerable: false }); return v; };
  const quiet = f => { try { return f(); } catch { return undefined; } };

  class Type {
    constructor(r) { this.raw = r; this.flags = r.flags; this.id = r.id; this.intrinsicName = r.isErrorType?.() ? "error" : r.intrinsicName; }
    get symbol() { return lazy(this, "symbol", () => sy(this.raw.getSymbol())); }
    get aliasSymbol() { return lazy(this, "aliasSymbol", () => sy(this.raw.getAliasSymbol())); }
    get types() { return lazy(this, "types", () => this.flags & ts.TypeFlags.UnionOrIntersection ? this.raw.getTypes().map(ty) : undefined); }
    get aliasArgs() { return lazy(this, "aliasArgs", () => (this.raw.getAliasTypeArguments?.() ?? []).map(ty)); }
    get base() { return lazy(this, "base", () => ty(this.raw.getBaseType?.())); }
    get target() { return lazy(this, "target", () => this.raw.isTupleType?.() ? this.raw.getTarget() : undefined); }
    get objectFlags() { return this.raw.objectFlags ?? 0; }
    isUnion() { return !!(this.flags & ts.TypeFlags.Union); }
    isIntersection() { return !!(this.flags & ts.TypeFlags.Intersection); }
    isUnionOrIntersection() { return !!(this.flags & ts.TypeFlags.UnionOrIntersection); }
    get calls() { return lazy(this, "calls", () => ch.getSignaturesOfType(this.raw, ts.SignatureKind.Call).map(sg)); }
    get news() { return lazy(this, "news", () => ch.getSignaturesOfType(this.raw, ts.SignatureKind.Construct).map(sg)); }
    get props() { return lazy(this, "props", () => ch.getPropertiesOfType(this.raw).map(sy)); }
    getCallSignatures() { return this.calls; }
    getConstructSignatures() { return this.news; }
    getProperties() { return this.props; }
    getProperty(n) { return this.props.find(p => p.name === n); }
    getReturnType() { return undefined; }
  }
  class Symbol_ {
    constructor(r) { this.raw = r; this.flags = r.flags; this.name = r.name; this.escapedName = r.escapedName; this.id = r.id; }
    get declarations() { return lazy(this, "declarations", () => { const d = (this.raw.declarations ?? []).map(node).filter(Boolean); return d.length ? d : undefined; }); }
    get valueDeclaration() { return lazy(this, "valueDeclaration", () => node(this.raw.valueDeclaration)); }
    get parent() { return lazy(this, "parent", () => sy(this.raw.getParent?.())); }
    get exportsTable() { return lazy(this, "exportsTable", () => quiet(() => new Map([...this.raw.getExports()].map(([k, v]) => [String(v.name ?? k), sy(v)]))) ?? new Map()); }
    /** The files it is declared in, with no node read. */
    get paths() { return (this.raw.declarations ?? []).map(d => d.path); }
    getName() { return this.name; }
  }
  class Signature {
    constructor(r) { this.raw = r; }
    get declaration() { return lazy(this, "declaration", () => node(this.raw.declaration)); }
    get params() { return lazy(this, "params", () => this.raw.getParameters().map(sy)); }
    get typeParams() { return lazy(this, "typeParams", () => { const r = this.raw.getTypeParameters(); return r?.length ? r.map(ty) : undefined; }); }
    get result() { return lazy(this, "result", () => ty(this.raw.getReturnType())); }
    getParameters() { return this.params; }
    getTypeParameters() { return this.typeParams; }
    get typeParameters() { return this.typeParams; }
    getReturnType() { return this.result; }
  }
  const memo = (f, key = x => x.id) => { const m = new Map(); return (x, ...a) => { const k = key(x, ...a); if (!m.has(k)) m.set(k, f(x, ...a)); return m.get(k); }; };
  const nodeKey = n => n;
  const texts = memo((t, at, flags) => ch.typeToString(t.raw, at, flags), (t, at, flags) => `${t.id}:${flags ?? ""}:${at ? 1 : 0}`);
  const checker = {
    getNonNullableType: memo(t => ty(ch.getNonNullableType(t.raw))),
    getTypeOfSymbol: memo(s => ty(ch.getTypeOfSymbol(s.raw))),
    getTypeOfSymbolAtLocation: memo(s => ty(ch.getTypeOfSymbol(s.raw))),
    getDeclaredTypeOfSymbol: memo(s => ty(ch.getDeclaredTypeOfSymbol(s.raw))),
    getAliasedSymbol: memo(s => sy(ch.getAliasedSymbol(s.raw))),
    // in the order they are written: the module's own, then what it hands on whole, a file at a time
    getExportsOfModule: memo(s => {
      const rank = new Map([[s.raw.declarations?.[0]?.path, -1]]); program.getSourceFileNames().forEach((f, i) => { const k = f; if (!rank.has(k)) rank.set(k, i); });
      const at = e => e.declarations?.[0], of = e => rank.get(at(e)?.path) ?? 1e9;
      return [...ch.getExportsOfModule(s.raw)].sort((a, b) => of(a) - of(b) || (at(a)?.index ?? 0) - (at(b)?.index ?? 0) || (a.name < b.name ? -1 : 1)).map(sy);
    }),
    getSymbolAtLocation: memo(n => n.pos < 0 ? undefined : sy(quiet(() => ch.getSymbolAtLocation(n))), nodeKey),
    getSymbolOfDeclaration: n => sy(quiet(() => ch.getSymbolOfDeclaration(n))),
    getTypeFromTypeNode: memo(n => ty(ch.getTypeFromTypeNode(n)), nodeKey),
    isArrayType: memo(t => !!(t.flags & ts.TypeFlags.Object) && ch.isArrayType(t.raw)),
    isTupleType: memo(t => !!(t.flags & ts.TypeFlags.Object) && ch.isTupleType(t.raw)),
    getTypeArguments: memo(t => t.objectFlags & 4 ? ch.getTypeArguments(t.raw).map(ty) : []),   // (ObjectFlags.Reference: of any other type there are none)
    getBaseConstraintOfType: memo(t => ty(ch.getBaseConstraintOfType(t.raw))),
    getBaseTypes: memo(t => (ch.getBaseTypes(t.raw) ?? []).map(ty)),
    getIndexInfoOfType: memo((t, k) => { const i = ch.getIndexInfosOfType(t.raw).find(x => k === ts.IndexKind.String ? x.keyType.flags & ts.TypeFlags.String : x.keyType.flags & ts.TypeFlags.Number); return i && { type: ty(i.valueType ?? i.type), isReadonly: i.isReadonly }; }, (t, k) => `${t.id}:${k}`),
    getIndexInfosOfType: memo(t => ch.getIndexInfosOfType(t.raw).map(i => ({ type: ty(i.valueType ?? i.type), isReadonly: i.isReadonly }))),
    getPropertyOfType: (t, n) => t.getProperty(n),
    getReturnTypeOfSignature: s => s.getReturnType(),
    getTypePredicateOfSignature: s => quiet(() => ch.getTypePredicateOfSignature(s.raw)),
    isTypeAssignableTo: memo((a, b) => ch.isTypeAssignableTo(a.raw, b.raw), (a, b) => `${a.id}:${b.id}`),
    typeToString: (t, at, flags) => texts(t, at, flags),
    typeToTypeNode: memo((t, at, flags) => quiet(() => ch.typeToTypeNode(t.raw, at, flags)), (t, at, flags) => `${t.id}:${flags}:${at ? 1 : 0}`),
    resolveName: (name, at, flags) => sy(quiet(() => ch.resolveName(name, flags, at, false))),
    wrap: { ty, sy, sg },
  };
  const names = () => program.getSourceFileNames();
  return { program: { getSourceFile: f => quiet(() => program.getSourceFile(f)), getSourceFileNames: names, getTypeChecker: () => checker, isSourceFileDefaultLibrary: sf => program.isSourceFileDefaultLibrary(sf) }, checker };
}

module.exports = { open, api };
