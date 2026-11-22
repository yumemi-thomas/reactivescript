// 09-modules: a program is a set of `.rx` modules. The loader resolves each `.rx` import to a path, parses every module once,
// and orders them dependencies first (MO-1). A cycle is refused (MO-5): signatures are computed in that order.
import { parseProgram, parseDeclarations, ParseError, type JsDecl } from "./parse.ts";
import type { Decl, Expr, Program } from "./ast.ts";
import type { Diagnostic } from "./errors.ts";
import type { ModSig } from "./check.ts";
import { parseSignature, SignatureError } from "./signature.ts";

export type ModuleSet = { entry: string; programs: Map<string, Program>; order: string[]; diags: Diagnostic[]; declarations?: Map<string, JsDecl[]>; signatures?: Map<string, ModSig>; declarationIds?: Map<string, string>; printed?: Set<string> };   // printed: MO-13a, the signatures a JS import's marked `.d.rx` gave, by `.rx` path   // declarationIds: SV-5a, `packageRelative`   // declarations: MO-8, by `.d.rx` path; signatures: MO-9, by `.rx` path

export const isRx = (from: string) => /\.rx$/.test(from);

/** MO-13a: whether a `.d.rx` is the printed signature of a compiled `.rx` module — a line `//@ signature …` before its
 *  first row. Such a file is read as MO-9b reads it wherever it is found (beside a JS module, MO-8a; a package's, MO-8k),
 *  not as a JS module's declaration. */
export function isPrintedSignature(src: string): boolean {
  for (const raw of src.split("\n")) { const t = raw.trim(); if (!t) continue; if (/^\/\/@\s*signature(\s|$)/.test(t)) return true; if (!t.startsWith("//")) return false; }
  return false;
}
/** `to` as an import from the module `from` writes it: a relative path where both are absolute or both are not. */
export function relativeModule(from: string, to: string): string {
  if (from.startsWith("/") !== to.startsWith("/")) return to;
  const a = from.split("/").slice(0, -1).filter(x => x && x !== "."), b = to.split("/").filter(x => x && x !== "."); let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return (a.length - i ? "../".repeat(a.length - i) : "./") + b.slice(i).join("/");
}

/** POSIX-style join and normalisation, for module keys (no file system involved). */
export function joinPath(fromFile: string, rel: string): string {
  const base = fromFile.split("/").slice(0, -1);
  const parts = rel.startsWith("/") ? [] : base;
  for (const seg of rel.split("/")) { if (seg === "" || seg === ".") continue; if (seg === "..") { if (parts.length && parts[parts.length - 1] !== "..") parts.pop(); else parts.push(".."); } else parts.push(seg); }
  return (rel.startsWith("/") ? "/" : "") + parts.join("/");
}

/** MO-10c: the file a package import resolves to, as a bundler finds it — `node_modules` up from the importer, the package's
 *  `exports` (a subpath, then the first of its conditions that a Solid build sets, in the package's order; `*` patterns),
 *  else `module` or `main`. Its declaration is beside it: the same name, `.d.rx`. */
