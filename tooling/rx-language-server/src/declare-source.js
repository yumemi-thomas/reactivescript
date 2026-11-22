// MO-8n: what a library's original TypeScript source shows of the words its types cannot (`rx-declare --source`).
// A declaration's types come from the package's `.d.ts` (src/declare.js); whether a callback is called inside a
// computation, which context a hook reads, whether a result undoes what the call did — none of that is in a type, and
// all of it is in the source. This reads the source the package was built from (`locate`: a checkout the person names,
// the `src/` the package publishes, or the sources its source maps carry), finds each export's implementation and
// follows what it does with its parameters (`analyze`), and answers with evidence: a word, the place it would go, the
// API that gives the reason, and the file and line. The evidence is a suggestion: `rx-declare` writes it as a comment
// above the row and never as the row (a word is the declaration's assertion, 09 MO-8b, and a person's to make).
//
// The analysis reads syntax, not types: an import's module and name, a function's parameters, where a name is used. It
// follows a callback through the library's own helpers and stops at another package's function (`given to <package>`),
// which is the honest end of what one package's source says. Nothing here names a library (08 CN-8): the facts are
// Solid's API and the platform's (what `createMemo` does with its function, what `addEventListener` does with its
// listener), and they mean the same for every library that calls them.
const fs = require("node:fs");
const path = require("node:path");

// ---- where the source is ----

const isSource = f => /\.(ts|tsx|mts|cts)$/.test(f) && !/\.d\.[cm]?ts$/.test(f) && !/(^|\/)(__tests__|tests?|__mocks__)\//.test(f) && !/\.(test|spec|test-d|bench|stories)\.[cm]?tsx?$/.test(f);
function walk(dir, keep, out = [], depth = 0) {
  let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of es) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === "dist" || e.name === "build") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (depth < 12) walk(p, keep, out, depth + 1); } else if (keep(p)) out.push(p);
  }
  return out;
}
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return undefined; } };
const packageName = spec => spec.startsWith(".") || spec.startsWith("/") ? undefined : spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
/** The directory of the package a file belongs to: the nearest one whose package.json has `name`. */
function packageDir(file, name) {
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    const pj = readJson(path.join(dir, "package.json"));
    if (pj && (!name || pj.name === name)) return dir;
    if (path.dirname(dir) === dir) return undefined;
  }
}
/** In a checkout, the folder of the package named `name`: the checkout itself, or a workspace package of it. */
function findPackage(root, name) {
  const queue = [[root, 0]];
  while (queue.length) {
    const [dir, depth] = queue.shift();
    const pj = readJson(path.join(dir, "package.json"));
    if (pj?.name === name) return dir;
    if (depth >= 4) continue;
    let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of es) if (e.isDirectory() && e.name !== "node_modules" && !e.name.startsWith(".")) queue.push([path.join(dir, e.name), depth + 1]);
  }
  return undefined;
}

/** Where the original source of the module `spec` (imported from `from`) is.
 *  `given`: a path the person names — a source file, a package's folder, or a checkout of its repository.
 *  @returns {{ kind: "module" | "checkout" | "published" | "sourcemap" | "none", files: Map<string, string>, root: string,
 *    note: string, installed?: string, version?: string, repository?: string }}
 *  `files`: each source file's path to its text; `root`: what a place is written relative to; `note`: what was found,
 *  in a sentence. `kind`: "module" (a relative module: it is its own source), "checkout" (the folder given),
 *  "published" (the package ships its `src/`), "sourcemap" (its source maps carry the sources' text), "none" (it ships
 *  built files only: the note names the repository and the version to check out). */
