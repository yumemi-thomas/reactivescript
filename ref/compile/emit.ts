// The code generator: a checked Program → an ES module per .rx module: the reactive lowering as __rt calls, the views as
// JSX, which Solid's own compiler then lowers for the target (compile/jsx.ts).
// Lexical scopes become JS scopes: every region is a JS function, every declaration a `const`. Names are mangled
// (`v$x` the value or accessor, `w$x` a source's writer, `p$x` a companion `pre` memo). The decisions are the
// oracle's (ref/oracle/lower.ts); this file only makes them at compile time.
import { inPrelude, language, scalar } from "../src/names.ts";
import type { Decl, Expr, Markup, Program, Stmt } from "../src/ast.ts";
import { instantiates, keptParts } from "../src/ast.ts";
import { singleModule, isRx, madeComponent, ViewProps, typeOnly, given, defaulted, bindGiven, viewFields, shownIn, shown, typesOf, type Given, type ModuleSet } from "../src/modules.ts";
export { madeComponent };
import { innerCatches, nonTailAwaits, viewReaders } from "../src/awaits.ts";
import { inferredAction } from "../src/infer.ts";
import { transform } from "@solidjs/compiler";
import { jsxTag } from "./jsx.ts";
import { unwrapServer, litKey } from "../src/check.ts";
import { scopeFacts } from "../src/scope.ts";
import { isPrims } from "../src/prims.ts";
import type { Shape, JsDecl } from "../src/parse.ts";
import { instance } from "../src/parse.ts";

export class CompileError extends Error { name = "CompileError"; }
type FnDecl = Extract<Decl, { k: "fn" }>;
type Kind = "acc" | "src" | "val" | "fn" | "ifn" | "jfn" | "act" | "comp";
type Bind = { kind: Kind; js: string; given?: Given; shows?: Map<string, boolean>; plain?: boolean; w?: string; fn?: FnDecl; prev?: string; client?: boolean; refs?: boolean[]; shape?: Shape; inst?: string; draft?: boolean; drafts?: [number, number[]][]; partDrafts?: Record<string, [number, number[]][]>; jsFn?: boolean; draftArgs?: number[] };   // MO-10i: draft, a library's draft (a callback's parameter, or a turn of a loop over a path of one): a place, read as a copy; drafts, partDrafts: a JS fn's draft callbacks, and its result's function parts that take them   // MO-10: jfn, a declared JS primitive (refs, shape); inst: an instance's raw result   // client: `client` JS (12 SF-5b)

/** RG-4c: a view given to an .rx component, a function of one parameter. */
const viewParam = (v: { params: string[] }) => v.params.map(mg).join(", ") || "__s";
class Env {
  vars = new Map<string, Bind>(); parent: Env | null;
  constructor(parent: Env | null) { this.parent = parent; }
  lookup(n: string): Bind | undefined { return this.vars.get(n) ?? this.parent?.lookup(n); }
  /** The declaring frame of `n` (for companion `pre` memos). */
  frame(n: string): Env | undefined { return this.vars.has(n) ? this : this.parent?.frame(n); }
}
type Ctx = { imp: boolean; gen?: boolean; async?: boolean; tail?: boolean; self?: string; effect?: boolean; dyn?: boolean; ref?: boolean };

const isHandler = (a: string) => /^on[A-Z:]/.test(a) || a === "ref";   // `ref`: called once with the element
const J = (v: unknown) => v === undefined ? "undefined" : JSON.stringify(v);
const mg = (n: string) => `v$${n}`;
const cm = (n: string) => `V$${n}`;   // a component: an uppercase JSX tag
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

// ---------------------------------------------------------------- usage analysis (the oracle's walkers, at compile time)
type Usage = { optimistic: Set<string>; paths: Set<string>; prevOf: Set<string>; plain: Set<string> };
function usage(p: Program | Program[], extra: Stmt[][] = []): Usage {
  const u: Usage = { optimistic: new Set(), paths: new Set(), prevOf: new Set(), plain: new Set() };
  const seen = new WeakSet<object>();
  const walk = (x: unknown, selfName?: string): void => {
    if (!x || typeof x !== "object" || seen.has(x as object)) return; seen.add(x as object);
    if (Array.isArray(x)) { x.forEach(y => walk(y, selfName)); return; }
    const o = x as Record<string, any>;
    if (o.k === "optimistic") u.optimistic.add(o.target.name);
    if (o.k === "write" && !o.target.ctx) u.plain.add(o.target.name);
    if ((o.k === "write" || o.k === "optimistic") && o.target.path.length) u.paths.add(o.target.name);
    if (o.k === "pending" && (o.e.k === "member" || o.e.k === "index")) { let y = o.e; while (y.k === "member" || y.k === "index") y = y.o; if (y.k === "id") u.paths.add(y.name); }
    if (o.k === "pre" && o.name !== selfName) u.prevOf.add(o.name);
    const nextSelf = (o.k === "eq" || o.k === "source") ? o.name : selfName;
    for (const v of Object.values(o)) walk(v, nextSelf);
  };
  walk(p); walk(extra);
  return u;
}
/** Free names of an expression, for ordering declarations (JS consts have a temporal dead zone; memos compute eagerly). */
function deps(e: unknown, self: string, out = new Set<string>()): Set<string> {
  if (!e || typeof e !== "object") return out;
  if (Array.isArray(e)) { e.forEach(x => deps(x, self, out)); return out; }
  const o = e as Record<string, any>;
  if (o.k === "id") out.add(o.name);
  if (o.k === "pre" && o.name !== self) out.add(o.name);
  if (o.k === "write" || o.k === "optimistic") out.add(o.target.name);
  for (const [k, v] of Object.entries(o)) if (k !== "k") deps(v, self, out);
  return out;
}

// ---------------------------------------------------------------- the module
export function compile(p: Program, opts: { extraStmts?: Stmt[][] } = {}): string { return compileModules(singleModule(p), opts).files.get("main.mjs")!; }

/** 09 MO-1: one ES module per `.rx` module. A dependency's module is a factory over the app (`__rt.module` runs it once per app,
 *  the first time an importer instantiates — inside the mounted root, so its state is owned there); the entry's is `main`. */
export function compileModules(set: ModuleSet, opts: { extraStmts?: Stmt[][] } = {}): { files: Map<string, string>; entry: string; css: string } {
  // MO-9: a module known by its signature is compiled on its own; its module is beside it, `x.rx` → `x.mjs`
  const out = (path: string) => path === set.entry ? "main.mjs" : set.order.includes(path) ? `m${set.order.indexOf(path)}.mjs` : `${path.split("/").pop()!.replace(/\.rx$/, "")}.mjs`;
  const g = new Gen(usage([...set.programs.values()], opts.extraStmts), { set, out });
  const files = new Map<string, string>();
  for (const path of set.order) {
    const p = set.programs.get(path)!; g.beginModule(path, p);
    const deps = [...new Set(p.decls.flatMap(d => d.k === "import" && d.resolved ? [d.resolved] : []))];
    // MO-13c: a module a JS import's printed signature stands for is the compiled JavaScript that import names, whose `__rx` is the module's factory
    const compiled = new Map(p.decls.flatMap(d => d.k === "import" && d.resolved && !isRx(d.from) ? [[d.resolved, d.from] as [string, string]] : []));
    const head = `// compiled by ReactiveScript ref/compile from ${path.split("/").pop()} — do not edit\n${deps.map(d => compiled.has(d) ? `import { __rx as ${g.depVar(d)} } from ${J(compiled.get(d)!)};` : `import ${g.depVar(d)} from "./${out(d)}";`).join("\n")}${deps.length ? "\n" : ""}`;
    if (path === set.entry) { const body = g.block(p.decls, p.view, new Env(null), 2, undefined, true); files.set(out(path), `${head}${g.top.join("\n")}${g.top.length ? "\n" : ""}export default function main(__rt) {\n  const __B = __rt.B;\n  return () => {\n${body}\n  };\n}\n`); }
    else {
      const exported = p.decls.filter(d => (d as { exported?: boolean }).exported && "name" in d && d.k !== "typedecl").map(d => (d as { name: string }).name);
      const isComp = (n: string) => p.decls.some(d => d.k === "component" && d.name === n) || madeComponent(p, n, set.declarations);   // MO-11j
      const body = g.block(p.decls, [], new Env(null), 1, `{ ${exported.map(n => `${J(n)}: ${isComp(n) ? cm(n) : mg(n)}`).join(", ")} }`);
      files.set(out(path), `${head}${g.top.join("\n")}${g.top.length ? "\n" : ""}export default function module(__rt) {\n  const __B = __rt.B;\n${body}\n}\n`);
    }
  }
  return { files, entry: out(set.entry), css: g.css.join("\n") };   // CSS-4: the modules' stylesheets, beside their JavaScript
}
/** Handler rows and resolve values in scenarios: statements over names looked up at run time (rt.lookup). */
export function compileDynamic(stmts: Stmt[]): string { const g = new Gen(usage({ decls: [], view: [] }, [stmts])); const env = new Env(null); return inferredAction(stmts) ? g.stmts([{ k: "action", body: stmts }], env, { imp: true, dyn: true }, 0) : g.stmts(stmts, env, { imp: true, dyn: true }, 0); }   // AC-1b: a handler row is a handler's body
export function compileDynamicExpr(e: Expr): string { const g = new Gen(usage({ decls: [], view: [] })); return g.expr(e, new Env(null), { imp: true, dyn: true }); }