const CONDITIONS = new Set(["solid", "browser", "import", "default"]);
export function packageDeclaration(fromFile: string, spec: string, read: (path: string) => string | undefined): string | undefined {
  const seg = spec.split("/"); const n = spec.startsWith("@") ? 2 : 1; if (seg.length < n || seg.slice(0, n).some(x => !x)) return undefined;
  const pkg = seg.slice(0, n).join("/"); const sub = seg.length > n ? "./" + seg.slice(n).join("/") : ".";
  const dirs = fromFile.split("/").slice(0, -1);
  for (let i = dirs.length; i >= (fromFile.startsWith("/") ? 1 : 0); i--) {
    const root = [...dirs.slice(0, i), "node_modules", pkg].join("/"); const pj = read(root + "/package.json"); if (pj === undefined) continue;
    let json: any; try { json = JSON.parse(pj); } catch { return undefined; }
    const pick = (t: unknown): string | undefined => {
      if (typeof t === "string") return t;
      if (Array.isArray(t)) { for (const x of t) { const r = pick(x); if (r) return r; } return undefined; }
      if (t && typeof t === "object") { for (const [k, v] of Object.entries(t)) if (CONDITIONS.has(k)) { const r = pick(v); if (r) return r; } }
      return undefined;
    };
    let target: string | undefined;
    const ex = json.exports;
    if (ex !== undefined) {
      const map: Record<string, unknown> | null = typeof ex === "object" && ex && !Array.isArray(ex) && Object.keys(ex).some(k => k.startsWith(".")) ? ex : null;
      if (!map) target = sub === "." ? pick(ex) : undefined;
      else if (sub in map) target = pick(map[sub]);
      else {                                                                               // Node's PATTERN_KEY_COMPARE: the longest part before `*` wins, then the longest key
        let best: string | undefined;
        for (const k of Object.keys(map)) { const star = k.indexOf("*"); if (star < 0 || k.lastIndexOf("*") !== star) continue; const pre = k.slice(0, star), post = k.slice(star + 1); if (sub.startsWith(pre) && sub.endsWith(post) && sub.length >= k.length && (best === undefined || star > best.indexOf("*") || (star === best.indexOf("*") && k.length > best.length))) best = k; }
        if (best !== undefined) { const star = best.indexOf("*"), post = best.length - star - 1; const t = pick(map[best]); if (t) target = t.split("*").join(sub.slice(star, sub.length - post)); }
      }
    } else target = sub === "." ? (typeof json.module === "string" ? json.module : typeof json.main === "string" ? json.main : "./index.js") : sub;
    if (!target) return undefined;
    return joinPath(root + "/package.json", target).replace(/\.(m?js|cjs|jsx|ts|tsx)$/, "") + ".d.rx";
  }
  return undefined;
}

/** MO-8k: where a package import's declaration is found, first match wins:
 *  1. the project's, `rx-types/<spec>.d.rx` in the importer's directory or one above it (it overrides a shipped one);
 *  2. the package's own, beside the file the import resolves to (MO-10c);
 *  3. a shared one, `node_modules/@rx-types/<scope>__<name>/<subpath or index>.d.rx`, as `@types` is for TypeScript;
 *  4. a generated one, `node_modules/.rx-types/<spec>.d.rx`, which the tooling drafts from the package's types (MO-8l).
 *  Undefined when none exists (the import is then what R-io-4 and R-f-8 say). */
export function declarationFor(fromFile: string, spec: string, read: (path: string) => string | undefined): string | undefined {
  const seg = spec.split("/"); const n = spec.startsWith("@") ? 2 : 1; if (seg.length < n || seg.some(x => !x || x === "." || x === "..")) return undefined;
  const dirs = fromFile.split("/").slice(0, -1); const lo = fromFile.startsWith("/") ? 1 : 0;
  const up = (rel: string): string | undefined => { for (let i = dirs.length; i >= lo; i--) { const f = [...dirs.slice(0, i), rel].join("/"); if (read(f) !== undefined) return f; } return undefined; };
  const shared = seg.slice(0, n).join("/").replace(/^@/, "").replace("/", "__"); const sub = seg.slice(n).join("/") || "index";
  const shipped = packageDeclaration(fromFile, spec, read);
  return up(`rx-types/${spec}.d.rx`) ?? (shipped !== undefined && read(shipped) !== undefined ? shipped : undefined) ?? up(`node_modules/@rx-types/${shared}/${sub}.d.rx`) ?? up(`node_modules/.rx-types/${spec}.d.rx`);
}

/** SV-5a (ruled 2026-11-22): what a declared error class is identified by. It is read from the declaration's own place and
 *  nothing else — not the entry, not the checkout — so a server and a client name it alike whatever each was built from,
 *  wherever. First match wins:
 *  1. the nearest folder above `file` whose package.json has a name: that name, then the path below it
 *     (`shop/src/err.d.rx`); a package.json with no name (a `{"type":"module"}` scope) is passed over;
 *  2. the nearest folder above `file` with a package.json: the path below it (`err.d.rx`, `lib/err.d.rx`);
 *  3. with none above: the file's own name.
 *  A folder's own name, or any folder above the package, is never part of it, so it holds no machine path. An unnamed
 *  package has nothing to tell its classes from another unnamed one's: two declarations that would name a class alike in
 *  one program are refused where they are loaded (`loadModules`), not told apart by where the build started. */