function locate(ts, spec, from, given, options = {}) {
  const files = new Map();
  const add = f => { if (!files.has(f)) { try { files.set(f, fs.readFileSync(f, "utf8")); } catch { /* unreadable: left out */ } } };
  const name = packageName(spec);
  const opts = { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, allowJs: true, ...options };
  const resolved = ts.resolveModuleName(spec, path.join(from, "__rx_declare__.ts"), opts, ts.sys).resolvedModule?.resolvedFileName;
  if (!name) {
    // a relative module is its own source: the file the import names, where it is not a declaration
    const base = path.resolve(from, spec);
    const at = [base, ...[".ts", ".tsx", ".js", ".jsx", ".mjs"].map(x => base.replace(/\.[cm]?jsx?$/, "") + x)].find(f => fs.existsSync(f) && fs.statSync(f).isFile() && !/\.d\.[cm]?ts$/.test(f));
    if (at) add(at);
    return { kind: at ? "module" : "none", files, root: from, note: at ? `the module itself (${path.relative(from, at)})` : `no source beside ${spec}` };
  }
  const dir = resolved && (packageDir(resolved, name) ?? packageDir(resolved));
  const pj = dir ? readJson(path.join(dir, "package.json")) : undefined;
  const installed = pj?.version;
  const repo = pj?.repository ? (typeof pj.repository === "string" ? pj.repository : `${String(pj.repository.url ?? "").replace(/^git\+/, "").replace(/\.git$/, "")}${pj.repository.directory ? ` (${pj.repository.directory})` : ""}`) : undefined;
  if (given) {
    const at = path.resolve(from, given);
    if (!fs.existsSync(at)) return { kind: "none", files, root: from, installed, repository: repo, note: `--source ${given}: no such file or folder` };
    if (fs.statSync(at).isFile()) { add(at); for (const f of walk(path.dirname(at), isSource)) add(f); return { kind: "checkout", files, root: path.dirname(at), installed, repository: repo, note: `the file given (${given}) and the sources beside it` }; }
    const pkg = findPackage(at, name) ?? at;
    const src = fs.existsSync(path.join(pkg, "src")) ? path.join(pkg, "src") : pkg;
    for (const f of walk(src, isSource)) add(f);
    const version = readJson(path.join(pkg, "package.json"))?.version;
    const differs = version && installed && version !== installed ? `; the checkout is ${version} and ${installed} is installed: a place may have moved` : "";
    return { kind: files.size ? "checkout" : "none", files, root: pkg, installed, version, repository: repo, note: files.size ? `${files.size} source files of the checkout (${path.relative(at, src) || "."} of ${given})${differs}` : `--source ${given}: no TypeScript source for ${name} there` };
  }
  if (!dir) return { kind: "none", files, root: from, note: `${spec} does not resolve from here` };
  // the source maps beside the files the import resolves to (its declarations', its code's): each names the sources
  // it was built from, which the package may ship (`files: ["src"]`) or carry as text (`sourcesContent`)
  const maps = new Set();
  const beside = d => { let es = []; try { es = fs.readdirSync(d); } catch { /* none */ } for (const e of es) if (/\.map$/.test(e)) maps.add(path.join(d, e)); };
  beside(path.dirname(resolved));
  for (const k of ["main", "module", "types"]) if (typeof pj?.[k] === "string") beside(path.dirname(path.join(dir, pj[k])));
  let carried = 0, shipped = 0;
  for (const m of maps) {
    const j = readJson(m); if (!j || !Array.isArray(j.sources)) continue;
    j.sources.forEach((s, i) => {
      if (typeof s !== "string" || /^(webpack|rolldown|vite|\0)/.test(s)) return;
      const f = path.resolve(path.dirname(m), j.sourceRoot ?? "", s);
      if (!isSource(f) || f.includes(`${path.sep}node_modules${path.sep}`) && !f.startsWith(dir + path.sep)) return;
      if (!f.startsWith(dir + path.sep)) { if (typeof j.sourcesContent?.[i] === "string" && !files.has(f)) { files.set(f, j.sourcesContent[i]); carried++; } return; }   // outside the package: only as carried text
      if (fs.existsSync(f)) { if (!files.has(f)) { add(f); shipped++; } }
      else if (typeof j.sourcesContent?.[i] === "string" && !files.has(f)) { files.set(f, j.sourcesContent[i]); carried++; }
    });
  }
  if (!files.size && fs.existsSync(path.join(dir, "src"))) for (const f of walk(path.join(dir, "src"), isSource)) { add(f); shipped++; }
  if (shipped) { for (const f of walk(path.join(dir, "src"), isSource)) add(f); return { kind: "published", files, root: dir, installed, repository: repo, note: `the src/ ${name}@${installed} publishes (${files.size} files${maps.size ? ", named by its source maps" : ""})` }; }
  if (carried) return { kind: "sourcemap", files, root: dir, installed, repository: repo, note: `the sources ${name}@${installed}'s source maps carry (${carried} files, sourcesContent)` };
  return { kind: "none", files, root: dir, installed, repository: repo, note: `${name}@${installed} publishes built files only (no src/, no source map with its sources): check out ${repo ?? "its repository"} at ${installed} and give the folder, --source <checkout>` };
}