class Gen {
  u: Usage;
  file = "main.rx"; css: string[] = [];
  top: string[] = [];                                   // module-level code: hoisted server functions and the module's error classes
  serverNames = new Map<string, string>();              // a module-level server fn → its hoisted function
  private modDecls: Decl[] = [];
  private views = new ViewProps(undefined, []);   // MO-11t: the props of the JS components this module imports that take a view
  private typeOnly = new Set<string>();           // what the module imports from JavaScript for its types alone
  private sfSeq = 0;
  /** Begin a module: what a hoisted server function may name at module level (SF-3: imports, error classes, server fns). */
  beginModule(path: string, p: Program) {
    const decls = p.decls; this.typeOnly = typeOnly(p, this.mods?.set);
    this.file = path; this.top = []; this.modDecls = decls; this.serverNames = new Map();
    this.views = new ViewProps(this.mods?.set, decls);
    this.argCalls = scopeFacts({ decls, view: [] }).argCalls;
    for (const d of decls) if (d.k === "server" || (d.k === "eq" && unwrapServer(d.e))) this.serverNames.set(d.name, `sf$${d.name}`);
    // a package's JS (\`@solidjs/web/server-functions\`): a real import at module level, where a hoisted server fn's wrappers are
    for (const d of decls) if (d.k === "import" && !d.resolved && !d.from.startsWith(".")) {
      if (!d.names.length) { this.top.push(`import ${J(d.from)};`); continue; }   // 07 §1a: for its effect
      const isType = (n: string) => !!d.declared && !!this.mods?.set.declarations?.get(d.declared)?.some(y => y.kind === "type" && y.name === n);   // a type its declaration file declares binds nothing: the JS module exports no such name
      const names = d.names.filter(n => !inPrelude(d, n.name, this.mods?.set.conformance) && !isType(n.name) && !this.typeOnly.has(n.alias));
      if (names.length) this.top.push(`import { ${names.map(n => `${n.name} as w$${n.alias}`).join(", ")} } from ${J(d.from)};`);
    }
  }
  /** 12 SF-7a: a server fn as Solid's \`"use server"\` function at module level — it may name only its parameters, its locals
   *  and module-level bindings, which SF-3 makes always possible: every name a body may use is a module-level import, error
   *  class or server fn, bound here from the calling app. Solid's \`transformDirectives\` then extracts it (server build) or
   *  replaces it with a reference (browser build). */
  /** SF-1d: a wrapped server fn — the wrapper calls kept around it at module level, where Solid's directive pass finds it. */
  private serverWrapped(name: string, e: Expr): string {
    const f = this.serverNames.get(name)!;
    const chain = (x: Expr): string => {
      if (x.k === "serverfn") return this.serverHoist({ name, params: x.params, body: x.body }, true);
      if (x.k === "call" && x.f.k === "id") {
        const imp = this.modDecls.find(d => d.k === "import" && !d.resolved && !d.from.startsWith(".") && d.names.some(n => n.alias === (x.f as { name: string }).name));
        if (!imp) throw new CompileError(`${name}: a server fn's wrapper is a package's function (here, ${x.f.name})`);
        return `w$${x.f.name}(${x.args.map(a => unwrapServer(a) ? chain(a) : a.k === "lit" ? J(a.v) : (() => { throw new CompileError(`${name}: a wrapper's other arguments are literals`); })()).join(", ")})`;
      }
      throw new CompileError(`${name}: not a wrapped server fn`);
    };
    this.top.push(`const ${f} = ${chain(e)};`);
    return f;
  }
  /** MO-8t: an import's names, and after each the methods its declaration gives rows of their own (`export fn
   *  toaster.show(…)`): each is bound as a declared fn is, under the name the loader gave its mentions (`toaster.show`),
   *  and written as that member of the import (`v$toaster.show`). */
  private withMethods(d: Extract<Decl, { k: "import" }>): { name: string; alias: string }[] {
    const ds = d.declared ? this.mods?.set.declarations?.get(d.declared) ?? [] : [];
    return d.names.flatMap(n => [n, ...ds.flatMap(m => m.kind === "fn" && m.name.startsWith(n.name + ".") ? [{ name: m.name, alias: n.alias + m.name.slice(n.name.length) }] : [])]);
  }
  private serverHoist(d: { name: string; params: string[]; body: Stmt[] }, expression = false): string {
    const f = this.serverNames.get(d.name) && !expression && !this.top.some(t => t.includes(`function ${this.serverNames.get(d.name)}(`)) ? this.serverNames.get(d.name)! : `sf$${d.name}$${this.sfSeq++}`;
    const env = new Env(null); const pre: string[] = [];
    for (const x of this.modDecls) {
      if (x.k === "import" && !x.resolved) for (const { name, alias } of this.withMethods(x)) {
        if (inPrelude(x, name, this.mods?.set.conformance)) continue;
        if (!x.from.startsWith(".")) { env.vars.set(alias, { kind: "val", js: `w$${alias}` }); continue; }   // a package's: module level
        env.vars.set(alias, { kind: "val", js: mg(alias) });
        pre.push(`const ${mg(alias)} = ${x.declaredErrors?.includes(name) ? `__rt.jsError(${J(name)})` : `__rt.api(${J(name)})`};`);
      }
      if (x.k === "error") { env.vars.set(x.name, { kind: "val", js: mg(x.name) }); pre.push(`const ${mg(x.name)} = g$${x.name}(__rt);`); }
      if (x.k === "server" || (x.k === "eq" && unwrapServer(x.e))) env.vars.set(x.name, { kind: "val", js: this.serverNames.get(x.name)! });
      if (x.k === "fn" && !instantiates(x)) env.vars.set(x.name, { kind: "fn", js: mg(x.name), fn: x });   // a value fn (SF-3: it reads nothing reactive)
    }
    for (const x of this.modDecls) if (x.k === "fn" && env.vars.get(x.name)?.fn === x) pre.push(this.fn(x, env, 0));   // declared again inside: the body is extracted with it (found by S-app-notes)
    const body = this.stmts(d.body, this.params(env, d.params), { imp: true, gen: true }, 2);
    const fn = `async function ${f}(...__a) {\n  "use server";\n  const __rt = globalThis.__rx_app; const __B = __rt.B;\n  ${pre.join("\n  ")}\n  return __rt.serverCall(${J(d.name)}, function* (${d.params.map(mg).join(", ")}) {\n${body}\n  }, __a);\n}`;
    if (expression) return fn;
    this.top.push(fn);
    return f;
  }
  private styleHash: string | null = null;   // CSS-2: the scope class of the view being emitted
  mods?: { set: ModuleSet; out: (path: string) => string };
  constructor(u: Usage, mods?: { set: ModuleSet; out: (path: string) => string }) { this.u = u; this.mods = mods; }
  private modIndex(path: string) { const { order, signatures } = this.mods!.set; return [...order, ...(signatures?.keys() ?? [])].indexOf(path); }
  depVar(path: string) { return `__m${this.modIndex(path)}`; }
  /** An imported name's binding, from the exporting module's declaration (MO-3: a source is read-only here, so an accessor). */
  /** RG-4c: a component whose children are a view or plain content. */
  private plain(d: Extract<Decl, { k: "component" }>, path: string): { plain?: true } { return shown(d, typesOf(this.mods?.set, path)).get("children")?.mixed ? { plain: true } : {}; }
  private importBind(path: string, name: string, alias: string): Bind {
    const sig = this.mods!.set.programs.has(path) ? undefined : this.mods!.set.signatures?.get(path)?.exports.get(name);
    if (sig) switch (sig.kind) {                                                             // MO-9: the kind is the signature's
      case "fn": return { kind: sig.instantiating || sig.params.some(p => p.ref) ? "ifn" : "fn", js: mg(alias), fn: { k: "fn", name, params: sig.params, decls: [], tail: { k: "lit", v: undefined } } as unknown as FnDecl };
      case "comp": return sig.sig.made ? { kind: "comp", js: cm(alias), shape: "comp" } : { kind: "comp", js: cm(alias), ...(sig.sig.props.children?.view?.mixed ? { plain: true } : {}) };   // MO-11j: a made component is a JS component
      case "action": return { kind: "act", js: mg(alias) };
      case "source": case "eq": return { kind: "acc", js: mg(alias) };
      default: return { kind: "val", js: mg(alias) };
    }
    const d = this.mods!.set.programs.get(path)?.decls.find(x => "name" in x && (x as { name: string }).name === name) as Decl | undefined;
    const js = mg(alias);
    if (!d) return { kind: "val", js };
    switch (d.k) {
      case "fn": return { kind: instantiates(d) ? "ifn" : "fn", js, fn: d };
      case "component": return { kind: "comp", js: cm(alias), ...this.plain(d, path) };
      case "action": return { kind: "act", js };
      case "eq": if (madeComponent(this.mods!.set.programs.get(path)!, name, this.mods!.set.declarations)) return { kind: "comp", js: cm(alias), shape: "comp" }; return { kind: "acc", js };   // MO-11j: a JS component, applied as JSX's <X />
      case "source": return { kind: "acc", js };
      default: return { kind: "val", js };
    }
  }