export function packageRelative(file: string, read: (path: string) => string | undefined): string {
  const pj = (dir: string) => dir === "" ? "package.json" : `${dir}/package.json`;
  const segs = file.split("/"); const lo = file.startsWith("/") ? 1 : 0; const mine: [string, string | null | undefined][] = [];   // nearest first: [folder, name | null (unnamed) | undefined (none)]
  for (let i = segs.length - 1; i >= lo; i--) {
    const dir = segs.slice(0, i).join("/"); const text = read(pj(dir));
    let name: string | null | undefined = undefined;
    if (text !== undefined) { name = null; try { const v = JSON.parse(text); if (typeof v?.name === "string" && v.name) name = v.name; } catch { /* unnamed */ } }
    mine.push([dir, name]);
  }
  const below = (dir: string): string | undefined => dir === "" ? (file.startsWith("/") ? undefined : file) : file.startsWith(dir + "/") ? file.slice(dir.length + 1) : undefined;
  const named = mine.find(([, n]) => typeof n === "string");
  if (named) { const r = below(named[0]); if (r !== undefined) return `${named[1]}/${r}`; }
  const own = mine.find(([, n]) => n !== undefined);
  const r = own ? below(own[0]) : undefined;
  return r ?? segs[segs.length - 1];
}

/** MO-8 (revised 2026-11-21 after review): the `.d.rx` that declares a relative JS import, first that exists wins: `./x.mjs`,
 *  `./x.cjs` and `./x.jsx` by `x.mjs.d.rx` (`x.cjs.d.rx`, `x.jsx.d.rx`), the file's whole name, then by `x.d.rx`; `./x.js`
 *  and `./x.ts` by `x.d.rx`; anything else by its name and `.d.rx`. When none exists, the last. */
export function declarationNames(from: string): string[] {
  const m = /^(.*)\.(mjs|cjs|jsx|tsx|mts|cts)$/.exec(from); if (m) return [`${from}.d.rx`, `${m[1]}.d.rx`];   // TypeScript's are JavaScript's (RFC 23, revised 2026-11-22)
  return [from.replace(/\.(js|ts)$/, "") + ".d.rx"];
}
export function besideDeclaration(importer: string, from: string, read: (path: string) => string | undefined): string {
  const paths = declarationNames(from).map(n => joinPath(importer, n));
  return paths.find(p => read(p) !== undefined) ?? paths[paths.length - 1];
}