// ---- what the source does ----

const SOLID = /^(solid-js(\/.*)?|@solidjs\/(signals|web|universal))$/;
/** Solid's functions by what they do with a function argument: `tracked` — it is run inside a computation, so what it
 *  reads is followed; `later` — it is run after, outside any computation (an effect's second function, a cleanup). */
const SOLID_ARGS = {
  createMemo: { 0: "tracked" }, createEffect: { 0: "tracked", 1: "later" }, createRenderEffect: { 0: "tracked", 1: "later" }, createTrackedEffect: { 0: "tracked" },
  createComputed: { 0: "tracked" }, createProjection: { 0: "tracked" }, createSignal: { 0: "tracked" }, createStore: { 0: "tracked" }, createAsync: { 0: "tracked" },
  createOptimistic: { 0: "tracked" }, createOptimisticStore: { 0: "tracked" }, createSelector: { 0: "tracked" }, createDeferred: { 0: "tracked" },
  onCleanup: { 0: "later" }, onMount: { 0: "later" }, onSettled: { 0: "later" },
};
/** The platform's: a function given to these is called later, by the browser. */
const LATER_CALLS = { setTimeout: [0], setInterval: [0], queueMicrotask: [0], requestAnimationFrame: [0], requestIdleCallback: [0] };
const LATER_METHODS = { addEventListener: [1], then: [0, 1], catch: [0], finally: [0], subscribe: [0] };
const LATER_NEW = new Set(["ResizeObserver", "MutationObserver", "IntersectionObserver", "PerformanceObserver"]);
/** What makes state or work the owner keeps: a call that reaches one runs once, where it is written (`instantiates`). */
const MAKES = new Set(["createSignal", "createMemo", "createEffect", "createRenderEffect", "createTrackedEffect", "createStore", "createProjection", "createAsync", "createOptimistic", "createOptimisticStore", "createRoot", "onCleanup", "onSettled", "onMount", "createComputed", "createResource"]);
const UNDOES = /^(removeEventListener|clearTimeout|clearInterval|cancelAnimationFrame|cancelIdleCallback|disconnect|unsubscribe|unobserve|dispose|abort|destroy|off|remove)$/;

/** @param {Map<string, string>} files a source file's path → its text  @param {string[]} names the exports to answer for
 *  (a member component as `Dialog.Trigger`: answered by `Trigger`'s, or `DialogTrigger`'s, implementation)
 *  @returns {{ name: string, word: string, on?: string, why: string, file: string, line: number }[]} evidence, by export:
 *  `word` is `tracked`, `handler`, `ref` (a parameter read as an accessor inside a computation), `uses`, `provides`, `instantiates`, `() => void` (its result undoes it) or `called`
 *  (a callback called while the call runs: no word, it is a pure function's); `on`: the parameter, field or context. */
