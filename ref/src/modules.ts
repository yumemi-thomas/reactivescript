// 09-modules: a program is a set of `.rx` modules. The loader resolves each `.rx` import to a path, parses every module once,
// and orders them dependencies first (MO-1). A cycle is refused (MO-5): signatures are computed in that order.
import { PRELUDE_FILES } from "./names.ts";
import { parseProgram, parseDeclarations, ParseError, fieldName, isViewType, splitTop, closes, type JsDecl } from "./parse.ts";
import type { Decl, Expr, Markup, Stmt, Program } from "./ast.ts";
import type { Diagnostic } from "./errors.ts";
import type { ModSig } from "./check.ts";
import { parseSignature, SignatureError } from "./signature.ts";
import { scoped } from "./scope.ts";

export type ModuleSet = { entry: string; /** CP-4c: loaded for the scenario runners, where `fetch` and `fail` are the scenario prelude's: the check and the build read the one mark */ conformance: boolean; programs: Map<string, Program>; order: string[]; diags: Diagnostic[]; declarations?: Map<string, JsDecl[]>; signatures?: Map<string, ModSig>; declarationIds?: Map<string, string>; printed?: Set<string>; host?: HostView; hosted?: Set<string>; placed?: Set<string>; through?: Set<string>; under?: Set<string> };   // under: MO-14h, in the program's set and the host's — the JS components the declaration says the host renders through, for a fn's `renders(H)`   // through: MO-14f, in the host's own set — the JS components the host renders through, `declaration#Name`   // MO-14: host, the JS host's view above this program (its declaration, and the program that stands for it); hosted: the modules it imports; placed: the components it places, `path#Name`
/** MO-14: a host declaration found above a program — `file`, the `host.d.rx`; `entry`, the module that stands for the
 *  host's view in the checker (never written: the declaration lowered onto a factory's words); `set`, that program. */
export type HostView = { file: string; entry: string; set: ModuleSet };   // printed: MO-13a, the signatures a JS import's marked `.d.rx` gave, by `.rx` path   // declarationIds: SV-5a, `packageRelative`   // declarations: MO-8, by `.d.rx` path; signatures: MO-9, by `.rx` path

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

/** MO-8k, MO-14a: a project's folder, as how many of `dirs` lead to it: the nearest one whose package.json has a name (a
 *  `{"type":"module"}` scope is passed over, as in SV-5a); with none, the outermost folder there is. */
export function projectTop(dirs: string[], lo: number, read: (path: string) => string | undefined): number {
  for (let i = dirs.length; i >= lo; i--) { const t = read([...dirs.slice(0, i), "package.json"].join("/")); if (t !== undefined) try { const v = JSON.parse(t); if (typeof v?.name === "string" && v.name) return i; } catch { /* unnamed */ } }
  return lo;
}

/** MO-8k: where a package import's declaration is found, first match wins:
 *  1. the project's, `rx-types/<spec>.d.rx` in the importer's directory or one above it, no higher than the project's folder
 *     (`projectTop`; it overrides a shipped one);
 *  2. the package's own, beside the file the import resolves to (MO-10c);
 *  3. a shared one, `node_modules/@rx-types/<scope>__<name>/<subpath or index>.d.rx`, as `@types` is for TypeScript;
 *  4. a generated one, `node_modules/.rx-types/<spec>.d.rx`, which the tooling drafts from the package's types (MO-8l).
 *  Undefined when none exists (the import is then what R-io-4 and R-f-8 say). */