/** Load `entry` and everything it imports from `.rx`. `read` returns a module's source, or undefined when there is none. */
export function loadModules(entry: string, read: (path: string) => string | undefined): ModuleSet {
  const programs = new Map<string, Program>(); const order: string[] = []; const diags: Diagnostic[] = []; const declarations = new Map<string, JsDecl[]>(); const signatures = new Map<string, ModSig>(); const printed = new Set<string>(); const wireIds = new Map<string, string>();   /* SV-5a: each declared error class's wire id (`id#Name`), and the declaration it is */ const declarationIds = new Map<string, string>();
  const state = new Map<string, "busy" | "done">();
  const visit = (path: string, stack: string[]) => {
    if (state.get(path) === "done") return;
    const src = read(path);
    if (src === undefined) return;                                    // reported at the import that names it
    let p: Program;
    try { p = parseProgram(src); } catch (e) { if (e instanceof ParseError) throw Object.assign(new ParseError(`${path}: ${e.message}`), { code: e.code }); throw e; }
    programs.set(path, p); state.set(path, "busy");
    for (const d of p.decls) {
      const pkgDts = d.k === "import" && !isRx(d.from) && !d.from.startsWith(".") && !d.from.startsWith("/") ? declarationFor(path, d.from, read) : undefined;   // MO-8k, MO-10c
      if (d.k === "import" && !isRx(d.from) && (d.from.startsWith(".") || pkgDts)) {             // MO-8: a JS module with a declaration file beside it
        const dts = pkgDts ?? besideDeclaration(path, d.from, read);
        // MO-13a: a declaration that says it is a compiled .rx module's printed signature is that module's signature (MO-9b)
        const rx = dts.replace(/\.d\.rx$/, ".rx");
        if (!printed.has(rx) && !declarations.has(dts)) { const src = read(dts); if (src !== undefined && isPrintedSignature(src)) { try { signatures.set(rx, parseSignature(src, rx)); printed.add(rx); } catch (e) { if (e instanceof SignatureError) throw new ParseError(e.message); throw e; } } }
        if (printed.has(rx)) { d.resolved = rx; continue; }
        if (!declarations.has(dts)) { const src = read(dts); if (src !== undefined) { try {
          const ds = parseDeclarations(src); contextSources(dts, ds, read);
          // SV-5a: the declaration's identity; two that would name an error class alike are not told apart
          const id = packageRelative(dts, read);
          if (d.from.startsWith(".")) for (const x of ds) {
            if (x.kind !== "error") continue;
            const key = `${id}#${x.name}`; const other = wireIds.get(key);
            if (other !== undefined) throw Object.assign(new ParseError(`the error class ${x.name} would be sent to the client as "${key}", and so would the one ${other} declares: neither is in a package with a name, so nothing tells them apart — give the package.json above one of them a "name" (SV-5a)`), { code: "DUPLICATE_WIRE_ID" });
            wireIds.set(key, dts);
          }
          declarations.set(dts, ds); declarationIds.set(dts, id);
        } catch (e) { if (e instanceof ParseError) throw Object.assign(new ParseError(`${dts}: ${e.message}`), { code: e.code }); throw e; } } }
        const ds = declarations.get(dts);
        if (ds) { d.declared = dts; d.declaredErrors = ds.filter(x => x.kind === "error").map(x => x.name); const ef = ds.flatMap(x => x.kind === "error" && x.fields ? [[x.name, x.fields]] : []); if (ef.length) d.declaredErrorFields = Object.fromEntries(ef); d.declaredPure = ds.filter(x => x.kind === "fn" && x.pure).map(x => x.name); d.declaredSide = Object.fromEntries(ds.flatMap(x => x.kind === "fn" && x.side ? [[x.name, x.side]] : [])); }
        continue;
      }
      if (d.k !== "import" || !isRx(d.from)) continue;
      const to = joinPath(path, d.from); d.resolved = to;
      if (state.get(to) === "busy") { diags.push({ code: "MODULE_CYCLE", rule: "MO-5", line: d.line, file: path, msg: `${[...stack, path].slice(stack.indexOf(to) >= 0 ? stack.indexOf(to) : 0).concat(to).join(" → ")}: modules may not import each other in a cycle (signatures are computed dependencies first)` }); continue; }
      if (state.get(to) !== "done" && !signatures.has(to) && read(to) === undefined) {   // MO-9: no body — its signature, read in place
        const sig = read(to.replace(/\.rx$/, ".d.rx"));
        if (sig !== undefined) { try { signatures.set(to, parseSignature(sig, to)); } catch (e) { if (e instanceof SignatureError) throw new ParseError(e.message); throw e; } continue; }
      }
      if (signatures.has(to)) continue;
      if (state.get(to) !== "done" && read(to) === undefined) { diags.push({ code: "MODULE_NOT_FOUND", rule: "MO-6", line: d.line, file: path, msg: `no module ${d.from} (from ${path})` }); continue; }
      visit(to, [...stack, path]);
    }
    state.set(path, "done"); order.push(path);
  };
  visit(entry, []);
  return { entry, programs, order, diags, declarations, signatures, declarationIds, printed };
}

/** One program with no `.rx` imports — the common case, and every scenario before 09. */
export function singleModule(p: Program, entry = "main.rx"): ModuleSet { return { entry, programs: new Map([[entry, p]]), order: [entry], diags: [] }; }