function analyze(ts, files, names, root) {
  const K = ts.SyntaxKind;
  const mods = new Map();
  for (const [f, text] of files) {
    let sf; try { sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, /\.[cm]?tsx$/.test(f) ? ts.ScriptKind.TSX : /\.[cm]?jsx?$/.test(f) ? ts.ScriptKind.JSX : ts.ScriptKind.TS); } catch { continue; }
    const m = { file: f, sf, imports: new Map(), decls: new Map(), exports: new Map(), stars: [], contexts: new Set() };
    const fnOf = e => { while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression?.(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e))) e = e.expression; return e; };
    for (const st of sf.statements) {
      const exported = !!st.modifiers?.some(x => x.kind === K.ExportKeyword);
      if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.importClause && !st.importClause.isTypeOnly) {
        const from = st.moduleSpecifier.text, c = st.importClause;
        if (c.name) m.imports.set(c.name.text, { from, name: "default" });
        if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) m.imports.set(c.namedBindings.name.text, { from, name: "*" });
        if (c.namedBindings && ts.isNamedImports(c.namedBindings)) for (const el of c.namedBindings.elements) if (!el.isTypeOnly) m.imports.set(el.name.text, { from, name: (el.propertyName ?? el.name).text });
      } else if (ts.isFunctionDeclaration(st) && st.name && st.body) { m.decls.set(st.name.text, st); if (exported) m.exports.set(st.modifiers.some(x => x.kind === K.DefaultKeyword) ? "default" : st.name.text, { local: st.name.text }); }
      else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const v = fnOf(d.initializer);
        if (v && (ts.isArrowFunction(v) || ts.isFunctionExpression(v))) m.decls.set(d.name.text, v);
        else if (v && ts.isCallExpression(v) && ts.isIdentifier(v.expression) && v.expression.text === "createContext") m.contexts.add(d.name.text);
        else if (v) m.decls.set(d.name.text, v);   // a value: an object of parts, a wrapped component
        if (exported) m.exports.set(d.name.text, { local: d.name.text });
      } else if (ts.isExportDeclaration(st) && !st.isTypeOnly) {
        const from = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : undefined;
        if (!st.exportClause) { if (from) m.stars.push(from); }
        else if (ts.isNamedExports(st.exportClause)) for (const el of st.exportClause.elements) if (!el.isTypeOnly) m.exports.set(el.name.text, from ? { from, name: (el.propertyName ?? el.name).text } : { local: (el.propertyName ?? el.name).text });
      } else if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) m.exports.set("default", { local: st.expression.text });
    }
    mods.set(f, m);
  }
  const fileOf = (from, spec) => {
    if (!/^\.{1,2}(\/|$)/.test(spec)) return undefined;
    const base = path.resolve(path.dirname(from), spec), bare = base.replace(/\.[cm]?jsx?$/, "");
    return [base, ...[".ts", ".tsx", ".mts", ".js", ".jsx"].flatMap(x => [bare + x, path.join(base, "index" + x)])].find(f => mods.has(f));
  };
  /** An export of a source file, followed through re-exports to the file that declares it. */
  const exportOf = (file, name, seen = new Set()) => {
    const m = mods.get(file); if (!m || seen.has(file + "#" + name)) return undefined; seen.add(file + "#" + name);
    const e = m.exports.get(name);
    if (e?.local) { const i = m.imports.get(e.local); if (i) { const f = fileOf(file, i.from); return f ? exportOf(f, i.name, seen) : { external: i.from, name: i.name }; } return m.decls.has(e.local) || m.contexts.has(e.local) ? { m, name: e.local } : undefined; }
    if (e?.from) { const f = fileOf(file, e.from); return f ? exportOf(f, e.name, seen) : { external: e.from, name: e.name }; }
    for (const s of m.stars) { const f = fileOf(file, s); const r = f && exportOf(f, name, seen); if (r) return r; }
    return undefined;
  };
  /** What a name used in a file is: the library's own declaration (`{ m, name }`), or another package's (`{ external, name }`). */
  const resolve = (m, id) => {
    const i = m.imports.get(id);
    if (i) { const f = fileOf(m.file, i.from); return f ? exportOf(f, i.name) : { external: i.from, name: i.name }; }
    return m.decls.has(id) || m.contexts.has(id) ? { m, name: id } : undefined;
  };
  const place = (m, node) => ({ file: path.relative(root, m.file), line: m.sf.getLineAndCharacterOfPosition(node.getStart(m.sf)).line + 1 });
  const unwrapUp = n => { while (n.parent && (ts.isParenthesizedExpression(n.parent) || ts.isAsExpression(n.parent) || ts.isNonNullExpression(n.parent) || ts.isSatisfiesExpression?.(n.parent))) n = n.parent; return n; };
  const isFnLike = n => ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n);
  const functionOf = v => v && isFnLike(v) ? v : undefined;

  /** Where an argument of a call goes: `{ kind: "tracked" | "later" | "external" | "unknown", api, at }`. */
  function argGoes(m, call, index, depth, seen) {
    const callee = call.expression; const at = place(m, call);
    if (ts.isNewExpression(call)) return ts.isIdentifier(callee) && LATER_NEW.has(callee.text) && index === 0 ? [{ kind: "later", api: `new ${callee.text}`, ...at }] : [{ kind: "unknown", ...at }];
    if (ts.isIdentifier(callee)) {
      const r = resolve(m, callee.text);
      if (!r) return LATER_CALLS[callee.text]?.includes(index) ? [{ kind: "later", api: callee.text, ...at }] : [{ kind: "unknown", ...at }];
      if (r.external) { const k = SOLID.test(r.external) ? SOLID_ARGS[r.name]?.[index] : undefined; return [k ? { kind: k, api: `${r.name}${k === "later" && index === 1 ? "'s effect function" : ""}`, ...at } : { kind: "external", api: `${r.external}'s ${r.name}`, ...at }]; }
      const fn = functionOf(r.m.decls.get(r.name));
      if (!fn || depth > 5) return [{ kind: "unknown", ...at }];
      const p = fn.parameters[index];
      if (!p || p.dotDotDotToken || !ts.isIdentifier(p.name)) return [{ kind: "unknown", ...at }];
      return uses(r.m, fn, n => ts.isIdentifier(n) && n.text === p.name.text, depth + 1, seen);
    }
    if (ts.isPropertyAccessExpression(callee)) {
      if (LATER_METHODS[callee.name.text]?.includes(index)) return [{ kind: "later", api: callee.name.text, ...at }];
      if (ts.isIdentifier(callee.expression)) { const r = resolve(m, callee.expression.text); if (r?.external && r.name === "*" && SOLID.test(r.external)) { const k = SOLID_ARGS[callee.name.text]?.[index]; if (k) return [{ kind: k, api: callee.name.text, ...at }]; } }
    }
    return [{ kind: "unknown", ...at }];
  }
  /** Where a function literal is run from, by where it is written. */
  function literalGoes(m, lit, scope, depth, seen) {
    const top = unwrapUp(lit), up = top.parent;
    if ((ts.isCallExpression(up) || ts.isNewExpression(up)) && up.arguments?.includes(top)) return argGoes(m, up, up.arguments.indexOf(top), depth, seen);
    if (ts.isVariableDeclaration(up) && up.initializer === top && ts.isIdentifier(up.name)) { const n = up.name.text; return uses(m, scope, x => ts.isIdentifier(x) && x.text === n && x !== up.name, depth + 1, seen); }
    if (ts.isReturnStatement(up) || (ts.isArrowFunction(up) && up.body === top)) return [{ kind: "returned", ...place(m, lit) }];
    if (ts.isPropertyAssignment(up) && up.initializer === top && ts.isObjectLiteralExpression(up.parent)) {   // `{ effect: () => cb() }`: with its object
      const obj = unwrapUp(up.parent), ou = obj.parent;
      if ((ts.isCallExpression(ou) || ts.isNewExpression(ou)) && ou.arguments?.includes(obj)) { const g = argGoes(m, ou, ou.arguments.indexOf(obj), depth, seen); return g.map(x => x.kind === "tracked" || x.kind === "later" ? { ...x, kind: "unknown" } : x); }
    }
    return [{ kind: "unknown", ...place(m, lit) }];
  }
  /** Every use of what `is` matches inside `fn`: called (and from where), or given on (and to what). */
  function uses(m, fn, is, depth = 0, seen = new Set()) {
    const key = `${m.file}:${fn.pos}:${is}`; if (seen.has(key) || depth > 6) return []; seen.add(key);
    const out = [];
    const visit = n => {
      if (ts.isTypeNode(n)) return;
      if (is(n) && !(ts.isParameter(n.parent) && n.parent.name === n) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) && !(ts.isPropertyAssignment(n.parent) && n.parent.name === n) && !(ts.isBindingElement(n.parent))) {
        const top = unwrapUp(n), up = top.parent;
        if ((ts.isCallExpression(up) && up.expression === top) || (ts.isCallExpression(up) && ts.isPropertyAccessExpression(up.expression) && up.expression.expression === top && /^(call|apply)$/.test(up.expression.name.text))) {
          let g = up.parent; while (g && g !== fn && !isFnLike(g)) g = g.parent;
          const read = !up.arguments.length;   // called with nothing: read as an accessor
          if (!g || g === fn) out.push({ kind: "called", read, ...place(m, up) });
          else out.push(...literalGoes(m, g, fn, depth, seen).map(x => ({ ...x, read })));
        } else if ((ts.isCallExpression(up) || ts.isNewExpression(up)) && up.arguments?.includes(top)) out.push(...argGoes(m, up, up.arguments.indexOf(top), depth, seen));
        else if (ts.isPropertyAccessExpression(up) && up.expression === top) { /* a field of it: another target's */ }
        else if (ts.isVariableDeclaration(up) && up.initializer === top && ts.isIdentifier(up.name)) { const a = up.name.text; out.push(...uses(m, fn, x => ts.isIdentifier(x) && x.text === a && x !== up.name, depth + 1, seen)); }
        else out.push({ kind: "unknown", ...place(m, n) });
        return;
      }
      ts.forEachChild(n, visit);
    };
    if (fn.body) visit(fn.body);
    return out;
  }

  /** What a function reaches by calling: itself and the library's own functions it calls, a few calls deep. */
  function reach(m, fn, visitCall, depth = 0, seen = new Set()) {
    if (seen.has(fn) || depth > 4) return; seen.add(fn);
    const visit = n => {
      if (ts.isTypeNode(n)) return;
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const r = resolve(m, n.expression.text);
        visitCall(m, n, r, depth);
        if (r?.m) { const g = functionOf(r.m.decls.get(r.name)); if (g) reach(r.m, g, visitCall, depth + 1, seen); }
      }
      if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n))) visitCall(m, n, undefined, depth);
      ts.forEachChild(n, visit);
    };
    if (fn.body) visit(fn.body);
  }

  const out = [];
  const implOf = name => {
    for (const cand of name.includes(".") ? [name.replace(/\./g, ""), name.split(".").pop()] : [name]) {
      for (const m of mods.values()) { const e = m.exports.get(cand); if (e?.local && m.decls.has(e.local)) { let v = m.decls.get(e.local); if (!isFnLike(v) && ts.isCallExpression(v)) v = v.arguments.map(a => a).find(isFnLike) ?? v; if (isFnLike(v)) return { m, fn: v }; } }
    }
    return undefined;
  };
  for (const name of names) {
    const impl = implOf(name); if (!impl) continue;
    const { m, fn } = impl; const push = e => { if (!out.some(x => x.name === name && x.word === e.word && x.on === e.on && x.why === e.why)) out.push({ name, ...e }); };
    // (1) callbacks: each parameter, and each field read of a parameter (an options object, a component's props)
    const targets = [];
    for (const p of fn.parameters) {
      if (ts.isIdentifier(p.name)) {
        const pn = p.name.text; targets.push({ on: pn, is: n => ts.isIdentifier(n) && n.text === pn });
        // what stands for the parameter: itself, and a local made from it (`mergeProps(defaults, props)`, `splitProps(props, …)`)
        const aliases = new Set([pn]);
        const scan = n => { if (ts.isVariableDeclaration(n) && n.initializer && ts.isCallExpression(n.initializer) && n.initializer.arguments.some(a => ts.isIdentifier(a) && aliases.has(a.text))) { if (ts.isIdentifier(n.name)) aliases.add(n.name.text); else if (ts.isArrayBindingPattern(n.name)) for (const el of n.name.elements) if (ts.isBindingElement(el) && ts.isIdentifier(el.name)) aliases.add(el.name.text); } ts.forEachChild(n, scan); };
        if (fn.body) scan(fn.body);
        const fields = new Set();
        const find = n => { if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && aliases.has(n.expression.text) && ts.isIdentifier(n.name)) fields.add(n.name.text); ts.forEachChild(n, find); };
        if (fn.body) find(fn.body);
        for (const f of fields) targets.push({ on: `${pn}.${f}`, is: n => ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && aliases.has(n.expression.text) && n.name.text === f });
      } else if (ts.isObjectBindingPattern(p.name)) for (const el of p.name.elements) if (ts.isIdentifier(el.name)) { const local = el.name.text; targets.push({ on: (el.propertyName ?? el.name).getText(m.sf), is: n => ts.isIdentifier(n) && n.text === local }); }
    }
    for (const t of targets) {
      const found = uses(m, fn, t.is).filter(u => u.kind === "tracked" || u.kind === "later" || u.kind === "called" || u.kind === "external");
      const kinds = new Set(found.map(u => u.kind));
      for (const u of found) {
        if (u.kind === "external" && (kinds.has("tracked") || kinds.has("later") || !/^on[A-Z]|[fF]n$|^(callback|handler|listener|fn|cb)$/.test(t.on.split(".").pop()))) continue;   // a value handed on is no evidence about a callback
        if (u.kind === "called" && /\./.test(t.on) && !/^on[A-Z]|[fF]n$|^(callback|handler|listener|fn|cb|children)$/.test(t.on.split(".").pop())) continue;   // a method of a value it was given (`target.addEventListener(…)`) is not a callback of the row's
        if (u.read && u.kind !== "tracked") continue;   // an accessor read once, or later: nothing a word says
        const word = u.kind === "tracked" ? (u.read ? "ref" : "tracked") : u.kind === "later" ? "handler" : u.kind === "called" ? "called" : "given";
        const why = u.kind === "tracked" ? (u.read ? `read as an accessor inside ${u.api}, a computation` : `called inside ${u.api}, a computation`) : u.kind === "later" ? `called from ${u.api}, after the call and outside any computation` : u.kind === "called" ? "called while the call runs" : `given to ${u.api}: its source is another package's`;
        push({ word, on: t.on, why, file: u.file, line: u.line });
      }
    }
    // (2) contexts read and provided, and state made, by it or by what it calls
    reach(m, fn, (mm, n, r) => {
      if (ts.isCallExpression(n)) {
        if (r?.external && SOLID.test(r.external) && r.name === "useContext" && n.arguments[0]) { const t = n.arguments[0].getText(mm.sf); const c = /^[A-Za-z_$][\w$]*$/.test(t) ? resolve(mm, t) : undefined; if (c?.m?.contexts.has(c.name)) push({ word: "uses", on: t, why: "it reads this context (useContext)", ...place(mm, n) }); }   // a context the library makes: one handed in by a parameter is its caller's
        else if (r?.external && SOLID.test(r.external) && MAKES.has(r.name) && !out.some(x => x.name === name && x.word === "instantiates")) push({ word: "instantiates", why: `it reaches ${r.name}: state or work the owner keeps, made once where the call is written`, ...place(mm, n) });
        else if (r?.external && SOLID.test(r.external) && r.name === "createComponent" && n.arguments[0]) { const t = n.arguments[0].getText(mm.sf).replace(/\.Provider$/, ""); const c = resolve(mm, t); if (c?.m?.contexts.has(c.name)) push({ word: "provides", on: t, why: "it renders this context's provider", ...place(mm, n) }); }
      } else {
        const tag = n.tagName.getText(mm.sf).replace(/\.Provider$/, ""); const c = /^[A-Za-z_$][\w$]*$/.test(tag) ? resolve(mm, tag) : undefined;
        if (c?.m?.contexts.has(c.name)) push({ word: "provides", on: tag, why: "it renders this context's provider", ...place(mm, n) });
      }
    });
    // (3) a result that undoes what the call did: a function handed back whose body removes, clears or disconnects
    const undoes = (mm, e, depth = 0) => {
      e = e && unwrapUp(e); while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e))) e = e.expression;
      if (!e || depth > 3) return undefined;
      if (ts.isIdentifier(e)) { let found; const look = n => { if (!found && ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === e.text && n.initializer) found = n.initializer; if (!found) ts.forEachChild(n, look); }; look(fn.body ?? fn); const r = found ? undefined : resolve(mm, e.text); return found ? undoes(mm, found, depth + 1) : r?.m && functionOf(r.m.decls.get(r.name)) ? undoes(r.m, r.m.decls.get(r.name), depth + 1) : undefined; }
      if (isFnLike(e) && !e.parameters.length) { let hit; const look = n => { if (!hit && ts.isCallExpression(n)) { const c = n.expression; const nm = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : ""; if (UNDOES.test(nm)) hit = { api: nm, ...place(mm, n) }; } if (!hit) ts.forEachChild(n, look); }; if (e.body) look(e.body); return hit; }
      if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) { const r = resolve(mm, e.expression.text); const g = r?.m && functionOf(r.m.decls.get(r.name)); if (g) { let hit; const rets = n => { if (hit) return; if (ts.isReturnStatement(n) && n.expression) hit = undoes(r.m, n.expression, depth + 1); else if (n === g || !isFnLike(n)) ts.forEachChild(n, rets); }; if (ts.isArrowFunction(g) && !ts.isBlock(g.body)) hit = undoes(r.m, g.body, depth + 1); else rets(g); return hit; } }
      return undefined;
    };
    const results = []; const rets = n => { if (ts.isReturnStatement(n) && n.expression) results.push(n.expression); else if (n === fn || !isFnLike(n)) ts.forEachChild(n, rets); };
    if (ts.isArrowFunction(fn) && fn.body && !ts.isBlock(fn.body)) results.push(fn.body); else rets(fn);
    for (const e of results) { const u = undoes(m, e); if (u) { push({ word: "() => void", why: `its result calls ${u.api}: it undoes what the call did, so dropping it leaves that behind (EF-5a)`, file: u.file, line: u.line }); break; } }
  }
  return out;
}