export function declarationFor(fromFile: string, spec: string, read: (path: string) => string | undefined): string | undefined {
  const seg = spec.split("/"); const n = spec.startsWith("@") ? 2 : 1; if (seg.length < n || seg.some(x => !x || x === "." || x === "..")) return undefined;
  const dirs = fromFile.split("/").slice(0, -1); const lo = fromFile.startsWith("/") ? 1 : 0;
  const up = (rel: string, top = lo): string | undefined => { for (let i = dirs.length; i >= top; i--) { const f = [...dirs.slice(0, i), rel].join("/"); if (read(f) !== undefined) return f; } return undefined; };
  const shared = seg.slice(0, n).join("/").replace(/^@/, "").replace("/", "__"); const sub = seg.slice(n).join("/") || "index";
  const shipped = packageDeclaration(fromFile, spec, read);
  return up(`rx-types/${spec}.d.rx`, projectTop(dirs, lo, read)) ?? (shipped !== undefined && read(shipped) !== undefined ? shipped : undefined) ?? up(`node_modules/@rx-types/${shared}/${sub}.d.rx`) ?? up(`node_modules/.rx-types/${spec}.d.rx`);
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

/** MO-14: the name a host declaration has, looked for in the entry's folder and each one above it, up to the project's (the nearest wins). */
export const HOST_DECLARATION = "host.d.rx";
/** MO-14c: a host declaration as the program the checker walks — the declaration's own imports, its tree given to a
 *  factory with the row's words (MO-11f, MO-11i, MO-12c), and that factory's component applied as the app's view. Text
 *  for text, each piece on the line the declaration has it, so a diagnostic's line is the declaration's. `rx` is the
 *  module (`<file>.host.rx`), `decl` the declaration of the factory it calls (`<file>.host.d.rx`). Undefined when the
 *  file states no view. */
export function hostProgram(src: string, ds: JsDecl[], name: string): { rx: string; decl: string } | undefined {
  const host = ds.find(d => d.kind === "host"); if (!host || host.kind !== "host") return undefined;
  const out = src.split("").map(ch => ch === "\n" ? "\n" : " ");   // every line kept, blank
  const put = (from: number, to: number, text = src.slice(from, to)) => { for (let i = from; i < to; i++) out[i] = ""; out[from] = text; };
  for (const d of ds) if (d.kind === "import") put(d.span[0], d.span[1]);
  const [row, tree, end] = host.span;
  // (the row's own line breaks kept after it, so the tree stays on its lines)
  put(row, tree, `import { jsHostFactory } from "./${name}.host.js"; export default component JsHost() { <JsHostView /> }; JsHostView = jsHostFactory(` + "\n".repeat(src.slice(row, tree).split("\n").length - 1));
  put(tree, end, src.slice(tree, end) + ")");
  const words = `${host.provides ? ` provides(${host.provides.join(", ")})` : ""}${host.nests ? ` nests(${host.nests.kids} in ${host.nests.inside})` : ""}`;
  const contexts = ds.flatMap(d => d.kind === "context" ? [`export context ${d.name}${d.from !== undefined ? ` from ${JSON.stringify(d.from)}` : ""}`] : []);
  return { rx: out.join(""), decl: [...contexts, `export pure fn jsHostFactory(tree: unknown): Component${words}`].join("\n") + "\n" };
}

/** Load `entry` and everything it imports from `.rx`. `read` returns a module's source, or undefined when there is none.
 *  MO-14: with a host declaration at or above the entry's folder, the program that stands for the host's view is loaded
 *  beside it (`host`), with the modules it imports (`hosted`) and the components it places (`placed`). */
export function loadModules(entry: string, read: (path: string) => string | undefined, conformance = false): ModuleSet {
  const set = loadProgram(entry, read, conformance);
  const dirs = entry.split("/").slice(0, -1); const lo = entry.startsWith("/") ? 1 : 0; let file: string | undefined; let src: string | undefined; const top = projectTop(dirs, lo, read);
  for (let i = dirs.length; i >= top && src === undefined; i--) { file = [...dirs.slice(0, i), HOST_DECLARATION].join("/"); src = read(file); }
  if (src === undefined || file === undefined) return set;
  let ds: JsDecl[]; try { ds = parseDeclarations(src); } catch (e) { if (e instanceof ParseError) throw Object.assign(new ParseError(`${file}: ${e.message}`), { code: e.code }); throw e; }
  const name = file.split("/").pop()!; const lowered = hostProgram(src, ds, name); if (!lowered) return set;
  const hostEntry = `${file}.host.rx`, hostDecl = `${file}.host.d.rx`;
  const over = (p: string) => p === hostEntry ? lowered.rx : p === hostDecl ? lowered.decl : read(p);
  let hs: ModuleSet; try { hs = loadProgram(hostEntry, over, conformance); } catch (e) { if (e instanceof ParseError) throw Object.assign(new ParseError(e.message.split(hostEntry).join(file).split(hostDecl).join(file)), { code: e.code }); throw e; }
  const hosted = new Set<string>(), placed = new Set<string>();
  // placed: the imported components the tree names (one it imports and leaves out is still rendered where no one says)
  const host = ds.find(d => d.kind === "host") as Extract<JsDecl, { kind: "host" }>; const named = new Set(src.slice(host.span[1], host.span[2]).split(/[^A-Za-z0-9_$]+/));
  // MO-14f: a component the declaration imports from a JS module is the host's own — one an `.rx` component applies, and the
  // host renders through: `through`, each by its declaration and its name there
  const through = new Set<string>();
  for (const d of ds) if (d.kind === "import") {
    if (!isRx(d.from)) {
      const imp = hs.programs.get(hostEntry)?.decls.find(x => x.k === "import" && x.from === d.from && x.line === d.line); const dts = imp && imp.k === "import" ? imp.declared : undefined;
      for (const n of d.names) {
        if (!dts || !hs.declarations?.get(dts)?.some(x => x.kind === "comp" && x.name === n.name)) throw Object.assign(new ParseError(`${file}: line ${d.line}: import { ${n.name} } from ${JSON.stringify(d.from)}: a host declaration imports from a JS module a component the host renders through, and ${dts ? `${dts} declares no component ${n.name}` : `${d.from} has no declaration`} — \`export component ${n.name}(props: {})\` in its \`.d.rx\` (MO-14f)`), { code: "NOT_EXPORTED" });
        through.add(`${dts}#${n.name}`);
      }
      continue;
    }
    const to = joinPath(file, d.from); hosted.add(to); for (const n of d.names) if (named.has(n.alias)) placed.add(`${to}#${n.name}`);
  }
  hs.hosted = hosted; hs.placed = placed; hs.through = through; hs.under = through;
  set.host = { file, entry: hostEntry, set: hs }; set.hosted = hosted; set.placed = placed; set.under = through;
  return set;
}
function loadProgram(entry: string, read: (path: string) => string | undefined, conformance: boolean): ModuleSet {
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
      if (d.k === "import" && d.prelude && PRELUDE_FILES.some(x => read(joinPath(path, d.from + x)) !== undefined)) delete d.prelude;   // a module of the program's own, by that name
      const pkgDts = d.k === "import" && !isRx(d.from) && !d.from.startsWith(".") && !d.from.startsWith("/") ? declarationFor(path, d.from, read) : undefined;   // MO-8k, MO-10c
      if (d.k === "import" && !isRx(d.from) && (d.from.startsWith(".") || pkgDts)) {             // MO-8: a JS module with a declaration file beside it
        const dts = pkgDts ?? besideDeclaration(path, d.from, read);
        // MO-13a: a declaration that says it is a compiled .rx module's printed signature is that module's signature (MO-9b)
        const rx = dts.replace(/\.d\.rx$/, ".rx");
        if (!printed.has(rx) && !declarations.has(dts)) { const src = read(dts); if (src !== undefined && isPrintedSignature(src)) { try { signatures.set(rx, parseSignature(src, rx)); printed.add(rx); } catch (e) { if (e instanceof SignatureError) throw new ParseError(e.message); throw e; } } }
        if (printed.has(rx)) { delete d.prelude; d.resolved = rx; continue; }
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
        if (ds) { delete d.prelude; d.declared = dts; d.declaredErrors = ds.filter(x => x.kind === "error").map(x => x.name); const ef = ds.flatMap(x => x.kind === "error" && x.fields ? [[x.name, x.fields]] : []); if (ef.length) d.declaredErrorFields = Object.fromEntries(ef); d.declaredPure = ds.filter(x => x.kind === "fn" && x.pure).map(x => x.name); d.declaredSide = Object.fromEntries(ds.flatMap(x => x.kind === "fn" && x.side ? [[x.name, x.side]] : [])); }
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
    nameMethods(p, declarations);
    state.set(path, "done"); order.push(path);
  };
  visit(entry, []);
  return { entry, conformance, programs, order, diags, declarations, signatures, declarationIds, printed };
}

/** MO-8t (2026-11-25): a method a declaration gives a row of its own — `export fn toaster.show(…)` beside `export const
 *  toaster` — is named by that row where the module writes it: `toaster.show` (no `?.`) becomes the name
 *  `toaster.show`, which the checkers, the emitters and the projection then read as they read any declared fn's (io or
 *  pure, its callbacks, the components it is given, what it rejects with). Done once, as the module is loaded, so every
 *  reader has the same tree. The object is the import by its scope (2026-11-26): where the name is bound again around
 *  the mention — a parameter, a local, a loop's variable — the member is that binding's, and stays a member. */
export function nameMethods(p: Program, declarations: Map<string, JsDecl[]>): void {
  const names = new Set<string>();
  for (const d of p.decls) if (d.k === "import" && d.declared) for (const { name, alias } of d.names) for (const x of declarations.get(d.declared) ?? []) if (x.kind === "fn" && x.name.startsWith(name + ".")) names.add(alias + x.name.slice(name.length));
  if (!names.size) return;
  type N = { k?: string; o?: unknown; p?: string; opt?: boolean; name?: string };
  const chain = (e: N): string | undefined => e.k === "id" ? e.name : e.k === "member" && !e.opt ? (() => { const o = chain(e.o as N); return o === undefined ? undefined : `${o}.${e.p}`; })() : undefined;
  scoped(p, (o: N, bound) => {
    if (o.k !== "member") return;
    const n = chain(o); if (n === undefined || !names.has(n) || bound.some(b => b.name === n.split(".")[0])) return;
    delete o.o; delete o.p; delete o.opt; o.k = "id"; o.name = n; return true;
  });
}

/** One program with no `.rx` imports — the common case, and every scenario before 09. */
export function singleModule(p: Program, entry = "main.rx"): ModuleSet { return { entry, conformance: true, programs: new Map([[entry, p]]), order: [entry], diags: [] }; }

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

/** The names a module imports from JavaScript and writes only in its types: nothing to import when it runs, as TypeScript
 *  leaves them out. A name a declaration gives a row is that row's to say (`typeNames`: its rows that are types). */
export function typeOnly(p: { decls: Decl[]; view: unknown }, set?: ModuleSet): Set<string> {
  const values = new Set<string>(), types: string[] = [];
  const walk = (x: unknown, key = ""): void => {
    if (typeof x === "string") { if (TYPE_KEYS.has(key)) types.push(x); else { values.add(x); values.add(x.split(".")[0]); } return; }
    if (Array.isArray(x)) { for (const y of x) walk(y, key); return; }
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>; if (o.k === "import" || o.k === "lit" || o.k === "text" || o.k === "style") return;
    for (const [k, v] of Object.entries(o)) if (k !== "k") walk(v, o.k === "typedecl" && k === "text" ? "type" : k);
  };
  walk(p.decls); walk(p.view);
  const out = new Set<string>();
  for (const d of p.decls) if (d.k === "import" && !d.resolved) for (const n of d.names) {
    if (d.declared && set?.declarations?.get(d.declared)?.some(y => "name" in y && y.name === n.name)) continue;
    if (!values.has(n.alias) && types.some(t => new RegExp(`(?<![\\w$.])${n.alias.replace(/\$/g, "\\$")}(?![\\w$])`).test(t))) out.add(n.alias);
  }
  return out;
}
const TYPE_KEYS = new Set(["type", "ptypes", "ret", "targs", "propsType"]);

/** RG-4b, RG-4c: what a name is of a component's props. `props`: the props themselves, without `less` (an object rest);
 *  `views`: those typed `View`. `held`: a view the component was given, its children (`children`) or another. Such an
 *  equation is a projection and no computation: the view is made where it is read, under what provides and catches there,
 *  as `props.children` is. */
export type Given = { props?: { less: string[]; views: Set<string> }; held?: "children" | "view"; view?: boolean; field?: string };   // field: the prop it is, or the first of those a choice names; view: declared `View` where the type is read (`views`); the children of a type that is not read are held, and no more is known of them
export function given(e: Expr, look: (n: string) => Given | undefined): Given | undefined {
  if (e.k === "id") return look(e.name);
  if (e.k === "omit") { const p = given(e.e, look)?.props; return p && { props: { less: [...p.less, ...e.keys], views: p.views } }; }
  if (e.k === "member") { const p = given(e.o, look)?.props; if (!p || p.less.includes(e.p)) return undefined; const view = p.views.has(e.p); return e.p === "children" ? { held: "children", field: e.p, ...(view ? { view } : {}) } : view ? { held: "view", view, field: e.p } : undefined; }
  if (e.k === "if") { const d = defaulted(e, look); if (d) return d; }
  const either = e.k === "if" ? [e.t, e.f] : e.k === "bin" && (e.op === "??" || e.op === "||" || e.op === "&&") ? [e.l, e.r] : [];
  const gs = either.map(x => given(x, look)).filter(g => g?.held);
  return gs.length ? { held: "view", field: gs[0]!.field, ...(gs.some(g => g!.view) ? { view: true } : {}) } : undefined;
}
/** A view with a default, `{ children = "none" } = props`: read once. Of text, it is still the children. */
export function defaulted(e: Expr, look: (n: string) => Given | undefined): Given | undefined {
  if (e.k !== "if" || e.c.k !== "bin" || e.c.op !== "==" || e.c.r.k !== "lit" || e.c.r.v !== undefined || JSON.stringify(e.c.l) !== JSON.stringify(e.f)) return undefined;
  const g = given(e.f, look); return !g?.held ? undefined : e.t.k === "lit" && typeof e.t.v === "string" ? g : { held: "view", field: g.field, ...(g.view ? { view: true } : {}) };
}
/** Names the equations of a block that are projections of its component's props, in whatever order they are written. */
export function bindGiven(decls: Decl[], look: (n: string) => Given | undefined, set: (n: string, g: Given) => void) {
  for (let more = true; more;) { more = false; for (const d of decls) if (d.k === "eq" && !d.deferred && !d.key && !look(d.name)?.held && !look(d.name)?.props) { const g = given(d.e, look); if (g?.held || g?.props) { set(d.name, g); more = true; } } }
}
/** The fields typed `View` of a component's props type: written out, or a type of the module (`type P = …`, `interface P`). */
export function viewFields(t: string | undefined, decls: Decl[], depth = 0): Set<string> {
  const out = new Set<string>(); if (t === undefined || depth > 8) return out;
  const alts = splitTop(t, "|").map(x => x.trim()).filter(Boolean);   // a union of records: a field that is a view in one of them is one
  if (alts.length > 1) { for (const a of alts) for (const f of viewFields(a, decls, depth + 1)) out.add(f); return out; }
  for (const part of splitTop(t, "&").map(x => x.trim())) {
    if (part.startsWith("{") && part.endsWith("}")) { for (const f of splitTop(part.slice(1, -1), ",;\n")) { const i = f.indexOf(":"); if (i > 0 && isViewType(f.slice(i + 1))) out.add(fieldName(f.slice(0, i))); } continue; }
    const d = decls.find(x => x.k === "typedecl" && x.name === /^\w+/.exec(part)?.[0]);
    const body = d?.k === "typedecl" ? /^(?:type\s[^=]*=|interface\s[^{]*(?={))([^]*)$/.exec((d.text ?? "").replace(/^export\s+/, ""))?.[1] : undefined;
    for (const f of viewFields(body?.trim().replace(/;$/, ""), decls, depth + 1)) out.add(f);
  }
  return out;
}

/** The fields declared `View` of a component's props, where its type is read: written out, a type of the module, one
 *  imported from `.rx`. One classification for the checkers, the interpreter, the oracle and the compiled module. */
export function viewsOf(propsType: string | undefined, types: Types, decls: Decl[] = []): Set<string> {
  if (propsType === undefined) return new Set();
  const out = viewFields(propsType, decls);
  for (const f of viewFields(expandType(propsType, types), [])) out.add(f);
  return out;
}
/** The same of every component of a program, for the runners. */
export function viewsAll(set: ModuleSet): Map<unknown, Set<string>> {
  const out = new Map<unknown, Set<string>>();
  for (const [path, p] of set.programs) {
    const mine = p.decls.filter(d => d.k === "typedecl");
    const walk = (x: unknown): void => { if (!x || typeof x !== "object") return; const o = x as { k?: string; propsType?: string }; if (o.k === "component" && "props" in o) out.set(o, viewsOf(o.propsType, typesOf(set, path), mine)); Object.values(x).forEach(walk); };
    walk(p.decls); walk(p.view);
  }
  return out;
}
/** A type that is read and is a value's, with no view in it: `number`, `string | undefined`, `"a" | "b"`. */
export function valueType(t: string): boolean { return splitTop(t, "|").every(a => /^(string|number|boolean|bigint|null|undefined|true|false|-?\d[\d.]*|"[^"]*"|'[^']*')$/.test(a.trim())); }
/** What a component's prop is declared: a view (`true`), a value's type that is read (`false`), or not known. */
export function takesView(propsType: string | undefined, types: Types, field: string): boolean | undefined {
  if (propsType === undefined) return undefined;
  const t = fieldType(expandType(propsType, types), field); if (!t) return undefined;
  return /\bView\b/.test(t.type) ? true : valueType(t.type) ? false : undefined;
}

/** RG-4c: a view a component takes and shows: a field of its props declared a function giving a `View`, of one parameter or
 *  none, which its view shows as `<props.f … />`. `mixed`: `children` declared `View | ((s: T) => View)` take plain content as well.
 *  `param`: the parameter's type. */
export type Shown = { optional: boolean; mixed: boolean; param?: string };
export function shown(d: { props: string; propsType?: string; decls: Decl[]; view: Markup[] }, types: Types): Map<string, Shown> {
  const out = new Map<string, Shown>(); const fields = d.propsType === undefined ? new Set<string>() : shownFields(d); if (!fields.size) return out;
  const text = expandType(d.propsType!, types);
  for (const f of fields) { const t = fieldType(text, f), v = t && viewType(t.type); if (v && f !== "ref" && (!v.mixed || f === "children")) out.set(f, { optional: t.optional, ...v }); }
  return out;
}
/** The same of every component of a program, for the runners. */
export function shownAll(set: ModuleSet): Map<unknown, Map<string, Shown>> {
  const out = new Map<unknown, Map<string, Shown>>();
  for (const [path, p] of set.programs) {
    const walk = (x: unknown): void => { if (!x || typeof x !== "object") return; const o = x as { k?: string }; if (o.k === "component" && "propsType" in o) out.set(o, shown(o as never, typesOf(set, path))); Object.values(x).forEach(walk); };
    walk(p.decls); walk(p.view);
  }
  return out;
}
/** The types a module names, its own and those it imports from `.rx` modules: what each stands for, in no name of a module. */
export type Types = Map<string, string>;
const typesMemo = new WeakMap<ModuleSet, Map<string, Types>>();
export function typesOf(set: ModuleSet | undefined, path: string): Types {
  if (!set) return new Map();
  let memo = typesMemo.get(set); if (!memo) typesMemo.set(set, memo = new Map());
  const done = memo.get(path); if (done) return done;
  const named = (path: string, name: string, busy: string[]): string | undefined => {
    const at = `${path}#${name}`; if (busy.includes(at) || busy.length > 8) return undefined;   // a type that names itself is read as far as its name
    for (const d of set.programs.get(path)?.decls ?? []) {
      if (d.k === "typedecl" && d.name === name) {
        const text = (d.text ?? "").replace(/^export\s+/, ""); let body: string | undefined;
        if (text.startsWith("interface")) { const i = text.indexOf("{"); if (i < 0) return undefined; body = text.slice(i); }
        else { const i = text.indexOf("="); if (i < 0) return undefined; body = text.slice(i + 1).trim().replace(/;$/, ""); }
        return expand(body, n => named(path, n, [...busy, at]));
      }
      if (d.k === "import" && d.resolved) { const n = d.names.find(n => n.alias === name); if (n) { if (set.programs.has(d.resolved)) return named(d.resolved, n.name, busy); const x = set.signatures?.get(d.resolved)?.exports.get(n.name); return x?.kind === "type" ? x.text : undefined; } }   // MO-9: a signature says what it stands for
    }
    return undefined;
  };
  const out: Types = new Map();
  for (const d of set.programs.get(path)?.decls ?? []) for (const n of d.k === "typedecl" ? [d.name] : d.k === "import" && d.resolved ? d.names.map(n => n.alias) : []) { const t = named(path, n, []); if (t !== undefined) out.set(n, t); }
  memo.set(path, out); return out;
}
/** A type with what its names stand for written out: records, lists, unions, a function's parameters and what it answers; a name it does not know is left. */
export const expandType = (t: string, types: Types) => expand(t, n => types.get(n));
function expand(t: string, named: (n: string) => string | undefined, depth = 0): string {
  t = t.trim(); if (depth > 8 || t.length > 4000) return t;
  const go = (x: string) => expand(x, named, depth + 1);
  if (t.startsWith("(")) {
    const end = closes(t, 0);
    if (end !== undefined) {
      const r = t.slice(end).trim();
      if (r.startsWith("=>")) return `(${splitTop(t.slice(1, end - 1), ",").filter(p => p.trim()).map(p => { const i = p.indexOf(":"); return i >= 0 && !/[{[]/.test(p.slice(0, i)) ? `${p.slice(0, i).trim()}: ${go(p.slice(i + 1))}` : p.trim(); }).join(", ")}) => ${go(r.slice(2))}`;
      if (end === t.length) return `(${go(t.slice(1, -1))})`;
    }
  }
  for (const sep of ["|", "&"]) {
    const parts = splitTop(t, sep).filter(x => x.trim()); if (parts.length < 2) continue;
    const xs = parts.map(go);
    if (sep === "&" && xs.every(x => x.startsWith("{") && closes(x, 0) === x.length)) return `{ ${xs.map(x => x.slice(1, -1).trim().replace(/[,;]+$/, "")).filter(Boolean).join("; ")} }`;
    return xs.join(` ${sep} `);
  }
  if (t.startsWith("readonly ")) return `readonly ${go(t.slice(9))}`;
  if (t.endsWith("[]")) { const x = go(t.slice(0, -2)); return /[|&]|=>/.test(x) ? `(${x})[]` : `${x}[]`; }
  for (const w of ["Array", "ReadonlyArray"]) if (t.startsWith(`${w}<`) && t.endsWith(">")) return `${w}<${go(t.slice(w.length + 1, -1))}>`;
  if (t.startsWith("{") && t.endsWith("}")) {
    const fields = splitTop(t.slice(1, -1), ",;\n").filter(f => f.trim()).map(f => { const i = f.indexOf(":"); return i >= 0 && !/[([]/.test(f.slice(0, i)) ? `${f.slice(0, i).trim()}: ${go(f.slice(i + 1))}` : f.trim(); });
    return fields.length ? `{ ${fields.join("; ")} }` : "{}";
  }
  return (/^[A-Za-z_$][\w$]*$/.test(t) ? named(t) : undefined) ?? t;
}
/** `<props.f … />`: the name of the props, and the field. */
export const shownIn = (tag: string): [string, string] | undefined => { const m = /^([a-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/.exec(tag); return m ? [m[1], m[2]] : undefined; };
/** The fields of its props a component shows so, whatever their types say. */
export function shownFields(d: { props: string; decls: Decl[]; view: Markup[] }): Set<string> {
  const out = new Set<string>();
  const walk = (x: unknown): void => {
    if (!x || typeof x !== "object") return;
    const o = x as { k?: string; tag?: string }; const t = o.k === "el" && o.tag ? shownIn(o.tag) : undefined;
    if (t?.[0] === d.props) out.add(t[1]);
    Object.values(x).forEach(walk);
  };
  if (/^[a-z_$]/.test(d.props)) walk([...d.decls, ...d.view]);
  return out;
}
/** A field of a record type written out: its type, and whether it is optional. In two records of an intersection, it is neither's. */
function fieldType(t: string, field: string): { type: string; optional: boolean } | undefined {
  const found: { type: string; optional: boolean }[] = [];
  for (const part of splitTop(t, "&").map(x => x.trim())) if (part.startsWith("{") && part.endsWith("}"))
    for (const f of splitTop(part.slice(1, -1), ",;\n")) { const i = f.indexOf(":"); if (i > 0 && fieldName(f.slice(0, i)) === field) found.push({ type: f.slice(i + 1).trim(), optional: f.slice(0, i).trim().endsWith("?") }); }
  return found.length === 1 ? found[0] : undefined;
}
/** `(s: T) => View`, `() => View`; `View | ((s: T) => View)`, either way round. */
function viewType(t: string): { mixed: boolean; param?: string } | undefined {
  const alts = splitTop(t, "|").map(x => x.trim());
  if (alts.length === 2) {
    const i = alts.indexOf("View"), f = alts[1 - i];
    if (i < 0 || !f.startsWith("(") || closes(f, 0) !== f.length) return undefined;
    const v = viewType(f.slice(1, -1)); return v && !v.mixed ? { ...v, mixed: true } : undefined;
  }
  t = t.trim(); if (!t.startsWith("(")) return undefined;
  const end = closes(t, 0); if (end === undefined || !/^\s*=>\s*View$/.test(t.slice(end))) return undefined;
  const ps = splitTop(t.slice(1, end - 1), ",").map(x => x.trim()).filter(Boolean);
  if (!ps.length) return { mixed: false };
  const m = ps.length === 1 ? /^[A-Za-z_$][\w$]*\s*:\s*([^]+)$/.exec(ps[0]) : null;
  return m ? { mixed: false, param: m[1].trim() } : undefined;
}
/** What names a view a component shows (`fields`) anywhere but where it is shown or asked for (`if props.f`, which plain
 *  content as well is not): the field, and its statement's line. A projection that takes it out of a rest
 *  (`{ children: none, ...rest } = props`) and is not named again is none. */
export function otherMention(d: { props: string; decls: Decl[]; view: Markup[] }, fields: Map<string, Shown>): { field: string; line: number } | undefined {
  const P = d.props, all = [...d.decls, ...d.view]; let found: { field: string; line: number } | undefined;
  const of = (e: unknown): string | undefined => { const x = e as Expr; return x.k === "member" && x.o.k === "id" && x.o.name === P && fields.has(x.p) ? x.p : undefined; };
  const out = new Set<unknown>(d.decls.filter(x => x.k === "eq" && of(x.e) !== undefined && !mentions(all, x.name)));
  const walk = (x: unknown, line: number): void => {
    if (!x || typeof x !== "object" || found || out.has(x)) return;
    if (Array.isArray(x)) { for (const y of x) walk(y, line); return; }
    const o = x as Record<string, unknown>; if (typeof o.line === "number") line = o.line;
    if (o.k === "member" && (o.o as Expr).k === "id" && (o.o as { name: string }).name === P) { if (fields.has(o.p as string)) found = { field: o.p as string, line }; return; }
    if (o.k === "omit" && (o.e as Expr).k === "id" && (o.e as { name: string }).name === P && [...fields.keys()].every(f => (o.keys as string[]).includes(f))) return;
    if ((o.k === "id" || o.k === "pre") && o.name === P) { found = { field: [...fields.keys()][0], line }; return; }
    for (const [k, v] of Object.entries(o)) { const f = o.k === "mif" && k === "c" ? of(v) : undefined; if (f === undefined || fields.get(f)!.mixed) walk(v, line); }
  };
  walk(all, 0);
  return found;
}
function mentions(x: unknown, name: string): boolean {
  if (!x || typeof x !== "object") return false;
  const o = x as { k?: string; name?: string; tag?: string };
  return ((o.k === "id" || o.k === "pre") && o.name === name) || (o.k === "el" && typeof o.tag === "string" && (o.tag === name || o.tag.startsWith(`${name}.`))) || Object.values(x).some(y => mentions(y, name));
}

/** RG-4c: what a component does with the views it is given: the props declared `View` where its type is read (`viewsOf`),
 *  its children among them. A view is only shown: `{props.children}` in the component's view, also under a default
 *  (`props.children ?? e`) or a choice (`c ? props.children : e`); given on, as content or as an argument of another
 *  component that takes a view there, or in a spread of the props; named again by a projection of the props; asked
 *  whether it was given (`if props.children`, `!`, `== undefined`).
 *  A name is the binding it is written under: a parameter, a loop's item, a local or an equation of an inner block of
 *  the same spelling is another name. `bad`: every other mention, in the order of the text. `kids`: the readers that
 *  show a view. `skip`: the fields the component shows as `<props.f … />`, which have their own rule (`otherMention`).
 *  `dest`: what the prop `attr` of `<tag>` is declared (`takesView`). */
export type ViewUses = { kids: Set<unknown>; bad: { field: string; line: number; how: string; of?: string }[]; /** each reader that shows a view, each argument and each content that gives one on: the props it is of (a choice names several) */ at: Map<unknown, string[]> };
/** What refuses a view read as a value, and the way that is accepted, by what read it (`how`). */
export function viewNotShown(comp: string, props: string, field: string, how: string, of = ""): string {
  const v = field === "props" || field === "view" ? `${props}.children` : `${props}.${field}`;
  if (field === "props") return `${comp} is given views in ${props} (${of}), and gives ${props} whole to what is no component: a view is only shown — take them out first, \`{ ${of}, ...rest } = ${props}\`, and show each (\`{${of.split(", ")[0]}}\`)`;
  const tail: Record<string, string> = {
    peek: `\`peek\` keeps nothing of it — show it where it goes, \`{${v}}\`: each place it is shown has its own, made there`,
    source: `a source does not hold it — show it, \`{${v}}\`; to show it later, keep a source that says when: \`{if open { {${v}} }}\``,
    effect: `an effect cannot watch it — whether one was given is \`${v} != undefined\``,
    handler: `a handler or an action cannot read it — write a source there and show it under that: \`{if open { {${v}} }}\``,
    closure: `a closure that answers it is not shown — show \`{${v}}\` there, or give it on as an argument typed \`View\`: \`<Q part={${v}} />\``,
    record: `a record does not hold it — give each on as an argument typed \`View\`: \`<Q header={…} footer={…} />\``,
    list: `a list does not hold it — write them one after the other: \`{${v}}{…}\``,
    context: `a context does not carry it — give it on as an argument typed \`View\` of the component that shows it (\`<Q part={${v}} />\`), or let what is shown elsewhere be shown by a \`portal to(…)\` where it is written`,
    argument: `a fn does not take it — a component does: \`<Q part={${v}} />\``,
    prop: `${of} takes a value, not a view — give it on to a prop typed \`View\`, or show it: \`{${v}}\``,
    value: `it is not read as a value (compared, written out, computed with, kept from one instant to the next) — \`{${v}}\` shows it, \`${v} != undefined\` asks whether one was given`,
  };
  return `${comp} is given a view, ${field === "view" ? "a prop typed View" : field}, and a view is only shown: ${tail[how] ?? tail.value}`;
}
export function viewUses(d: { props: string; propsType?: string; decls: Decl[]; view: Markup[] }, types: Types, skip: Set<string> = new Set(), dest?: (tag: string, attr: string) => boolean | undefined): ViewUses {
  const kids = new Set<unknown>(), bad: ViewUses["bad"] = [], places = new Map<unknown, string[]>();
  const views = new Set([...viewsOf(d.propsType, types)].filter(f => !skip.has(f)));
  type Sc = { names: Map<string, Given | null>; up: Sc | null; fields?: Map<string, string[]> };   // fields: the props a name of this block stands for   // null: a name of this block that is no view
  const sub = (up: Sc, ...ns: (string | undefined)[]): Sc => { const s: Sc = { names: new Map(), up }; for (const n of ns) if (n) s.names.set(n, null); return s; };
  const look = (sc: Sc) => (n: string): Given | undefined => { for (let s: Sc | null = sc; s; s = s.up) if (s.names.has(n)) return s.names.get(n) ?? undefined; return undefined; };
  const view = (e: Expr, sc: Sc): Given | undefined => { const g = given(e, look(sc)); return g?.held && g.view ? g : undefined; };
  const form = (e: Expr, sc: Sc): boolean => (e.k === "id" || e.k === "member") && !!view(e, sc);
  const left = (e: Expr, sc: Sc): string[] => { const p = given(e, look(sc))?.props; return p ? [...p.views].filter(v => !p.less.includes(v)).sort() : []; };
  const nothing = (e: Expr): boolean => e.k === "lit" && e.v == null;
  const near = (how: string, k: string): string => how === "handler" || how === "effect" ? how : k;   // what reads it: the nearest, but a handler's or an effect's body whatever is in it
  const hit = (field: string, line: number, how: string, of?: string): void => { bad.push({ field, line, how, ...(of ? { of } : {}) }); };
  /** The view an expression shows, if it does: itself, an arm of a choice or of a default. */
  const shows = (e: Expr, sc: Sc): string | undefined => {
    if (e.k === "id") return view(e, sc)?.held;
    if (e.k === "member") return view(e, sc) ? e.p : undefined;
    if (e.k === "if") return shows(e.t, sc) ?? shows(e.f, sc);
    if (e.k === "bin" && (e.op === "??" || e.op === "||" || e.op === "&&")) return shows(e.l, sc) ?? shows(e.r, sc);
    return undefined;
  };
  /** Every prop an expression shows. */
  const fields = (e: Expr, sc: Sc): string[] => {
    if (e.k === "id" || e.k === "member") { const g = view(e, sc); if (!g) return []; if (e.k === "member") return [e.p]; for (let s: Sc | null = sc; s; s = s.up) if (s.names.has(e.name)) return s.fields?.get(e.name) ?? (g.field ? [g.field] : []); return []; }
    if (e.k === "if") return [...fields(e.t, sc), ...fields(e.f, sc)];
    if (e.k === "bin" && e.op === "&&") return fields(e.r, sc);   // the left is asked: what it is where it was not given is nothing, placed nowhere
    if (e.k === "bin" && (e.op === "??" || e.op === "||")) return [...fields(e.l, sc), ...fields(e.r, sc)];
    return [];
  };
  const declared = (x: Decl): string[] => x.k === "import" ? x.names.map(n => n.alias) : x.k === "effect" || x.k === "provide" ? [] : [x.name];
  const block = (ds: Decl[], up: Sc): Sc => {
    const sc = sub(up); for (const x of ds) for (const n of declared(x)) sc.names.set(n, null);
    bindGiven(ds, look(sc), (n, g) => { sc.names.set(n, g); });
    for (let more = true; more;) { more = false; for (const x of ds) if (x.k === "eq" && sc.names.get(x.name)?.held) { const fs = [...new Set(fields(x.e, sc))], was = sc.fields?.get(x.name); if (fs.length !== (was?.length ?? 0)) { (sc.fields ??= new Map()).set(x.name, fs); more = true; } } }
    return sc;
  };
  const plain = (x: Expr | Expr[] | undefined, sc: Sc, line: number, how: string): void => {
    if (!x) return;
    if (Array.isArray(x)) { for (const y of x) plain(y, sc, line, how); return; }
    const e = x;
    switch (e.k) {
      case "id": { const g = look(sc)(e.name); if (g?.held && g.view) hit(g.held, line, how); else if (g?.props) { const l = left(e, sc); if (l.length) hit("props", line, how, l.join(", ")); } return; }
      case "pre": plain({ k: "id", name: e.name }, sc, line, how); plain(e.init, sc, line, how); return;   // what it was an instant ago is a value
      case "member": if (view(e, sc)) { hit(e.p, line, how); return; } if (given(e.o, look(sc))?.props) return; plain(e.o, sc, line, how); return;
      case "omit": if (given(e.e, look(sc))?.props) { const l = left(e, sc); if (l.length) hit("props", line, how, l.join(", ")); return; } plain(e.e, sc, line, how); return;
      // whether one was given is a value like another, wherever it is asked
      case "un": if (e.op === "!" && form(e.e, sc)) return; plain(e.e, sc, line, how); return;
      case "bin":
        if (/^[!=]==?$/.test(e.op) && form(e.l, sc) && nothing(e.r)) return;
        if (!(e.op === "&&" && form(e.l, sc))) plain(e.l, sc, line, how);
        plain(e.r, sc, line, how); return;
      case "if": if (!form(e.c, sc)) plain(e.c, sc, line, how); plain(e.t, sc, line, how); plain(e.f, sc, line, how); return;
      case "peek": plain(e.e, sc, line, near(how, "peek")); return;
      case "await": plain(e.e, sc, line, how); plain(e.init, sc, line, how); return;
      case "latest": case "pending": case "spread": case "throw": plain(e.e, sc, line, how); return;
      case "tpl": for (const p of e.parts) if (typeof p !== "string") plain(p, sc, line, how); return;
      case "index": plain(e.o, sc, line, how); plain(e.i, sc, line, how); return;
      case "call": plain(e.f, sc, line, near(how, "argument")); plain(e.args, sc, line, near(how, "argument")); return;
      case "arr": plain(e.items, sc, line, near(how, "list")); return;
      case "rec": for (const f of e.fields) plain("spread" in f ? f.spread : f.v, sc, line, near(how, "record")); return;
      case "fn": { const inner = sub(sc, ...e.params); if (e.stmts) stmts(e.stmts, inner, line, near(how, "handler")); else plain(e.body, inner, line, near(how, "closure")); return; }
      case "draft": plain(e.seed, sc, line, how); stmts(e.body, sub(sc, "d"), line, how); return;
      case "catch": plain(e.e, sc, line, how); plain(e.alt, sub(sc, e.name), line, how); return;
      case "serverfn": stmts(e.body, sub(sc, ...e.params), line, near(how, "handler")); return;
      default: return;   // lit, use, stylemap
    }
  };
  /** A condition: a view in it is asked for. */
  const test = (c: Expr, sc: Sc, line: number, how = "value"): void => {
    if (form(c, sc)) return;
    if (c.k === "un" && c.op === "!") return test(c.e, sc, line, how);
    if (c.k === "bin" && (c.op === "&&" || c.op === "||")) { test(c.l, sc, line, how); test(c.r, sc, line, how); return; }
    plain(c, sc, line, how);
  };
  /** What is shown, given on or named again: a view, or a choice or a default whose every arm is one or a value. */
  const ve = (e: Expr, sc: Sc, line: number, how = "value"): void => {
    if (form(e, sc)) return;
    if (e.k === "if") { test(e.c, sc, line, how); ve(e.t, sc, line, how); ve(e.f, sc, line, how); return; }
    if (e.k === "bin" && (e.op === "??" || e.op === "||")) { ve(e.l, sc, line, how); ve(e.r, sc, line, how); return; }
    if (e.k === "bin" && e.op === "&&") { test(e.l, sc, line, how); ve(e.r, sc, line, how); return; }
    plain(e, sc, line, how);
  };
  const stmts = (ss: Stmt[], up: Sc, line: number, how: string): void => {
    const sc = sub(up);
    for (const s of ss) {
      const at = s.line || line;
      switch (s.k) {
        case "let": plain(s.e, sc, at, how); sc.names.set(s.name, null); break;
        case "write": case "optimistic": for (const p of s.target.path) if (typeof p !== "string") plain(p, sc, at, how); plain(s.e, sc, at, near(how, "source")); break;
        case "expr": case "throw": plain(s.e, sc, at, how); break;
        case "return": plain(s.e, sc, at, how); break;
        case "action": stmts(s.body, sc, at, near(how, "handler")); break;
        case "sif": test(s.c, sc, at, how); stmts(s.t, sc, at, how); stmts(s.f, sc, at, how); break;
        case "for": plain(s.e, sc, at, how); stmts(s.body, sub(sc, s.name), at, how); break;
        case "try": stmts(s.body, sc, at, how); if (s.handler) stmts(s.handler, sub(sc, s.catchName), at, how); if (s.fin) stmts(s.fin, sc, at, how); break;
        default: break;   // refresh, affects
      }
    }
  };
  const dk = (ds: Decl[], sc: Sc, line: number, how = "value"): void => { for (const x of ds) {
    const at = x.line || line;
    switch (x.k) {
      case "eq": if (sc.names.get(x.name)) { if (!given(x.e, look(sc))?.props) ve(x.e, sc, at, how); } else plain(x.e, sc, at, how); break;   // a projection: every arm of what it names
      case "source": plain(x.init, sc, at, near(how, "source")); break;
      case "fn": { const b = block(x.decls, sub(sc, ...x.params.map(p => p.name))); dk(x.decls, b, at, near(how, "closure")); plain(x.tail, b, at, near(how, "closure")); break; }
      case "component": { const b = block(x.decls, sub(sc, x.props)); dk(x.decls, b, at, near(how, "closure")); mk(x.view, b, at); break; }
      case "effect": plain(x.inputs, sc, at, "effect"); stmts(x.body, sc, at, "effect"); break;
      case "action": case "server": stmts(x.body, sub(sc, ...x.params), at, near(how, "handler")); break;
      case "provide": plain(x.e, sc, at, near(how, "context")); break;
      case "context": plain(x.dflt, sc, at, how); break;
      case "error": plain(x.msg, sub(sc, ...x.params), at, how); break;
      default: break;   // import, typedecl
    }
  } };
  const inner = (ds: Decl[], ms: Markup[], up: Sc, at: number): void => { const b = block(ds, up); dk(ds, b, at); mk(ms, b, at); };
  const mk = (ms: Markup[], sc: Sc, line: number): void => { for (const m of ms) {
    const at = typeof m.line === "number" ? m.line : line;
    switch (m.k) {
      case "read": ve(m.e, sc, at); if (shows(m.e, sc) !== undefined) { kids.add(m); places.set(m, fields(m.e, sc)); } break;
      case "el": {
        const comp = /^[A-Z]/.test(m.tag) || shownIn(m.tag) !== undefined;
        const to = (attr: string, e: Expr, key: unknown): void => { const f = shows(e, sc); if (f === undefined) return; places.set(key, fields(e, sc)); if (dest?.(m.tag, attr) === false) hit(f, at, "prop", `${attr} of <${m.tag}>`); };
        for (const a of m.attrs) {
          const handler = /^on[A-Z:]/.test(a.name);
          if (a.name === "..." && comp && given(a.e, look(sc))?.props) {                              // a spread gives each on under its own name
            places.set(a, left(a.e, sc));
            const later = new Set(m.attrs.slice(m.attrs.indexOf(a) + 1).map(x => x.name));
            for (const f of left(a.e, sc)) if (!later.has(f) && !(f === "children" && m.children.some(x => x.k !== "text" || x.s.trim())) && dest?.(m.tag, f) === false) hit(f, at, "prop", `${f} of <${m.tag}>`);
          }
          if (a.name === "...") { if (!given(a.e, look(sc))?.props || (!comp && left(a.e, sc).includes("children") && !m.children.some(x => x.k !== "text" || x.s.trim()))) plain(a.e, sc, at, "value"); }   // a spread of the props gives the views on to a component; an element with no content of its own would be given the children, which one runner shows and another does not
          else if (comp && !handler && a.name !== "ref") { ve(a.e, sc, at); to(a.name, a.e, a); }
          else plain(a.e, sc, at, handler ? "handler" : "value");
        }
        if (comp) { const c = m.children.filter(x => x.k !== "text" || x.s.trim()); if (c.length === 1 && c[0].k === "read") to("children", c[0].e, m); }
        mk(m.children, sc, at); break;
      }
      case "mif": test(m.c, sc, at); inner(m.tDecls, m.t, sc, at); inner(m.fDecls, m.f, sc, at); break;
      case "mfor": plain(m.xs, sc, at, "value"); inner(m.decls, m.body, sub(sc, m.name), at); break;
      case "mview": inner(m.decls, m.body, sub(sc, ...m.params), at); break;
      case "loading": plain(m.on, sc, at, "value"); mk(m.fallback, sc, at); inner(m.decls, m.body, sc, at); break;
      case "errored": mk(m.fallback, sub(sc, m.errName), at); inner(m.decls, m.body, sc, at); break;
      case "portal": plain(m.to, sc, at, "value"); inner(m.decls, m.body, sc, at); break;
      default: break;
    }
  } };
  inner(d.decls, d.view, { names: new Map([[d.props, { props: { less: [], views } }]]), up: null }, 0);
  return { kids, bad, at: places };
}
/** The readers that show a component's children, of every component of a program: for the interpreter. */
export function heldReads(set: ModuleSet): Set<unknown> {
  const out = new Set<unknown>(), all = shownAll(set);
  for (const [path, p] of set.programs) {
    const walk = (x: unknown): void => { if (!x || typeof x !== "object") return; const o = x as { k?: string }; if (o.k === "component" && "props" in o) for (const m of viewUses(o as never, typesOf(set, path), new Set(all.get(o)?.keys() ?? [])).kids) out.add(m); Object.values(x).forEach(walk); };
    walk(p.decls); walk(p.view);
  }
  return out;
}
