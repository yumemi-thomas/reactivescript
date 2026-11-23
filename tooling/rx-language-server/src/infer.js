// MO-8v: words proven from the code that runs. `rx-declare` reads types (src/declare.js), and three of a row's words
// are in no type: `pure`, `handler` on a callback, and what a promise `rejects` with. This reads the JavaScript the
// import resolves to — the app's own module, a library's shipped ESM, every build its export map can hand a bundler —
// with TypeScript's parser, and claims a word only where the code proves it; everything it cannot see through is a
// refusal with its reason and its place (`rx-declare --why`), and the draft is then what it was (io, no `handler`,
// `Error`, the question asked). Nothing here names a library (08 CN-8): the facts are the language's (what `Array`'s
// methods do), the platform's (a timer calls later) and Solid's (an effect's second function runs outside tracking).
//
// The contract of each word (spec/09 MO-8v):
//   pure      the call, and all it schedules outside Solid's owner, only computes: it writes nothing but values it
//             made and Solid nodes it made, reads no time, randomness or environment, reaches no code that is not
//             itself proven, and calls back nothing later. (So an inferred `pure` is deterministic and the same on the
//             server and in the browser: 10 SV-7c's second assertion holds by construction. The word itself asks less
//             — a loader that fetches is `pure` — and that much stays a person's to say.)
//   handler   every call of the callback the code can reach is behind something that calls later, outside any
//             computation: a timer, a listener, an observer, a promise's continuation, an `await` already passed,
//             an effect's second function, a cleanup. One call that is not, or one place the callback goes that the
//             analysis cannot follow to its end, and there is no word.
//   rejects   the classes of every `throw` and rejection the code writes or reaches, where each is a class the module
//             exports. A call into code that is not read, a callback, a thrown value that is no `new C(…)` add `Error`,
//             which is the row's default: then nothing is written. What the engine raises for a bug (a TypeError on
//             `undefined.x`) is a panic (04 R-f-10), not a failure, and is no part of it.
const fs = require("node:fs");
const path = require("node:path");

const INF = 1e9;
/** A table that has only what is written in it (`"toString" in {}` is true of a plain one). */
const T = o => Object.assign(Object.create(null), o);
// ---- the language's own: what a built-in does with its receiver and what it answers ----
/** Methods of Array and String that change nothing. `own`: what the result shares with the receiver — "elem" (an element
 *  of it), "copy" (a new container of its elements), "prim" (a primitive), "same" (may be the receiver's parts: reduce). */