/** The evidence as the draft's comment lines, by export: a suggestion and its place, never a row. */
function notes(evidence) {
  const by = new Map();
  for (const e of evidence) {
    const at = `${e.file}:${e.line}`;
    const text =
      e.word === "tracked" ? `\`${e.on}\`: ${e.why} — \`tracked\`? (MO-10j)` :
      e.word === "ref" ? `\`${e.on}\`: ${e.why} — \`ref\`? (MO-10a)` :
      e.word === "handler" ? `\`${e.on}\`: ${e.why} — \`handler\`? (MO-10g)` :
      e.word === "called" ? `\`${e.on}\`: ${e.why} — no word: an unmarked function type is that (MO-10g)` :
      e.word === "given" ? `\`${e.on}\`: ${e.why}, which says where it is called` :
      e.word === "uses" ? `${e.why}: ${e.on} — uses(<its name>)? (MO-12b)` :
      e.word === "provides" ? `${e.why}: ${e.on} — provides(<its name>)? (MO-12c)` :
      e.word === "instantiates" ? `${e.why} — \`instantiates\`? (MO-10a)` :
      `${e.why} — its result \`() => void\`?`;
    by.set(e.name, [...(by.get(e.name) ?? []), `// SOURCE ${e.name}: ${text} [${at}]`]);
  }
  return by;
}

/** A draft with the source's evidence above each row it is about. */
function annotate(draft, evidence) {
  const by = notes(evidence);
  const name = l => /^export\s+(?:(?:pure|server|client|trusted)\s+)*(?:fn|component|const)\s+([\w$.]+)/.exec(l)?.[1];
  // a suggestion the row already says (a parameter drafted `ref` from its type) is not repeated
  const said = (l, note) => { const m = /^\/\/ SOURCE [\w$.]+: `([\w$]+)`: .* — `ref`\?/.exec(note); return !!m && new RegExp(`\\bref ${m[1].replace(/\$/g, "\\$")}\\b`).test(l); };
  return draft.split("\n").flatMap(l => { const n = name(l); return n && by.has(n) ? [...by.get(n).filter(x => !said(l, x)), l] : [l]; }).join("\n");
}

module.exports = { locate, analyze, notes, annotate };
