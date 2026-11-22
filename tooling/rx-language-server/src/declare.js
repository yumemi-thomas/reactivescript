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
function text(ts, checker, t) {
  if (isJsxElement(ts, checker, t)) return "View";
  if (checker.isArrayType(t) && isJsxElement(ts, checker, checker.getTypeArguments(t)[0])) return "View[]";
  const s = checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias);
  const names = s.replace(/"[^"]*"|'[^']*'/g, "").match(/\b[A-Z][A-Za-z0-9_$]*\b/g) ?? [];
  return names.every(n => KNOWN.has(n)) && !/=>/.test(s) ? s : "any";
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

function propText(ts, checker, p, at) {
  const t = checker.getTypeOfSymbolAtLocation(p, at);
  const opt = p.flags & ts.SymbolFlags.Optional ? "?" : "";
  const fnSigs = checker.getNonNullableType(t).getCallSignatures();
  if (p.name === "children" && fnSigs.length && fnSigs.every(s => isElement(ts, checker, s.getReturnType())))
    return `children${opt}: (${fnSigs[0].getParameters().map(q => `${q.name}: any`).join(", ")}) => View`;   // MO-11k: a render prop, written `{view (…) { … }}`
  if (isComponent(ts, checker, t) && !isElement(ts, checker, t)) return `${p.name}${opt}: Component`;
  if (/^(as|component)$/.test(p.name) && checker.getNonNullableType(t).isUnion?.() && checker.getNonNullableType(t).types.some(u => isComponent(ts, checker, u))) return `${p.name}${opt}: string | Component`;   // a polymorphic \`as\`: a tag or a component (MO-11c)
  if (isElement(ts, checker, t)) return `${p.name}${opt}: View`;
  if (isFn(checker, t)) return `${p.name}${opt}: (...args: any[]) => any`;   // a callback (MO-10g)
  return `${p.name}${opt}: ${text(ts, checker, t)}`;
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
function paramText(ts, checker, p, at, generic = false) {
  const t = checker.getTypeOfSymbolAtLocation(p, at);
  const opt = p.valueDeclaration && ts.isParameter(p.valueDeclaration) && (p.valueDeclaration.questionToken || p.valueDeclaration.initializer) ? "?" : "";   // MO-8e
  const name = RESERVED.has(p.name) ? `${p.name}_` : p.name;   // a parameter's name is only a name: never a row word (`ref`)
  const held = signalOf(ts, checker, t);
  if (held) return `signal ${name}${opt}: ${text(ts, checker, held)}`;   // MO-10h: the program passes the value, the compiler the signal
  const read = accessorOf(ts, checker, t);
  if (read) return `ref ${name}${opt}: ${text(ts, checker, read)}`;
  // a callback (MO-10g); one whose type is a predicate, or ranges over the signature's type parameters, is written `any`
  if (isFn(checker, t)) return checker.getNonNullableType(t).getCallSignatures().some(s => checker.getTypePredicateOfSignature?.(s)) ? `${name}${opt}: any` : `${name}${opt}: (...args: any[]) => any`;
  const obj = checker.getNonNullableType(t);
  if (ownObject(ts, obj, checker) && obj.getProperties().some(q => isFn(checker, checker.getTypeOfSymbolAtLocation(q, at)))) {
    return `${name}${opt}: { ${obj.getProperties().map(q => propText(ts, checker, q, at)).join("; ")} }`;   // its callbacks are typed as functions
  }
  return `${name}${opt}: ${text(ts, checker, opt ? checker.getNonNullableType(t) : t)}`;   // `?` already says it may be absent
}

/** What a type may also be: ` | undefined`, ` | null`, from its union members. */
const nullish = (ts, t) => !(t.flags & ts.TypeFlags.Union) ? "" : (t.types.some(x => x.flags & ts.TypeFlags.Undefined) ? " | undefined" : "") + (t.types.some(x => x.flags & ts.TypeFlags.Null) ? " | null" : "");
/** EF-5a: what undoes a call — a function that takes nothing and answers nothing, as TypeScript resolves the type (a
 *  library's own name for it, `VoidFunction`, is that function). */
const isDisposer = (ts, checker, t) => { const u = checker.getNonNullableType(t); const sigs = u.getCallSignatures(); return !u.getProperties().length && !u.getConstructSignatures().length && sigs.length === 1 && !sigs[0].getParameters().length && !sigs[0].getTypeParameters()?.length && !!(sigs[0].getReturnType().flags & ts.TypeFlags.Void); };
function resultText(ts, checker, t, todos, generic = false) {
  if (isComponent(ts, checker, t) && !isElement(ts, checker, t)) return "Component";
  const read = accessorOf(ts, checker, t);
  if (read) return `ref ${text(ts, checker, read)}`;
  if (isDisposer(ts, checker, t)) return nullish(ts, t) ? `(() => void)${nullish(ts, t)}` : "() => void";   // EF-5a: the checker holds a call to keeping it
  if (isFn(checker, t)) return generic ? "any" : `((...args: any[]) => any)${nullish(ts, t)}`;   // a function part is io (MO-10b); it may be absent
  const tuple = checker.getNonNullableType(t);
  if (checker.isTupleType(tuple)) {
    const ro = tuple.target?.readonly ? "readonly " : "";   // MO-10b: `as const` results stay read-only
    return `${ro}[${checker.getTypeArguments(tuple).map(x => accessorOf(ts, checker, x) ? `ref ${text(ts, checker, accessorOf(ts, checker, x))}` : isFn(checker, x) ? (generic ? "any" : "(...args: any[]) => void") : text(ts, checker, x)).join(", ")}]`;
  }
  const s = text(ts, checker, t);
  if (/^Promise</.test(checker.typeToString(t))) todos.push("what does its promise reject with? add rejects(<classes>) (default Error)");
  else if (ownObject(ts, t, checker)) todos.push("is the result a store with fields that wait or throw when read? mark them `pending fails(<classes>)` (MO-10f)");
  return s;
}

/** @returns {string} the draft `.d.rx` for `spec`, imported from `from` (a directory). */
function declare(ts, spec, from, options = {}) {
  const host = ts.createCompilerHost({ strict: true, skipLibCheck: true, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve, jsxImportSource: "@solidjs/web", ...options });
  const entry = path.join(from, "__rx_declare__.ts");
  const code = `import * as __m from ${JSON.stringify(spec)};\nexport { __m };\n`;
  const { getSourceFile, fileExists } = host;
  host.getSourceFile = (f, ...rest) => path.resolve(f) === entry ? ts.createSourceFile(f, code, ts.ScriptTarget.ES2022) : getSourceFile.call(host, f, ...rest);
  host.fileExists = f => path.resolve(f) === entry || fileExists.call(host, f);
  const program = ts.createProgram([entry], { strict: true, skipLibCheck: true, noEmit: true, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve, jsxImportSource: "@solidjs/web", ...options }, host);
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
  const contexts = [];
  const lines = [];
  for (const sym0 of checker.getExportsOfModule(mod)) {
    const sym = sym0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym0) : sym0;
    const name = sym0.name;
    if (name === "default") { lines.push(`// TODO: the module's default export: import it by name in a JS helper (\`export { default as x } from …\`) and declare that`); continue; }
    if (sym.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface) && !(sym.flags & ts.SymbolFlags.Value)) {
      const tp = sym.declarations?.[0]?.typeParameters ?? [];
      // a generic type's bounds name the library's own types, which the draft cannot see: declare it only if `.rx` names it
      lines.push(tp.length ? `// TODO ${name}: a generic type; declare it if your .rx names it (types are text to the checker)` : `export type ${name} = import(${JSON.stringify(spec)}).${name}`);
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
      const props = pt ? checker.getNonNullableType(pt).getProperties().filter(q => /^[A-Za-z_$][\w$]*$/.test(q.name)).map(q => propText(ts, checker, q, imp)) : [];
      // MO-10g: a prop's function type is pure unless it says `handler`, whatever its name, so an event-like name is only
      // a suggestion here, never the word
      const events = [...new Set(props.map(x => /^(on[A-Z][\w$]*)\??\s*:\s*\(/.exec(x)?.[1]).filter(Boolean))];
      const row = `export component ${as}(props: { ${props.join("; ")} })`;
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
    const ps = params.map(p => isRest(p) ? `...${p.name}: any[]` : paramText(ts, checker, p, imp, generic));   // MO-8h: a rest parameter (`pipe(...items)`)
    const todos = [];
    // MO-10g: a function type is pure unless marked `handler`; one named like an event is likely called later — a
    // suggestion for a person, not a row (the name is a convention, not a fact)
    const events = [...ps.join("; ").matchAll(/(?:^|[\s{;,(])(on[A-Z][\w$]*)\??\s*:\s*\(/g)].map(m => m[1]);
    if (events.length) todos.push(`${[...new Set(events)].join(", ")}: called later, outside any computation? mark ${events.length > 1 ? "each" : "it"} \`handler (…) => …\`, so a closure there may write sources (MO-10g)`);
    const ret = resultText(ts, checker, sig.getReturnType(), todos, generic);
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
    lines.push(`export fn ${name}(${ps.join(", ")}): ${ret}${primitive && !/\bref\b/.test(ps.join(" ") + ret) && !factory ? " instantiates" : ""}`);
  }
  if (contexts.length) out.push(`// TODO: the module's contexts (${contexts.join(", ")}): name each with \`export context <name>\` and add uses(<name>) to the hooks that read it (MO-12)`);
  return [...out, ...lines].join("\n") + "\n";
}

module.exports = { declare };