const READ = T({
  map: "fresh", filter: "copy", slice: "copy", concat: "copy", flat: "copy", flatMap: "fresh", toSorted: "copy", toReversed: "copy", toSpliced: "copy", with: "copy",
  find: "elem", findLast: "elem", at: "elem", findIndex: "prim", findLastIndex: "prim", includes: "prim", indexOf: "prim", lastIndexOf: "prim", join: "prim", some: "prim", every: "prim",
  reduce: "same", reduceRight: "same", forEach: "prim", keys: "copy", values: "copy", entries: "copy2",
  // String's (a string shares nothing)
  trim: "prim", trimStart: "prim", trimEnd: "prim", split: "prim", replace: "prim", replaceAll: "prim", toLowerCase: "prim", toUpperCase: "prim", startsWith: "prim", endsWith: "prim", padStart: "prim", padEnd: "prim",
  charAt: "prim", charCodeAt: "prim", codePointAt: "prim", substring: "prim", substr: "prim", repeat: "prim", match: "prim", matchAll: "prim", search: "prim", normalize: "prim", toString: "prim", valueOf: "same",
  toFixed: "prim", toPrecision: "prim", test: "prim", exec: "prim", hasOwnProperty: "prim",
  // a promise's
  then: "same", catch: "same", finally: "same",
});
const CALLBACK_SYNC = new Set(["map", "filter", "flatMap", "find", "findLast", "findIndex", "findLastIndex", "some", "every", "reduce", "reduceRight", "forEach", "toSorted", "replace", "replaceAll", "sort"]);
const PROMISE_LATER = new Set(["then", "catch", "finally"]);
/** What changes its receiver, by the kind of thing that has it. */
const MUTATE = T({ array: new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin"]), map: new Set(["set", "delete", "clear"]), set: new Set(["add", "delete", "clear"]) });
const MUTATORS = new Set([...MUTATE.array, ...MUTATE.map, ...MUTATE.set]);
const KIND_READ = T({ map: T({ get: "elem", has: "prim", keys: "copy", values: "copy", entries: "copy2", forEach: "prim" }), set: T({ has: "prim", keys: "copy", values: "copy", entries: "copy2", forEach: "prim" }) });
/** Globals that only compute. `Date` and `Intl` are not here: a date is the clock's or the time zone's, a format the locale's. */
const GLOBAL_VALUES = new Set(["undefined", "NaN", "Infinity", "Math", "JSON", "Object", "Array", "String", "Number", "Boolean", "BigInt", "Symbol", "Map", "Set", "WeakMap", "WeakSet", "Promise", "RegExp",
  "Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "EvalError", "URIError", "AggregateError", "URL", "URLSearchParams", "Reflect", "arguments"]);
const GLOBAL_FNS = T({ parseInt: "prim", parseFloat: "prim", isNaN: "prim", isFinite: "prim", String: "prim", Number: "prim", Boolean: "prim", BigInt: "prim", Symbol: "prim", encodeURIComponent: "prim", encodeURI: "prim", decodeURIComponent: "prim", decodeURI: "prim", structuredClone: "deep", Array: "fresh", Object: "same", atob: "prim", btoa: "prim" });
const STATIC = T({
  Math: null, // every member but `random`
  JSON: T({ stringify: "prim", parse: "deep" }),
  Object: T({ keys: "prim", values: "copy", entries: "copy2", fromEntries: "copy", is: "prim", hasOwn: "prim", getPrototypeOf: "same", getOwnPropertyNames: "prim", getOwnPropertySymbols: "prim", create: "fresh", assign: "target", freeze: "target", defineProperty: "target", defineProperties: "target", setPrototypeOf: "target", isFrozen: "prim" }),
  Array: T({ isArray: "prim", from: "copy", of: "copy" }),
  Number: T({ isFinite: "prim", isInteger: "prim", isNaN: "prim", isSafeInteger: "prim", parseFloat: "prim", parseInt: "prim" }),
  String: T({ fromCharCode: "prim", fromCodePoint: "prim", raw: "prim" }),
  Promise: T({ resolve: "same", reject: "same", all: "copy", allSettled: "fresh", race: "same", any: "same", withResolvers: "fresh" }),
  Symbol: T({ for: "prim" }), Reflect: T({ ownKeys: "prim", has: "prim", get: "elem", getPrototypeOf: "same" }),
});
/** Built-ins that throw on what they are given, as a matter of course: an `Error` in what a call rejects with. */
const THROWS = new Set(["JSON.parse", "JSON.stringify", "decodeURIComponent", "decodeURI", "encodeURIComponent", "encodeURI", "structuredClone", "BigInt", "atob", "btoa", "new URL", "new RegExp"]);
const NEW_OK = T({ Map: "map", Set: "set", WeakMap: "map", WeakSet: "set", Array: "array", Object: "object", Promise: "promise", RegExp: "regexp", URL: "url", URLSearchParams: "url",
  Error: "error", TypeError: "error", RangeError: "error", SyntaxError: "error", ReferenceError: "error", EvalError: "error", URIError: "error", AggregateError: "error" });
const BUILTIN_ERRORS = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "EvalError", "URIError", "AggregateError"]);
/** The platform's: what is given here is called later, outside any computation. */
const LATER_GLOBAL = T({ setTimeout: 0, setInterval: 0, queueMicrotask: 0, requestAnimationFrame: 0, requestIdleCallback: 0 });
const LATER_NEW = new Set(["ResizeObserver", "MutationObserver", "IntersectionObserver", "PerformanceObserver"]);
/** Solid's, by what it does with each function argument: "track" — run now, inside a computation; "run" — run now;
 *  "later" — run after, outside any computation, under the owner (an effect's second function, a cleanup). `makes`: the
 *  call makes a node the owner keeps. */
const SOLID = /^(solid-js(\/store)?|@solidjs\/(signals|web|universal))$/;
const SOLID_API = T({
  createSignal: { args: { 0: "track" }, makes: true, gives: "signal" }, createMemo: { args: { 0: "track" }, makes: true, gives: "read" }, createEffect: { args: { 0: "track", 1: "later" }, makes: true },
  createRenderEffect: { args: { 0: "track", 1: "later" }, makes: true }, createTrackedEffect: { args: { 0: "later" }, makes: true }, createStore: { args: { 0: "track" }, makes: true, gives: "store" },
  createProjection: { args: { 0: "track" }, makes: true, gives: "read" }, createAsync: { args: { 0: "track" }, makes: true, gives: "read" }, createOptimistic: { args: { 0: "track" }, makes: true, gives: "signal" },
  createOptimisticStore: { args: { 0: "track" }, makes: true, gives: "store" }, createRoot: { args: { 0: "run" }, makes: true }, untrack: { args: { 0: "run" } }, runWithOwner: { args: { 1: "run" } },
  createOwner: { makes: true }, onCleanup: { args: { 0: "later" }, makes: true }, onSettled: { args: { 0: "later" }, makes: true }, getOwner: {}, getObserver: {}, createContext: {}, useContext: {}, merge: {}, omit: {}, isPending: { args: { 0: "track" } },
  latest: { args: { 0: "track" } }, mapArray: { args: { 0: "track", 1: "track" }, makes: true, gives: "read" }, createUniqueId: { makes: true }, children: { args: { 0: "track" }, makes: true, gives: "read" },
});

const join = (a, b) => ({ r: Math.max(a.r, b.r), f: Math.min(a.f, b.f) });
const PRIM = { r: 0, f: INF }, FOREIGN = { r: INF, f: 0 };
/** One step into a value: its element, or a property of it. */
const access = v => v.f > 0 ? { r: v.r, f: v.f === INF ? INF : v.f - 1 } : { r: Math.max(0, v.r === INF ? INF : v.r - 1), f: 0 };
const wrap = (v, n = 1) => ({ r: v.r, f: v.f === INF ? INF : v.f + n });

function create(ts, options = {}) {
  const K = ts.SyntaxKind;
  const mods = new Map();          // file → module model, or null
  let sums = new WeakMap();        // function node → its summary (this round's)
  const prev = new WeakMap();      // … the round before's, for a function met while it is being read
  const active = new Set();
  let changed = false, cyclic = false;
  const isFn = n => !!n && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n) || ts.isConstructorDeclaration(n));
  const skip = e => { while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression?.(e) || ts.isSatisfiesExpression?.(e))) e = e.expression; return e; };
  const up = n => { let p = n.parent; while (p && (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isNonNullExpression(p) || ts.isSatisfiesExpression?.(p))) { n = p; p = p.parent; } return [n, p]; };
  const place = n => { const sf = n.getSourceFile(); const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf)); return { file: sf.fileName, line: line + 1 }; };
  const isAsync = f => !!f.modifiers?.some(m => m.kind === K.AsyncKeyword);

  // ---- modules ----
  function load(file) {
    if (mods.has(file)) return mods.get(file);
    let text; try { text = fs.readFileSync(file, "utf8"); } catch { mods.set(file, null); return null; }
    const kind = /\.[cm]?tsx$/.test(file) ? ts.ScriptKind.TSX : /\.[cm]?ts$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JSX;
    let sf; try { sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind); } catch { mods.set(file, null); return null; }
    const m = { file, sf, top: new Map(), exports: new Map(), stars: [], written: new Set(), readonly: new Map() };
    mods.set(file, m);
    const bind = (name, b) => { if (m.top.has(name)) m.top.get(name).multi = true; else m.top.set(name, b); };
    const names = (pat, out = []) => { if (ts.isIdentifier(pat)) out.push(pat.text); else if (pat.elements) for (const e of pat.elements) if (!ts.isOmittedExpression(e)) names(e.name, out); return out; };
    for (const st of sf.statements) {
      const exported = !!st.modifiers?.some(x => x.kind === K.ExportKeyword), dflt = !!st.modifiers?.some(x => x.kind === K.DefaultKeyword);
      if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
        const c = st.importClause; if (!c || c.isTypeOnly) continue; const from = st.moduleSpecifier.text;
        if (c.name) bind(c.name.text, { kind: "import", from, name: "default" });
        if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) bind(c.namedBindings.name.text, { kind: "ns", from });
        if (c.namedBindings && ts.isNamedImports(c.namedBindings)) for (const e of c.namedBindings.elements) if (!e.isTypeOnly) bind(e.name.text, { kind: "import", from, name: (e.propertyName ?? e.name).text });
      } else if (ts.isFunctionDeclaration(st)) {
        const n = st.name?.text ?? "default"; if (st.body) bind(n, { kind: "fn", node: st });
        if (exported) m.exports.set(dflt ? "default" : n, { local: n });
      } else if (ts.isClassDeclaration(st)) {
        const n = st.name?.text ?? "default"; bind(n, { kind: "class", node: st });
        if (exported) m.exports.set(dflt ? "default" : n, { local: n });
      } else if (ts.isVariableStatement(st)) {
        const isConst = true;   // judged by `written`: a `var` or `let` the file never assigns again is as fixed as a `const` (bundlers write `var X = class {}`)
        for (const d of st.declarationList.declarations) {
          if (ts.isIdentifier(d.name)) { bind(d.name.text, { kind: "var", isConst, init: d.initializer, decl: d }); if (exported) m.exports.set(d.name.text, { local: d.name.text }); }
          else for (const n of names(d.name)) { bind(n, { kind: "var", isConst, init: undefined, decl: d, pattern: true }); if (exported) m.exports.set(n, { local: n }); }
        }
      } else if (ts.isExportDeclaration(st) && !st.isTypeOnly) {
        const from = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : undefined;
        if (!st.exportClause) { if (from) m.stars.push(from); }
        else if (ts.isNamedExports(st.exportClause)) for (const e of st.exportClause.elements) { if (e.isTypeOnly) continue; const local = (e.propertyName ?? e.name).text; m.exports.set(e.name.text, from ? { from, name: local } : { local }); }
        else if (ts.isNamespaceExport(st.exportClause) && from) m.exports.set(st.exportClause.name.text, { ns: from });
      } else if (ts.isExportAssignment(st) && !st.isExportEquals) {
        const e = skip(st.expression);
        if (ts.isIdentifier(e)) m.exports.set("default", { local: e.text }); else { bind("default", { kind: "var", isConst: true, init: e, decl: st }); m.exports.set("default", { local: "default" }); }
      }
    }
    // every name the file assigns to, anywhere: a module binding among them is state that changes
    const targets = (e) => { e = skip(e); if (ts.isIdentifier(e)) m.written.add(e.text); else if (ts.isArrayLiteralExpression(e)) e.elements.forEach(x => targets(ts.isSpreadElement(x) ? x.expression : x)); else if (ts.isObjectLiteralExpression(e)) for (const p of e.properties) { if (ts.isShorthandPropertyAssignment(p)) m.written.add(p.name.text); else if (ts.isPropertyAssignment(p)) targets(p.initializer); else if (ts.isSpreadAssignment(p)) targets(p.expression); } else if (ts.isBinaryExpression(e) && e.operatorToken.kind === K.EqualsToken) targets(e.left); };
    const scan = n => {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind >= K.FirstAssignment && n.operatorToken.kind <= K.LastAssignment) targets(n.left);
      else if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && (n.operator === K.PlusPlusToken || n.operator === K.MinusMinusToken)) targets(n.operand);
      else if ((ts.isForInStatement(n) || ts.isForOfStatement(n)) && !ts.isVariableDeclarationList(n.initializer)) targets(n.initializer);
      ts.forEachChild(n, scan);
    };
    scan(sf);
    for (const [name, b] of m.top) if (b.kind === "var") b.isConst = !m.written.has(name);
    return m;
  }
  const readJson = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return undefined; } };
  const probe = base => { for (const x of ["", ".js", ".mjs", ".ts", ".tsx", ".jsx", ".mts", "/index.js", "/index.mjs", "/index.ts", "/index.tsx", "/index.jsx"]) { const f = base + x; try { if (fs.statSync(f).isFile() && !/\.d\.[cm]?ts$/.test(f)) return fs.realpathSync(f); } catch { /* next */ } } const m = /^(.*)\.[cm]?js$/.exec(base); if (m) for (const x of [".ts", ".tsx", ".jsx", ".mts"]) { try { if (fs.statSync(m[1] + x).isFile()) return fs.realpathSync(m[1] + x); } catch { /* next */ } } return undefined; };
  /** Every file an import of `spec` from `dir` may load as an ES module: a relative module is one file; a package's is
   *  each target its export map has for the subpath under any condition a bundler or Node may be given (`browser`,
   *  `node`, `development`, `solid`, `default`…) — a word must hold in each. `require` and `types` are not an .rx app's. */
  const targetCache = new Map();
  function targets(spec, dir) {
    const key = `${dir}\0${spec}`; if (targetCache.has(key)) return targetCache.get(key);
    let out = [];
    if (spec.startsWith(".") || spec.startsWith("/")) { const f = probe(path.resolve(dir, spec)); if (f) out = [f]; }
    else {
      const parts = spec.split("/"); const pkg = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]; const sub = "./" + parts.slice(spec.startsWith("@") ? 2 : 1).join("/");
      let root; for (let d = dir; ; d = path.dirname(d)) { const p = path.join(d, "node_modules", pkg); if (fs.existsSync(path.join(p, "package.json"))) { root = p; break; } if (path.dirname(d) === d) break; }
      const pj = root && readJson(path.join(root, "package.json"));
      if (pj) {
        // the targets an `import` can reach: conditions are tried in the order written and the first that holds wins —
        // `import` and `default` always hold for an ES module's import (what is written after them is never reached),
        // `require` and `types` never, and any other (`browser`, `node`, `development`, `solid`, …) may or may not
        // The `solid` condition names the package's source — its JS or JSX before Solid's compiler, at the version
        // installed — which is what Solid's bundler plugin compiles into an app and what every other build of the
        // package is compiled from: where there is one it is the module that is read, alone (and its JSX parsed as JSX)
        const leaves = (t, acc, solid = false) => { if (typeof t === "string") acc.push({ t, solid }); else if (Array.isArray(t)) { if (t.length) leaves(t[0], acc, solid); } else if (t && typeof t === "object") for (const [k, v] of Object.entries(t)) { if (k === "types" || k === "require" || k === "react-native" || k === "deno" || k === "bun") continue; leaves(v, acc, solid || k === "solid"); if (k === "import" || k === "default") break; } return acc; };
        const pick = ls => { const src = options.solid === false ? [] : ls.filter(x => x.solid); return (src.length ? src : ls).map(x => x.t); };
        let found = [];
        const ex = pj.exports;
        if (ex !== undefined) {
          const map = typeof ex === "string" || Array.isArray(ex) || (ex && !Object.keys(ex).some(k => k.startsWith("."))) ? { ".": ex } : ex;
          const want = sub === "./" ? "." : sub;
          if (map[want] !== undefined) found = pick(leaves(map[want], []));
          else for (const [k, v] of Object.entries(map)) { const star = k.indexOf("*"); if (star < 0) continue; const pre = k.slice(0, star), post = k.slice(star + 1); if (want.startsWith(pre) && want.endsWith(post) && want.length >= pre.length + post.length) { found = pick(leaves(v, [])).map(t => t.replace(/\*/g, want.slice(pre.length, want.length - post.length))); break; } }
        } else if (sub === "./") found = [pj.module, pj.type === "module" || /\.mjs$/.test(pj.main ?? "") ? pj.main : undefined, pj.module ? undefined : pj.main ?? "index.js"].filter(Boolean).slice(0, 1);
        else found = [sub];
        out = [...new Set(found.filter(t => !/\.d\.[cm]?ts$/.test(t) && !/\.cjs$/.test(t) && !/\.(css|json)$/.test(t)).map(t => probe(path.join(root, t))).filter(Boolean))];
      }
    }
    targetCache.set(key, out); return out;
  }
  /** What a module's export is: the bindings it may be (one per build), each `{ m, b }` — a top-level binding of a module
   *  — or undefined where a build cannot be read to it. */
  function exported(file, name, seen = new Set()) {
    const k = `${file}\0${name}`; if (seen.has(k)) return undefined; seen.add(k);
    const m = load(file); if (!m) return undefined;
    const e = m.exports.get(name);
    if (e?.local !== undefined) return binding(m, e.local, seen);
    if (e?.from) return imported(m, e.from, e.name, seen);
    if (e?.ns) return undefined;
    for (const from of m.stars) { if (name === "default") break; const r = imported(m, from, name, seen, true); if (r) return r; }
    return undefined;
  }
  function imported(m, from, name, seen = new Set(), quiet) {
    if (SOLID.test(from)) return [{ solid: name }];
    const files = targets(from, path.dirname(m.file)); if (!files.length) return undefined;
    const out = [];
    for (const f of files) { const r = exported(f, name, new Set(seen)); if (!r) return undefined; out.push(...r); }
    return out;
  }
  /** A top-level name of a module, followed through imports and plain aliases to what it is. */
  function binding(m, name, seen = new Set()) {
    const b = m.top.get(name); if (!b || b.multi) return undefined;
    if (b.kind === "import") return imported(m, b.from, b.name, seen);
    if (b.kind === "var" && b.isConst && !m.written.has(name) && b.init) { const e = skip(b.init); if (ts.isIdentifier(e) && e.text !== name && m.top.has(e.text)) return binding(m, e.text, seen); }
    return [{ m, b, name }];
  }

  // ---- scopes ----
  const localsOf = new WeakMap();
  /** The names a function declares (its parameters and every declaration in its body that is not a nested function's),
   *  each with where it gets a value: `{ inits: [...], multi }`. */
  function locals(fn) {
    if (localsOf.has(fn)) return localsOf.get(fn);
    const map = new Map();
    const add = (name, init) => { const e = map.get(name); if (e) { e.count++; e.inits.push(init); } else map.set(name, { count: 1, inits: [init], stores: [] }); };
    const pattern = (pat, init) => { if (ts.isIdentifier(pat)) add(pat.text, init); else for (const e of pat.elements ?? []) if (!ts.isOmittedExpression(e)) pattern(e.name, { part: init, of: pat, el: e }); };
    fn.parameters?.forEach((p, i) => pattern(p.name, { param: i, node: p }));
    if (ts.isFunctionExpression(fn) && fn.name) add(fn.name.text, { fn });
    const visit = n => {
      if (isFn(n)) { if (ts.isFunctionDeclaration(n) && n.name) add(n.name.text, { fn: n }); return; }
      if (ts.isClassDeclaration(n)) { if (n.name) add(n.name.text, { cls: n }); return; }
      if (ts.isClassExpression(n)) return;
      if (ts.isVariableDeclaration(n)) {
        const loop = n.parent?.parent; const of = loop && (ts.isForOfStatement(loop) || ts.isForInStatement(loop)) && loop.initializer === n.parent ? loop : undefined;
        pattern(n.name, of ? { loop: of } : n.initializer ? { expr: n.initializer } : { none: true });
      }
      if (ts.isCatchClause(n) && n.variableDeclaration) pattern(n.variableDeclaration.name, { caught: n });
      ts.forEachChild(n, visit);
    };
    if (fn.body) visit(fn.body);
    for (const e of map.values()) e.multi = e.count > 1 && e.inits.some(i => !i.expr && !i.none);
    localsOf.set(fn, map); return map;
  }
  const fnOf = n => { let p = n.parent; while (p && !isFn(p) && !ts.isSourceFile(p)) { if (ts.isClassLike(p) || ts.isPropertyDeclaration(p)) return p; p = p.parent; } return p; };
  /** Where a name is from: `{ fn, local }` (a function's own), `{ top }` (the module's), `{ global }`. */
  function resolve(id, m) {
    const name = id.text;
    for (let f = fnOf(id); f && !ts.isSourceFile(f); f = fnOf(f)) { if (!isFn(f)) continue; const l = locals(f).get(name); if (l) return { fn: f, local: l, name }; }
    // a parameter's default and a declaration's own name are the function's
    const top = m.top.get(name);
    if (top) return { top, name };
    return { global: name };
  }
  const isRef = id => {
    const p = id.parent;
    if (!p) return false;
    if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
    if ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p) || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p) || ts.isEnumMember(p) || ts.isPropertySignature(p)) && p.name === id) return false;
    if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p) || ts.isClassExpression(p)) && p.name === id) return false;
    if (ts.isBindingElement(p)) return p.initializer === id;
    if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p) || ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p) || ts.isJsxAttribute(p) || ts.isTypeReferenceNode?.(p) || ts.isQualifiedName(p)) return false;
    if (ts.isTypeNode?.(p)) return false;
    return true;
  };
  const refsOf = new WeakMap();
  /** Every reference in `scope` (a function, or the file) to the name as `owner` declares it. */
  function refs(scope, name, m, same) {
    let by = refsOf.get(scope); if (!by) { by = new Map(); const all = n => { if (ts.isIdentifier(n) && isRef(n)) { const a = by.get(n.text); if (a) a.push(n); else by.set(n.text, [n]); } ts.forEachChild(n, all); }; all(scope); refsOf.set(scope, by); }
    return (by.get(name) ?? []).filter(id => same(resolve(id, m)));
  }

  // ---- the role of a function written inside another ----
  /** What becomes of a function literal, by where it is written: "run" (called now: a built-in's callback, a promise's
   *  executor, an IIFE), "track" (Solid runs it now, in a computation), "then" (a continuation, a timer: later, not under
   *  the owner), "later" (Solid runs it after, under the owner), "listen" (the platform calls it later), "named" (bound
   *  to a name of the function around it: by its uses), "kept" (handed back, stored, given to code that is not read). */
  function role(fn, m) {
    let [n, p] = up(fn);
    if (!p) return { kind: "kept" };
    if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
      if (p.expression === n) return ts.isCallExpression(p) ? { kind: "run" } : { kind: "kept" };
      const i = (p.arguments ?? []).indexOf(n); if (i < 0) return { kind: "kept" };
      const c = callee(p, m);
      if (c.kind === "later") return { kind: c.at.includes(i) ? (c.owner ? "later" : c.listen ? "listen" : "then") : "kept" };
      if (c.kind === "solid") { const r = c.api.args?.[i]; return { kind: r === "later" ? "later" : r === "track" ? "track" : r === "run" ? "run" : "kept" }; }
      if (c.kind === "builtin") return { kind: (c.sync && (c.name === "new Promise" ? i === 0 : i === 1)) || c.name === "JSON.parse" || c.name === "JSON.stringify" ? "run" : "kept", call: p };
      if (c.kind === "method") return { kind: PROMISE_LATER.has(c.name) ? "then" : CALLBACK_SYNC.has(c.name) || KIND_READ.map[c.name] === "prim" ? "run" : "kept" };
      if (c.kind === "iife") return { kind: "kept" };
      if (c.kind === "fns") return { kind: "given", fns: c.fns, index: i, call: p };
      if (c.kind === "local" && c.r.local.inits.length === 1 && !c.r.local.multi) { const i0 = c.r.local.inits[0]; const g = i0.fn ?? (i0.expr && isFn(skip(i0.expr)) ? skip(i0.expr) : undefined); if (g) return { kind: "given", fns: [{ m, node: g, name: c.r.name }], index: i, call: p }; }
      return { kind: "kept" };
    }
    if (ts.isVariableDeclaration(p) && p.initializer === n && ts.isIdentifier(p.name)) return { kind: "named", name: p.name.text, at: p };
    if (ts.isFunctionDeclaration(fn) && fn.name) return { kind: "named", name: fn.name.text, at: fn };
    if (ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent)) { const tag = p.parent.parent.parent.tagName; const an = p.parent.name.getText(); if (ts.isIdentifier(tag) && /^[a-z]/.test(tag.text) && (/^on[A-Z:]/.test(an) || an === "ref")) return { kind: "listen" }; }
    return { kind: "kept" };
  }
  /** What a call's callee is. */
  function callee(call, m) {
    const e = skip(call.expression);
    const isNew = ts.isNewExpression(call);
    if (ts.isIdentifier(e)) {
      const r = resolve(e, m);
      if (r.global !== undefined) {
        if (isNew) return LATER_NEW.has(r.global) ? { kind: "later", at: [0], listen: true, observer: r.global } : NEW_OK[r.global] ? { kind: "builtin", name: `new ${r.global}`, made: NEW_OK[r.global], sync: r.global === "Promise" } : { kind: "unknown", why: `new ${r.global}` };
        if (r.global in LATER_GLOBAL) return { kind: "later", at: [LATER_GLOBAL[r.global]], listen: r.global !== "setTimeout" && r.global !== "queueMicrotask", timer: true, name: r.global };
        if (r.global in GLOBAL_FNS) return { kind: "builtin", name: r.global, gives: GLOBAL_FNS[r.global] };
        if (r.global === "clearTimeout" || r.global === "clearInterval") return { kind: "builtin", name: r.global, gives: "prim", clears: true };
        return { kind: "unknown", why: r.global === "eval" || r.global === "Function" ? `${r.global}: code made from a string` : r.global === "fetch" ? "fetch: the network" : `${r.global}, a global that is not known to only compute` };
      }
      if (r.local) return { kind: "local", r };
      return fromBinding(binding(m, e.text), e.text, isNew);
    }
    if (ts.isPropertyAccessExpression(e) || (ts.isElementAccessExpression(e) && ts.isStringLiteralLike(skip(e.argumentExpression)))) {
      const name = ts.isPropertyAccessExpression(e) ? e.name.text : skip(e.argumentExpression).text;
      const o = skip(e.expression);
      if (ts.isIdentifier(o)) {
        const r = resolve(o, m);
        if (r.global !== undefined && !isNew) {
          if ((r.global === "window" || r.global === "globalThis" || r.global === "self") && name in LATER_GLOBAL) return { kind: "later", at: [LATER_GLOBAL[name]], listen: name !== "setTimeout" && name !== "queueMicrotask", timer: true, name };
          if (r.global === "Math") return name === "random" ? { kind: "unknown", why: "Math.random: randomness" } : { kind: "builtin", name: `Math.${name}`, gives: "prim" };
          if (STATIC[r.global]?.[name]) return { kind: "builtin", name: `${r.global}.${name}`, gives: STATIC[r.global][name], sync: r.global === "Array" && name === "from" };
          if (r.global === "Date" || r.global === "performance") return { kind: "unknown", why: `${r.global}.${name}: the clock` };
          if (r.global === "crypto") return { kind: "unknown", why: `crypto.${name}: randomness` };
        }
        if (r.top?.kind === "ns") return fromBinding(imported(m, r.top.from, name), `${o.text}.${name}`, isNew);
        // a method of an object the module declares: `toaster.show`
        if (r.top?.kind === "var" && r.top.isConst && r.top.init && ts.isObjectLiteralExpression(skip(r.top.init))) { const f = memberFn(skip(r.top.init), name); if (f) return { kind: "fns", fns: [{ m, node: f, name: `${o.text}.${name}`, method: true }] }; }
      }
      if (!isNew && name === "addEventListener") return { kind: "later", at: [1], listen: true, name, method: e };
      if (!isNew && name === "bind") return { kind: "builtin", name: ".bind", gives: "fresh", on: o };   // a new function: nothing is called
      if (!isNew && (name === "call" || name === "apply")) return { kind: "unknown", why: `.${name}(…): a call the code does not spell out` };
      if (!isNew) return { kind: "method", name, on: o, access: e };
    }
    if (isFn(e) && !isNew) return { kind: "iife", fn: e };
    if (e.kind === K.SuperKeyword) return { kind: "super" };
    if (e.kind === K.ImportKeyword) return { kind: "unknown", why: "import(): a module loaded while it runs" };
    return { kind: "unknown", why: ts.isElementAccessExpression(e) ? "a call through a computed member" : "a call of a value that is computed" };
  }
  const memberFn = (obj, name) => { for (const p of obj.properties) { const pn = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)) ? p.name.text : undefined; if (pn !== name) continue; if (ts.isMethodDeclaration(p)) return p; if (ts.isPropertyAssignment(p) && isFn(skip(p.initializer))) return skip(p.initializer); } return undefined; };
  function fromBinding(bs, name, isNew) {
    if (!bs) return { kind: "unknown", why: `${name}: code that is not read (another package's, or not a module's top-level function)` };
    if (bs.every(x => x.solid)) { const api = SOLID_API[bs[0].solid]; return api && !isNew && bs.every(x => x.solid === bs[0].solid) ? { kind: "solid", api, name: bs[0].solid } : { kind: "unknown", why: `${bs[0].solid}, of Solid: not known to only compute` }; }
    const fns = [];
    for (const x of bs) {
      if (x.solid) return { kind: "unknown", why: `${name}: Solid's in one build, the package's in another` };
      const b = x.b;
      if (b.kind === "fn" && !isNew) fns.push({ m: x.m, node: b.node, name: x.name });
      else if (b.kind === "class" && isNew) fns.push({ m: x.m, node: b.node, name: x.name, cls: true });
      else if (b.kind === "var" && b.isConst && !x.m.written.has(x.name) && b.init && isFn(skip(b.init)) && !isNew) fns.push({ m: x.m, node: skip(b.init), name: x.name });
      else if (b.kind === "var" && b.isConst && b.init && ts.isClassExpression(skip(b.init)) && isNew) fns.push({ m: x.m, node: skip(b.init), name: x.name, cls: true });
      else return { kind: "unknown", why: `${name}: ${b.kind === "var" ? "a value made by a call, or one the module assigns again" : "not a function the module declares"}` };
    }
    return { kind: "fns", fns, name };
  }

  // ---- a function's summary ----
  const optimistic = () => ({ pure: [], makes: false, fails: new Set(), mutates: new Map(), may: new Set(), calls: new Set(), keeps: new Set(), env: undefined });
  const same = (a, b) => a.pure.length === b.pure.length && a.makes === b.makes && a.fails.size === b.fails.size && a.mutates.size === b.mutates.size && a.calls.size === b.calls.size && a.keeps.size === b.keeps.size && a.may.size === b.may.size;
  /** `{ pure: [reasons: why it is not], makes, fails: Set<class | "*">, mutates: Map<param index, reason>, calls:
   *  Set<param index> (called while it runs), keeps: Set<param index> (given to what is not read, or kept) }`. */
  function summary(f) {
    if (sums.has(f.node)) return sums.get(f.node);
    if (active.has(f.node)) { cyclic = true; return prev.get(f.node) ?? optimistic(); }
    active.add(f.node);
    let s;
    try { s = f.cls ? construct(f) : read(f); } catch (e) { if (options.debug) throw e; s = optimistic(); s.pure.push({ why: `could not be read (${String(e?.message ?? e).slice(0, 80)})`, ...place(f.node) }); s.fails.add("*"); }
    active.delete(f.node);
    const was = prev.get(f.node); if (!was || !same(was, s)) changed = true;
    sums.set(f.node, s); prev.set(f.node, s);
    return s;
  }
  /** `new C(…)`: the constructor's own body with `this` the thing being made; a class it extends is a built-in error,
   *  or one that is read the same way. A field's initializer is the constructor's. */
  function construct(f) {
    const s = optimistic(); const cls = f.node; const m = f.m;
    const h = cls.heritageClauses?.find(c => c.token === K.ExtendsKeyword)?.types[0]?.expression;
    if (h) {
      const e = skip(h);
      const r = ts.isIdentifier(e) ? resolve(e, m) : undefined;
      if (r?.global !== undefined && NEW_OK[r.global]) { /* a built-in */ }
      else { const bs = ts.isIdentifier(e) && !r?.local ? fromBinding(binding(m, e.text), e.text, true) : { kind: "unknown", why: "a class that extends a computed value" }; if (bs.kind !== "fns") s.pure.push({ why: `its class extends ${bs.why ?? "what is not read"}`, ...place(h) }); else for (const g of bs.fns) absorb(s, summary(g), g, h); }
    }
    for (const mem of cls.members) {
      if (ts.isPropertyDeclaration(mem) && mem.initializer && !mem.modifiers?.some(x => x.kind === K.StaticKeyword)) walkBody(s, { m, node: mem, name: f.name }, mem.initializer, true);
      if (ts.isConstructorDeclaration(mem) && mem.body) { const r = read({ m, node: mem, name: f.name, ctor: true }); s.pure.push(...r.pure); for (const x of r.fails) s.fails.add(x); for (const [k, v] of r.mutates) s.mutates.set(k, v); for (const x of r.calls) s.calls.add(x); for (const x of r.keeps) s.keeps.add(x); for (const x of r.may) s.may.add(x); s.makes ||= r.makes; }
    }
    return s;
  }
  const absorb = (s, t, g, at) => { const w = t.pure.find(x => !x.param); if (w) s.pure.push({ why: `it calls ${g.name ?? "a function"}, which is not proven: ${w.why}`, file: w.file, line: w.line, via: place(at) }); s.makes ||= t.makes; for (const x of t.fails) s.fails.add(x); };
  function read(f) { const s = optimistic(); walkBody(s, f, f.node.body, false); return s; }

  /** Reads `body` as part of the call of `f`: what it writes, calls, throws. */
  function walkBody(s, f, body, isField) {
    const m = f.m, root = f.node;
    const no = (why, n) => { s.pure.push({ why, ...place(n) }); };
    const inRoot = fn => { for (let g = fn; g && !ts.isSourceFile(g); g = fnOf(g)) if (g === root) return true; return false; };
    const paramIndex = r => r.fn === root && r.local.inits.length === 1 && r.local.inits[0].param !== undefined ? r.local.inits[0].param : undefined;
    // ---- what a value shares with what the call did not make ----
    const valOf = new Map(); const kindOf = new Map(); const busy = new Set();
    const localVal = r => {
      const l = r.local; if (valOf.has(l)) return valOf.get(l);
      if (busy.has(l) || l.multi || !inRoot(r.fn)) return FOREIGN;
      busy.add(l); let v = PRIM;
      for (const i of l.inits) v = join(v, initVal(i));
      for (const st of l.stores) { const w = val(st.expr); v = join(v, { r: w.r, f: w.f === INF ? INF : w.f + st.depth }); }
      busy.delete(l); valOf.set(l, v); return v;
    };
    const initVal = i => i.param !== undefined || i.caught || i.cls ? FOREIGN : i.fn ? PRIM : i.none ? PRIM : i.expr ? val(i.expr) : i.loop ? (ts.isForInStatement(i.loop) ? PRIM : access(val(i.loop.expression))) : i.part ? access(initVal(i.part)) : FOREIGN;
    const val = e => {
      e = skip(e);
      if (!e) return PRIM;
      switch (e.kind) {
        case K.StringLiteral: case K.NumericLiteral: case K.BigIntLiteral: case K.NoSubstitutionTemplateLiteral: case K.TemplateExpression: case K.TrueKeyword: case K.FalseKeyword: case K.NullKeyword: case K.RegularExpressionLiteral:
        case K.TypeOfExpression: case K.VoidExpression: case K.DeleteExpression: case K.PrefixUnaryExpression: case K.PostfixUnaryExpression: case K.ArrowFunction: case K.FunctionExpression: case K.ClassExpression: return PRIM;
      }
      if (ts.isIdentifier(e)) { const r = resolve(e, m); if (r.local) return localVal(r); if (r.global !== undefined) return r.global === "undefined" || r.global === "NaN" || r.global === "Infinity" ? PRIM : FOREIGN; return r.top.kind === "fn" || r.top.kind === "class" ? PRIM : FOREIGN; }
      if (ts.isArrayLiteralExpression(e)) { let v = PRIM; for (const x of e.elements) v = join(v, ts.isSpreadElement(x) ? access(val(x.expression)) : val(x)); return wrap(v); }
      if (ts.isObjectLiteralExpression(e)) { let v = PRIM; for (const p of e.properties) v = join(v, ts.isSpreadAssignment(p) ? access(val(p.expression)) : ts.isPropertyAssignment(p) ? val(p.initializer) : ts.isShorthandPropertyAssignment(p) ? val(p.name) : PRIM); return wrap(v); }
      if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) return access(val(e.expression));
      if (ts.isConditionalExpression(e)) return join(val(e.whenTrue), val(e.whenFalse));
      if (ts.isBinaryExpression(e)) { const k = e.operatorToken.kind; if (k === K.BarBarToken || k === K.AmpersandAmpersandToken || k === K.QuestionQuestionToken) return join(val(e.left), val(e.right)); if (k === K.CommaToken || (k >= K.FirstAssignment && k <= K.LastAssignment)) return val(e.right); return PRIM; }
      if (ts.isAwaitExpression(e)) return val(e.expression);
      if (ts.isCallExpression(e) || ts.isNewExpression(e)) {
        const c = callee(e, m); const args = e.arguments ?? [];
        const all = () => args.reduce((v, a) => join(v, ts.isSpreadElement(a) ? access(val(a.expression)) : val(a)), PRIM);
        if (c.kind === "builtin") {
          if (c.made) return c.made === "promise" || c.made === "error" || c.made === "regexp" || c.made === "url" ? { r: 0, f: INF } : wrap(args.length ? access(access(all())) : PRIM);
          const g = c.gives;
          return g === "prim" || g === "deep" ? PRIM : g === "fresh" ? { r: all().r, f: 1 } : g === "copy" ? wrap(access(all())) : g === "copy2" ? wrap(access(all()), 2) : g === "elem" ? access(all()) : g === "target" ? (args[0] ? val(args[0]) : PRIM) : all();
        }
        if (c.kind === "method") {
          const recv = val(c.on); const g = READ[c.name] ?? KIND_READ.map[c.name];
          if (PROMISE_LATER.has(c.name)) return FOREIGN;
          return g === "prim" ? PRIM : g === "copy" ? wrap(access(recv)) : g === "copy2" ? wrap(access(recv), 2) : g === "elem" ? access(recv) : g === "fresh" ? { r: INF, f: 1 } : FOREIGN;
        }
        if (c.kind === "solid") return c.api.gives ? { r: 0, f: INF } : FOREIGN;
        return FOREIGN;
      }
      return FOREIGN;
    };
    const kind = e => {
      e = skip(e);
      if (!e) return undefined;
      if (ts.isArrayLiteralExpression(e)) return "array";
      if (ts.isObjectLiteralExpression(e)) return "object";
      if (ts.isStringLiteralLike(e) || ts.isTemplateExpression(e)) return "string";
      if (ts.isIdentifier(e)) { const r = resolve(e, m); if (!r.local || r.local.multi) return undefined; if (kindOf.has(r.local)) return kindOf.get(r.local); kindOf.set(r.local, undefined); const ks = r.local.inits.map(i => i.expr ? kind(i.expr) : undefined); const k = ks.length && ks.every(x => x && x === ks[0]) ? ks[0] : undefined; kindOf.set(r.local, k); return k; }
      if (ts.isCallExpression(e) || ts.isNewExpression(e)) { const c = callee(e, m); if (c.kind === "builtin") return c.made ?? (c.gives === "copy" || c.gives === "copy2" || c.name === "Object.keys" || c.name === "Array" ? "array" : undefined); if (c.kind === "method" && /^(map|filter|slice|concat|flat|flatMap|toSorted|toReversed|toSpliced|split)$/.test(c.name)) return "array"; }
      return undefined;
    };
    /** The locals of this call an expression's value may be part of: what is stored into one is stored into each. */
    const rootsIn = (e, out = []) => { const v = n => { if (isFn(n)) return; if (ts.isIdentifier(n) && isRef(n)) { const r = resolve(n, m); if (r.local && inRoot(r.fn)) out.push(r); } ts.forEachChild(n, v); }; v(e); return out; };
    // every store into a local of the call, before anything is judged by what a local holds
    const stores = n => {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind >= K.FirstAssignment && n.operatorToken.kind <= K.LastAssignment) {
        const l = skip(n.left);
        if (ts.isIdentifier(l)) { const r = resolve(l, m); if (r.local) r.local.inits.push({ expr: n.right, again: true }); }
        else if (ts.isPropertyAccessExpression(l) || ts.isElementAccessExpression(l)) for (const r of rootsIn(l.expression)) for (const q of aliasClass(r)) q.local.stores.push({ expr: n.right, depth: steps(l) });
      }
      if (ts.isCallExpression(n)) { const e = skip(n.expression); if (ts.isPropertyAccessExpression(e) && (MUTATORS.has(e.name.text) || e.name.text === "assign")) for (const r of rootsIn(e.expression)) for (const q of aliasClass(r)) for (const a of n.arguments) q.local.stores.push({ expr: ts.isSpreadElement(a) ? a.expression : a, depth: ts.isSpreadElement(a) ? 1 : steps(e) }); }
      ts.forEachChild(n, stores);
    };
    /** How many steps under its first name a place is: `a.b[c]` is two. (Through anything else, one: the least it can be.) */
    const steps = e => { let k = 0; for (e = skip(e); ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e); e = skip(e.expression)) k++; return ts.isIdentifier(e) ? Math.max(1, k) : 1; };
    const classes = new Map();
    const aliasClass = r => { let c = classes.get(r.local); if (c) return c; c = [r]; classes.set(r.local, c); for (const i of r.local.inits) if (i.expr) for (const q of rootsIn(i.expr)) if (!c.some(x => x.local === q.local)) { c.push(q); for (const z of aliasClass(q)) if (!c.some(x => x.local === z.local)) c.push(z); } return c; };
    const marked = Symbol.for("rx.infer.stores");
    if (!root[marked] && body) { root[marked] = true; stores(ts.isBlock(body) || ts.isSourceFile(body) ? body : body); for (const p of root.parameters ?? []) if (p.initializer) stores(p.initializer); }

    // ---- which parameter of the root a value is part of ----
    const taintOf = new Map();
    const taint = e => { const out = new Set(); for (const r of rootsIn(e)) for (const i of localTaint(r)) out.add(i); return out; };
    const localTaint = r => {
      if (taintOf.has(r.local)) return taintOf.get(r.local);
      const out = new Set(); taintOf.set(r.local, out);
      const of = i => { if (i.param !== undefined) { if (r.fn === root) out.add(i.param); else if (i.node && inRoot(r.fn)) for (const x of givenTaint(r.fn)) out.add(x); } else if (i.expr) for (const x of taint(i.expr)) out.add(x); else if (i.loop) for (const x of taint(i.loop.expression)) out.add(x); else if (i.part) of(i.part); };
      for (const i of r.local.inits) of(i);
      for (const st of r.local.stores) for (const x of taint(st.expr)) out.add(x);
      return out;
    };
    /** A callback's parameters are parts of what the built-in it is given to walks. */
    const givenTaint = fn => { const [n, p] = up(fn); if (p && ts.isCallExpression(p) && p.arguments.includes(n)) { const e = skip(p.expression); return taint(ts.isPropertyAccessExpression(e) ? e.expression : p); } return new Set(); };

    // ---- throws ----
    let fails = s.fails;
    const classOf = e => {
      e = skip(e);
      if (ts.isNewExpression(e)) { const c = skip(e.expression); if (ts.isIdentifier(c)) { const r = resolve(c, m); if (r.global !== undefined) return "*"; if (r.local) return "*"; const bs = binding(m, c.text); if (bs && bs.length && bs.every(x => x.b?.kind === "class" && x.b.node === bs[0].b.node)) return bs[0].b.node; } return "*"; }
      if (ts.isIdentifier(e)) { const r = resolve(e, m); if (r.local && !r.local.multi && r.local.inits.length === 1 && r.local.inits[0].expr) return classOf(r.local.inits[0].expr); if (r.local?.inits[0]?.caught && caughtSets.has(r.local.inits[0].caught)) return caughtSets.get(r.local.inits[0].caught); }
      return "*";
    };
    const caughtSets = new Map();
    const addFail = (c, to = fails) => { if (c instanceof Set) for (const x of c) to.add(x); else to.add(c); };

    const writeTo = (target, n, what) => {
      // a write through `target` (the thing whose property is set, or whose method changes it)
      const t = skip(target);
      if (t.kind === K.ThisKeyword) { if (f.ctor || isField) return; return no("it writes to `this`", n); }
      const v = val(t);
      if (v.f > 0 || v.r === 0) return;   // a container the call made, or one that holds nothing it did not make
      // what is written through: the name the target starts from
      let b = t; for (;;) { if (ts.isPropertyAccessExpression(b) || ts.isElementAccessExpression(b)) b = skip(b.expression); else if (ts.isCallExpression(b) && (ts.isPropertyAccessExpression(skip(b.expression)) || ts.isElementAccessExpression(skip(b.expression)))) b = skip(skip(b.expression).expression); else break; }
      const r0 = ts.isIdentifier(b) ? resolve(b, m) : undefined;
      if (r0?.local && inRoot(r0.fn)) {
        const ps = localTaint(r0);
        // a local that holds nothing but what the function was given: the write is to its argument, for certain — its
        // caller's to answer for (one that gives it a value it made has changed nothing else: `_attach({ … })`)
        if (ps.size && r0.fn === root && paramOnly(r0, 0)) {
          const pi = paramIndex(r0); const of = pi !== undefined ? [pi] : [...ps];
          for (const i of of) if (!s.mutates.has(i)) s.mutates.set(i, { why: what, ...place(n), later: depth.later });
          s.pure.push({ why: `it changes its argument ${of.map(i => `\`${paramName(i)}\``).join(", ")} in place (${what})`, ...place(n), param: true }); return;
        }
        for (const i of ps) s.may.add(i);
        return no(ps.size ? `it may change its argument ${[...ps].map(i => `\`${paramName(i)}\``).join(", ")} in place: it writes to ${r0.name}, which may hold a part of it (${what})` : `it writes to ${r0.name}, which holds what the call did not make (${what})`, n);
      }
      no(`it writes to ${t.getText().slice(0, 40)}, which the call did not make (${what})`, n);
    };
    /** A local that holds nothing but (a part of) what the function was given. */
    const paramOnly = (r, d) => d < 8 && !r.local.multi && r.fn === root && r.local.inits.length > 0 && r.local.inits.every(i => { while (i.part) i = i.part; if (i.param !== undefined) return true; let e = i.expr ? skip(i.expr) : i.loop ? skip(i.loop.expression) : undefined; if (!e) return false; while (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) e = skip(e.expression); if (!ts.isIdentifier(e)) return false; const q = resolve(e, m); return !!q.local && paramOnly(q, d + 1); });
    const paramName = i => { const p = root.parameters?.[i]; return p && ts.isIdentifier(p.name) ? p.name.text : `#${i + 1}`; };
    const depth = { later: false };

    const fnArg = (a, how, call) => {
      // a function given where it will be called: `how` is "run" | "track" | "then"
      const e = skip(a);
      if (isFn(e)) { if (how === "then") { const was = depth.later, wasFails = fails; depth.later = true; fails = s.fails; inner(e); depth.later = was; fails = wasFails; } else inner(e); return; }
      if (ts.isIdentifier(e)) {
        const r = resolve(e, m);
        if (r.local) {
          const pi = paramIndex(r);
          if (pi !== undefined) { if (how === "then") no(`it calls back \`${e.text}\` later: the call starts work`, a); else { s.calls.add(pi); addFail("*"); } return; }
          if (isResolver(r)) return;
          const fnInit = r.local.inits.length === 1 && (r.local.inits[0].fn ?? (r.local.inits[0].expr && isFn(skip(r.local.inits[0].expr)) ? skip(r.local.inits[0].expr) : undefined));
          if (fnInit) { runNamed(fnInit, how === "then"); return; }
          if (solidLocal(r)) return;
          return no(`it hands \`${e.text}\`, a value that is not known to be a function of its own, to be called`, a);
        }
        if (r.top) { const c = fromBinding(binding(m, e.text), e.text, false); if (c.kind === "fns") { for (const g of c.fns) absorb(s, summary(g), g, a); return; } return no(`it has ${c.why} called`, a); }
        return no(`it has ${e.text}, a global, called`, a);
      }
      if (e.kind === K.NullKeyword || (ts.isIdentifier(e) && e.text === "undefined")) return;
      expr(e);
      no("it has a computed value called as a function", a);
    };
    const ran = new Set();
    const runNamed = (fn, later) => { const k = later ? `${fn.pos}L` : `${fn.pos}`; if (ran.has(k)) return; ran.add(k); if (later) { const was = depth.later, wasFails = fails; depth.later = true; fails = s.fails; inner(fn); depth.later = was; fails = wasFails; } else inner(fn); };
    /** `resolve` and `reject` of `new Promise((resolve, reject) => …)`, and what `Promise.withResolvers()` hands out. */
    const isResolver = r => { const i = r.local.inits[0]; if (r.local.inits.length !== 1 || i.param === undefined || i.param > 1) return false; const [n, p] = up(r.fn); return !!p && ts.isNewExpression(p) && p.arguments?.[0] === n && ts.isIdentifier(skip(p.expression)) && skip(p.expression).text === "Promise" && resolve(skip(p.expression), m).global !== undefined; };
    /** A name bound to what one of Solid's makers hands back: a signal's reader or setter, a memo. */
    const solidLocal = r => r.local.inits.length === 1 && !r.local.multi && (() => { let i = r.local.inits[0]; while (i.part) i = i.part; if (!i.expr) return false; const e = skip(i.expr); if (!ts.isCallExpression(e)) return false; const c = callee(e, m); return c.kind === "solid" && !!c.api.gives; })();
    const inner = fn => { for (const p of fn.parameters ?? []) if (p.initializer) expr(p.initializer); if (!fn.body) return; if (ts.isBlock(fn.body)) block(fn.body); else expr(fn.body); };

    const args = (call, c) => {
      for (const [i, a] of (call.arguments ?? []).entries()) {
        const e = ts.isSpreadElement(a) ? a.expression : a;
        expr(e);
      }
    };
    const call = n => {
      const c = callee(n, m); const as = n.arguments ?? [];
      const isNew = ts.isNewExpression(n);
      const plain = () => { for (const a of as) { const e = skip(ts.isSpreadElement(a) ? a.expression : a); if (isFn(e)) kept(e); else expr(e); } };
      switch (c.kind) {
        case "builtin": {
          if (THROWS.has(c.name)) addFail("*");
          if (/^Promise\./.test(c.name)) { if (c.name === "Promise.reject") addFail(as[0] ? classOf(as[0]) : "*"); else if (!as.every(a => { const e = skip(a); return ts.isArrayLiteralExpression(e) ? e.elements.every(x => settled(x)) : settled(e); })) addFail("*"); }
          if (c.clears) { for (const a of as) expr(a); return; }
          if (c.name === ".bind") { expr(c.on); for (const a of as) expr(a); return; }
          if (c.gives === "target" && as[0] && c.name !== "Object.freeze" && c.name !== "Object.isFrozen") writeTo(as[0], n, c.name);
          if (c.name === "Object.freeze" && as[0]) { const v = val(as[0]); if (v.f === 0) no("it freezes what the call did not make (Object.freeze)", n); }
          as.forEach((a, i) => { const e = skip(ts.isSpreadElement(a) ? a.expression : a); if ((c.sync && (c.name === "new Promise" ? i === 0 : i === 1)) || (isFn(e) && (c.name === "JSON.parse" || c.name === "JSON.stringify"))) fnArg(e, "run", n); else if (isFn(e)) kept(e); else expr(e); });
          return;
        }
        case "later": {
          if (c.timer && (c.name === "setTimeout" || c.name === "queueMicrotask")) { as.forEach((a, i) => { if (i === c.at[0]) fnArg(a, "then", n); else expr(a); }); return; }
          if (c.observer) { plain(); return; }   // an observer made observes nothing yet: `.observe(…)` is the call that registers
          plain(); return no(`${c.name ?? "an observer"}: it registers with the platform`, n);
        }
        case "solid": {
          s.makes ||= !!c.api.makes;
          as.forEach((a, i) => { const how = c.api.args?.[i]; const e = skip(a); if (how === "later") { if (isFn(e)) kept(e); else expr(e); } else if (how && (isFn(e) || ts.isIdentifier(e))) { if (isFn(e) && isAsync(e)) no(`${c.name}: an async computation starts work`, a); fnArg(a, how === "track" ? "track" : "run", n); } else if (isFn(e)) kept(e); else expr(e); });
          return;
        }
        case "iife": plain(); inner(c.fn); return;
        case "super": if (!f.ctor) no("super(…) outside a constructor", n); for (const a of as) expr(a); return;
        case "local": {
          const r = c.r; const pi = paramIndex(r);
          for (const a of as) { const e = skip(ts.isSpreadElement(a) ? a.expression : a); if (isFn(e)) kept(e); else expr(e); }
          if (isNew) return no(`new ${r.name}(…): a class that is a value`, n);
          if (pi !== undefined) { if (depth.later) return no(`it calls back \`${r.name}\` later: the call starts work`, n); s.calls.add(pi); addFail("*"); return; }
          if (isResolver(r)) { if (r.local.inits[0].param === 1 && as[0]) addFail(classOf(as[0]), s.fails); return; }
          if (solidLocal(r)) return;
          const fnInit = !r.local.multi && r.local.inits.length === 1 && (r.local.inits[0].fn ?? (r.local.inits[0].expr && isFn(skip(r.local.inits[0].expr)) ? skip(r.local.inits[0].expr) : undefined));
          if (fnInit && inRoot(r.fn)) { runNamed(fnInit, false); return; }
          // an element of a list the function was given, called where a built-in walks the list: its caller's function,
          // as a callback parameter is
          if (!depth.later && !r.local.multi && r.local.inits.length === 1 && r.local.inits[0].param !== undefined && inRoot(r.fn) && r.fn !== root) { const [fnN, fnP] = up(r.fn); const ce = fnP && ts.isCallExpression(fnP) && fnP.arguments.includes(fnN) ? skip(fnP.expression) : undefined; let b = ce && ts.isPropertyAccessExpression(ce) && CALLBACK_SYNC.has(ce.name.text) ? skip(ce.expression) : undefined; while (b && (ts.isPropertyAccessExpression(b) || ts.isElementAccessExpression(b))) b = skip(b.expression); const rb = b && ts.isIdentifier(b) ? resolve(b, m) : undefined; if (rb?.local && rb.fn === root && paramOnly(rb, 0)) { for (const i of localTaint(rb)) s.calls.add(i); addFail("*"); return; } }
          addFail("*"); return no(`it calls \`${r.name}\`, a value it was handed or computed, as a function`, n);
        }
        case "fns": {
          for (const g of c.fns) {
            const t = summary(g); absorb(s, t, g, n);
            as.forEach((a, i) => { const e = skip(ts.isSpreadElement(a) ? a.expression : a); if (t.mutates.has(i)) writeTo(e, n, `given to ${g.name}, which changes it`); else if (t.may.has(i)) { const v = val(e); if (!(v.f > 0 || v.r === 0)) { for (const x of taint(e)) s.may.add(x); no(`it gives ${e.getText().slice(0, 30)} to ${g.name}, which may change it`, n); } } if (t.keeps.has(i)) for (const x of taint(e)) s.keeps.add(x); if (t.calls.has(i) && ts.isIdentifier(e)) { const r = resolve(e, m); const pi = r.local ? paramIndex(r) : undefined; if (pi !== undefined) s.calls.add(pi); } });
            if (g.method && /\bthis\b/.test(g.node.getText())) no(`${g.name} reads \`this\``, n);
          }
          for (const a of as) { const e = skip(ts.isSpreadElement(a) ? a.expression : a); if (isFn(e)) fnArg(e, "run", n); else expr(e); }
          return;
        }
        case "method": {
          expr(c.on);
          const name = c.name; const k = kind(c.on); const v = val(c.on);
          const recvOpaque = [...taint(c.on)].some(i => f.opaque?.has(i));
          const cb = how => as.forEach(a => { const e = skip(ts.isSpreadElement(a) ? a.expression : a); if (isFn(e) || (ts.isIdentifier(e) && CALLBACK_SYNC.has(name) && as.indexOf(a) === (name === "replace" || name === "replaceAll" ? 1 : 0))) fnArg(e, how, n); else expr(e); });
          if (recvOpaque) { plain(); addFail("*"); return no(`it calls .${name}(…) of an argument whose type has methods of its own: not known to be the built-in`, n); }
          if (k && MUTATE[k]?.has(name)) { writeTo(c.on, n, `.${name}()`); return cb("run"); }
          if (k && KIND_READ[k]?.[name]) return cb("run");
          if (k === "object" || k === "promise" && !PROMISE_LATER.has(name)) { plain(); addFail("*"); return no(`it calls .${name}(…) of an object it made: a function that is not read`, n); }
          if (MUTATORS.has(name) && !(name in READ)) {
            if (v.f > 0 && !k) { plain(); addFail("*"); return no(`it calls .${name}(…) of a value whose kind is not known`, n); }
            writeTo(c.on, n, `.${name}()`); return cb("run");
          }
          if (PROMISE_LATER.has(name)) { addFail("*"); return cb("then"); }
          if (name in READ) {
            if (name === "test" || name === "exec") { const o = skip(c.on); if (!ts.isRegularExpressionLiteral(o) || /[gy][a-z]*$/.test(o.text)) { plain(); return no(`.${name}(…) of a pattern that may keep where it stopped (a g or y flag)`, n); } }
            if (name === "normalize" || name === "toString" && as.length) { /* plain */ }
            return cb(CALLBACK_SYNC.has(name) ? "run" : "run");
          }
          plain(); addFail("*");
          if (/^toLocale|^localeCompare$/.test(name)) return no(`.${name}(…): the answer is the locale's and the time zone's`, n);
          return no(`it calls .${name}(…), a method that is not read`, n);
        }
        default: plain(); addFail("*"); { const ce = skip(n.expression); if (ts.isCallExpression(ce) || ts.isNewExpression(ce) || ts.isPropertyAccessExpression(ce) || ts.isElementAccessExpression(ce)) expr(ce); } return no(isNew && c.kind === "unknown" && /^new /.test(c.why ?? "") ? `${c.why}: not known to only compute` : `it calls ${c.why ?? "code that is not read"}`, n);
      }
    };
    /** A function that is handed back or stored: not run by the call. What it closes over is kept past the call. */
    const kept = fn => { const v = n => { if (ts.isIdentifier(n) && isRef(n)) { const r = resolve(n, m); if (r.local && inRoot(r.fn)) for (const i of localTaint(r)) s.keeps.add(i); } ts.forEachChild(n, v); }; v(fn); };
    const assign = (target, n) => {
      const t = skip(target);
      if (ts.isIdentifier(t)) { const r = resolve(t, m); if (r.local) { if (!inRoot(r.fn)) no(`it assigns ${t.text}, a variable of the function around it`, n); return; } return no(r.top ? `it assigns ${t.text}, a variable of the module` : `it assigns ${t.text}, a global`, n); }
      if (ts.isPropertyAccessExpression(t) || ts.isElementAccessExpression(t)) { expr(t.expression); if (ts.isElementAccessExpression(t)) expr(t.argumentExpression); return writeTo(t.expression, n, "an assignment"); }
      if (ts.isArrayLiteralExpression(t)) { for (const x of t.elements) if (!ts.isOmittedExpression(x)) assign(ts.isSpreadElement(x) ? x.expression : x, n); return; }
      if (ts.isObjectLiteralExpression(t)) { for (const p of t.properties) { if (ts.isShorthandPropertyAssignment(p)) assign(p.name, n); else if (ts.isPropertyAssignment(p)) assign(p.initializer, n); else if (ts.isSpreadAssignment(p)) assign(p.expression, n); } return; }
      if (ts.isBinaryExpression(t) && t.operatorToken.kind === K.EqualsToken) { assign(t.left, n); expr(t.right); return; }
      no("it assigns to a computed place", n);
    };
    const expr = n => {
      if (!n) return;
      n = skip(n);
      if (isFn(n)) { const r = role(n, m); if (r.kind === "run") inner(n); else kept(n); return; }
      if (ts.isClassExpression(n)) return;
      if (ts.isIdentifier(n)) {
        if (!isRef(n)) return;
        const r = resolve(n, m);
        if (r.local) return;
        if (r.global !== undefined) { if (!GLOBAL_VALUES.has(r.global) && !(r.global in GLOBAL_FNS)) no(r.global === "Date" || r.global === "performance" ? `${r.global}: the clock` : /^(window|document|navigator|location|localStorage|sessionStorage|globalThis|self|process|history|screen)$/.test(r.global) ? `it reads ${r.global}: the environment` : r.global === "console" ? "console: it writes output" : `it reads ${r.global}, a global that is not known to only compute`, n); return; }
        return topRead(n, r);
      }
      if (n.kind === K.ThisKeyword) { if (!f.ctor && !isField) no("it reads `this`", n); return; }
      // `typeof window === "undefined"`: a test of where the code runs, as Solid's `isServer` is
      if (ts.isTypeOfExpression(n) && ts.isIdentifier(skip(n.expression)) && /^(window|document|navigator|self)$/.test(skip(n.expression).text) && resolve(skip(n.expression), m).global !== undefined && isTest(n)) { s.env ??= { what: `typeof ${skip(n.expression).text}`, ...place(n) }; return; }
      if (n.kind === K.SuperKeyword) return;
      if (ts.isCallExpression(n) || ts.isNewExpression(n)) return call(n);
      if (ts.isTaggedTemplateExpression(n)) { const e = skip(n.tag); const c = ts.isIdentifier(e) && !resolve(e, m).local && resolve(e, m).global === undefined ? fromBinding(binding(m, e.text), e.text, false) : ts.isPropertyAccessExpression(e) && e.name.text === "raw" && ts.isIdentifier(skip(e.expression)) && skip(e.expression).text === "String" ? { kind: "ok" } : { kind: "unknown", why: "a template's tag that is not read" }; if (c.kind === "fns") for (const g of c.fns) absorb(s, summary(g), g, n); else if (c.kind !== "ok") { addFail("*"); no(`it calls ${c.why}`, n); } if (ts.isTemplateExpression(n.template)) for (const sp of n.template.templateSpans) expr(sp.expression); return; }
      if (ts.isBinaryExpression(n)) {
        const k = n.operatorToken.kind;
        if (k >= K.FirstAssignment && k <= K.LastAssignment) { assign(n.left, n); return expr(n.right); }
        expr(n.left); return expr(n.right);
      }
      if (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) { if (n.operator === K.PlusPlusToken || n.operator === K.MinusMinusToken) return assign(n.operand, n); return expr(n.operand); }
      if (ts.isDeleteExpression(n)) { const t = skip(n.expression); if (ts.isPropertyAccessExpression(t) || ts.isElementAccessExpression(t)) { expr(t.expression); return writeTo(t.expression, n, "delete"); } return; }
      if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
        // what a bundler writes in for the build: `process.env.NODE_ENV`, `import.meta.env.DEV` — one value for as
        // long as the code runs; `import.meta.env.SSR` is a test of where it runs
        { const txt = n.getText().replace(/\s+/g, ""); if (txt === "process.env.NODE_ENV" && resolve(skip(skip(n.expression).expression), m).global !== undefined) return; if (/^import\.meta\.env\.(DEV|PROD|MODE)$/.test(txt)) return; if (txt === "import.meta.env.SSR") { if (isTest(n)) { s.env ??= { what: txt, ...place(n) }; return; } return no("it reads import.meta.env.SSR: the environment (where the code runs)", n); } }
        const o = skip(n.expression);
        if (ts.isIdentifier(o)) {
          const r = resolve(o, m);
          if (r.global !== undefined && !r.local) { const name = ts.isPropertyAccessExpression(n) ? n.name.text : undefined; if (r.global === "Math" || r.global === "Number" || r.global === "Symbol" || (r.global === "arguments")) { if (ts.isElementAccessExpression(n)) expr(n.argumentExpression); return; } if (r.global === "import" ) return; void name; }
          if (r.top?.kind === "ns") { const name = ts.isPropertyAccessExpression(n) ? n.name.text : undefined; const bs = name ? imported(m, r.top.from, name) : undefined; if (!bs) return no(`it reads ${o.text}.${name ?? "[…]"}: a module that is not read`, n); return bindingRead(bs, n, `${o.text}.${name}`); }
        }
        expr(n.expression); if (ts.isElementAccessExpression(n)) expr(n.argumentExpression); return;
      }
      if (ts.isAwaitExpression(n)) { if (!settled(n.expression)) addFail("*"); return expr(n.expression); }
      if (ts.isYieldExpression(n)) { no("a generator: it runs when it is asked, not when it is called", n); return expr(n.expression); }
      if (ts.isObjectLiteralExpression(n)) { for (const p of n.properties) { if (ts.isPropertyAssignment(p)) { if (ts.isComputedPropertyName(p.name)) expr(p.name.expression); expr(p.initializer); } else if (ts.isShorthandPropertyAssignment(p)) expr(p.name); else if (ts.isSpreadAssignment(p)) expr(p.expression); else if (isFn(p)) kept(p); } return; }
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) { no("it renders (JSX)", n); return; }
      if (ts.isMetaProperty(n)) { no("import.meta: the environment", n); return; }
      ts.forEachChild(n, c => { if (ts.isTypeNode?.(c)) return; expr(c); });
    };
    /** A read of a name of the module. */
    const topRead = (id, r) => { const bs = binding(m, id.text); if (!bs) return no(`it reads ${id.text}: ${r.top.kind === "import" || r.top.kind === "ns" ? "another module's, which is not read" : "a name the module declares twice"}`, id); bindingRead(bs, id, id.text); };
    const bindingRead = (bs, at, name) => {
      for (const x of bs) {
        if (x.solid === "DEV" || x.solid === "isDev") continue;   // the build's: one value for as long as the code runs
        if (x.solid) { if (x.solid === "isServer" && isTest(at)) { s.env ??= { what: "isServer", ...place(at) }; continue; } if (!SOLID_API[x.solid]) no(`it reads ${x.solid}, of Solid: ${x.solid === "isServer" || x.solid === "isDev" ? "the environment" : "not known to be a constant"}`, at); continue; }
        const b = x.b;
        if (b.kind === "fn" || b.kind === "class") continue;
        if (b.kind === "var" && b.isConst && b.init && envTest(b.init, x.m, 0)) { if (isTest(at)) { s.env ??= { what: name, ...place(at) }; continue; } no(`it reads ${name}: the environment (where the code runs)`, at); continue; }
        const why = constant(x.m, x.name);
        if (why) no(`it reads ${name}, ${why}`, at);
      }
    };
    /** Whether what an expression may reject with is read where it is written: a call (its own reading says), a
     *  literal, a name bound once to one of those. A promise the function was handed is not: it rejects with anything. */
    const settled = (e, d = 0) => {
      e = skip(e); if (!e || d > 6) return !e;
      if (ts.isObjectLiteralExpression(e)) return e.properties.every(p => ts.isSpreadAssignment(p) ? settled(p.expression, d + 1) : !(p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)) && p.name.text === "then"));
      if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) { let b = e; while (ts.isPropertyAccessExpression(b) || ts.isElementAccessExpression(b)) b = skip(b.expression); if (ts.isIdentifier(b)) { const r = resolve(b, m); if (r.top && !r.local) { const bs = binding(m, b.text); return !!bs && bs.every(x => x.b?.kind === "var" && !constant(x.m, x.name)); } } return false; }
      if (ts.isCallExpression(e) || ts.isNewExpression(e) || ts.isArrayLiteralExpression(e) || ts.isTemplateExpression(e) || ts.isLiteralExpression(e) || isFn(e) || ts.isPrefixUnaryExpression(e) || ts.isTypeOfExpression(e)) return true;
      if (e.kind === K.TrueKeyword || e.kind === K.FalseKeyword || e.kind === K.NullKeyword) return true;
      if (ts.isBinaryExpression(e)) { const k = e.operatorToken.kind; return k === K.BarBarToken || k === K.AmpersandAmpersandToken || k === K.QuestionQuestionToken || k === K.CommaToken ? settled(e.left, d + 1) && settled(e.right, d + 1) : true; }
      if (ts.isConditionalExpression(e)) return settled(e.whenTrue, d + 1) && settled(e.whenFalse, d + 1);
      if (ts.isAwaitExpression(e)) return true;
      if (ts.isIdentifier(e)) { if (e.text === "undefined") return true; const r = resolve(e, m); if (!r.local || r.local.multi || !inRoot(r.fn)) return false; const pi = paramIndex(r); if (pi !== undefined) return !!f.plain?.has(pi); return r.local.inits.length > 0 && r.local.inits.every(i => i.none || (i.expr && settled(i.expr, d + 1))); }
      return false;
    };
    /** Whether an expression only decides which way the code goes: the condition of an `if` or of `a ? b : c`. */
    const isTest = e => { for (let [n, p] = up(e); p; [n, p] = up(p)) { if (ts.isIfStatement(p)) return p.expression === n; if (ts.isConditionalExpression(p)) return p.condition === n; if (ts.isPrefixUnaryExpression(p) && p.operator === K.ExclamationToken) continue; if (ts.isBinaryExpression(p)) { const k = p.operatorToken.kind; if (k === K.BarBarToken || k === K.AmpersandAmpersandToken) continue; if (k === K.EqualsEqualsEqualsToken || k === K.ExclamationEqualsEqualsToken || k === K.EqualsEqualsToken || k === K.ExclamationEqualsToken) { const o = skip(p.left === n ? p.right : p.left); if (ts.isStringLiteralLike(o)) continue; } } return false; } return false; };
    const block = b => { for (const st of b.statements) stmt(st); };
    const stmt = n => {
      if (!n) return;
      if (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) return;
      if (ts.isBlock(n)) return block(n);
      if (ts.isVariableStatement(n)) { for (const d of n.declarationList.declarations) decl(d); return; }
      if (ts.isExpressionStatement(n)) return expr(n.expression);
      if (ts.isReturnStatement(n)) { if (n.expression) { const e = skip(n.expression); if (isFn(e)) kept(e); else { if (!settled(e)) addFail("*"); expr(e); } } return; }
      if (ts.isIfStatement(n)) { expr(n.expression); stmt(n.thenStatement); return stmt(n.elseStatement); }
      if (ts.isThrowStatement(n)) { expr(n.expression); return addFail(classOf(n.expression)); }
      if (ts.isTryStatement(n)) {
        if (n.catchClause) { const outer = fails; const inside = new Set(); fails = inside; block(n.tryBlock); fails = outer; caughtSets.set(n.catchClause, inside); block(n.catchClause.block); }
        else block(n.tryBlock);
        if (n.finallyBlock) block(n.finallyBlock);
        return;
      }
      if (ts.isForOfStatement(n) || ts.isForInStatement(n)) { if (n.awaitModifier) no("for await: it reads a stream", n); if (ts.isVariableDeclarationList(n.initializer)) { /* its names are the loop's */ } else assign(n.initializer, n); expr(n.expression); return stmt(n.statement); }
      if (ts.isForStatement(n)) { if (n.initializer) { if (ts.isVariableDeclarationList(n.initializer)) for (const d of n.initializer.declarations) decl(d); else expr(n.initializer); } expr(n.condition); expr(n.incrementor); return stmt(n.statement); }
      if (ts.isWhileStatement(n) || ts.isDoStatement(n)) { expr(n.expression); return stmt(n.statement); }
      if (ts.isSwitchStatement(n)) { expr(n.expression); for (const c of n.caseBlock.clauses) { if (ts.isCaseClause(c)) expr(c.expression); for (const st of c.statements) stmt(st); } return; }
      if (ts.isLabeledStatement(n)) return stmt(n.statement);
      if (ts.isWithStatement?.(n)) return no("with: names that are not the code's", n);
      if (ts.isBreakOrContinueStatement(n) || ts.isEmptyStatement(n) || n.kind === K.DebuggerStatement) return;
      ts.forEachChild(n, c => (ts.isStatement?.(c) ? stmt(c) : expr(c)));
    };
    const decl = d => { const bindInit = p => { if (ts.isIdentifier(p)) return; for (const e of p.elements ?? []) { if (ts.isOmittedExpression(e)) continue; if (e.initializer) expr(e.initializer); if (e.propertyName && ts.isComputedPropertyName(e.propertyName)) expr(e.propertyName.expression); bindInit(e.name); } }; bindInit(d.name); if (d.initializer) { const e = skip(d.initializer); if (isFn(e)) { /* a named function: read where it is called, or kept */ if (!namedUsedOnlyAsCallee(d, e)) kept(e); } else expr(e); } };
    /** A function bound to a name is run where the name is called; referenced any other way, it is kept. */
    const namedUsedOnlyAsCallee = (d, fn) => { if (!ts.isIdentifier(d.name)) return false; const host = fnOf(d); const scope = host && isFn(host) ? host : m.sf; const all = refs(scope, d.name.text, m, r => !!r.local && r.local.inits.some(i => i.expr && skip(i.expr) === fn)); return all.every(id => { const [n, p] = up(id); return p && ts.isCallExpression(p) && p.expression === n || (p && ts.isCallExpression(p) && p.arguments.includes(n)); }); };

    for (const p of root.parameters ?? []) if (p.initializer) expr(p.initializer);
    if (!body) return;
    // function declarations of the body that are handed on (not only called) are kept
    if (ts.isBlock(body)) {
      const hoisted = n => { if (ts.isFunctionDeclaration(n) && n.name) { const host = fnOf(n); const scope = host && isFn(host) ? host : m.sf; const all = refs(scope, n.name.text, m, r => !!r.local && r.local.inits.some(i => i.fn === n)); if (!all.every(id => { const [x, p] = up(id); return p && ts.isCallExpression(p) && (p.expression === x || p.arguments.includes(x)); })) kept(n); return; } if (isFn(n) || ts.isClassLike(n)) return; ts.forEachChild(n, hoisted); };
      hoisted(body); block(body);
    } else { const e = skip(body); if (isFn(e)) kept(e); else { if (!settled(e)) addFail("*"); expr(e); } }
    // a test of where the code runs (isServer, `typeof window`): the call may go two ways, each read above. What it
    // answers must then hold no data — nothing, functions, accessors — since data that differs between the server and
    // the browser is what 10 SV-7c's assertion is about, and no reading of the code shows the two sides agree
    if (s.env && isFn(root)) {
      const fnish = (e, d = 0) => {
        e = skip(e); if (!e) return true; if (d > 8) return false;
        if (isFn(e) || ts.isVoidExpression(e)) return true;
        if (ts.isIdentifier(e)) { if (e.text === "undefined") return true; const r = resolve(e, m); if (r.local) return !r.local.multi && (solidLocal(r) || (r.local.inits.length > 0 && r.local.inits.every(i => i.fn || i.none || (i.expr && fnish(i.expr, d + 1))))); if (r.top) { const bs = binding(m, e.text); return !!bs && bs.every(x => x.b && (x.b.kind === "fn" || (x.b.kind === "var" && x.b.isConst && x.b.init && isFn(skip(x.b.init))))); } return false; }
        if (ts.isArrayLiteralExpression(e)) return e.elements.every(x => !ts.isSpreadElement(x) && fnish(x, d + 1));
        if (ts.isObjectLiteralExpression(e)) return e.properties.every(p => isFn(p) || (ts.isPropertyAssignment(p) && fnish(p.initializer, d + 1)) || (ts.isShorthandPropertyAssignment(p) && fnish(p.name, d + 1)));
        if (ts.isConditionalExpression(e)) return fnish(e.whenTrue, d + 1) && fnish(e.whenFalse, d + 1);
        if (ts.isCallExpression(e)) { const c = callee(e, m); if (c.kind === "solid") return !!c.api.gives; if (c.kind === "builtin" && c.name === ".bind") return true; if (c.kind === "builtin" && c.name === "Object.assign") return e.arguments.every(a => fnish(a, d + 1)); }
        return false;
      };
      const rets = []; const find = n => { if (isFn(n) || ts.isClassLike(n)) return; if (ts.isReturnStatement(n)) rets.push(n); ts.forEachChild(n, find); };
      if (ts.isBlock(body)) find(body);
      const data = ts.isBlock(body) ? rets.find(r => r.expression && !fnish(r.expression)) : fnish(body) ? undefined : body;
      if (data) no(`it tests where it runs (${s.env.what}) and answers data: what it answers may differ between the server and the browser (10 SV-7c)`, data);
    }
  }

  /** Whether an expression is a test of where the code runs: `typeof window === "undefined"`, Solid's `isServer`, a
   *  constant bound to one, the negation of one. */
  function envTest(e, m, d) {
    e = skip(e); if (!e || d > 6) return false;
    if (ts.isPrefixUnaryExpression(e) && e.operator === K.ExclamationToken) return envTest(e.operand, m, d + 1);
    if (ts.isBinaryExpression(e)) { const k = e.operatorToken.kind; if (k === K.EqualsEqualsEqualsToken || k === K.ExclamationEqualsEqualsToken || k === K.EqualsEqualsToken || k === K.ExclamationEqualsToken) { const [a, b] = ts.isStringLiteralLike(skip(e.right)) ? [skip(e.left), skip(e.right)] : [skip(e.right), skip(e.left)]; return ts.isStringLiteralLike(b) && ts.isTypeOfExpression(a) && ts.isIdentifier(skip(a.expression)) && /^(window|document|navigator|self)$/.test(skip(a.expression).text) && !m.top.has(skip(a.expression).text); } return false; }
    if (ts.isIdentifier(e)) { const bs = binding(m, e.text); return !!bs && bs.every(x => x.solid ? x.solid === "isServer" : x.b?.kind === "var" && x.b.isConst && !!x.b.init && envTest(x.b.init, x.m, d + 1)); }
    return false;
  }

  // ---- a constant of the module ----
  /** Why a module's name is not a constant a `pure` function may read — undefined where it is one: declared `const`,
   *  never assigned, holding a literal, and nothing in the module writes through it or hands it to code that could. */
  function constant(m, name) {
    if (m.readonly.has(name)) return m.readonly.get(name);
    m.readonly.set(name, undefined);   // (a name met again while it is judged: no worse than what is found)
    const b = m.top.get(name);
    const done = why => { m.readonly.set(name, why); return why; };
    if (!b || b.kind !== "var") return done("which is not a value the module declares");
    if (!b.isConst || m.written.has(name)) return done("a variable of the module that is assigned: state that changes");
    if (b.pattern || !b.init) return done("a value the module takes apart from a call");
    const lit = literal(b.init, m, 0);
    if (lit === undefined) return done("a value made by code that runs when the module loads: not known to be a constant");
    if (lit === 0) return done(undefined);
    if ([...m.exports.values()].some(e => e.local === name)) return done("an object the module exports: any importer may change it");
    const bad = refs(m.sf, name, m, r => r.top === b).map(id => flow(id, { r: lit, f: 0 }, m, 0)).find(Boolean);
    return done(bad ? `a value of the module that ${bad.why} [${path.basename(bad.file)}:${bad.line}]: state that changes` : undefined);
  }
  /** How many levels of containers a literal has (0: a primitive), or undefined where it is not a literal a function
   *  may read as a constant: a getter, a `valueOf` or `toString` of its own, a function, a value that is computed. */
  function literal(e, m, d) {
    e = skip(e);
    if (d > 8) return undefined;
    if (ts.isStringLiteralLike(e) || ts.isNumericLiteral(e) || e.kind === K.TrueKeyword || e.kind === K.FalseKeyword || e.kind === K.NullKeyword || ts.isBigIntLiteral(e)) return 0;
    if (ts.isRegularExpressionLiteral(e)) return /\/[a-z]*[gy][a-z]*$/.test(e.text) ? undefined : 0;
    if (isFn(e) || ts.isClassExpression(e) || ts.isVoidExpression(e)) return 0;
    // a symbol, and a context Solid makes: values that are made once and hold nothing that changes
    if (ts.isCallExpression(e)) { const c = skip(e.expression); if (ts.isIdentifier(c) && c.text === "Symbol" && !m.top.has("Symbol")) return 0; if (ts.isPropertyAccessExpression(c) && c.getText() === "Symbol.for") return 0; if (ts.isIdentifier(c)) { const bs = binding(m, c.text); if (bs && bs.every(x => x.solid === "createContext")) return 0; } }
    if (ts.isPrefixUnaryExpression(e) && ts.isNumericLiteral(e.operand)) return 0;
    if (ts.isTemplateExpression(e)) return e.templateSpans.every(sp => literal(sp.expression, m, d + 1) === 0) ? 0 : undefined;
    if (ts.isIdentifier(e)) { if (e.text === "undefined" || e.text === "NaN" || e.text === "Infinity") return 0; const b = m.top.get(e.text); if (b?.kind === "var" && b.isConst && b.init && !m.written.has(e.text)) return literal(b.init, m, d + 1); if (b?.kind === "fn" || b?.kind === "class") return 0; return undefined; }
    if (ts.isArrayLiteralExpression(e)) { let k = 0; for (const x of e.elements) { if (ts.isSpreadElement(x) || ts.isOmittedExpression(x)) return undefined; const q = literal(x, m, d + 1); if (q === undefined) return undefined; k = Math.max(k, q); } return k + 1; }
    if (ts.isObjectLiteralExpression(e)) { let k = 0; for (const p of e.properties) { if (!ts.isPropertyAssignment(p) || ts.isComputedPropertyName(p.name)) return undefined; const pn = p.name.text; if (pn === "valueOf" || pn === "toString" || pn === "toJSON" || pn === "then" || pn === "__proto__") return undefined; const q = literal(p.initializer, m, d + 1); if (q === undefined) return undefined; k = Math.max(k, q); } return k + 1; }
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(skip(e.expression)) && skip(e.expression).getText() === "Object.freeze" && e.arguments.length === 1) return literal(e.arguments[0], m, d + 1);
    if (ts.isNewExpression(e) && ts.isIdentifier(skip(e.expression)) && /^(Map|Set)$/.test(skip(e.expression).text) && !m.top.has(skip(e.expression).text)) { if (!e.arguments?.length) return 1; const q = literal(e.arguments[0], m, d + 1); return q === undefined ? undefined : q; }
    if (ts.isBinaryExpression(e) && e.operatorToken.kind !== K.CommaToken && !(e.operatorToken.kind >= K.FirstAssignment && e.operatorToken.kind <= K.LastAssignment)) return literal(e.left, m, d + 1) === 0 && literal(e.right, m, d + 1) === 0 ? 0 : undefined;
    return undefined;
  }
  /** Where the value at `node` goes, with `v` what it shares (`r` levels of shared containers under `f` of its own):
   *  undefined where every use only reads, else `{ why, file, line }` — a write through it, or a place it goes that
   *  could write. */
  function flow(node, v, m, depth) {
    if (v.r <= 0) return undefined;
    if (depth > 40) return { why: "is handed on further than is followed", ...place(node) };
    const [n, p] = up(node);
    const bad = why => ({ why, ...place(n) });
    if (!p) return undefined;
    // a list of [key, value] pairs (`Object.entries`): a pair's first part is a key, a primitive
    const acc = w => w.pairs ? { ...access(w), pair: true } : access(w);
    const alias = (nameNode, w) => {
      if (w.r <= 0) return undefined;
      if (!ts.isIdentifier(nameNode)) { for (const [i, e] of (nameNode.elements ?? []).entries()) { if (ts.isOmittedExpression(e)) continue; if (w.pair && ts.isArrayBindingPattern(nameNode) && i === 0) continue; const x = alias(e.name, e.dotDotDotToken ? wrap(access(w)) : access(w)); if (x) return x; } return undefined; }
      const host = fnOf(nameNode); const scope = host && isFn(host) ? host : m.sf;
      const l = isFn(scope) ? locals(scope).get(nameNode.text) : undefined;
      if (l && l.count > 1) return { why: `is bound to ${nameNode.text}, which is bound again`, ...place(nameNode) };
      for (const id of refs(scope, nameNode.text, m, r => isFn(scope) ? r.fn === scope : !!r.top)) { const x = flow(id, w, m, depth + 1); if (x) return x; }
      return undefined;
    };
    if ((ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) && p.expression === n) {
      const [pn, pp] = up(p);
      if (pp && ts.isCallExpression(pp) && pp.expression === pn) {
        const name = ts.isPropertyAccessExpression(p) ? p.name.text : ts.isStringLiteralLike(skip(p.argumentExpression)) ? skip(p.argumentExpression).text : undefined;
        if (!name) return bad("has a computed method called");
        const g = READ[name] ?? KIND_READ.map[name] ?? (name === "size" ? "prim" : undefined);
        if (MUTATORS.has(name) && !(name in READ)) return v.f > 0 ? undefined : bad(`is changed in place (.${name}())`);
        if (name === "sort" || name === "reverse") return bad(`is changed in place (.${name}())`);
        if (!g) return bad(`has .${name}(…) called, a method that is not read`);
        for (const a of pp.arguments) { const e = skip(a); if (isFn(e)) { for (const [i, q] of e.parameters.entries()) { if ((name === "reduce" || name === "reduceRight" ? i > 1 : i > 0)) continue; const x = alias(q.name, name === "reduce" || name === "reduceRight" ? (i === 0 ? { r: INF, f: 0 } : acc(v)) : acc(v)); if (x) return x; } } else if (ts.isIdentifier(e) && CALLBACK_SYNC.has(name)) return bad(`has its parts handed to ${e.text}`); }
        const out = g === "prim" || (g === "fresh" && pp.arguments.length && isFn(skip(pp.arguments[0]))) ? PRIM : g === "copy" ? { ...wrap(access(v)), pairs: v.pairs } : g === "copy2" ? { ...wrap(access(v), 2), pairs: true } : g === "elem" ? acc(v) : g === "fresh" ? { r: access(v).r, f: 1 } : v;
        return flow(pp, out, m, depth + 1);
      }
      // an assignment to, an update or a delete of a property of it
      if (pp && ts.isBinaryExpression(pp) && pp.left === pn && pp.operatorToken.kind >= K.FirstAssignment && pp.operatorToken.kind <= K.LastAssignment) return v.f > 0 ? undefined : bad("is written to");
      if (pp && (ts.isPrefixUnaryExpression(pp) || ts.isPostfixUnaryExpression(pp)) && (pp.operator === K.PlusPlusToken || pp.operator === K.MinusMinusToken)) return v.f > 0 ? undefined : bad("is written to");
      if (pp && ts.isDeleteExpression(pp)) return v.f > 0 ? undefined : bad("has a property deleted");
      if (v.pair && ts.isElementAccessExpression(p) && ts.isNumericLiteral(skip(p.argumentExpression)) && skip(p.argumentExpression).text === "0") return undefined;
      return flow(p, acc(v), m, depth + 1);
    }
    if (ts.isElementAccessExpression(p) && p.argumentExpression === n) return undefined;
    if (ts.isBinaryExpression(p)) {
      const k = p.operatorToken.kind;
      if (k >= K.FirstAssignment && k <= K.LastAssignment) { if (p.left === n) return undefined; const l = skip(p.left); if (ts.isIdentifier(l)) return alias(l, v); return bad("is stored where it can be changed"); }
      if (k === K.BarBarToken || k === K.AmpersandAmpersandToken || k === K.QuestionQuestionToken || k === K.CommaToken) return p.right === n || k !== K.CommaToken ? flow(p, v, m, depth + 1) : undefined;
      return undefined;
    }
    if (ts.isConditionalExpression(p)) return p.condition === n ? undefined : flow(p, v, m, depth + 1);
    if (ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) return p.operator === K.PlusPlusToken || p.operator === K.MinusMinusToken ? undefined : undefined;
    if (ts.isTypeOfExpression(p) || ts.isVoidExpression(p) || ts.isTemplateSpan(p) || ts.isIfStatement(p) || ts.isWhileStatement(p) || ts.isDoStatement(p) || ts.isSwitchStatement(p) || ts.isCaseClause(p) || ts.isExpressionStatement(p) || ts.isThrowStatement(p) || ts.isComputedPropertyName(p)) return undefined;
    if (ts.isAwaitExpression(p)) return flow(p, v, m, depth + 1);
    if (ts.isVariableDeclaration(p) && p.initializer === n) { const loop = p.parent?.parent; void loop; return alias(p.name, v); }
    if (ts.isForOfStatement(p) && p.expression === n) { if (ts.isVariableDeclarationList(p.initializer)) return alias(p.initializer.declarations[0].name, acc(v)); return bad("is walked into a name declared elsewhere"); }
    if (ts.isForInStatement(p) || ts.isForStatement(p)) return undefined;
    if (ts.isSpreadElement(p) || ts.isSpreadAssignment(p)) { const lit = p.parent; if (ts.isCallExpression(lit) || ts.isNewExpression(lit)) return bad("is spread into a call"); return flow(lit, wrap(access(v)), m, depth + 1); }
    if (ts.isPropertyAssignment(p) && p.initializer === n) return flow(p.parent, wrap(v), m, depth + 1);
    if (ts.isShorthandPropertyAssignment(p)) return flow(p.parent, wrap(v), m, depth + 1);
    if (ts.isArrayLiteralExpression(p)) return flow(p, wrap(v), m, depth + 1);
    if (ts.isReturnStatement(p) || (ts.isArrowFunction(p) && p.body === n)) return flow.returning ? undefined : bad("is handed back, to be changed by whoever calls");
    if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
      if (p.expression === n) return undefined;
      const i = (p.arguments ?? []).indexOf(n);
      const c = callee(p, m);
      if (c.kind === "builtin") { const g = c.gives; if (g === "target") return i === 0 ? (v.f > 0 ? flow(p, v, m, depth + 1) : c.name === "Object.freeze" || c.name === "Object.isFrozen" ? flow(p, v, m, depth + 1) : bad(`is changed in place (${c.name})`)) : flow(p, v, m, depth + 1); if (g === "prim" || g === "deep") return undefined; if (c.made) return c.made === "map" || c.made === "set" || c.made === "array" ? flow(p, wrap(access(access(v))), m, depth + 1) : undefined; return flow(p, g === "copy" ? wrap(access(v)) : g === "copy2" ? { ...wrap(access(v), 2), pairs: true } : g === "elem" ? access(v) : g === "fresh" ? { r: v.r, f: 1 } : v, m, depth + 1); }
      if (c.kind === "fns") { for (const g of c.fns) { const t = summary(g); if (t.mutates.has(i)) return bad(`is given to ${g.name}, which changes it`); if (t.keeps.has(i)) return bad(`is given to ${g.name}, which keeps it or hands it on`); if (t.pure.some(x => /not read|computed/.test(x.why))) return bad(`is given to ${g.name}, which calls code that is not read`); } return flow(p, v, m, depth + 1); }
      if (c.kind === "solid" && (c.name === "merge" || c.name === "omit" || c.name === "untrack")) return flow(p, v, m, depth + 1);
      if (c.kind === "method" && ts.isIdentifier(skip(c.on)) && skip(c.on).text === "console" && resolve(skip(c.on), m).global !== undefined) return undefined;   // printed: read, not changed
      return bad(`is given to ${c.why ?? (c.kind === "method" ? `.${c.name}(…)` : c.kind === "local" ? `${c.r.name}(…)` : "a call")}, which is not read`);
    }
    if (ts.isJsxExpression(p) || ts.isJsxSpreadAttribute(p)) return bad("is rendered");
    return bad("is used in a way that is not followed");
  }

  // ---- a callback: when is it called? ----
  /** Whether an `await` is passed before `node` runs, in the function `fn` it is written in: an earlier statement of a
   *  block around it that awaits whatever happens. */
  function afterAwait(node, fn) {
    if (!isAsync(fn)) return false;
    const definite = st => (ts.isExpressionStatement(st) && (ts.isAwaitExpression(skip(st.expression)) || (ts.isBinaryExpression(skip(st.expression)) && skip(st.expression).operatorToken.kind === K.EqualsToken && ts.isAwaitExpression(skip(skip(st.expression).right))))) || (ts.isVariableStatement(st) && st.declarationList.declarations.some(d => d.initializer && ts.isAwaitExpression(skip(d.initializer)))) || (ts.isForOfStatement(st) && !!st.awaitModifier);
    for (let n = node; n && n !== fn; n = n.parent) { const p = n.parent; const list = p && (ts.isBlock(p) || ts.isCaseClause(p) || ts.isDefaultClause(p)) ? p.statements : undefined; if (list) { const at = list.indexOf(n); for (let i = 0; i < at; i++) if (definite(list[i])) return true; } }
    return false;
  }
  const timingOf = new WeakMap();
  /** When code written at `node`, inside the root `f`, runs: "later" (behind something that calls later, outside any
   *  computation), "sync" (while the call runs, or inside a computation), "reentry" (inside a function that is handed
   *  back or kept: whenever whoever has it calls it). */
  function timing(node, f, seen = new Set()) {
    const m = f.m;
    for (let fn = fnOf(node); fn && !ts.isSourceFile(fn); fn = fnOf(fn)) {
      if (!isFn(fn)) return "reentry";   // a class's member
      if (afterAwait(node, fn)) return "later";
      if (fn === f.node) return "sync";
      const r = role(fn, m);
      if (r.kind === "later" || r.kind === "listen" || r.kind === "then") return "later";
      if (r.kind === "kept") return "reentry";
      if (r.kind === "named") {
        if (seen.has(fn)) return "sync"; seen.add(fn);
        const host = fnOf(r.at); const scope = host && isFn(host) ? host : m.sf;
        const all = refs(scope, r.name, m, x => isFn(scope) ? x.fn === scope : !!x.top);
        let worst = "later"; if (!all.length) return "reentry";
        for (const id of all) { const t = useTiming(id, f, seen); if (t === "reentry") return "reentry"; if (t === "sync") worst = "sync"; }
        return worst;
      }
      if (r.kind === "given") {
        // handed to a function that is read: when that function calls it
        let worst = "later";
        for (const g of r.fns) { const us = callbackUses(g, r.index, undefined, seen); if (!us.length) return "reentry"; for (const u of us) { if (u.how === "escape" || u.how === "reentry") return "reentry"; if (u.how === "sync") worst = "sync"; } }
        if (worst === "later") return "later";
      }
      node = fn;
    }
    return "reentry";
  }
  /** When a function known by a name runs, by one use of the name. */
  function useTiming(id, f, seen) {
    const [n, p] = up(id); const m = f.m;
    if (p && ts.isCallExpression(p) && p.expression === n) return timing(p, f, seen);
    if (p && (ts.isCallExpression(p) || ts.isNewExpression(p)) && (p.arguments ?? []).includes(n)) {
      const i = p.arguments.indexOf(n); const c = callee(p, m);
      if (c.kind === "later") return c.at.includes(i) ? "later" : "reentry";
      if (c.kind === "solid") { const how = c.api.args?.[i]; return how === "later" ? "later" : how ? timing(p, f, seen) : "reentry"; }
      if (c.kind === "builtin") return c.sync ? timing(p, f, seen) : "reentry";
      if (c.kind === "method") return PROMISE_LATER.has(c.name) || c.name === "removeEventListener" ? "later" : CALLBACK_SYNC.has(c.name) ? timing(p, f, seen) : "reentry";
      if (c.kind === "fns") { let worst = "later"; for (const g of c.fns) { const us = callbackUses(g, i, undefined, seen); for (const u of us) { const t = u.how === "later" ? "later" : u.how === "sync" ? timing(p, f, seen) : "reentry"; if (t === "reentry") return "reentry"; if (t === "sync") worst = "sync"; } } return worst; }
      return "reentry";
    }
    if (p && ts.isPropertyAccessExpression(p) && p.expression === n) return "sync";   // `f.name`: read, not called
    return "reentry";
  }
  const usesMemo = new Map(); const usesBusy = new Set();
  /** Every use the code makes of a callback — parameter `index` of `f`, or its field `field` — as
   *  `{ how: "sync" | "later" | "reentry" | "escape", why, file, line }`. Empty: it is never called here. */
  function callbackUses(f, index, field, seen = new Set()) {
    const key = `${f.node.pos}\0${f.m.file}\0${index}\0${field ?? ""}`;
    if (usesMemo.has(key)) return usesMemo.get(key);
    if (usesBusy.has(key)) return [];   // met again while it is read (recursion): the reading under way finds what there is
    usesBusy.add(key);
    const out = []; const m = f.m; const fn = f.node;
    const p = fn.parameters?.[index];
    // kept only when nothing was being read above it: a reading made inside another may have met that one unfinished
    const done = () => { usesBusy.delete(key); if (!usesBusy.size) usesMemo.set(key, out); return out; };
    if (!p || !fn.body) return done();
    if (p.dotDotDotToken) { out.push({ how: "escape", why: "a rest parameter", ...place(p) }); return done(); }
    const use = (how, why, n) => out.push({ how, why, ...place(n) });
    const visited = new Set();
    /** `node` is the callback itself, as an expression. */
    const value = (node, d = 0) => {
      if (d > 30) return use("escape", "handed on further than is followed", node);
      const [n, par] = up(node);
      if (!par) return;
      if ((ts.isCallExpression(par)) && par.expression === n) { const t = timing(par, f); return use(t, t === "later" ? "called later" : t === "sync" ? "called while the call runs" : "called from a function that is handed back or kept: whenever that is called", par); }
      if (ts.isPropertyAccessExpression(par) && par.expression === n && (par.name.text === "call" || par.name.text === "apply") && ts.isCallExpression(par.parent) && par.parent.expression === par) { const t = timing(par.parent, f); return use(t, `.${par.name.text}(…)`, par); }
      // `cb.bind(x, …)` is the callback with its first arguments said: it goes where the bound function goes
      if (ts.isPropertyAccessExpression(par) && par.expression === n && par.name.text === "bind") return ts.isCallExpression(par.parent) && par.parent.expression === par ? value(par.parent, d + 1) : use("escape", "its .bind is taken", par);
      if (ts.isCallExpression(par) || ts.isNewExpression(par)) {
        const i = (par.arguments ?? []).indexOf(n); if (i < 0) return use("escape", "constructed", par);
        { const ce = skip(par.expression); if (ts.isPropertyAccessExpression(ce) && ce.name.text === "bind" && ts.isPropertyAccessExpression(skip(ce.expression)) && skip(ce.expression).name.text === "removeEventListener") return; }   // `t.removeEventListener.bind(t, type, cb)`: what takes it off
        const c = callee(par, m); const t = timing(par, f);
        const at = (how) => how === "reentry" ? "reentry" : how === "later" || t === "later" ? "later" : t === "reentry" ? "reentry" : how;
        if (c.kind === "later") return c.at.includes(i) ? use("later", `given to ${c.name ?? "an observer"}`, par) : use("escape", `given to ${c.name ?? "an observer"} where it is not the listener`, par);
        if (c.kind === "solid") { const how = c.api.args?.[i]; return how === "later" ? use("later", `given to ${c.name}, which runs it after, outside tracking`, par) : how ? use(at("sync"), `given to ${c.name}, which runs it in a computation`, par) : use("escape", `given to ${c.name}`, par); }
        if (c.kind === "builtin") return c.sync && (c.name === "new Promise" ? i === 0 : true) ? use(at("sync"), `given to ${c.name}, which calls it`, par) : use("escape", `given to ${c.name}`, par);
        if (c.kind === "method" && c.name === "removeEventListener") return;   // taken off: not called
        if (c.kind === "method") return PROMISE_LATER.has(c.name) ? use("later", `given to .${c.name}(…)`, par) : CALLBACK_SYNC.has(c.name) ? use(at("sync"), `given to .${c.name}(…), which calls it`, par) : use("escape", `given to .${c.name}(…), a method that is not read`, par);
        if (c.kind === "fns") { for (const g of c.fns) for (const u of callbackUses(g, i, undefined, seen)) out.push({ ...u, how: u.how === "escape" ? "escape" : at(u.how === "reentry" ? "reentry" : u.how), why: `${g.name}: ${u.why}` }); return; }
        return use("escape", `given to ${c.why ?? "code that is not read"}`, par);
      }
      if (ts.isVariableDeclaration(par) && par.initializer === n && ts.isIdentifier(par.name)) return name(par.name, d);
      if (ts.isBinaryExpression(par)) {
        const k = par.operatorToken.kind;
        if (k === K.EqualsToken && par.right === n) { const l = skip(par.left); if (ts.isIdentifier(l)) { const r = resolve(l, m); if (r.local) return nameRefs(r, l.text, d); } return use("escape", "stored", par); }
        if (k === K.QuestionQuestionToken || k === K.BarBarToken) return par.left === n || par.right === n ? value(par, d + 1) : undefined;
        if (k === K.AmpersandAmpersandToken) return par.right === n ? value(par, d + 1) : undefined;
        return;   // compared, tested
      }
      if (ts.isConditionalExpression(par)) return par.condition === n ? undefined : value(par, d + 1);
      if (ts.isPrefixUnaryExpression(par) || ts.isTypeOfExpression(par) || ts.isIfStatement(par) || ts.isExpressionStatement(par) || ts.isVoidExpression(par)) return;
      if (ts.isPropertyAssignment(par) && par.initializer === n || ts.isShorthandPropertyAssignment(par)) {
        // in a record given to a function that is read: that function's field
        const lit = par.parent; const [ln, lp] = up(lit); const fname = par.name && (ts.isIdentifier(par.name) || ts.isStringLiteralLike(par.name)) ? par.name.text : undefined;
        if (fname && lp && ts.isCallExpression(lp) && lp.arguments.includes(ln)) { const c = callee(lp, m); const t = timing(lp, f); if (c.kind === "fns") { for (const g of c.fns) for (const u of callbackUses(g, lp.arguments.indexOf(ln), fname, seen)) out.push({ ...u, how: u.how === "escape" || u.how === "reentry" ? u.how : u.how === "later" || t === "later" ? "later" : t === "reentry" ? "reentry" : u.how, why: `${g.name}: ${u.why}` }); return; } }
        return use("escape", "put in a record that goes where it is not followed", par);
      }
      if (ts.isJsxExpression(par) && ts.isJsxAttribute(par.parent)) { const tag = par.parent.parent.parent.tagName; const an = par.parent.name.getText(); if (ts.isIdentifier(tag) && /^[a-z]/.test(tag.text) && (/^on[A-Z:]/.test(an) || an === "ref")) return use("later", `the element's ${an}`, par); return use("escape", `given to <${tag.getText()}> as ${an}`, par); }
      if (ts.isReturnStatement(par) || (ts.isArrowFunction(par) && par.body === n)) return use("escape", "handed back", par);
      return use("escape", "used in a way that is not followed", par);
    };
    const name = (id, d) => { const host = fnOf(id); const scope = host && isFn(host) ? host : m.sf; const l = isFn(scope) ? locals(scope).get(id.text) : undefined; if (!l) return use("escape", "bound to a name of the module", id); nameRefs({ fn: scope, local: l }, id.text, d); };
    const nameRefs = (r, text, d) => { if (visited.has(r.local)) return; visited.add(r.local); if (r.local.count > 1 && r.local.inits.some(i => i.param === undefined && !i.expr && !i.part)) return use("escape", `${text} is bound more than once`, r.fn); for (const id of refs(r.fn, text, m, x => x.local === r.local)) { if (isAssignTarget(id)) continue; if (field === undefined || d > 0) value(id, d + 1); else whole(id); } };
    const isAssignTarget = id => { const [n, par] = up(id); return !!par && ts.isBinaryExpression(par) && par.left === n && par.operatorToken.kind === K.EqualsToken; };
    /** `node` is the record that has the callback as `field`. */
    const whole = (node, d = 0) => {
      if (d > 30) return use("escape", "handed on further than is followed", node);
      const [n, par] = up(node);
      if (!par) return;
      if ((ts.isPropertyAccessExpression(par) || ts.isElementAccessExpression(par)) && par.expression === n) {
        const fname = ts.isPropertyAccessExpression(par) ? par.name.text : ts.isStringLiteralLike(skip(par.argumentExpression)) ? skip(par.argumentExpression).text : null;
        if (fname === null) return use("escape", "read by a computed name", par);
        if (fname !== field) return;
        const [an, ap] = up(par);
        if (ap && ts.isBinaryExpression(ap) && ap.left === an && ap.operatorToken.kind === K.EqualsToken) return;
        return value(par, 1);
      }
      if (ts.isVariableDeclaration(par) && par.initializer === n) return pattern(par.name, d);
      if (ts.isCallExpression(par) || ts.isNewExpression(par)) {
        const i = (par.arguments ?? []).indexOf(n); if (i < 0) return;
        const c = callee(par, m); const t = timing(par, f);
        if (c.kind === "fns") { for (const g of c.fns) for (const u of callbackUses(g, i, field, seen)) out.push({ ...u, how: u.how === "escape" || u.how === "reentry" ? u.how : u.how === "later" || t === "later" ? "later" : t === "reentry" ? "reentry" : u.how, why: `${g.name}: ${u.why}` }); return; }
        if (c.kind === "builtin" && (c.gives === "prim") && !/^(Object\.(keys|getOwnPropertyNames)|JSON\.stringify)$/.test(c.name)) return;
        return use("escape", `the record is given to ${c.why ?? c.name ?? "code that is not read"}`, par);
      }
      if (ts.isSpreadAssignment(par) || ts.isSpreadElement(par) || ts.isJsxSpreadAttribute(par)) return use("escape", "the record is spread into another", par);
      if (ts.isBinaryExpression(par)) { const k = par.operatorToken.kind; if (k === K.EqualsToken && par.right === n) return use("escape", "the record is stored", par); if ((k === K.QuestionQuestionToken || k === K.BarBarToken || k === K.AmpersandAmpersandToken) && (par.right === n || k !== K.AmpersandAmpersandToken)) return whole(par, d + 1); return; }
      if (ts.isConditionalExpression(par)) return par.condition === n ? undefined : whole(par, d + 1);
      if (ts.isPrefixUnaryExpression(par) || ts.isTypeOfExpression(par) || ts.isIfStatement(par) || ts.isExpressionStatement(par)) return;
      if (ts.isForInStatement(par)) return use("escape", "the record's fields are walked", par);
      if (ts.isPropertyAssignment(par) || ts.isShorthandPropertyAssignment(par) || ts.isArrayLiteralExpression(par) || ts.isReturnStatement(par) || ts.isArrowFunction(par) || ts.isJsxExpression(par)) return use("escape", "the record is handed on", par);
      return use("escape", "the record is used in a way that is not followed", par);
    };
    const pattern = (pat, d) => {
      if (ts.isIdentifier(pat)) { const host = fnOf(pat); const scope = host && isFn(host) ? host : m.sf; const l = isFn(scope) ? locals(scope).get(pat.text) : undefined; if (!l) return use("escape", "the record is bound to a name of the module", pat); if (visited.has(l)) return; visited.add(l); for (const id of refs(scope, pat.text, m, x => x.local === l)) whole(id, d + 1); return; }
      if (!ts.isObjectBindingPattern(pat)) return use("escape", "the record is taken apart as a list", pat);
      for (const e of pat.elements) { if (e.dotDotDotToken) { pattern(e.name, d); continue; } const pn = e.propertyName ?? e.name; if (ts.isComputedPropertyName(pn)) { use("escape", "taken apart by a computed name", e); continue; } if (pn.text !== field) continue; if (ts.isIdentifier(e.name)) name(e.name, 1); else use("escape", "taken apart further", e); }
    };
    if (field === undefined) { if (ts.isIdentifier(p.name)) { const l = locals(fn).get(p.name.text); if (l) nameRefs({ fn, local: l }, p.name.text, 0); } else use("escape", "taken apart where it is declared", p); }
    else pattern(p.name, 0);
    return done();
  }

  // ---- what a call hands back ----
  const plainMemo = new WeakMap();
  /** Whether everything `f` can hand back is a value the code builds there — a record or a list written out (no
   *  getter of its own), a function, a primitive, a built-in's instance — and so no store whose fields wait or throw
   *  where they are read: that is what Solid's store makers and projections hand back, a value the function was given
   *  may be, and a call into code that is not read may hand back. */
  function plainResult(f) {
    if (plainMemo.has(f.node)) return plainMemo.get(f.node);
    plainMemo.set(f.node, false);   // met again while it is read: not shown
    const m = f.m, root = f.node;
    const ok = (e, d = 0) => {
      e = skip(e); if (!e) return true; if (d > 10) return false;
      if (isFn(e) || ts.isClassExpression(e) || ts.isLiteralExpression(e) || ts.isTemplateExpression(e) || ts.isArrayLiteralExpression(e) || ts.isTypeOfExpression(e) || ts.isVoidExpression(e) || ts.isPrefixUnaryExpression(e) || ts.isPostfixUnaryExpression(e)) return true;
      if (e.kind === K.TrueKeyword || e.kind === K.FalseKeyword || e.kind === K.NullKeyword) return true;
      if (ts.isObjectLiteralExpression(e)) return e.properties.every(p => ts.isSpreadAssignment(p) ? ok(p.expression, d + 1) : !ts.isGetAccessorDeclaration(p) && !ts.isSetAccessorDeclaration(p));
      if (ts.isConditionalExpression(e)) return ok(e.whenTrue, d + 1) && ok(e.whenFalse, d + 1);
      if (ts.isBinaryExpression(e)) { const k = e.operatorToken.kind; return k === K.BarBarToken || k === K.AmpersandAmpersandToken || k === K.QuestionQuestionToken ? ok(e.left, d + 1) && ok(e.right, d + 1) : k === K.CommaToken || (k >= K.FirstAssignment && k <= K.LastAssignment) ? ok(e.right, d + 1) : true; }
      if (ts.isAwaitExpression(e)) return ok(e.expression, d + 1);
      if (ts.isIdentifier(e)) {
        if (e.text === "undefined") return true;
        const r = resolve(e, m);
        if (r.local) return !r.local.multi && r.local.inits.length > 0 && r.local.inits.every(i => i.fn || i.cls || i.none || (i.expr && ok(i.expr, d + 1)));
        if (r.top) { const bs = binding(m, e.text); return !!bs && bs.every(x => x.b && (x.b.kind === "fn" || x.b.kind === "class" || (x.b.kind === "var" && x.b.isConst && x.b.init && !x.m.written.has(x.name) && literal(x.b.init, x.m, 0) !== undefined))); }
        return false;
      }
      if (ts.isCallExpression(e) || ts.isNewExpression(e)) {
        const c = callee(e, m);
        if (c.kind === "builtin") return c.gives === "target" || c.gives === "same" ? (e.arguments ?? []).every(a => ok(ts.isSpreadElement(a) ? a.expression : a, d + 1)) : true;
        if (c.kind === "later") return true;   // a timer's id, an observer
        if (c.kind === "solid") return c.name === "createSignal" || c.name === "createMemo" || c.name === "createStore" || c.name === "createOptimistic" || c.name === "createOptimisticStore" || c.name === "createUniqueId" || c.name === "getOwner" || c.name === "createRoot" && false;
        if (c.kind === "method") return (c.name in READ && READ[c.name] !== "elem" && READ[c.name] !== "same") || c.name === "bind";
        if (c.kind === "fns") return c.fns.every(g => g.cls ? !g.node.members.some(x => ts.isGetAccessorDeclaration(x)) && !g.node.heritageClauses?.some(h => h.token === K.ExtendsKeyword && !(ts.isIdentifier(skip(h.types[0].expression)) && skip(h.types[0].expression).text in NEW_OK)) : plainResult(g));
        if (c.kind === "local" && !c.r.local.multi && c.r.local.inits.length === 1) { const i0 = c.r.local.inits[0]; const g = i0.fn ?? (i0.expr && isFn(skip(i0.expr)) ? skip(i0.expr) : undefined); if (g) return plainResult({ m, node: g }); }
        return false;
      }
      return false;
    };
    let out = true;
    const body = root.body;
    if (!body) out = false;
    else if (ts.isBlock(body)) { const find = n => { if (!out || isFn(n) || ts.isClassLike(n)) return; if (ts.isReturnStatement(n) && n.expression && !ok(n.expression)) out = false; ts.forEachChild(n, find); }; find(body); }
    else out = ok(body);
    plainMemo.set(f.node, out); return out;
  }

  // ---- the answers ----
  /** To a fixed point: a function met while it is being read (recursion) is taken as the round before found it — at
   *  first as proven — and the reading is made again until a round changes nothing. Every property only gets worse
   *  from round to round (not pure, more thrown, called sooner), so it ends, at the greatest fixed point. */
  function rounds(run) { let out; for (let i = 0; i < 8; i++) { changed = false; cyclic = false; out = run(); if (!cyclic || !changed) break; sums = new WeakMap(); usesMemo.clear(); for (const m of mods.values()) m?.readonly.clear(); } return out; }
  /** What the code shows of the export `name` of `spec`, imported from `dir`. `types`: what the row's types say —
   *  `opaque`: the indexes of the parameters whose type has methods of its own.
   *  @returns {undefined | { files: string[], pure: boolean, why: {why,file,line}[], makes: boolean,
   *    rejects: null | { node, name?: string }[] , rejectsWhy?: string, isAsync: boolean,
   *    handler(index, field?): { ok: boolean, uses: [] }, draft(index): "changes" | "never" | undefined, draftWhy(index) }} */
  function exportFacts(spec, dir, name, types = {}) {
    const files = targets(spec, dir); if (!files.length) return { unread: `${spec} resolves to no ES module that can be read from ${dir}` };
    const [head, ...rest] = name.split(".");
    const fns = [];
    for (const file of files) {
      const bs = exported(file, head);
      if (!bs) return { unread: `${head} is not followed to a declaration in ${path.basename(file)}`, files };
      for (const x of bs) {
        if (x.solid) return { unread: `${head} is Solid's own`, files };
        const b = x.b; let node = b.kind === "fn" ? b.node : b.kind === "var" && b.isConst && b.init && !x.m.written.has(x.name) ? skip(b.init) : undefined;
        let method = false;
        for (const part of rest) { node = node && ts.isObjectLiteralExpression(node) ? memberFn(node, part) : undefined; method = true; }
        if (!node || !isFn(node)) return { unread: `${name} is ${b.kind === "class" ? "a class" : "not a function the module declares (a value made by a call, or assigned again)"} in ${path.basename(x.m.file)}`, files };
        fns.push({ m: x.m, node, name, opaque: types.opaque, plain: types.plain, method });
      }
    }
    const classes = file => { const out = new Map(); const m = load(file); if (!m) return out; for (const [en] of m.exports) { const bs = exported(file, en); if (bs && bs.length === 1 && bs[0].b?.kind === "class") out.set(bs[0].b.node, en); } return out; };
    return rounds(() => {
      const ss = fns.map(g => g.opaque?.size || g.plain?.size ? read(g) : summary(g));
      const why = []; for (const [i, s] of ss.entries()) { for (const w of s.pure) why.push(w); if (fns[i].method && /\bthis\b/.test(fns[i].node.getText())) why.push({ why: "a method that reads `this`", ...place(fns[i].node) }); if (fns[i].node.asteriskToken) why.push({ why: "a generator", ...place(fns[i].node) }); }
      // what it rejects with: classes the module exports, in every build
      let rejects = [], rejectsWhy;
      const byFile = new Map(files.map(f => [f, classes(f)]));
      const names = new Set();
      for (const s of ss) for (const c of s.fails) { if (c === "*") { rejects = null; rejectsWhy ??= "a call, a callback or a thrown value whose class the code does not show adds `Error`"; continue; } const n = [...byFile.values()].map(mp => mp.get(c)).find(Boolean); if (!n) { rejects = null; rejectsWhy ??= `it throws ${c.name?.text ?? "a class"}, which the module does not export`; } else names.add(n); }
      if (rejects) rejects = [...names].sort();
      const handler = (index, field) => {
        const uses = fns.flatMap(g => callbackUses(g, index, field));
        const called = fns.every(g => callbackUses(g, index, field).length > 0);
        return { ok: called && uses.every(u => u.how === "later"), never: !uses.length, uses };
      };
      const draft = index => {
        if (ss.some(s => s.may.has(index) || (s.mutates.has(index) && s.mutates.get(index).later))) return undefined;
        if (ss.every(s => s.mutates.has(index)) && ss.every(s => !s.keeps.has(index))) return "changes";
        if (ss.some(s => s.mutates.has(index))) return undefined;
        // never: every use of the parameter only reads
        for (const g of fns) { const p = g.node.parameters?.[index]; if (!p || p.dotDotDotToken) return undefined; const m = g.m; const names = []; const pn = q => { if (ts.isIdentifier(q)) names.push(q); else for (const e of q.elements ?? []) if (!ts.isOmittedExpression(e)) pn(e.name); }; pn(p.name); flow.returning = true; try { for (const id of names) for (const r of refs(g.node, id.text, m, x => x.fn === g.node)) if (flow(r, FOREIGN, m, 0)) return undefined; } finally { flow.returning = false; } }
        return "never";
      };
      const draftWhy = index => { for (const s of ss) if (s.mutates.has(index)) return s.mutates.get(index); return undefined; };
      return { files, plain: fns.every(g => plainResult(g)), pure: !why.length, why, makes: ss.some(s => s.makes), rejects, rejectsWhy, isAsync: fns.every(g => isAsync(g.node)), fns, handler, draft, draftWhy };
    });
  }
  return { exportFacts, targets, load };
}

module.exports = { create };