  // ---- blocks: a region's declarations, then its view ----
  block(decls: Decl[], view: Markup[], env: Env, ind: number, exportsTail?: string, styleRoot = false): string {
    const pad = " ".repeat(ind * 2);
    const prevHash = this.styleHash;
    if (styleRoot) this.styleHash = this.style(view);   // a component's view (or the program's) has its own scope; a branch keeps its view's
    try { return this.block0(decls, view, env, ind, exportsTail); } finally { this.styleHash = prevHash; }
  }
  /** 07 §6b: a view's <style> through TSRX's engine (Solid's compiler): the view's elements as a TSRX fragment — HTML
   *  elements with their static attributes, components with the children passed to them, and every region (a branch, a
   *  loop body, a boundary) as an expression TSRX matches conservatively, as it does its own control flow. Its scoped
   *  stylesheet joins the module's; its hash is the view's scope class. */
  /** 07 CSS-5: a style expression through TSRX's engine — its class map literal; its stylesheet joins the module's. */
  private classMap(css: string, line?: number): string {
    let r: { code: string; css?: string };
    try { r = transform(`export const __s = <style>${css}</style>;`, { filename: this.file.replace(/\.rx$/, "") + `.${line ?? 0}.tsrx`, generate: "dom" }) as typeof r; }
    catch (e) { throw new CompileError(`<style> (line ${line ?? "?"}): ${(e as Error).message}`); }
    const m = /export const __s = (\{[\s\S]*?\});/.exec(r.code); if (!m) throw new CompileError(`<style> (line ${line ?? "?"}): no class map`);
    if (r.css) this.css.push(r.css);
    return `Object.freeze(${m[1]})`;
  }
  private style(view: Markup[]): string | null {
    const st = view.find(m => m.k === "style") as Extract<Markup, { k: "style" }> | undefined; if (!st) return null;
    const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const tree = (ms: Markup[]): string => ms.map(m => {
      switch (m.k) {
        case "text": case "style": return "";
        case "read": return "{0}";
        case "el": {
          if (m.tag === "") return `<>${tree(m.children)}</>`;
          if (this.shown.has(m.tag)) return "{0}";                                             // RG-4c: the caller's
          const attrs = m.attrs.filter(a => !isHandler(a.name) && a.name !== "...").map(a => a.e.k === "lit" && typeof a.e.v === "string" ? ` ${a.name}="${esc(a.e.v)}"` : a.e.k === "lit" && a.e.v === true ? ` ${a.name}` : ` ${a.name}={0}`).join("") + (m.attrs.some(a => a.name === "...") ? " {...0}" : "");
          { const tag = jsxTag(m.tag); return VOID_TAGS.has(m.tag) ? `<${tag}${attrs} />` : `<${tag}${attrs}>${tree(m.children)}</${tag}>`; }
        }
        case "mif": return `{(<>${tree(m.t)}</>)}{(<>${tree(m.f)}</>)}`;
        case "mfor": case "mview": return `{(<>${tree(m.body)}</>)}`;
        case "loading": case "errored": return `{(<>${tree(m.fallback)}</>)}{(<>${tree(m.body)}</>)}`;
      }
    }).join("");
    const src = `export const __view = () => <><style>${st.css}</style>${tree(view)}</>;`;
    let r: { css?: string; cssHash?: string | null };
    try { r = transform(src, { filename: this.file.replace(/\.rx$/, "") + ".tsrx", generate: "dom" }) as typeof r; }
    catch (e) { throw new CompileError(`<style> (line ${st.line ?? "?"}): ${(e as Error).message}`); }
    if (!r.cssHash) return null;
    this.css.push(r.css ?? ""); return r.cssHash;
  }
  private block0(decls: Decl[], view: Markup[], env: Env, ind: number, exportsTail?: string): string {
    const pad = " ".repeat(ind * 2);
    const out: string[] = [`${pad}const __o = __rt.owner();`];
    // MO-1: each .rx dependency instantiated (once per app), its exports bound by name
    for (const d of decls) if (d.k === "import" && d.resolved) {
      const iv = `__i${this.modIndex(d.resolved)}`;
      if (!out.some(l => l.includes(`const ${iv} =`))) out.push(`${pad}const ${iv} = __rt.module(${isRx(d.from) ? J(this.mods!.out(d.resolved)) : this.depVar(d.resolved) /* MO-13c: keyed by its factory, as a bundler's build keys a module */}, ${this.depVar(d.resolved)});`);
      for (const { name, alias } of d.names) {
        if (this.mods!.set.programs.get(d.resolved)?.decls.some(x => x.k === "typedecl" && x.name === name) || this.mods!.set.signatures?.get(d.resolved)?.exports.get(name)?.kind === "type") continue;   // a type binds nothing
        const ib = this.importBind(d.resolved, name, alias); if (ib.kind === "acc" && this.u.prevOf.has(alias)) ib.prev = `p$${alias}`; env.vars.set(alias, ib); out.push(`${pad}const ${ib.js} = ${iv}[${J(name)}];${ib.prev ? `\n${pad}const ${ib.prev} = __rt.pre(${ib.js});` : ""}`);
      }
    }
    // names first: hoisted functions and components; every other declaration is a const
    for (const d of decls) {
      if (d.k === "import" && d.resolved) continue;
      if (d.k === "import") for (const { name, alias } of this.withMethods(d)) { const x = d.declared ? this.mods?.set.declarations?.get(d.declared)?.find(y => y.name === name) : undefined; const dr = { ...(x?.kind === "fn" ? { ...(x.drafts ? { drafts: x.drafts } : {}), ...(x.partDrafts ? { partDrafts: x.partDrafts } : {}), ...(x.draftArgs ? { draftArgs: x.draftArgs } : {}) } : {}), ...(d.resolved ? {} : { jsFn: true }) };   /* MO-10i; jsFn: a JS module's name — a draft it is called with is lent, not given */ env.vars.set(alias, x?.kind === "fn" && instance(x, d.declared!, !!d.pure) ? { kind: "jfn", js: mg(alias), refs: x.refs ?? [], shape: x.shape ?? "value", ...dr } : x?.kind === "comp" ? { kind: "comp", js: cm(alias), shape: "comp" } : { kind: "val", js: mg(alias), client: d.side === "client" || d.declaredSide?.[name] === "client", ...dr }); }   // MO-10a; MO-11a: a JS component is a JSX tag
      if (d.k === "fn") env.vars.set(d.name, { kind: instantiates(d) ? "ifn" : "fn", js: mg(d.name), fn: d });
      if (d.k === "component") env.vars.set(d.name, { kind: "comp", js: cm(d.name), ...this.plain(d, this.file) });
      if (d.k === "action") env.vars.set(d.name, { kind: "act", js: mg(d.name) });
      if (d.k === "server") env.vars.set(d.name, { kind: "val", js: mg(d.name) });
      if (d.k === "error" || d.k === "context") env.vars.set(d.name, { kind: "val", js: mg(d.name) });
      if (d.k === "source") env.vars.set(d.name, { kind: "src", js: mg(d.name), w: `w$${d.name}`, prev: this.u.prevOf.has(d.name) ? `p$${d.name}` : undefined });
      if (d.k === "eq" && unwrapServer(d.e)) { env.vars.set(d.name, { kind: "val", js: mg(d.name) }); continue; }   // SF-1d: a server fn, not an accessor
      if (d.k === "eq") { const jf = d.e.k === "call" && d.e.f.k === "id" ? env.lookup(d.e.f.name) : undefined; if (jf?.kind === "jfn" && jf.shape === "comp") { env.vars.set(d.name, { kind: "comp", js: cm(d.name), inst: cm(d.name), shape: "comp" }); continue; } env.vars.set(d.name, { kind: "acc", js: mg(d.name), w: this.guessedEq(d) ? `w$${d.name}` : undefined, prev: this.u.prevOf.has(d.name) ? `p$${d.name}` : undefined, ...(jf?.kind === "jfn" ? { inst: `r$${d.name}`, shape: jf.shape } : {}), ...this.draftsOfBinding(d.e, env) }); }
    }
    bindGiven(decls.filter(d => d.k === "eq" && !this.guessedEq(d) && !unwrapServer(d.e)), n => env.lookup(n)?.given, (n, g) => { env.vars.get(n)!.given = g; });
    for (const d of decls) if (d.k === "import" && !d.resolved) for (const { name, alias } of d.names) {
      if (d.declared && this.mods?.set.declarations?.get(d.declared)?.some(y => y.kind === "type" && y.name === name)) continue;   // a type its declaration file declares binds nothing
      if (this.typeOnly.has(alias)) continue;
      const v = inPrelude(d, name, this.mods?.set.conformance) ? `__B.${name}` : !d.from.startsWith(".") ? (d.declaredErrors?.includes(name) ? `__rt.jsClass(w$${alias}, ${J(`${d.from}#${name}`)}${d.declaredErrorFields?.[name] ? `, ${J(d.declaredErrorFields[name])}` : ""})` : `w$${alias}`) /* SV-5a: a declared JS error class, by its declaration's identity */ : d.declaredErrors?.includes(name) ? `__rt.jsError(${J(name)})` : d.from.endsWith("/api") ? `__rt.api(${J(name)})` : isPrims(d.from) ? `__rt.prim(${J(name)})` : null;   // MO-10: the prelude's Solid primitives
      if (!v) throw new CompileError(`${name} from "${d.from}" is not in the scenario prelude`);
      const js = env.lookup(alias)?.kind === "comp" ? cm(alias) : mg(alias);
      out.push(`${pad}const ${js} = ${v};${this.reg(alias, `{ value: ${js} }`, pad)}`);
    }
    for (const d of decls) if (d.k === "error") {
      const inner = this.params(env, d.params); const make = `__rt.errorClass(${J(d.name)}, ${J(d.params)}, (${d.params.map(mg).join(", ")}) => ${d.msg ? this.expr(d.msg, inner, { imp: false }) : J(d.name)})`;
      if (env.parent) { out.push(`${pad}const ${mg(d.name)} = ${make};   // R-f-1`); continue; }
      // a module's error class is the module's, created once (by whichever app asks first): a server function's body,
      // hoisted to module level (SF-7a), throws the class an action's catch tests
      this.top.push(`let c$${d.name};\nfunction g$${d.name}(__rt) { const __B = __rt.B; return c$${d.name} ??= ${make}; }`);
      out.push(`${pad}const ${mg(d.name)} = g$${d.name}(__rt);   // R-f-1`);
    }
    for (const d of decls) if (d.k === "context") out.push(`${pad}const ${mg(d.name)} = __rt.context(${J(d.name)}, ${d.dflt ? `() => ${this.expr(d.dflt, env, { imp: false })}` : "null"});   // RG-7: the declaration is the context's identity${this.reg(d.name, `{ value: ${mg(d.name)} }`, pad)}`);
    for (const d of decls) if (d.k === "fn") out.push(this.fn(d, env, ind));
    for (const d of decls) if (d.k === "component") out.push(this.component(d, env, ind));
    for (const d of decls) if (d.k === "action") out.push(`${pad}const ${mg(d.name)} = __rt.action(function* (${d.params.map(mg).join(", ")}) {\n${this.stmts(d.body, this.params(env, d.params), { imp: true, gen: true }, ind + 1)}\n${pad}});${this.reg(d.name, `{ value: ${mg(d.name)} }`, pad)}`);
    for (const d of decls) if (d.k === "eq" && unwrapServer(d.e)) { const f = this.serverWrapped(d.name, d.e); out.push(`${pad}const ${mg(d.name)} = __rt.serverRef(${J(d.name)}, ${f});   // 12 SF-1d: a wrapped server fn, at module level`); }
    for (const d of decls) if (d.k === "server") { const f = this.serverHoist(d); out.push(`${pad}const ${mg(d.name)} = __rt.serverRef(${J(d.name)}, ${f});   // 12 SF-7a: the call site's (question or request); the function is module-level`); }
    // values in dependency order (E-7: equations are unordered in the source; C-1 makes this a DAG)
    const vals = decls.filter(d => d.k === "source" || (d.k === "eq" && !unwrapServer(d.e)) || d.k === "provide");
    const key = (d: Decl) => d.k === "provide" ? `provide:${d.name}` : (d as { name: string }).name;
    const local = new Set(vals.filter(d => d.k !== "provide").map(d => (d as { name: string }).name));
    const done = new Set<string>(); const order: Decl[] = []; const busy = new Set<string>();
    const visit = (d: Decl) => {
      const k = key(d); if (done.has(k) || busy.has(k)) return; busy.add(k);
      const self = d.k === "provide" ? "" : (d as { name: string }).name;
      for (const n of deps(d.k === "eq" ? d.e : d.k === "source" ? d.init : d.e, self)) if (local.has(n) && n !== self) { const t = vals.find(x => x.k !== "provide" && (x as { name: string }).name === n); if (t) visit(t); }
      busy.delete(k); done.add(k); order.push(d);
    };
    vals.forEach(visit);
    for (const d of order) out.push(this.value(d, env, ind));
    for (const d of decls) if (d.k === "effect") {
      const inner = new Env(env);
      out.push(...this.hoistAll(d.inputs, env, pad));
      out.push(`${pad}__rt.effect(${d.inputs.length}, () => [${d.inputs.map(i => this.expr(i, env, { imp: false })).join(", ")}], ($p) => __rt.untrack(() => {\n${this.stmts(d.body, inner, { imp: true, effect: true }, ind + 1, true)}\n${pad}}));   // SC-2: the apply reads σ, untracked`);
    }
    if (!exportsTail) out.push(...this.hoistAll(viewReaders(view, t => !!env.lookup(t)?.plain), env, pad));
    out.push(exportsTail ? `${pad}return ${exportsTail};` : `${pad}return ${this.markup(view, env, ind)};`);
    return out.join("\n");
  }
  private params(env: Env, ps: string[]) { const e = new Env(env); for (const p of ps) e.vars.set(p, { kind: "val", js: mg(p) }); return e; }

  private value(d: Decl, env: Env, ind: number): string {
    const pad = " ".repeat(ind * 2);
    if (d.k === "provide") {
      const b = d.e.k === "id" ? env.lookup(d.e.name) : undefined;
      const hoisted = b?.kind === "src" ? "" : this.hoistAll([d.e], env, pad).map(x => x + "\n").join("");
      const entry = b?.kind === "src" ? `{ get: ${b.js}, w: ${b.w} }` : given(d.e, n => env.lookup(n)?.given)?.held ? `{ get: ${this.held(d.e, env)} }` : `{ get: __rt.memo(null, () => ${this.expr(d.e, env, { imp: false })}) }`;
      return `${hoisted}${pad}__rt.provide(${this.ref(d.name, env, { imp: false })}, ${entry});`;
    }
    const b = env.vars.get((d as { name: string }).name)!;
    if (d.k === "eq" && d.e.k !== "draft") this.updaterClosure(d.name, d.line, d.e, env);
    const hoist = d.k === "source" && d.question ? this.hoist(d.name, d.init, env, pad) : d.k === "eq" && d.e.k !== "draft" ? [this.hoist(d.name, d.e, env, pad), this.hoistCatches(d.name, d.e, env, pad)].filter(Boolean).join("\n") : "";
    if (hoist) return hoist + "\n" + this.value1(d, env, ind, b);
    return this.value1(d, env, ind, b);
  }
  /** 07 §3 / R-1: each `await` that is not the equation's result is its own async memo, asked only while the conditions that
   *  reach it hold (E-11, ref/src/awaits.ts); the equation reads it where the `await` was. */
  private hoisted = new Map<Expr, string>(); private hoistSeq = 0;
  private hoist(name: string | null, e: Expr, env: Env, pad: string, tail = true): string {
    return nonTailAwaits(e, tail).map(h => {
      const v = `a$${name ?? ""}$${this.hoistSeq++}`;
      const guards = h.guards.map(g => { const x = this.expr(g.e, env, { imp: false }); return g.nullish ? `(${x}) == null` : g.neg ? `!(${x})` : `(${x})`; });
      const body0 = this.expr(h.node.e, env, { imp: false, tail: true }); const body = h.node.stream ? body0 : `__rt.awaited(${body0})`;
      this.hoisted.set(h.node, v);
      if (name) this.claims = true;
      const lv = h.node.init ? `__rt.firstPaint(() => ${this.expr(h.node.init, env, { imp: false })})` : "undefined";
      return `${pad}const ${v} = __rt.memo(${J(name)}, () => ${guards.length ? `(${guards.join(" && ")}) ? ${body} : undefined` : body}, ${this.clientCall(h.node.e, env) ? `__rt.clientQuestion(${lv})` : lv});${name ? `\n${pad}__rt.hoisted(${J(name)}, ${v});` : ""}`;
    }).join("\n");
  }
  /** R-f-4: each catch inside an equation gets one boundary, made once beside it (awaits.ts `innerCatches`). */
  private hoistedCatch = new Map<Expr, string>();
  private hoistCatches(name: string, e: Expr, env: Env, pad: string): string {
    return innerCatches(e).map(h => {
      const v = `c$${name}$${this.hoistSeq++}`;
      const guards = h.guards.map(g => { const x = this.expr(g.e, env, { imp: false }); return g.nullish ? `(${x}) == null` : g.neg ? `!(${x})` : `(${x})`; });
      const c = h.node; const inner = new Env(env); if (c.name) inner.vars.set(c.name, { kind: "val", js: mg(c.name) });
      const body = this.expr(c.e, env, { imp: false });
      const out = `${pad}const ${v} = __rt.catchMemo(() => ${guards.length ? `(${guards.join(" && ")}) ? ${body} : undefined` : body}, (__e) => __rt.isA(__e, ${this.classes(c.classes, env)}), (${c.name ? mg(c.name) : "__e"}) => ${this.expr(c.alt, inner, { imp: false })});`;
      this.hoistedCatch.set(c, v);
      return out;
    }).join("\n");
  }
  /** The scenario harness's table of names (CP-4c): a conformance build's, and an app's where an equation's accessor claims
   *  its hoisted awaits. An app has no such table, and one would keep every instance. */
  private claims = false;
  private reg(name: string, entry: string, pad: string): string { const c = this.claims; this.claims = false; return this.mods?.set.conformance || c ? `\n${pad}__rt.reg(${J(name)}, ${entry});` : ""; }
  private hoistAll(es: Expr[], env: Env, pad: string): string[] { return es.map(x => this.hoist(null, x, env, pad, false)).filter(Boolean); }
  /** An equation a guess sits over (AC-3): not deferred, not a draft, not a wrapped server fn. */
  private guessedEq(d: Extract<Decl, { k: "eq" }>): boolean { return this.u.optimistic.has(d.name) && !d.deferred && d.e.k !== "draft" && !unwrapServer(d.e); }
  private value1(d: Decl, env: Env, ind: number, b: Bind): string {
    const pad = " ".repeat(ind * 2);
    const prev = b.prev ? `\n${pad}const ${b.prev} = __rt.pre(${b.js});` : "";
    if (d.k === "source") {
      if (!d.question) return `${pad}const [${b.js}, ${b.w}] = __rt.source(${J(d.name)}, __rt.untrack(() => ${this.expr(d.init, env, { imp: false })})${this.u.optimistic.has(d.name) ? ", true" : d.key !== undefined ? ", false" : ""}${d.key !== undefined ? `, ${J(d.key)}` : ""});${this.reg(d.name, `{ get: ${b.js}, w: ${b.w} }`, pad)}${prev}`;
      const lv = this.loadingValue(d.init, env);
      const mode = `{ optimistic: ${this.u.optimistic.has(d.name)}, structured: ${this.u.paths.has(d.name)}, record: ${d.init.k === "rec"}, plain: ${this.u.plain.has(d.name)} }`;
      return `${pad}const [${b.js}, ${b.w}] = __rt.question(${J(d.name)}, (__prev) => ${this.expr(d.init, env, { imp: false, tail: true, self: d.name })}, ${lv}, ${mode}${d.key ? `, ${J(d.key)}` : ""});${this.reg(d.name, `{ get: ${b.js}, w: ${b.w} }`, pad)}${prev}`;
    }
    if (d.k !== "eq") throw new CompileError("unreachable");
    for (const x of keptParts(d.e, d.name)) this.kept.add(x);
    if (this.guessedEq(d)) {                                                                   // AC-3 over an equation: createOptimistic(fn) / createOptimisticStore(fn, seed) — derived, its setter only guesses
      const lv = this.loadingValue(d.e, env);
      const mode = `{ optimistic: true, structured: ${this.u.paths.has(d.name) || !!d.key}, derived: true, record: ${d.e.k === "rec"} }`;
      return `${pad}const [${b.js}, ${b.w}] = __rt.question(${J(d.name)}, (__prev) => ${this.expr(d.e, env, { imp: false, tail: true, self: d.name })}, ${lv}, ${mode}${d.key ? `, ${J(d.key)}` : ""});${this.reg(d.name, `{ get: ${b.js}, w: ${b.w} }`, pad)}${prev}`;
    }
    const reg = `${this.reg(d.name, `{ get: ${b.js} }`, pad)}${prev}`;
    if (b.given?.held) return `${pad}const ${b.js} = ${this.held(d.e, env)};${reg}`;
    if (d.e.k === "draft") {                                                                   // ST-3
      const seed = d.e.seed; if (seed.k !== "pre" || seed.name !== d.name || !seed.init) throw new CompileError("a draft's seed must be `pre self -> seed`");
      const inner = new Env(env); inner.vars.set("d", { kind: "val", js: "v$d" });
      return `${pad}const ${b.js} = __rt.draft(__rt.untrack(() => ${this.expr(seed.init, env, { imp: false })}), (v$d) => {\n${this.draftBody(d.e.body, inner, ind + 1)}\n${pad}});${reg}`;
    }
    if (d.e.k === "call" && d.e.f.k === "id" && env.lookup(d.e.f.name)?.kind === "ifn") return `${pad}const ${b.js} = ${this.instantiate(d.e, env)};${reg}`;   // RG-6
    const fx = this.foreign(d, env, b, pad); if (fx !== null) return b.kind === "comp" ? `${fx}${this.reg(d.name, `{ value: ${b.js} }`, pad)}` : `${fx}${reg}`;
    if (d.key) return `${pad}const ${b.js} = __rt.keyed(${J(d.name)}, ${J(d.key)}, () => ${this.expr(d.e, env, { imp: false, tail: true })}, ${d.e.k === "rec"});${reg}`;
    if (d.e.k === "catch" && !d.deferred) {                                                    // R-f-4 over a tail await: the flight is an inner memo, read through a boundary
      const c = d.e; const inner = new Env(env); if (c.name) inner.vars.set(c.name, { kind: "val", js: mg(c.name) });
      const x = this.expr(c.e, env, { imp: false, tail: true, self: d.name }); const m = `(__e) => __rt.isA(__e, ${this.classes(c.classes, env)})`, a = `(${c.name ? mg(c.name) : "__e"}) => ${this.expr(c.alt, inner, { imp: false })}`;
      const body = c.e.k === "await" ? `__rt.settle(${x}, ${m}, ${a})` : x;                       // a matching rejection is an answer (R-f-4): caught where it is awaited, not by the boundary
      return `${pad}const i$${d.name} = __rt.memo(${J(d.name)}, (__prev) => ${body}, ${this.loadingValue(c.e, env)});\n${pad}const ${b.js} = __rt.catchMemo(() => i$${d.name}(), (__e) => __rt.isA(__e, ${this.classes(c.classes, env)}), (${c.name ? mg(c.name) : "__e"}) => ${this.expr(c.alt, inner, { imp: false })});${reg}`;
    }
    const fn = d.deferred ? "deferred" : "memo";
    return `${pad}const ${b.js} = __rt.${fn}(${J(d.name)}, (__prev) => ${this.expr(d.e, env, { imp: false, tail: true, self: d.name })}, ${this.loadingValue(d.e, env)});${reg}`;
  }
  /** RG-4c: a view the component was given, as it is read: no computation of its own, so it is made where it is read. */
  private held(e: Expr, env: Env): string {
    const x = (y: Expr) => this.expr(y, env, { imp: false });
    return `() => ${e.k === "if" && defaulted(e, n => env.lookup(n)?.given) ? `__rt.preOr(${x(e.f)}, () => ${x(e.t)})` : x(e)}`;
  }
  /** SV-7b: a call into `client` JS — awaited, a client question: Solid's `ssrSource: "client"`, never asked on the server. */
  private clientCall(e: Expr, env: Env): boolean { const f = e.k === "catch" ? e.e : e; return f.k === "call" && f.f.k === "id" && !!env.lookup(f.f.name)?.client; }
  private tailClient(e: Expr, env: Env): boolean {
    let hit = false;
    const walk = (x: unknown): void => { if (hit || !x || typeof x !== "object") return; if (Array.isArray(x)) { x.forEach(walk); return; } const o = x as Record<string, any>; if (o.k === "fn") return; if (o.k === "await" && !this.hoisted.has(o as Expr) && this.clientCall(o.e, env)) { hit = true; return; } Object.values(o).forEach(walk); };
    walk(e); return hit;
  }
  private loadingValue(e: Expr, env: Env): string {                                            // R-7: the first paint of an `await … -> v`; SV-7b: a client question's ssrSource
    const lv = this.loadingValue0(e, env); return this.tailClient(e, env) ? `__rt.clientQuestion(${lv})` : lv;
  }
  private loadingValue0(e: Expr, env: Env): string {
    let init: Expr | undefined;
    const walk = (x: unknown): void => { if (init || !x || typeof x !== "object") return; if (Array.isArray(x)) { x.forEach(walk); return; } const o = x as Record<string, any>; if (o.k === "fn") return; if (o.k === "await" && o.init) { init = o.init; return; } Object.values(o).forEach(walk); };
    walk(e);
    return init ? `__rt.firstPaint(() => ${this.expr(init, env, { imp: false })})` : "undefined";
  }
  private draftBody(ss: Stmt[], env: Env, ind: number): string {
    const pad = " ".repeat(ind * 2);
    return ss.map(s => {
      if (s.k === "let") { env.vars.set(s.name, { kind: "val", js: mg(s.name) }); return `${pad}const ${mg(s.name)} = ${this.expr(s.e, env, { imp: false })};`; }
      if (s.k === "expr") return `${pad}${this.expr(s.e, env, { imp: false })};`;
      if (s.k === "write") { const path = s.target.path.map(p => typeof p === "string" ? J(p) : this.expr(p, env, { imp: false })); const last = path.pop()!; return `${pad}{ let __t = v$d; ${path.map(k => `__t = (__t[${k}] ??= {});`).join(" ")} __t[${last}] = ${this.expr(s.e, env, { imp: false })}; }`; }
      throw new CompileError(`${s.k} in a draft block`);
    }).join("\n");
  }
  private fn(d: FnDecl, env: Env, ind: number): string {
    const pad = " ".repeat(ind * 2);
    const inner = new Env(env);
    for (const p of d.params) inner.vars.set(p.name, { kind: p.ref ? "acc" : "val", js: mg(p.name), ...(p.ref && this.u.prevOf.has(p.name) ? { prev: `p$${p.name}` } : {}) });
    if (!instantiates(d)) return `${pad}function ${mg(d.name)}(${d.params.map(p => mg(p.name)).join(", ")}) { return ${this.expr(d.tail, inner, { imp: false })}; }`;
    // an instantiating fn (RG-6): called once, returns the accessor of its tail
    // an `await` in the result: the result is an equation (RG-6a), and its flights are that equation's (07 §3)
    if (nonTailAwaits(d.tail, false).length) { const result = { k: "eq", name: "result$", e: d.tail, line: d.line } as Decl; return this.fn({ ...d, decls: [...d.decls, result], tail: { k: "id", name: "result$" } }, env, ind); }
    const body = this.block(d.decls, [], inner, ind + 1).split("\n").filter(l => !/^\s*return null;$/.test(l)).join("\n");
    const prevs = d.params.filter(p => p.ref && this.u.prevOf.has(p.name)).map(p => `${pad}  const p$${p.name} = __rt.pre(${mg(p.name)});\n`).join("");
    const tb = d.tail.k === "id" ? inner.lookup(d.tail.name) : undefined;
    const tail = tb && (tb.kind === "acc" || tb.kind === "src") ? tb.js : `__rt.memo(null, () => ${this.expr(d.tail, inner, { imp: false })})`;
    const own = d.decls.some(x => x.k === "provide");   // RG-6a: what it provides is for what its call instantiates, not for the caller's region: an owner of the call's own
    return `${pad}function ${mg(d.name)}(${d.params.map(p => mg(p.name)).join(", ")}) {${own ? " return __rt.inst(() => {" : ""}\n${prevs}${body}\n${pad}  return ${tail};\n${pad}${own ? "}); }" : "}"}`;
  }
  /** MO-10: `x = f(…)` over a declared primitive — called once (RG-6), a ref argument as an accessor, a value one untracked;
   *  and `y = x[i]` / `x.k` over its result. A `ref` part is bound to the accessor itself, any other part to its value. */
  private foreign(d: Extract<Decl, { k: "eq" }>, env: Env, b: Bind, pad: string): string | null {
    const e = d.e;
    const part = (r: string, p: Shape) => p === "ref" ? r : `() => ${r}`;
    if (e.k === "call" && e.f.k === "id") {
      const f = env.lookup(e.f.name); if (f?.kind !== "jfn") return null;
      const args = e.args.map((a, i) => {
        if (!f.refs![i]) return `__rt.untrack(() => ${this.expr(a, env, { imp: false })})`;
        if (a.k === "id") { const ab = env.lookup(a.name); if (ab && (ab.kind === "acc" || ab.kind === "src")) return ab.js; }
        // RG-6b, MO-10a (2026-11-23): what is written out as a constant has nothing to follow, and is the plain accessor
        // `() => "a.mp3"`. A node for it took an owner's id for no reader, and a library that reads the parameter once
        // while it is made (`access(src)`) read a reactive value where nothing tracks: Solid's STRICT_READ_UNTRACKED
        if (constant(a)) return `() => ${this.expr(a, env, { imp: false })}`;
        return `__rt.memo(null, () => ${this.expr(a, env, { imp: false })})`;
      });
      const r = b.inst!; const sh = f.shape!;
      if (sh === "comp") return `${pad}const ${b.js} = ${f.js}(${args.join(", ")});`;                 // MO-11f: the component the factory hands back
      // R-f-5, MO-10f (revised 2026-11-21 after review): the result as a value whose parts are read where they are read
      // …and a result none of whose parts is an accessor is the library's own object, read as it is (2026-11-22): a field
      // read is that field's read on it, its methods are called on it, and a field its declaration leaves out is still there
      const noRef = typeof sh !== "string" && !("items" in sh ? sh.items : sh.fields.map(f => f[1])).includes("ref");
      const whole = typeof sh === "string" ? part(r, sh) : noRef ? part(r, "value") : "items" in sh ? `__rt.lazy(${r}, [${sh.items.map((_, i) => i).join(", ")}], [${sh.items.flatMap((p, i) => p === "ref" ? [i] : []).join(", ")}])` : `__rt.lazy(${r}, [${sh.fields.map(([k]) => J(k)).join(", ")}], [${sh.fields.flatMap(([k, p]) => p === "ref" ? [J(k)] : []).join(", ")}])`;
      // MO-10a: called in an owner of its own (`__rt.inst`), its arguments' nodes with it
      return `${pad}const ${r} = __rt.inst(() => ${f.js}(${args.join(", ")}));\n${pad}const ${b.js} = ${whole};`;
    }
    if ((e.k === "index" && e.i.k === "lit") || e.k === "member") {
      const ob = e.o.k === "id" ? env.lookup(e.o.name) : undefined; const sh = ob?.shape; if (!ob?.inst || !sh || typeof sh !== "object") return null;
      const key = e.k === "index" ? (e.i as { v: any }).v : e.p;
      const p = "items" in sh ? sh.items[key] : sh.fields.find(f => f[0] === key)?.[1]; if (!p) return null;
      return `${pad}const ${b.js} = ${part(`${ob.inst}[${J(key)}]`, p)};`;
    }
    return null;
  }
  private instantiate(call: Extract<Expr, { k: "call" }>, env: Env): string {
    const b = env.lookup((call.f as { name: string }).name)!; const f = b.fn!;
    const args = f.params.map((p, i) => {
      const a = call.args[i]; if (!a) return "undefined";
      if (p.ref) { if (a.k === "id") { const b = env.lookup(a.name); if (b && (b.kind === "acc" || b.kind === "src")) return b.js; } return `__rt.memo(null, () => ${this.expr(a, env, { imp: false })})`; }
      return `__rt.untrack(() => ${this.expr(a, env, { imp: false })})`;
    });
    return `${b.js}(${args.join(", ")})`;
  }
  private shown = new Set<string>();   // RG-4c: `props.f`, in a component that shows that view
  private component(d: Extract<Decl, { k: "component" }>, env: Env, ind: number): string {
    const pad = " ".repeat(ind * 2);
    const shows = new Map([...shown(d, typesOf(this.mods?.set, this.file))].map(([f, v]) => [f, v.mixed] as const));
    const inner = new Env(env); inner.vars.set(d.props, { kind: "val", js: mg(d.props), shows, given: { props: { less: [], views: viewFields(d.propsType, this.modDecls) } } });
    const was = this.shown; this.shown = new Set([...shows.keys()].map(f => `${d.props}.${f}`));
    try { return `${pad}function ${cm(d.name)}(${mg(d.props)}) {\n${this.owned(d.decls, d.view, inner, ind + 1, true)}\n${pad}}`; } finally { this.shown = was; }
  }

  // ---- expressions ----
  /** MO-10i: expressions written where a read of a draft needs no copy: handed straight back to the library (a value
   *  written to a draft's path, the callback's result, an argument of a draft's own method), or consumed by an operator
   *  that makes a primitive of them. */
  private raw = new Set<Expr>();
  private kept = new Set<Expr>();   // C-2: a whole store read there is copied
  /** MO-10i: the arguments of a JS fn's call, with the fn's name: a draft read there is lent (`__rt.lend`). */
  private lent = new Map<Expr, string>();
  /** MO-10i: closures written where a JS fn hands their parameters a draft, with those positions. */
  private draftClosures = new Map<Expr, number[]>();
  /** MO-10i (2026-11-22): where a name is written as a call's whole argument, in the module being emitted: name → (callee's
   *  name, argument index) — how a closure bound to a name is known to be a draft's callback. */
  private argCalls = new Map<string, [string, number][]>();
  /** MO-10i (2026-11-22): a closure bound to `name` that the module gives, by that name, to a call that hands the position
   *  a draft (`setTodos(up)`) is that callback: its parameters there are the draft's (the checker holds the name to that
   *  use alone, `Checker.updaterPositions`). */
  private updaterClosure(name: string, line: number, e: Expr, env: Env) {
    if (e.k !== "fn" || !e.params.length) return;
    let found: number[] | undefined;
    for (const [callee, i] of this.argCalls.get(`${name}@${line}`) ?? []) {
      const ps = env.lookup(callee)?.drafts?.find(([j]) => j === i)?.[1]; if (!ps) continue;
      if (!found) found = ps; else if (JSON.stringify(found) !== JSON.stringify(ps)) return;
    }
    if (found) this.draftClosures.set(e, found);
  }
  /** MO-10i: what an equation's binding keeps of a result's draft parts: a call's result's, an alias's, or the callbacks
   *  of a function part bound to a name. */
  private draftsOfBinding(e: Expr, env: Env): Pick<Bind, "drafts" | "partDrafts"> {
    if (e.k === "call" && e.f.k === "id") { const pd = env.lookup(e.f.name)?.partDrafts; return pd ? { partDrafts: pd } : {}; }
    if (e.k === "id") { const pd = env.lookup(e.name)?.partDrafts; return pd ? { partDrafts: pd } : {}; }
    if (e.k === "member" || e.k === "index") { const d = this.partDraftsOf(e, env); return d ? { drafts: d } : {}; }
    return {};
  }
  /** MO-10i: the draft a read goes through: the draft's name, a path below it, or what a method called on one gives. */
  private draftChain(e: Expr, env: Env): boolean {
    if (e.k === "id") return !!env.lookup(e.name)?.draft;
    if (e.k === "member" || e.k === "index") return this.draftChain(e.o, env);
    if (e.k === "call") return (e.f.k === "member" || e.f.k === "index") && this.draftChain(e.f.o, env);
    return false;
  }
  /** MO-10i: a place of a draft: its name, or a path below it (no call). */
  private draftPlace(e: Expr, env: Env): boolean {
    if (e.k === "id") return !!env.lookup(e.name)?.draft;
    return (e.k === "member" || e.k === "index") && this.draftPlace(e.o, env);
  }
  /** MO-10i: the draft callbacks of a function part read off a result, `st[1]` or `st.set`. */
  private partDraftsOf(f: Expr, env: Env): [number, number[]][] | undefined {
    if (f.k !== "member" && f.k !== "index") return undefined;
    const key = f.k === "member" ? f.p : litKey(f.i);
    if (f.o.k !== "id" || key === undefined) return undefined;
    const pd = env.lookup(f.o.name)?.partDrafts;
    return pd && Object.prototype.hasOwnProperty.call(pd, key) ? pd[key] : undefined;
  }
  /** An expression's value. MO-10i (ruled 2026-11-22): a library's draft is a place, not a value, so a read of one — its
   *  name, a path below it, what a method called on it gives — is a copy (`__rt.copy`), wherever its value could be kept:
   *  what `.rx` holds of a draft is never the library's own object. Not where it is handed straight back to the library,
   *  or consumed by an operator that makes a primitive of it (`raw`). */
  expr(e: Expr, env: Env, ctx: Ctx): string {
    const x0 = this.expr0(e, env, ctx), x = this.kept.has(e) ? `__rt.kept(${x0})` : x0;
    if (this.raw.has(e) || !this.draftChain(e, env)) return x;
    // a JS fn called with a read of a draft is lent a copy (in a development build one that refuses to be changed: a
    // change to it would be lost, MO-10i); its `draft` parameters are given the draft itself (`raw`)
    const to = this.lent.get(e);
    return to !== undefined ? `__rt.lend(${x}, ${JSON.stringify(to)})` : `__rt.copy(${x})`;
  }
  private expr0(e: Expr, env: Env, ctx: Ctx): string {
    const sub: Ctx = { ...ctx, tail: false };
    const go = (x: Expr) => this.expr(x, env, sub);
    const rawGo = (x: Expr) => { this.raw.add(x); return go(x); };
    switch (e.k) {
      case "lit": return J(e.v);
      case "id": return this.ref(e.name, env, ctx);
      case "pre": {
        const init = e.init ? this.expr(e.init, env, sub) : "undefined";
        if (ctx.self === e.name) return `__rt.preOr(__prev, () => ${init})`;            // the equation's own: the memo's previous value
        const b = env.lookup(e.name); if (!b?.prev) throw new CompileError(`pre ${e.name}: no companion memo`);
        return `__rt.preOr(${b.prev}(), () => ${init})`;
      }
      case "peek": return `__rt.untrack(() => ${go(e.e)})`;
      case "await": {
        if (this.hoisted.has(e)) return `${this.hoisted.get(e)}()`;
        if (ctx.imp) return ctx.gen ? `(yield __rt.awaited(${go(e.e)}))` : ctx.async ? `(await __rt.awaited(${go(e.e)}))` : go(e.e);
        if (!ctx.tail) throw new CompileError("`await` outside an equation's result position is not lowered yet");
        return e.stream ? go(e.e) : `__rt.awaited(${go(e.e)})`;                                      // the memo returns the flight (R-1): a stream for `await*`, else its one answer
      }
      case "latest": return `__rt.latest(() => ${this.expr(e.e, env, { ...ctx, imp: false })})`;   // R-12: Solid's latest — of a value that never had one it throws, in a handler too (S-solid-28)
      case "pending": return `__rt.isPending(() => ${go(e.e)})`;
      case "if": return `(${rawGo(e.c)} ? ${this.expr(e.t, env, ctx)} : ${this.expr(e.f, env, ctx)})`;
      case "throw": return `__rt.throw(${go(e.e)})`;                                          // R-f-3
      case "catch": {                                                                           // R-f-4: over a sync value, or the tail await's promise/stream
        if (!ctx.imp && this.hoistedCatch.has(e)) return `${this.hoistedCatch.get(e)}()`;
        if (ctx.imp && this.hasAwait(e.e)) throw new CompileError("`await … catch` inside an expression of imperative scope (AWAIT_IN_EXPRESSION, AC-1)");
        const inner = new Env(env); if (e.name) inner.vars.set(e.name, { kind: "val", js: mg(e.name) });
        return `__rt.${ctx.imp ? "tryCatch" : "catchRead"}(() => ${this.expr(e.e, env, sub)}, (__e) => __rt.isA(__e, ${this.classes(e.classes, env)}), (${e.name ? mg(e.name) : "__e"}) => ${this.expr(e.alt, inner, sub)})`;
      }
      case "tpl": return `(${e.parts.map(p => typeof p === "string" ? J(p) : `__rt.fmt(${rawGo(p)})`).join(" + ") || '""'})`;
      case "member": return `${rawGo(e.o)}?.${e.p}`;
      case "index": return `${rawGo(e.o)}?.[${rawGo(e.i)}]`;                                 // a key is a primitive
      case "stylemap": return this.classMap(e.css, e.line);                                  // 07 CSS-5
      case "call": {
        if (e.f.k === "id" && language(e.f.name, env.lookup(e.f.name)) === "until" && e.args[0]?.k === "fn") { const p = e.args[0]; return `__rt.until(() => ${this.expr(p.body, env, { imp: false, dyn: ctx.dyn })})`; }   // AC-6: Solid's until; the predicate is reactive scope
        if (e.f.k === "id" && !ctx.dyn && ["onSettled", "onFlush"].includes(language(e.f.name, env.lookup(e.f.name))!)) return `__rt.${e.f.name}(${e.args.map(go).join(", ")})`;   // EF-7, EF-8: Solid's own
        // MO-10i: the closures this call hands a library's draft
        for (const [i, ps] of e.f.k === "id" ? env.lookup(e.f.name)?.drafts ?? [] : this.partDraftsOf(e.f, env) ?? []) { const a = e.args[i]; if (a?.k === "fn") this.draftClosures.set(a, ps); }
        // a method of a draft is the library's own: what it is given goes straight back to it; a builtin that answers a
        // primitive keeps nothing
        if (((e.f.k === "member" || e.f.k === "index") && this.draftChain(e.f.o, env)) || (e.f.k === "id" && scalar(e.f.name, env.lookup(e.f.name)))) for (const a of e.args) this.raw.add(a);
        // a closure written for one of a draft's own methods (`d.items.forEach((row) => { … })`) is called by it with
        // places of the draft: its parameters are read as copies, as the draft is (closed 2026-11-22)
        if ((e.f.k === "member" || e.f.k === "index") && this.draftChain(e.f.o, env)) for (const a of e.args) if (a.k === "fn" && !this.draftClosures.has(a)) this.draftClosures.set(a, a.params.map((_, i) => i));
        // MO-10i (2026-11-22): a JS fn's `draft` parameter is given the draft itself; its other arguments are lent
        if (e.f.k === "id") { const f = env.lookup(e.f.name); if (f?.jsFn) e.args.forEach((a, i) => { if (f.draftArgs?.includes(i)) this.raw.add(a); else this.lent.set(a, (e.f as { name: string }).name); }); }
        this.raw.add(e.f);
        if (e.f.k === "member") return `${rawGo(e.f.o)}?.${e.f.p}(${e.args.map(go).join(", ")})`;
        return `${go(e.f)}(${e.args.map(go).join(", ")})`;
      }
      case "arr": return `[${e.items.map(i => i.k === "spread" ? `...${go(i.e)}` : go(i)).join(", ")}]`;
      case "rec": return `({ ${e.fields.map(f => "spread" in f ? `...${go(f.spread)}` : `${J(f.key)}: ${go(f.v)}`).join(", ")} })`;
      case "fn": {
        const inner = this.params(env, e.params); let ps = e.params.map(mg).join(", ");
        // H-10: what a `ref` closure reads is a snapshot, a prop as a source is — it is called while the view is made, where Solid's development build reports a read nothing tracks
        const once = ctx.ref ? `(${ps}) => __rt.untrack(` : ""; if (once) ps = ""; const end = once && ")";
        { const ds = this.draftClosures.get(e); if (ds) { for (const j of ds) { const p = e.params[j]; if (p !== undefined) inner.vars.set(p, { kind: "val", js: mg(p), draft: true }); } this.raw.add(e.body); } }   // MO-10i: the parameters a library hands its draft; what the callback gives back is the library's
        if (e.stmts && inferredAction(e.stmts)) return `${once}(${ps}) => __rt.action(function* () {\n${this.stmts(e.stmts, inner, { imp: true, gen: true, dyn: ctx.dyn, effect: ctx.effect }, 1)}\n})()${end}`;   // AC-1b: an inferred action lowers as `action { … }` does, to Solid's action()
        if (e.stmts) { const async = this.hasAwait(e.stmts); return `${once}${async ? "async " : ""}(${ps}) => {\n${this.stmts(e.stmts, inner, { imp: true, async, dyn: ctx.dyn, effect: ctx.effect }, 0)}\n}${end}`; }
        return `${once}(${ps}) => ${this.expr(e.body, inner, { imp: ctx.imp, dyn: ctx.dyn, effect: ctx.effect })}${end}`;
      }
      case "use": return `__rt.useGet(${this.ref(e.name, env, { imp: false, dyn: ctx.dyn })}, __o)`;
      case "bin": {
        if (e.op !== "??" && e.op !== "||" && e.op !== "&&") { this.raw.add(e.l); this.raw.add(e.r); }   // MO-10i: an operator that makes a primitive keeps nothing of what it reads
        if (e.op === "==") return `__rt.eq(${go(e.l)}, ${go(e.r)})`;
        if (e.op === "!=") return `!__rt.eq(${go(e.l)}, ${go(e.r)})`;
        return `(${go(e.l)} ${e.op} ${go(e.r)})`;
      }
      case "un": return `(${e.op}${rawGo(e.e)})`;
      case "draft": throw new CompileError("a draft is an equation's whole expression");
      case "spread": throw new CompileError("spread outside an array literal");
      case "omit": return `__rt.omit(${[go(e.e), ...e.keys.map(k => J(k))].join(", ")})`;   // RG-4b: Solid's live view
    }
  }
  private ref(name: string, env: Env, ctx: Ctx): string {
    if (ctx.effect && /^\$\d+$/.test(name)) return `$p[${name.slice(1)}]`;
    const b = env.lookup(name);
    if (!b) {
      const l = language(name, false, this.mods?.set.conformance); const own = l === "fn" || (l === "log" && (ctx.imp || ctx.dyn)) ? `__B.${name}` : ctx.dyn && (l === "onSettled" || l === "onFlush") ? `__rt.${name}` : null;
      if (ctx.dyn) return `__rt.dget(${J(name)}${own ? `, ${!ctx.imp}, ${own}` : ctx.imp ? "" : ", true"})`;   // a scenario's row names what the program binds, else the language's function
      if (own) return own;
      throw new CompileError(`unbound ${name}`);
    }
    if (b.kind === "acc" || b.kind === "src") return ctx.imp ? `__rt.snapshot(${b.js})` : `${b.js}()`;
    return b.js;                                                                                // a component value is the compiled component (MO-11c)
  }
  /** R-f-4: error class names → a JS array of their values; `undefined`: every failure. */
  private classes(names: string[] | undefined, env: Env): string { return names ? `[${names.map(n => n === "Error" ? "Error" : n === "Panic" ? "__rt.PANIC" : this.ref(n, env, { imp: false })).join(", ")}]` : "undefined"; }
  private hasAwait(ss: unknown): boolean { const s = JSON.stringify(ss); return s.includes('"k":"await"'); }

  // ---- imperative scope ----
  stmts(ss: Stmt[], env0: Env, ctx: Ctx, ind: number, returnLast = false): string {
    const env = new Env(env0); const pad = " ".repeat(ind * 2);
    const out: string[] = [];
    ss.forEach((s, i) => {
      const e = (x: Expr) => this.expr(x, env, { ...ctx, tail: false });
      const c = (s.k === "let" || s.k === "expr") && s.e.k === "catch" && s.e.e.k === "await" ? s.e : null;
      if (c && (s.k === "let" || s.k === "expr")) {                                             // AC-1 / R-f-4: a statement-level `await … catch` is a try around the await
        const v = s.k === "let" ? mg(s.name) : null; const set = (x: string) => `${pad}  ${v ? `${v} = ` : ""}${x};`;
        const h = new Env(env); if (c.name) h.vars.set(c.name, { kind: "val", js: mg(c.name) });
        const ev = c.name ? mg(c.name) : "__e";
        out.push(`${v ? `${pad}let ${v};\n` : ""}${pad}try {\n${set(e(c.e))}\n${pad}} catch (${ev}) {\n${pad}  if (!__rt.isA(${ev}, ${this.classes(c.classes, env)})) throw ${ev};\n${set(this.expr(c.alt, h, { ...ctx, tail: false }))}\n${pad}}`);
        if (v) env.vars.set(s.name, { kind: "val", js: v });
        return;
      }
      switch (s.k) {
        case "let": this.updaterClosure(s.name, s.line ?? -1, s.e, env); out.push(`${pad}let ${mg(s.name)} = ${e(s.e)};`); env.vars.set(s.name, { kind: "val", js: mg(s.name) }); break;
        case "expr": this.raw.add(s.e); out.push(`${pad}${returnLast && i === ss.length - 1 ? "return " : ""}${e(s.e)};`); break;   // MO-10i: its value is dropped, or is the callback's result
        case "return": if (s.e) this.raw.add(s.e); out.push(`${pad}return${s.e ? " " + e(s.e) : ""};`); break;   // MO-10i: a draft is named only in its own callback, whose result is the library's
        case "throw": out.push(`${pad}throw ${e(s.e)};`); break;
        case "write": case "optimistic": {
          for (const p of s.target.path) if (typeof p !== "string") this.raw.add(p);          // a key is a primitive
          const keys = `[${s.target.path.map(p => typeof p === "string" ? J(p) : e(p)).join(", ")}]`;
          if (s.k === "write" && s.target.path.length && !s.target.ctx && env.lookup(s.target.name)?.draft) this.raw.add(s.e);   // MO-10i: a value written to a path of a draft goes straight back to the library
          const v = e(s.e);
          if (ctx.dyn && !s.target.ctx && !env.lookup(s.target.name)) { out.push(`${pad}__rt.dset(${J(s.target.name)}, ${keys}, ${v}, ${s.k === "optimistic"});`); break; }
          { const b = s.target.ctx || s.k !== "write" || !s.target.path.length ? undefined : env.lookup(s.target.name);   // MO-10i: a library's draft, written along its path
            if (b && b.kind === "val" && !b.w) {
              const segs = s.target.path.map(p => `[${typeof p === "string" ? J(p) : e(p)}]`);
              // W-6: \`d.n := v => v + 1\` applies it, the place evaluated once (the object up to the last key, then the key)
              if (s.e.k === "fn" && !s.e.stmts && s.e.params.length === 1) { const last = s.target.path[s.target.path.length - 1]; out.push(`${pad}{\n${pad}  const __o$d = ${b.js}${segs.slice(0, -1).join("")};\n${pad}  const __k$d = ${typeof last === "string" ? J(last) : e(last)};\n${pad}  __o$d[__k$d] = (${v})(__o$d[__k$d]);\n${pad}}`); break; }
              out.push(`${pad}${b.js}${segs.join("")} = ${v};`); break; } }
          let w: string;
          if (s.target.ctx) w = `__rt.use(${this.ref(s.target.name, env, { imp: false, dyn: ctx.dyn })}, __o).w`;
          else { const b = env.lookup(s.target.name); if (!b?.w) throw new CompileError(`W-1: ${s.target.name} is not a source`); w = b.w; }
          out.push(`${pad}${s.k === "optimistic" ? `${w}.guess(${v}${s.target.path.length ? `, ${keys}` : ""})` : s.target.path.length ? `${w}.path(${keys}, ${v})` : `${w}.set(${v})`};`);
          break;
        }
        case "refresh": { const b = env.lookup(s.name); out.push(`${pad}__rt.refresh(${J(s.name)}, ${b ? b.js : `__rt.lookup(${J(s.name)}).get`});`); break; }
        case "affects": { const b = env.lookup(s.name); out.push(`${pad}__rt.affects(${b ? b.js : `__rt.lookup(${J(s.name)}).get`});`); break; }
        case "action": out.push(`${pad}__rt.action(function* () {\n${this.stmts(s.body, env, { imp: true, gen: true, dyn: ctx.dyn }, ind + 1)}\n${pad}})();`); break;
        case "for": {                                                                        // 07 §5: a loop of imperative scope; its variable is a constant of each turn
          const place = this.draftPlace(s.e, env); if (place) this.raw.add(s.e);              // MO-10i: a turn of a loop over a path of a draft is a place of that draft
          const x = e(s.e); const inner = new Env(env); inner.vars.set(s.name, { kind: "val", js: mg(s.name), ...(place ? { draft: true } : {}) });
          out.push(`${pad}for (const ${mg(s.name)} of [...${x}]) {\n${this.stmts(s.body, inner, ctx, ind + 1)}\n${pad}}`); break;   // the loop visits what `e` holds when it starts (07 §5)
        }
        case "sif": this.raw.add(s.c); out.push(`${pad}if (${e(s.c)}) {\n${this.stmts(s.t, env, ctx, ind + 1)}\n${pad}} else {\n${this.stmts(s.f, env, ctx, ind + 1)}\n${pad}}`); break;
        case "try": {
          let t = `${pad}try {\n${this.stmts(s.body, env, ctx, ind + 1)}\n${pad}}`;
          if (s.handler) { const h = new Env(env); if (s.catchName) h.vars.set(s.catchName, { kind: "val", js: mg(s.catchName) }); const v = s.catchName ? mg(s.catchName) : "__e"; t += ` catch (${v}) {\n${s.catchClasses ? `${pad}  if (!__rt.isA(${v}, ${this.classes(s.catchClasses, env)})) throw ${v};   // R-f-6: a typed catch rethrows other classes\n` : ""}${this.stmts(s.handler, h, ctx, ind + 1)}\n${pad}}`; }
          if (s.fin) t += ` finally {\n${this.stmts(s.fin, env, ctx, ind + 1)}\n${pad}}`;
          out.push(t); break;
        }
      }
    });
    return out.join("\n");
  }

  // ---- views: JSX, which Solid's compiler (@solidjs/compiler) lowers for the DOM, the server and the test renderer ----
  /** A view: a fragment of children. Text is a string child; `{e}` is `{__rt.show(e)}` (a value is formatted, a view is
   *  inserted); control flow is Solid's components. What is a hole, a scope or a memo is the compiler's to decide. */
  markup(ms: Markup[], env: Env, ind: number): string { return ms.length ? `<>${ms.map(m => this.child(m, env, ind)).join("")}</>` : "null"; }   // an empty view is null, not `<></>` (an empty array loses its slot in the universal renderer: DV-13)
  /** A region's body as a child: its declarations, then its view (a function body, so it is owned where it is called). */
  private regionFn(decls: Decl[], view: Markup[], env: Env, ind: number, param = "", bind?: (e: Env) => string): string {
    const pad = " ".repeat(ind * 2);
    const inner = new Env(env); const pre = bind ? bind(inner) : "";
    return `(${param}) => {\n${pre}${this.owned(decls, view, inner, ind + 1)}\n${pad}}`;
  }
  /** RG-7a: what a region provides is for what is in it, so it has an owner of its own: in Solid's production build a
   *  component has none, and a branch's is its condition's, made again and again under what the last one provided. */
  private owned(decls: Decl[], view: Markup[], env: Env, ind: number, root?: boolean): string {
    const b = this.block(decls, view, env, ind, undefined, root); const pad = " ".repeat(ind * 2);
    return decls.some(x => x.k === "provide") ? `${pad}return __rt.inst(() => {\n${b}\n${pad}});` : b;
  }
  private region(decls: Decl[], view: Markup[], env: Env, ind: number): string { return `{(${this.regionFn(decls, view, env, ind)})()}`; }
  private attr(name: string, e: Expr, env: Env): string { return name === "..." ? `{...${this.expr(e, env, { imp: false })}}` : `${name}={${this.expr(e, env, { imp: isHandler(name), ref: name === "ref" })}}`; }   // 07 §4: a spread is Solid's
  /** RG-4c: the view a tag shows, `<props.f … />` in a component that does. */
  private shownFrom(tag: string, env: Env): { view: string; mixed: boolean } | undefined { const n = shownIn(tag), b = n && env.lookup(n[0]), mixed = b?.shows?.get(n![1]); return mixed === undefined ? undefined : { view: `${b!.js}.${n![1]}`, mixed }; }
  private child(m: Markup, env: Env, ind: number): string {
    const re: Ctx = { imp: false };
    const pad = " ".repeat((ind + 1) * 2);
    switch (m.k) {
      case "text": return `{${J(m.s)}}`;
      case "style": return "";                                                                 // CSS-4: removed; the stylesheet is the module's
      // a component's children are a view whoever gave them: `{props.children}` is inserted as it is, where another value
      // is formatted. A JS library hands a component its text as an array of strings (solid-marked's paragraphs), which
      // `show` would print as the list it also is (2026-11-24)
      case "read": return `{__rt.${given(m.e, n => env.lookup(n)?.given)?.held === "children" ? "kids" : "show"}(${this.expr(m.e, env, re)})}`;
      case "el": {
        if (m.tag === "") return this.markup(m.children, env, ind);
        { const p = this.shownFrom(m.tag, env); if (p) return `{__rt.view(${p.view}, V$view => <V$view${m.attrs.map(a => " " + this.attr(a.name, a.e, env)).join("")} />${p.mixed ? ", true" : ""})}`; }   // RG-4c: the view the component was given, applied (plain content, as it is)
        if (/^[A-Z]/.test(m.tag)) {
          const dot = m.tag.indexOf("."); const head = dot > 0 && !env.lookup(m.tag) ? env.lookup(m.tag.slice(0, dot)) : undefined;   // MO-11q: `<Dialog.Root>`, a member of a declared JS object
          const b = head ? { kind: "comp" as const, js: `${head.js}${m.tag.slice(dot)}`, shape: "comp" as const } : env.lookup(m.tag); if (b?.kind !== "comp") throw new CompileError(`unknown component ${m.tag}`);
          const attrs = m.attrs.map(a => { const given = this.views.given(m.tag, a.name, a.e); return " " + (given ? `${a.name}={${this.child({ k: "el", tag: given, attrs: [], children: [], line: m.line }, env, ind + 1).trim()}}` : this.attr(a.name, a.e, env)); }).join("");   // MO-11t: a component given by name to a prop typed `View` is applied there, with no arguments: the element, made where the library reads the prop (JSX's `fallback={<Empty />}`, a getter)
          const named = m.children.filter((c): c is Extract<Markup, { k: "mview" }> => c.k === "mview" && !!c.prop);   // MO-11k: named render props are attributes
          const kids = m.children.filter(c => !(c.k === "mview" && c.prop));
          const props = attrs + named.map(v => ` ${v.prop}={${this.regionFn(v.decls, v.body, env, ind + 1, b.shape === "comp" ? v.params.map(mg).join(", ") : viewParam(v), e => { for (const p of v.params) e.vars.set(p, { kind: "val", js: mg(p) }); return ""; })}}`).join("");
          const view = b.shape === "comp" ? undefined : kids.length === 1 && kids[0].k === "mview" ? kids[0] : kids.length && "plain" in b && b.plain ? { k: "mview" as const, params: [], decls: [], body: kids } : undefined;   // RG-4c: what is given as plain content where a view is taken is one that asks nothing
          if (view) return `<${b.js}${props}>{${this.regionFn(view.decls, view.body, env, ind + 2, viewParam(view), e => { for (const p of view.params) e.vars.set(p, { kind: "val", js: mg(p) }); return ""; })}}</${b.js}>`;
          return kids.length ? `<${b.js}${props}>${kids.map(c => this.child(c, env, ind + 1)).join("")}</${b.js}>` : b.shape === "comp" ? `<${b.js}${props} />` : `<${b.js}${props} children={[]} />`;   // MO-11: a JS component gets JSX's own <X />
        }
        let attrs = m.attrs.map(a => " " + (a.name === "class" && this.styleHash ? `class={${a.e.k === "lit" && typeof a.e.v === "string" ? J(`${a.e.v} ${this.styleHash}`) : `__rt.scopedClass(${this.expr(a.e, env, { imp: false })}, ${J(this.styleHash)})`}}` : this.attr(a.name, a.e, env))).join("");
        if (this.styleHash && !m.attrs.some(a => a.name === "class")) attrs += ` class=${J(this.styleHash)}`;   // CSS-2: every HTML element of the view
        { const tag = jsxTag(m.tag); return VOID_TAGS.has(m.tag) ? `<${tag}${attrs} />` : `<${tag}${attrs}>${m.children.map(c => this.child(c, env, ind + 1)).join("")}</${tag}>`; }
      }
      case "mif": {
        const narrowed = m.c.k === "id" ? env.lookup(m.c.name) : undefined;
        const t = this.regionFn(m.tDecls, m.t, env, ind + 1, "__item", e => { if (m.c.k === "id" && narrowed && (narrowed.kind === "acc" || narrowed.kind === "src")) { e.vars.set(m.c.name, { kind: "acc", js: `n$${m.c.name}`, w: narrowed.w, given: narrowed.given }); return `${pad}  const n$${m.c.name} = __item;\n`; } return ""; });
        const asked = m.c.k === "member" && m.c.o.k === "id" ? this.shownFrom(`${m.c.o.name}.${m.c.p}`, env) : undefined;   // RG-4c: a view left out is whatever the caller writes for nothing (`children: []`)
        return `<Show when={${asked ? `typeof ${asked.view} === "function"` : this.expr(m.c, env, re)}} fallback={(${this.regionFn(m.fDecls, m.f, env, ind + 1)})()}>{${t}}</Show>`;
      }
      case "mview": {                                                                         // MO-11k: the render prop, an arrow over the view
        const body = this.regionFn(m.decls, m.body, env, ind + 1, m.params.map(mg).join(", "), e => { for (const p of m.params) e.vars.set(p, { kind: "val", js: mg(p) }); return ""; });
        return `{${body}}`;
      }
      case "mfor": {
        const body = this.regionFn(m.decls, m.body, env, ind + 1, mg(m.name), e => { e.vars.set(m.name, { kind: "val", js: mg(m.name) }); return ""; });
        return `<For each={${this.expr(m.xs, env, re)}}>{${body}}</For>`;
      }
      case "loading": {
        const on = m.on ? ` on={${this.expr(m.on, env, re)}}` : "";
        return `<Loading${on} fallback={${this.markup(m.fallback, env, ind + 1)}}>${this.region(m.decls, m.body, env, ind + 1)}</Loading>`;
      }
      case "portal": {                                                                          // RG-8: Solid's Portal (the web's, or the test renderer's)
        const to = m.to ? ` mount={${this.expr(m.to, env, re)}}` : "";
        return `<__rt.Portal${to}>${this.region(m.decls, m.body, env, ind + 1)}</__rt.Portal>`;
      }
      case "errored": {
        const fbEnv = new Env(env); if (m.errName) fbEnv.vars.set(m.errName, { kind: "acc", js: mg(m.errName) });
        const fallback = `fallback={(${m.errName ? mg(m.errName) : "__err"}) => ${this.markup(m.fallback, fbEnv, ind + 1)}}`;
        const body = this.region(m.decls, m.body, env, ind + 1);
        return m.classes ? `<__rt.TypedErrored classes={${this.classes(m.classes, env)}} ${fallback}>${body}</__rt.TypedErrored>` : `<Errored ${fallback}>${body}</Errored>`;   // R-f-4: a typed boundary passes other classes up
      }
    }
  }
}

/** An expression written out as a constant: a literal, or an array, a record, a template or a sign over them. */
function constant(e: Expr): boolean {
  switch (e.k) {
    case "lit": return true;
    case "un": return constant(e.e);
    case "tpl": return e.parts.every(p => typeof p === "string" || constant(p));
    case "arr": return e.items.every(constant);
    case "rec": return e.fields.every(f => "key" in f && constant(f.v));
    default: return false;
  }
}