/** MO-12e: where each context a declaration takes from another module (`export context c from "<module>"`) is declared:
 *  that module's declaration file, found as an import of it from this file would find it (MO-8k, MO-10c), and followed
 *  while it too takes the context from elsewhere. Left unset where no declaration declares it (`NOT_EXPORTED`). */
export function contextSources(dts: string, ds: JsDecl[], read: (path: string) => string | undefined): void {
  for (const d of ds) {
    if (d.kind !== "context" || d.from === undefined) continue;
    let at = dts, spec = d.from;
    for (let i = 0; i < 8; i++) {
      const target = spec.startsWith(".") || spec.startsWith("/") ? besideDeclaration(at, spec, read) : declarationFor(at, spec, read);
      if (target === undefined) break;
      const src = read(target); if (src === undefined || isPrintedSignature(src)) break;   // an .rx module's context is imported and used by its name (MO-7)
      let theirs: JsDecl[]; try { theirs = parseDeclarations(src); } catch { break; }
      const c = theirs.find(x => x.kind === "context" && x.name === d.name); if (!c || c.kind !== "context") break;
      if (c.from === undefined) { d.resolved = target; break; }
      at = target; spec = c.from;
    }
  }
}

/** MO-11f, MO-11j: an equation bound from a declared factory's call is a component (`Router = createRouter(…)`). */
export function madeComponent(p: { decls: Decl[] }, name: string, declarations?: Map<string, JsDecl[]>): boolean {
  const d = p.decls.find(x => x.k === "eq" && x.name === name); if (!d || d.k !== "eq" || d.e.k !== "call" || d.e.f.k !== "id") return false;
  const g = d.e.f.name;
  for (const i of p.decls) if (i.k === "import" && i.declared) { const n = i.names.find(x => x.alias === g); if (n) return declarations?.get(i.declared)?.some(x => x.kind === "fn" && x.name === n.name && x.shape === "comp") ?? false; }
  return false;
}

/** MO-11t: what a module's emitters need to know of a component given by name to a declared JS component's prop typed
 *  `View` — the props that take a view, by the tag as the module writes it (an alias, a member), and the names that are
 *  components here. The checker has both from its own symbols; the compiled module and the TSX projection write the
 *  component applied (`fallback={<Empty />}`), which this decides. */
export class ViewProps {
  private props = new Map<string, Set<string>>(); private comps = new Set<string>();
  constructor(set: ModuleSet | undefined, decls: Decl[]) {
    const made = (ds: Decl[], name: string) => madeComponent({ decls: ds }, name, set?.declarations);
    for (const d of decls) {
      if (d.k === "component") this.comps.add(d.name);
      else if (d.k === "eq" && made(decls, d.name)) this.comps.add(d.name);
      else if (d.k === "import" && d.resolved) { for (const n of d.names) {
        const src = set?.programs.get(d.resolved);
        const inSource = !!src && (src.decls.some(x => x.k === "component" && x.name === n.name) || made(src.decls, n.name));
        if (inSource || set?.signatures?.get(d.resolved)?.exports.get(n.name)?.kind === "comp") this.comps.add(n.alias);
      } }
      else if (d.k === "import" && d.declared) { for (const n of d.names) for (const x of set?.declarations?.get(d.declared) ?? []) {
        if (x.kind !== "comp" || !(x.name === n.name || x.name.startsWith(n.name + "."))) continue;   // MO-11q: a member is written after the name its object is imported under
        const rest = x.name.slice(n.name.length); if (!rest) this.comps.add(n.alias);
        const views = x.props.filter(p => p.view).map(p => p.name); if (views.length) this.props.set(n.alias + rest, new Set(views));
      } }
    }
  }
  /** The component `attr={e}` of `<tag>` gives by name to a prop that takes a view, if it does. */
  given(tag: string, attr: string, e: Expr): string | undefined { return e.k === "id" && this.props.get(tag)?.has(attr) && this.comps.has(e.name) ? e.name : undefined; }
}
