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
// MO-8w adds what JSX and Solid's contexts show, and a value made by a call:
//   handler   on a component's prop too: it reaches only an element's `on…` or `ref` — as an attribute, by a spread,
//             through `omit`, `merge`, a copy, a component of the module it is given to.
//   uses(c)   `useContext(C)` on every path of the call, where nothing answers without a provider (no default; a
//             `null` the code throws on). On one path only, later, or under another owner: no word.
//   provides  a provider of `C` written in the component, and every use of its props that may be of a view written
//             among that provider's children (a view is made where its expression is evaluated).
//   a value made by a call (`export const x = factory(…)`) is the function the factory hands back, read with the
//   factory's parameters standing for the call's arguments; what that function shares between its calls is state.
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
/** The constructors of ECMAScript whose creation only computes (ECMA-262), and no others: `[kind, argument rules, what the
 *  result holds]`. A rule says what an argument must be for the constructor to run no code of anyone's on it; an argument
 *  past the rules is ignored by the constructor, or (`…`) read as the last one. Not here: Function (code), Intl's (the
 *  locale), SharedArrayBuffer (another agent's). Nothing of the platform's.
 *    any     kept, tested for being an object, or not read         prim    converted: a primitive
 *    list    iterated: null, or a list that is known plain         pairs   iterated, and each item's 0 and 1 read
 *    fill    a length, a list of primitives, a buffer made here    buffer  a buffer made here
 *    plain   a record of data properties (`{ cause }`)             time    a number of milliseconds, or a UTC string
 *    text    a pattern: a primitive, or a pattern written out      run     called now: a promise's executor */
const NEW = T({
  Map: ["map", ["pairs"], "parts2"], WeakMap: ["map", ["pairs"], "parts2"], Set: ["set", ["list"], "parts"], WeakSet: ["set", ["list"], "parts"],
  WeakRef: ["weakref", ["any"], "args"], FinalizationRegistry: ["registry", ["any"], "nothing"], Proxy: ["proxy", ["any", "any"], "foreign"], Promise: ["promise", ["run"], "nothing"],
  Array: ["array", ["any…"], "args"], Object: ["boxed", ["any"], "arg"], Boolean: ["boxed", ["any"], "nothing"], Number: ["boxed", ["prim"], "nothing"], String: ["boxed", ["prim"], "nothing"],
  ArrayBuffer: ["buffer", ["prim", "plain"], "nothing"], DataView: ["view", ["buffer", "prim", "prim"], "nothing"], RegExp: ["regexp", ["text", "prim"], "nothing"], Date: ["date", ["time"], "nothing"],
  ...Object.fromEntries("Int8 Uint8 Uint8Clamped Int16 Uint16 Int32 Uint32 Float16 Float32 Float64 BigInt64 BigUint64".split(" ").map(n => [`${n}Array`, ["typed", ["fill", "prim", "prim"], "nothing"]])),
  ...Object.fromEntries("Error TypeError RangeError SyntaxError ReferenceError EvalError URIError".split(" ").map(n => [n, ["error", ["prim", "plain"], "parts"]])),
  AggregateError: ["error", ["list", "prim", "plain"], "parts"],
});
/** Made by the call, and whose every use runs code of its own (a proxy's traps) or reads the time zone (a date, as text):
 *  it may be handed back, or kept in what is handed back, and nothing else (`holds`). */
const HELD = T({ proxy: "a Proxy, whose traps every use runs", date: "a Date, which reads the time zone" });
/** The platform's that were read before the table, as they were. */
const NEW_URL = new Set(["URL", "URLSearchParams"]);
/** The platform's: what is given here is called later, outside any computation. */
const LATER_GLOBAL = T({ setTimeout: 0, setInterval: 0, queueMicrotask: 0, requestAnimationFrame: 0, requestIdleCallback: 0 });
const LATER_NEW = new Set(["ResizeObserver", "MutationObserver", "IntersectionObserver", "PerformanceObserver"]);
/** Solid's, by what it does with each function argument: "track" — run now, inside a computation; "run" — run now;
 *  "later" — run after, outside any computation, under the owner (an effect's second function, a cleanup). `makes`: the
 *  call makes a node the owner keeps. */
const SOLID = /^(solid-js(\/store|\/internal)?|@solidjs\/(signals|web|universal))$/;
const SOLID_API = T({
  createSignal: { args: { 0: "track" }, makes: true, gives: "signal" }, createMemo: { args: { 0: "track" }, makes: true, gives: "read" }, createEffect: { args: { 0: "track", 1: "later" }, makes: true },
  createRenderEffect: { args: { 0: "track", 1: "later" }, makes: true }, createTrackedEffect: { args: { 0: "later" }, makes: true }, createStore: { args: { 0: "track" }, makes: true, gives: "store" },
  createProjection: { args: { 0: "track" }, makes: true, gives: "read" }, createAsync: { args: { 0: "track" }, makes: true, gives: "read" }, createOptimistic: { args: { 0: "track" }, makes: true, gives: "signal" },
  createOptimisticStore: { args: { 0: "track" }, makes: true, gives: "store" }, createRoot: { args: { 0: "run" }, makes: true }, untrack: { args: { 0: "run" } }, runWithOwner: { args: { 1: "run" } },
  createOwner: { makes: true }, onCleanup: { args: { 0: "later" }, makes: true }, onSettled: { args: { 0: "later" }, makes: true }, getOwner: {}, getObserver: {}, createContext: {}, useContext: {}, merge: {}, omit: {}, isPending: { args: { 0: "track" } },
  latest: { args: { 0: "track" } }, mapArray: { args: { 0: "track", 1: "track" }, makes: true, gives: "read" }, createUniqueId: { makes: true }, children: { args: { 0: "track" }, makes: true, gives: "read" },
});

/** Solid's makers whose first argument is a value, or a function that computes it. */
const VALUE_OR_FN = new Set(["createSignal", "createStore", "createOptimistic", "createOptimisticStore"]);
const join = (a, b) => ({ r: Math.max(a.r, b.r), f: Math.min(a.f, b.f) });
const PRIM = { r: 0, f: INF }, FOREIGN = { r: INF, f: 0 };
/** One step into a value: its element, or a property of it. */
const access = v => v.f > 0 ? { r: v.r, f: v.f === INF ? INF : v.f - 1 } : { r: Math.max(0, v.r === INF ? INF : v.r - 1), f: 0 };
const wrap = (v, n = 1) => ({ r: v.r, f: v.f === INF ? INF : v.f + n });

/** What a constructor's result shares with its arguments, by the table. */
const heldBy = (c, v) => c.keeps === "nothing" ? { r: 0, f: INF } : c.keeps === "args" ? wrap(v) : c.keeps === "parts" ? wrap(access(v)) : c.keeps === "parts2" ? wrap(access(access(v))) : c.keeps === "arg" ? v : FOREIGN;

function create(ts, options = {}) {
  const K = ts.SyntaxKind;
  const mods = new Map();          // file → module model, or null
  let sums = new WeakMap();        // function node → its summary (this round's)
  const prev = new WeakMap();      // … the round before's, for a function met while it is being read
  const active = new Map();        // function node → the environments it is being read in
  const NOENV = {};
  let changed = false, cyclic = false;
  const isFn = n => !!n && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n) || ts.isConstructorDeclaration(n));
  const skip = e => { while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression?.(e) || ts.isSatisfiesExpression?.(e))) e = e.expression; return e; };
  const up = n => { let p = n.parent; while (p && (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isNonNullExpression(p) || ts.isSatisfiesExpression?.(p))) { n = p; p = p.parent; } return [n, p]; };
  const place = n => { const sf = n.getSourceFile(); const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf)); return { file: sf.fileName, line: line + 1 }; };
  const modOf = n => mods.get(n.getSourceFile().fileName);
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
  /** Every name the module exports in any of its builds — undefined where one of them, or a module it hands on whole
   *  (`export * from`), is not read to its end: no ES module, Solid's own, a file that is not there. */
  function exportedNames(spec, dir) {
    const out = new Set(), seen = new Set();
    const read = file => {
      if (seen.has(file)) return true; seen.add(file);
      const m = load(file); if (!m || !(m.exports.size || m.stars.length)) return false;
      for (const n of m.exports.keys()) out.add(n);
      return m.stars.every(from => { const fs_ = SOLID.test(from) ? [] : targets(from, path.dirname(file)); return fs_.length > 0 && fs_.every(read); });
    };
    const files = targets(spec, dir);
    return files.length && files.every(read) ? out : undefined;
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
  /** Whether a name is the global's: nothing around it declares it, in a block or as a class's own name either, and the
   *  file never assigns it. */
  const declaredOf = new WeakMap();
  function isGlobal(id, m) {
    if (resolve(id, m).global === undefined || m.written.has(id.text)) return false;
    let by = declaredOf.get(m.sf);
    if (!by) { declaredOf.set(m.sf, by = new Map()); const all = n => { if (ts.isIdentifier(n) && n.parent?.name === n && (ts.isVariableDeclaration(n.parent) || ts.isParameter(n.parent) || ts.isBindingElement(n.parent) || ts.isFunctionDeclaration(n.parent) || ts.isFunctionExpression(n.parent) || ts.isClassLike(n.parent) || ts.isEnumDeclaration(n.parent) || ts.isModuleDeclaration(n.parent))) { let h = ts.isFunctionExpression(n.parent) || ts.isClassExpression(n.parent) ? n.parent : n.parent.parent; while (h && !isFn(h) && !ts.isClassLike(h) && !ts.isSourceFile(h)) h = h.parent; by.set(n.text, [...(by.get(n.text) ?? []), h]); } ts.forEachChild(n, all); }; all(m.sf); }
    const hs = by.get(id.text) ?? []; for (let n = id; n; n = n.parent) if (hs.includes(n)) return false;
    return true;
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
    if (ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent)) {
      const tag = tagOf(p.parent); const an = p.parent.name.getText();
      if (isElementTag(tag)) { if (/^on[A-Z]/.test(an) || an === "ref") return { kind: "listen" }; return { kind: "kept" }; }
    }
    return { kind: "kept" };
  }
  /** What a call's callee is. */
  function callee(call, m) {
    const e = skip(call.expression);
    const isNew = ts.isNewExpression(call);
    if (ts.isIdentifier(e)) {
      const r = resolve(e, m);
      if (r.global !== undefined) {
        if (isNew) return LATER_NEW.has(r.global) ? { kind: "later", at: [0], listen: true, observer: r.global } : NEW[r.global] && isGlobal(e, m) ? { kind: "builtin", name: `new ${r.global}`, made: NEW[r.global][0], rules: NEW[r.global][1], keeps: NEW[r.global][2], sync: r.global === "Promise" } : NEW_URL.has(r.global) && isGlobal(e, m) ? { kind: "builtin", name: `new ${r.global}`, made: "url", keeps: "nothing" } : { kind: "unknown", why: `new ${r.global}` };
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
          if (r.global === "Math") return name === "random" ? { kind: "unknown", why: "Math.random: randomness", effect: true } : { kind: "builtin", name: `Math.${name}`, gives: "prim" };
          if (STATIC[r.global]?.[name]) return { kind: "builtin", name: `${r.global}.${name}`, gives: STATIC[r.global][name], sync: r.global === "Array" && name === "from" };
          if (r.global === "Date" || r.global === "performance") return { kind: "unknown", why: `${r.global}.${name}: the clock`, effect: true };
          if (r.global === "crypto") return { kind: "unknown", why: `crypto.${name}: randomness`, effect: true };
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
  const staticOf = (e, m) => ts.isPropertyAccessExpression(e) && ts.isIdentifier(skip(e.expression)) && !m.top.has(skip(e.expression).text) && skip(e.expression).text !== "Math" && STATIC[skip(e.expression).text]?.[e.name.text] ? { kind: "builtin", name: `${skip(e.expression).text}.${e.name.text}`, gives: STATIC[skip(e.expression).text][e.name.text], sync: skip(e.expression).text === "Array" && e.name.text === "from" } : undefined;
  /** The element or component a JSX attribute (or a spread among them) is written on. */
  const tagOf = attr => attr.parent.parent.tagName;
  const isElementTag = tag => ts.isIdentifier(tag) && /^[a-z]/.test(tag.text);
  function fromBinding(bs, name, isNew) {
    if (!bs) return { kind: "unknown", why: `${name}: code that is not read (another package's, or not a module's top-level function)` };
    if (bs.every(x => x.solid)) { const api = SOLID_API[bs[0].solid]; return api && !isNew && bs.every(x => x.solid === bs[0].solid) ? { kind: "solid", api, name: bs[0].solid } : { kind: "unknown", why: `${bs[0].solid}, of Solid: not known to only compute` }; }
    const fns = [];
    for (const x of bs) {
      if (x.solid) return { kind: "unknown", why: `${name}: Solid's in one build, the package's in another` };
      const b = x.b;
      if (x.m.written.has(x.name)) return { kind: "unknown", why: `${name}: a function the module assigns again` };
      if (b.kind === "fn" && !isNew) fns.push({ m: x.m, node: b.node, name: x.name });
      else if (b.kind === "class" && isNew) fns.push({ m: x.m, node: b.node, name: x.name, cls: true });
      else if (b.kind === "var" && b.isConst && !x.m.written.has(x.name) && b.init && isFn(skip(b.init)) && !isNew) fns.push({ m: x.m, node: skip(b.init), name: x.name });
      else if (b.kind === "var" && b.isConst && b.init && ts.isClassExpression(skip(b.init)) && isNew) fns.push({ m: x.m, node: skip(b.init), name: x.name, cls: true });
      else {
        // `const keys = Object.keys`: the built-in by another name
        const st = b.kind === "var" && b.isConst && b.init && !isNew && bs.length === 1 ? staticOf(skip(b.init), x.m) : undefined;
        if (st) return st;
        // `const tryOnCleanup = isDev ? fn => … : onCleanup`: one of two functions
        const q = b.kind === "var" && b.isConst && b.init && !isNew && bs.length === 1 ? skip(b.init) : undefined;
        if (q && ts.isConditionalExpression(q)) { const of = [q.whenTrue, q.whenFalse].map(e => { e = skip(e); return isFn(e) ? { kind: "fns", fns: [{ m: x.m, node: e, name: x.name }], name } : ts.isIdentifier(e) && e.text !== x.name ? fromBinding(binding(x.m, e.text), e.text, false) : { kind: "unknown" }; }); if (of.every(c => c.kind === "fns" || c.kind === "solid")) return { kind: "either", of }; }
        return { kind: "unknown", why: `${name}: ${b.kind === "var" ? "a value made by a call, or one the module assigns again" : "not a function the module declares"}` };
      }
    }
    return { kind: "fns", fns, name };
  }

  // ---- a value made by a call ----
  // `export const ease = named(bezier(0.42, 0, 1, 1), "easeIn")`, `export const useKeys = createSingletonRoot(() => …)`,
  // `export const Toggle = rootScope(function Toggle(props) { … })`: what such a name holds is the function its factory
  // hands back, with the factory's parameters standing for the arguments it was called with. An environment says which:
  // `{ id, map: local → { expr, m, env } | { undef }, parent }` — a factory's parameter bound to the argument's
  // expression, in the module and the environment the call is written in. A function value is `{ m, node, env }`.
  let envIds = 0; const envOf = new WeakMap(); const MAX_DEPTH = 6;
  const envGet = (env, local) => { for (let e = env; e; e = e.parent) { const b = e.map.get(local); if (b) return b; } return undefined; };
  /** Whether a reference writes the name it names: `x = …`, `x += …`, `x++`, a loop's target, a destructuring target. */
  const isWriteRef = id => { let [n, p] = up(id); while (p && (ts.isArrayLiteralExpression(p) || ts.isObjectLiteralExpression(p) || ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p) || ts.isSpreadElement(p) || ts.isSpreadAssignment(p))) { if (ts.isPropertyAssignment(p) && p.name === n) return false; [n, p] = up(p); } if (!p) return false; if (ts.isBinaryExpression(p) && p.left === n && p.operatorToken.kind >= K.FirstAssignment && p.operatorToken.kind <= K.LastAssignment) return true; if ((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) && (p.operator === K.PlusPlusToken || p.operator === K.MinusMinusToken)) return true; if ((ts.isForInStatement(p) || ts.isForOfStatement(p)) && p.initializer === n) return true; return false; };
  /** Whether a function's local is given a value more than once: declared twice, or assigned anywhere in the function. */
  const reassigned = (r, m) => r.local.count > 1 || r.local.multi || refs(r.fn, r.name, m, x => x.local === r.local).some(isWriteRef);
  /** The environment of a call of `g` with `call`'s arguments, written in module `am` under `aenv`. */
  function bindEnv(g, call, am, aenv) {
    let by = envOf.get(call); if (!by) envOf.set(call, by = new Map());
    const key = aenv ?? NOENV; let byG = by.get(key); if (!byG) by.set(key, byG = new Map());
    const k2 = g.env ?? NOENV; if (byG.has(g.node) && byG.get(g.node).has(k2)) return byG.get(g.node).get(k2);
    // (`depth`: how many calls deep the arguments were written; past a few, a call is not followed — see `resultOf`)
    const env = { id: ++envIds, map: new Map(), parent: g.env, depth: Math.max(aenv?.depth ?? 0, g.env?.depth ?? 0) + 1 };
    const ls = locals(g.node); const args = call.arguments ?? [];
    (g.node.parameters ?? []).forEach((q, i) => { if (!ts.isIdentifier(q.name) || q.dotDotDotToken) return; const l = ls.get(q.name.text); if (!l) return; const a = args[i]; const isUndef = !a || (ts.isIdentifier(skip(a)) && skip(a).text === "undefined") || ts.isVoidExpression(skip(a)); env.map.set(l, isUndef ? (q.initializer ? { expr: q.initializer, m: g.m, env } : { undef: true }) : { expr: a, m: am, env: aenv }); });
    if (!byG.has(g.node)) byG.set(g.node, new Map()); byG.get(g.node).set(k2, env);
    return env;
  }
  const isObjectAssign = (e, m) => { const c = skip(e.expression); return ts.isPropertyAccessExpression(c) && c.name.text === "assign" && ts.isIdentifier(skip(c.expression)) && skip(c.expression).text === "Object" && resolve(skip(c.expression), m).global !== undefined; };
  const shortEnvs = new WeakMap();
  /** `g` as a call with `n` arguments reads it: the parameters past the last argument are `undefined` (or their
   *  defaults), so a branch that tests one of them (`if (options?.dirty)`) is not taken. The function itself where
   *  every parameter is given, or it takes the rest of its arguments in one. */
  function calledWith(g, n) {
    const ps = g.node.parameters ?? [];
    if (g.env || g.cls || n >= ps.length || ps.some(q => q.dotDotDotToken) || /\barguments\b/.test(g.node.body?.getText() ?? "")) return g;
    let by = shortEnvs.get(g.node); if (!by) shortEnvs.set(g.node, by = new Map());
    if (!by.has(n)) { const env = { id: ++envIds, map: new Map(), parent: undefined }; const ls = locals(g.node); ps.forEach((q, i) => { if (i < n || !ts.isIdentifier(q.name)) return; const l = ls.get(q.name.text); if (l) env.map.set(l, q.initializer ? { expr: q.initializer, m: g.m, env } : { undef: true }); }); by.set(n, env); }
    return { ...g, env: by.get(n) };
  }
  /** What an expression's value is, as far as the code shows it: `{ e, m, env, name? }` with `e` the expression that
   *  makes it — a function, a record or a list written out, a call that is not followed — reached through names bound
   *  once, a factory's parameters (by the environment), members of records written out, parts taken by a pattern, and
   *  what a call of a function that is read hands back (every `return` of it the same value). */
  const valMemo = new WeakMap();
  function valOf(e, m, env, d = 0) {
    e = skip(e); if (!e || d > 32) return undefined;
    // (asked many times of the same expression: each answer is kept, by where the expression is read from)
    if (e.pos >= 0 && e.parent) { let by = valMemo.get(e); if (!by) valMemo.set(e, by = new Map()); const k = env ?? NOENV; if (by.has(k)) return by.get(k); by.set(k, undefined); const v = valOf1(e, m, env, d); by.set(k, v); return v; }
    return valOf1(e, m, env, d);
  }
  function valOf1(e, m, env, d) {
    if (isFn(e)) return { e, m, env, name: e.name && ts.isIdentifier(e.name) ? e.name.text : undefined };
    if (ts.isIdentifier(e)) {
      const r = resolve(e, m);
      if (r.local) {
        const b = envGet(env, r.local); if (b) return b.undef ? undefined : valOf(b.expr, b.m, b.env, d + 1);
        if (r.local.inits.length !== 1 || reassigned(r, m)) return undefined;
        const v = initOf(r.local.inits[0], m, env, d + 1); return v && { ...v, name: v.name ?? e.text };
      }
      if (!r.top) return undefined;
      const bs = binding(m, e.text); if (!bs || bs.length !== 1 || bs[0].solid) return undefined;
      const x = bs[0];
      if (x.b.kind === "fn") return x.m.written.has(x.name) ? undefined : { e: x.b.node, m: x.m, env: undefined, name: x.name };
      if (x.b.kind !== "var" || !x.b.isConst || x.m.written.has(x.name)) return undefined;
      if (x.b.pattern) { const v = partOf(x.b.decl.name, x.name, x.b.decl.initializer, x.m, undefined, d + 1); return v && { ...v, name: x.name }; }
      if (!x.b.init) return undefined;
      const v = valOf(x.b.init, x.m, undefined, d + 1); return v && { ...v, name: x.name };
    }
    if (ts.isPropertyAccessExpression(e)) { const o = skip(e.expression); if (ts.isIdentifier(o)) { const r = resolve(o, m); if (r.top?.kind === "ns") { const bs = imported(m, r.top.from, e.name.text); if (!bs || bs.length !== 1 || bs[0].solid) return undefined; const x = bs[0]; return x.b.kind === "fn" ? { e: x.b.node, m: x.m, env: undefined, name: x.name } : x.b.kind === "var" && x.b.isConst && x.b.init && !x.b.pattern && !x.m.written.has(x.name) ? valOf(x.b.init, x.m, undefined, d + 1) : undefined; } } const v = memberOf(e.expression, e.name.text, m, env, d + 1); return v && (v.node ? { e: v.node, m: v.m, env: v.env, method: true } : valOf(v.expr, v.m, v.env, d + 1)); }
    if (ts.isElementAccessExpression(e) && ts.isNumericLiteral(skip(e.argumentExpression))) { const o = valOf(e.expression, m, env, d + 1); const i = Number(skip(e.argumentExpression).text); if (!o || !ts.isArrayLiteralExpression(o.e) || o.e.elements.slice(0, i + 1).some(x => ts.isSpreadElement(x)) || !o.e.elements[i]) return undefined; return valOf(o.e.elements[i], o.m, o.env, d + 1); }
    if (ts.isCallExpression(e)) {
      if (isObjectAssign(e, m)) return e.arguments[0] ? valOf(e.arguments[0], m, env, d + 1) : undefined;
      const g = fnValueOf(e.expression, m, env, d + 1);
      if (g) { const r = resultOf(g, e, m, env, d + 1); if (r) return r; }
      return { e, m, env };
    }
    return { e, m, env };
  }
  /** The value a local's one initializer gives it. */
  function initOf(i0, m, env, d) {
    if (i0.fn) return i0.fn.body ? { e: i0.fn, m, env } : undefined;
    if (i0.expr) return valOf(i0.expr, m, env, d);
    if (i0.part) { const src = i0.part.expr ? i0.part.expr : undefined; if (!src) return undefined; return partOf(i0.of, undefined, src, m, env, d, i0.el); }
    return undefined;
  }
  /** The part a pattern takes of an initializer's value: an element of a list written out, a member of a record. */
  function partOf(pat, name, init, m, env, d, el) {
    if (!init) return undefined;
    el ??= (pat.elements ?? []).find(x => !ts.isOmittedExpression(x) && ts.isIdentifier(x.name) && x.name.text === name);
    if (!el || el.dotDotDotToken || el.initializer || !pat.elements.includes(el)) return undefined;
    if (ts.isArrayBindingPattern(pat)) { const o = valOf(init, m, env, d + 1); const i = pat.elements.indexOf(el); if (!o || !ts.isArrayLiteralExpression(o.e) || o.e.elements.slice(0, i + 1).some(x => ts.isSpreadElement(x)) || !o.e.elements[i]) return undefined; return valOf(o.e.elements[i], o.m, o.env, d + 1); }
    const key = el.propertyName ?? el.name; if (!ts.isIdentifier(key) && !ts.isStringLiteralLike(key)) return undefined;
    const v = memberOf(init, key.text, m, env, d + 1); return v && (v.node ? { e: v.node, m: v.m, env: v.env, method: true } : valOf(v.expr, v.m, v.env, d + 1));
  }
  /** The function an expression's value is, where the code shows it. `{ m, node, env, name }`. */
  function fnValueOf(e, m, env, d = 0) {
    const v = valOf(e, m, env, d); if (!v || !isFn(v.e) || !v.e.body) return undefined;
    return { m: v.m, node: v.e, env: v.env, name: v.name, method: v.method };
  }
  /** What a call of `g` hands back: every `return` of it the same value. */
  function resultOf(g, call, am, aenv, d) {
    const node = g.node; if (!node.body || node.asteriskToken || isAsync(node) || (call.arguments ?? []).some(a => ts.isSpreadElement(a))) return undefined;
    if (Math.max(aenv?.depth ?? 0, g.env?.depth ?? 0) >= MAX_DEPTH) return undefined;   // factories of factories, further than is followed
    const env = bindEnv(g, call, am, aenv);
    const rets = [];
    if (ts.isBlock(node.body)) { const find = n => { if (isFn(n) || ts.isClassLike(n)) return; if (ts.isReturnStatement(n)) rets.push(n.expression); ts.forEachChild(n, find); }; find(node.body); } else rets.push(node.body);
    let out;
    for (const r of rets) { const v = r ? valOf(r, g.m, env, d + 1) : undefined; if (!v) return undefined; if (out && (out.e !== v.e || out.env !== v.env)) return undefined; out = v; }
    return out;
  }
  /** The member `name` of what an expression's value is, where the code writes that object out: a record written there,
   *  a name bound once to one, `Object.assign(target, { … })`. `{ expr, m, env }`, or a method's `{ m, node, env }`. */
  function memberOf(e, name, m, env, d = 0) {
    e = skip(e); if (!e || d > 32) return undefined;
    const inRecord = (lit, mm, ee) => {
      for (let i = lit.properties.length - 1; i >= 0; i--) {
        const p = lit.properties[i]; if (ts.isSpreadAssignment(p)) return undefined;
        const pn = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)) ? p.name.text : undefined; if (pn === undefined) return undefined; if (pn !== name) continue;
        if (ts.isMethodDeclaration(p)) return { m: mm, node: p, env: ee, method: true };
        if (ts.isPropertyAssignment(p)) return { expr: p.initializer, m: mm, env: ee };
        if (ts.isShorthandPropertyAssignment(p)) return { expr: p.name, m: mm, env: ee };
        return undefined;
      }
      return undefined;
    };
    if (ts.isCallExpression(e) && isObjectAssign(e, m)) {
      for (let i = e.arguments.length - 1; i >= 1; i--) { const a = valOf(e.arguments[i], m, env, d + 1); if (!a || !ts.isObjectLiteralExpression(a.e)) return undefined; const v = inRecord(a.e, a.m, a.env); if (v) return v; if (a.e.properties.some(p => ts.isSpreadAssignment(p) || !(p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name))))) return undefined; }
      return undefined;   // (a member of the target itself — a function's own property — is not one the code writes out)
    }
    // a name bound once to `Object.assign(fn, { … })`: the members the call writes
    if (ts.isIdentifier(e)) {
      const r = resolve(e, m); let raw;
      if (r.local) { const b = envGet(env, r.local); raw = b ? (b.undef ? undefined : b) : r.local.inits.length === 1 && r.local.inits[0].expr && !reassigned(r, m) ? { expr: r.local.inits[0].expr, m, env } : undefined; }
      else if (r.top) { const bs = binding(m, e.text); const x = bs && bs.length === 1 && !bs[0].solid ? bs[0] : undefined; if (x && x.b.kind === "var" && x.b.isConst && x.b.init && !x.b.pattern && !x.m.written.has(x.name)) raw = { expr: x.b.init, m: x.m, env: undefined }; }
      if (raw && ts.isCallExpression(skip(raw.expr)) && isObjectAssign(skip(raw.expr), raw.m)) return memberOf(raw.expr, name, raw.m, raw.env, d + 1);
      if (raw && ts.isIdentifier(skip(raw.expr))) return memberOf(raw.expr, name, raw.m, raw.env, d + 1);
    }
    const o = valOf(e, m, env, d + 1);
    if (!o) return undefined;
    if (ts.isObjectLiteralExpression(o.e)) return inRecord(o.e, o.m, o.env);
    if (ts.isCallExpression(o.e) && o.e !== e && isObjectAssign(o.e, o.m)) return memberOf(o.e, name, o.m, o.env, d + 1);
    return undefined;
  }

  /** Whether the part `at` of what `g` hands back (an index, a field, `""` the whole of it) is shown to be a reader:
   *  in every `return`, what Solid's `createMemo` (or another maker of one) gives, a signal's getter, or a function of
   *  nothing that only computes — it writes nothing, makes nothing, and answers no function made at each call. */
  function readsPart(g, at) {
    const node = g.node; if (!node.body || node.asteriskToken || isAsync(node)) return false;
    const reader = (e, m, env) => {
      e = skip(e); if (!e) return false;
      if (ts.isIdentifier(e)) {
        const r = resolve(e, m), i = r.local?.inits.length === 1 && !r.local.multi && !reassigned(r, m) ? r.local.inits[0] : undefined;
        if (i?.part?.expr && i.of && ts.isArrayBindingPattern(i.of) && ts.isCallExpression(skip(i.part.expr))) { const c = callee(skip(i.part.expr), m); return c.kind === "solid" && c.api.gives === "signal" && i.of.elements.indexOf(i.el) === 0; }
      }
      const v = valOf(e, m, env); if (!v) return false;
      if (ts.isCallExpression(v.e)) { const c = callee(v.e, v.m); return c.kind === "solid" && c.api.gives === "read"; }
      if (!isFn(v.e) || !v.e.body || v.method || isAsync(v.e) || v.e.asteriskToken || (v.e.parameters ?? []).some(q => !q.initializer && !q.questionToken)) return false;
      const s = summary({ m: v.m, node: v.e, env: v.env, name: v.name });
      return !s.pure.length && !s.wants.length && !s.held && !s.makes && !s.mutates.size && !s.may.size && quiet(v, new Set());
    };
    // no write of the state the call made: nothing it names, nor what a function it names names, is a setter (a write of
    // a fn's own state is no part of `pure`, and is one of a read)
    const quiet = (v, seen) => {
      if (seen.has(v.e)) return true; seen.add(v.e);
      let ok = true;
      const look = n => {
        if (!ok) return;
        if (ts.isNewExpression(n)) { ok = false; return; }   // another value at each read
        if (ts.isIdentifier(n) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) && !(ts.isPropertyAssignment(n.parent) && n.parent.name === n)) {
          const r = resolve(n, v.m), i = r.local?.inits[0];
          if (i?.part?.expr && ts.isCallExpression(skip(i.part.expr))) { const c = callee(skip(i.part.expr), v.m); if (c.kind === "solid" && c.api.gives && !(i.of && ts.isArrayBindingPattern(i.of) && i.of.elements.indexOf(i.el) === 0)) { ok = false; return; } }
        }
        if (ts.isIdentifier(n) || ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) { const g = fnValueOf(n, v.m, v.env); if (g && !quiet({ e: g.node, m: g.m, env: g.env }, seen)) { ok = false; return; } }
        ts.forEachChild(n, look);
      };
      look(v.e.body ?? v.e);
      return ok;
    };
    const rets = [];
    if (ts.isBlock(node.body)) { const find = n => { if (isFn(n) || ts.isClassLike(n)) return; if (ts.isReturnStatement(n)) rets.push(n.expression); ts.forEachChild(n, find); }; find(node.body); } else rets.push(node.body);
    const one = e => {
      e = skip(e); if (!e) return false;
      if (ts.isConditionalExpression(e)) return one(e.whenTrue) && one(e.whenFalse);
      if (at === "") return reader(e, g.m, g.env);
      if (/^\d+$/.test(at)) { const o = valOf(e, g.m, g.env); return !!o && ts.isArrayLiteralExpression(o.e) && !o.e.elements.slice(0, Number(at) + 1).some(x => ts.isSpreadElement(x)) && !!o.e.elements[Number(at)] && reader(o.e.elements[Number(at)], o.m, o.env); }
      const f = memberOf(e, at, g.m, g.env); return !!f && !f.node && reader(f.expr, f.m, f.env);
    };
    return rets.length > 0 && rets.every(one);
  }
  const passMemo = new WeakMap();
  /** Whether a function only hands back what it was given: every `return` a parameter, a call of one with nothing
   *  (`v()`), or a choice between those. `{ idx: the parameters, calls: whether one is called }`, else null. */
  function passes(g) {
    if (passMemo.has(g.node)) return passMemo.get(g.node);
    passMemo.set(g.node, null);
    const node = g.node; if (!node.body || isAsync(node) || node.asteriskToken) return null;
    const idx = new Set(); let calls = false, ok = true;
    const pi = id => { const r = resolve(id, g.m); return r.local && r.fn === node && r.local.inits.length === 1 && r.local.inits[0].param !== undefined && !reassigned(r, g.m) ? r.local.inits[0].param : -1; };
    const ret = e => { e = skip(e); if (!e) { ok = false; return; } if (ts.isIdentifier(e)) { const i = pi(e); if (i < 0) ok = false; else idx.add(i); return; } if (ts.isCallExpression(e) && !e.arguments.length && ts.isIdentifier(skip(e.expression))) { const i = pi(skip(e.expression)); if (i < 0) ok = false; else { idx.add(i); calls = true; } return; } if (ts.isConditionalExpression(e)) { ret(e.whenTrue); ret(e.whenFalse); return; } if (ts.isBinaryExpression(e) && (e.operatorToken.kind === K.BarBarToken || e.operatorToken.kind === K.QuestionQuestionToken)) { ret(e.left); ret(e.right); return; } ok = false; };
    if (ts.isBlock(node.body)) { let any = false; const find = n => { if (isFn(n) || ts.isClassLike(n)) return; if (ts.isReturnStatement(n)) { any = true; ret(n.expression); } ts.forEachChild(n, find); }; find(node.body); if (!any) ok = false; } else ret(node.body);
    const out = ok && idx.size ? { idx, calls } : null; passMemo.set(g.node, out); return out;
  }

  // ---- a function's summary ----
  const optimistic = () => ({ pure: [], makes: false, fails: new Set(), mutates: new Map(), may: new Set(), calls: new Set(), keeps: new Set(), env: undefined, held: undefined, wants: [], given: undefined, deep: new Set(), later: new Set(), gives: new Set(), maybe: new Map(), fields: new Map(), made: new Set(), reads: new Set() });
  const same = (a, b) => a.pure.length === b.pure.length && a.makes === b.makes && a.fails.size === b.fails.size && a.mutates.size === b.mutates.size && a.calls.size === b.calls.size && a.keeps.size === b.keeps.size && a.may.size === b.may.size && a.held === b.held && a.wants.length === b.wants.length && a.given === b.given && ['deep', 'later', 'gives', 'maybe', 'fields', 'made', 'reads'].every(k => a[k].size === b[k].size);
  /** `{ pure: [reasons: why it is not], makes, fails: Set<class | "*">, mutates: Map<param index, reason>, calls:
   *  Set<param index> (called while it runs), keeps: Set<param index> (given to what is not read, or kept) }`. */
  function summary(f) {
    const key = f.env ?? NOENV;
    const got = (w) => w.get(f.node)?.get(key), put = (w, v) => { let by = w.get(f.node); if (!by) w.set(f.node, by = new Map()); by.set(key, v); };
    if (got(sums)) return got(sums);
    if (active.get(f.node)?.has(key)) { cyclic = true; return got(prev) ?? optimistic(); }
    if (!active.has(f.node)) active.set(f.node, new Set()); active.get(f.node).add(key);
    let s;
    try { s = f.cls ? construct(f) : read(f); } catch (e) { if (options.debug) throw e; s = optimistic(); s.pure.push({ why: `could not be read (${String(e?.message ?? e).slice(0, 80)})`, ...place(f.node) }); s.fails.add("*"); }
    active.get(f.node).delete(key);
    const was = got(prev); if (!was || !same(was, s)) changed = true;
    put(sums, s); put(prev, s);
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
      // a built-in. (Map's and Set's call the `set` and the `add` of what is made for what they are given, a subclass's
      // own: they are given nothing. One that is run or held is not followed through a class)
      let extra;
      if (r?.global !== undefined && NEW[r.global] && isGlobal(e, m)) { const [kind] = NEW[r.global]; if (HELD[kind] || kind === "promise") s.pure.push({ why: `its class extends ${r.global}`, ...place(h) }); else if (kind !== "error") extra = `its class extends ${r.global}, which is given what may run code`; }
      else if (r?.global !== undefined && NEW_URL.has(r.global) && isGlobal(e, m)) { /* as it was */ }
      else { const bs = ts.isIdentifier(e) && !r?.local ? fromBinding(binding(m, e.text), e.text, true) : { kind: "unknown", why: "a class that extends a computed value" }; if (bs.kind !== "fns") s.pure.push({ why: `its class extends ${bs.why ?? "what is not read"}`, ...place(h) }); else for (const g of bs.fns) { const t = summary(g); extra ??= t.given ?? t.wants[0]?.why; absorb(s, t, g, h, f, () => true); } }
      if (extra) {
        const ctor = cls.members.find(x => ts.isConstructorDeclaration(x) && x.body); let given = !ctor;
        const supers = n => { if (ts.isCallExpression(n) && n.expression.kind === K.SuperKeyword && n.arguments.length) given = true; ts.forEachChild(n, supers); }; if (ctor) supers(ctor.body);
        if (given && ctor) s.pure.push({ why: extra, ...place(h) }); else if (given) s.given = extra;   // (no constructor of its own: what `new` is given)
      }
    }
    for (const mem of cls.members) {
      if (!mem.modifiers?.some(x => x.kind === K.StaticKeyword) && (ts.isMethodDeclaration(mem) && mem.body || ts.isAccessor(mem) || (ts.isPropertyDeclaration(mem) && mem.initializer && isFn(skip(mem.initializer))))) s.made.add(ts.isPropertyDeclaration(mem) ? skip(mem.initializer) : mem);
      if (ts.isPropertyDeclaration(mem) && mem.initializer && !mem.modifiers?.some(x => x.kind === K.StaticKeyword)) walkBody(s, { m, node: mem, name: f.name }, mem.initializer, true);
      if (ts.isConstructorDeclaration(mem) && mem.body) { const r = read({ m, node: mem, name: f.name, ctor: true }); s.pure.push(...r.pure); for (const x of r.fails) s.fails.add(x); for (const [k, v] of r.mutates) s.mutates.set(k, v); for (const x of r.calls) s.calls.add(x); for (const x of r.keeps) s.keeps.add(x); for (const x of r.may) s.may.add(x); for (const k of ['deep', 'later', 'gives', 'made', 'reads']) for (const x of r[k]) s[k].add(x); for (const [k, v] of r.maybe) s.maybe.set(k, v); for (const [k, v] of r.fields) s.fields.set(k, v); s.makes ||= r.makes; for (const x of r.wants) s.wants.push(x); if (r.held) s.pure.push({ why: `its constructor hands back ${r.held}`, ...place(mem) }); }
    }
    return s;
  }
  /** Methods the language calls by itself, of any object it is given. */
  const SPECIAL = new Set(["toString", "valueOf", "toJSON", "then", "@computed"]);
  const nameOf = p => p.name && ts.isComputedPropertyName(p.name) && skip(p.name.expression).getText() === "Symbol.asyncIterator" ? "@asyncIterator" : p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name) || ts.isNumericLiteral(p.name)) ? p.name.text : p.name ? "@computed" : undefined;
  const absorb = (s, t, g, at, f, met) => { for (const x of t.made) s.made.add(x); for (const x of t.reads) s.reads.add(x); if (t.held) holds(s, f, at, t.held); for (const x of t.wants) if (!met || !met(x)) s.pure.push({ why: `${g.name ?? "a function"}: ${x.why}`, file: x.file, line: x.line, via: place(at) }); const w = t.pure.find(x => x.effect) ?? t.pure.find(x => !x.param); if (w) s.pure.push({ why: `it calls ${g.name ?? "a function"}, which is not proven: ${w.why}`, file: w.file, line: w.line, via: place(at), effect: w.effect }); s.makes ||= t.makes; for (const x of t.fails) s.fails.add(x); };
  /** `node` makes `what` (`HELD`), or a call that may hand one back, in the call of `f`: every way its value goes must be
   *  out of the call — handed back, in a list or a record written out that is, in a closure that is — and then what the
   *  call answers is `held` in turn. Any other use is done by the call itself: a reason. */
  function holds(s, f, node, what) {
    const m = f.m, seen = new Set(), gave = new Set(); let bad;
    const use = n => { bad ??= n; };
    const met = (x, gives) => { if (seen.has(x) || (gives && gave.has(x))) return true; (gives ? gave : seen).add(x); return false; };
    /** `gives`: the value is a function whose answer is the held thing (so a call of it is followed), not one that uses it. */
    const goes = (n0, gives) => {
      const [n, p] = up(n0); if (bad || !p) return;
      if (ts.isReturnStatement(p) || (ts.isArrowFunction(p) && p.body === n)) { const fn = ts.isArrowFunction(p) ? p : fnOf(p); if (!isFn(fn) || isAsync(fn) || fn.asteriskToken) return use(p); if (fn === f.node) { s.held ??= what; return; } return closure(fn, !gives); }
      if (ts.isConditionalExpression(p)) return p.condition === n ? use(p) : goes(p, gives);
      if (ts.isBinaryExpression(p)) {
        const k = p.operatorToken.kind;
        if (k === K.BarBarToken || k === K.AmpersandAmpersandToken || k === K.QuestionQuestionToken) return goes(p, gives);
        if (k === K.CommaToken) return p.right === n ? goes(p, gives) : undefined;
        if (k === K.EqualsToken && p.right === n && ts.isIdentifier(skip(p.left))) { const r = resolve(skip(p.left), m); if (r.local) { named(r, gives); return goes(p, gives); } }
        return use(p);
      }
      if (ts.isExpressionStatement(p)) return;
      if (ts.isVariableDeclaration(p) && p.initializer === n && ts.isIdentifier(p.name)) { const r = resolve(p.name, m); return r.local ? named(r, gives) : use(p); }
      if ((ts.isPropertyAssignment(p) && p.initializer === n) || ts.isShorthandPropertyAssignment(p)) return goes(p.parent, false);
      if (ts.isArrayLiteralExpression(p)) return goes(p, false);
      if (ts.isCallExpression(p) && p.expression === n && gives) return goes(p, false);
      if (ts.isNewExpression(p) && p.expression !== n && callee(p, m).made === "proxy") return goes(p, false);   // (its target, or its handler: kept)
      use(p);
    };
    const named = (r, gives) => { if (met(r.local, gives)) return; for (const id of refs(r.fn, r.name, m, x => x.local === r.local)) { if (isWriteRef(id)) { const [n, p] = up(id); if (!(ts.isBinaryExpression(p) && p.left === n && p.operatorToken.kind === K.EqualsToken)) use(id); continue; } if (fnOf(id) === r.fn) goes(id, gives); else { let g = fnOf(id); while (isFn(g) && fnOf(g) !== r.fn) g = fnOf(g); if (isFn(g)) closure(g, false); else use(id); } } };
    const closure = (fn, gives) => {
      if (met(fn, gives)) return;
      if (ts.isFunctionDeclaration(fn) && fn.name) { const host = fnOf(fn), l = isFn(host) ? locals(host).get(fn.name.text) : undefined; return l ? named({ fn: host, local: l, name: fn.name.text }, gives) : use(fn); }
      if (ts.isMethodDeclaration(fn) || ts.isGetAccessorDeclaration(fn) || ts.isSetAccessorDeclaration(fn)) return ts.isObjectLiteralExpression(fn.parent) ? goes(fn.parent, false) : use(fn);
      if (ts.isFunctionExpression(fn) && fn.name) return use(fn);   // (its own name: called from inside it)
      goes(fn, gives);
    };
    goes(node, false);
    if (bad) s.pure.push({ why: `it uses ${what}: it may only be handed back`, ...place(bad) });
  }
  function read(f) { const s = optimistic(); walkBody(s, f, f.node.body, false); return s; }

  /** Reads `body` as part of the call of `f`: what it writes, calls, throws. */
  function walkBody(s, f, body, isField) {
    const m = f.m, root = f.node;
    // (`effect`: shown to do what `pure` denies — time, chance, the environment, work started — where any other reason is
    // that the reading stops: the first is an answer, the second a question)
    const no = (why, n, effect) => { s.pure.push({ why, ...place(n), ...(effect ? { effect: true } : {}) }); };
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
          if (c.made) return heldBy(c, all());
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
      if (ts.isCallExpression(e) || ts.isNewExpression(e)) { const c = callee(e, m); if (c.kind === "builtin") return (c.made === "boxed" ? "object" : c.made) ?? (c.gives === "copy" || c.gives === "copy2" || c.name === "Object.keys" || c.name === "Array" ? "array" : undefined); if (c.kind === "method" && /^(map|filter|slice|concat|flat|flatMap|toSorted|toReversed|toSpliced|split)$/.test(c.name)) return "array"; }
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
        if (ps.size && inRoot(r0.fn) && paramOnly(r0, 0)) {
          // the parameters it is a part of, by the names its initializers spell out (not all that may flow into it)
          const direct = (r, seen = new Set()) => { if (seen.has(r.local)) return []; seen.add(r.local); const pi0 = paramIndex(r); if (pi0 !== undefined) return [pi0]; return r.local.inits.flatMap(i => { while (i.part) i = i.part; const e = i.again ? undefined : i.expr ?? i.loop?.expression; return e ? rootsIn(e).flatMap(q => direct(q, seen)) : []; }); };
          const named = [...new Set(direct(r0))]; const of = named.length ? named : [...ps];
          for (const i of of) if (!s.mutates.has(i)) s.mutates.set(i, { why: what, ...place(n), later: depth.later || depth.tracked });
          s.pure.push({ why: `it changes its argument ${of.map(i => `\`${paramName(i)}\``).join(", ")} in place (${what})`, ...place(n), param: true, params: of }); return;
        }
        for (const i of ps) s.may.add(i);
        return no(ps.size ? `it may change its argument ${[...ps].map(i => `\`${paramName(i)}\``).join(", ")} in place: it writes to ${r0.name}, which may hold a part of it (${what})` : `it writes to ${r0.name}, which holds what the call did not make (${what})`, n);
      }
      no(`it writes to ${t.getText().slice(0, 40)}, which the call did not make (${what})`, n);
    };
    /** A local that holds nothing but (a part of) what the function was given. */
    const paramOnly = (r, d) => d < 8 && !r.local.multi && inRoot(r.fn) && r.local.inits.length > 0 && r.local.inits.every(i => { while (i.part) i = i.part; if (i.param !== undefined) return r.fn === root; const e = i.expr ? i.expr : i.loop ? i.loop.expression : undefined; return !!e && partOnly(e, d); });
    /** An expression that is nothing but (a part of) what the function was given: a parameter, a part of one, what
     *  calling an accessor parameter answers (`ref list`: the list itself), a choice between such, and what a function
     *  that only hands its argument back — or calls it — makes of one (`access(list)`). */
    const partOnly = (e, d) => {
      e = skip(e); if (!e || d > 8) return false;
      while (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) e = skip(e.expression);
      if (ts.isIdentifier(e)) { const q = resolve(e, m); return !!q.local && paramOnly(q, d + 1); }
      if (ts.isConditionalExpression(e)) return partOnly(e.whenTrue, d + 1) && partOnly(e.whenFalse, d + 1);
      if (ts.isBinaryExpression(e) && (e.operatorToken.kind === K.BarBarToken || e.operatorToken.kind === K.QuestionQuestionToken)) return partOnly(e.left, d + 1) && partOnly(e.right, d + 1);
      if (ts.isCallExpression(e)) {
        const accessor = a => { a = skip(a); if (!ts.isIdentifier(a)) return false; const q = resolve(a, m); const pi = q.local ? paramIndex(q) : undefined; return pi !== undefined && !!f.refs?.has(pi); };
        if (!e.arguments.length) return accessor(e.expression);
        const c = callee(e, m); if (c.kind !== "fns") return false;
        return c.fns.every(g => { const ps = passes(g); return !!ps && [...ps.idx].every(i => e.arguments[i] && !ts.isSpreadElement(e.arguments[i]) && (ps.calls ? accessor(e.arguments[i]) : partOnly(e.arguments[i], d + 1))); });
      }
      return false;
    };
    const paramName = i => { const p = root.parameters?.[i]; return p && ts.isIdentifier(p.name) ? p.name.text : `#${i + 1}`; };
    const depth = { later: false, tracked: false };

    const fnArg = (a, how, call) => {
      // a function given where it will be called: `how` is "run" | "track" | "then"
      const e = skip(a);
      if (isFn(e)) { if (e.asteriskToken) return; if (how === "then") { const was = depth.later, wasFails = fails; depth.later = true; fails = s.fails; inner(e); depth.later = was; fails = wasFails; } else if (how === "track") { const was = depth.tracked; depth.tracked = true; inner(e); depth.tracked = was; } else inner(e); return; }
      if (e.kind === K.NullKeyword || ts.isVoidExpression(e) || (ts.isIdentifier(e) && e.text === "undefined") || ts.isLiteralExpression(e) || ts.isTemplateExpression(e)) return;
      if (ts.isIdentifier(e)) {
        const r = resolve(e, m);
        if (r.local) {
          const pi = paramIndex(r);
          if (pi !== undefined) { if (root.parameters[pi].initializer) fnArg(root.parameters[pi].initializer, how, call); if (how === "then" || depth.later || afterSomeAwait(call)) calledLater(pi, e.text, a); else called(pi); return; }
          if (isResolver(r)) return;
          const fnInit = r.local.inits.length === 1 && (r.local.inits[0].fn ?? (r.local.inits[0].expr && isFn(skip(r.local.inits[0].expr)) ? skip(r.local.inits[0].expr) : undefined));
          if (fnInit) { if (!inRoot(r.fn)) { const g = fnValueOf(e, m, f.env); if (g) { absorb(s, summary(g), g, a, f); return; } } else { runNamed(fnInit, how === "then"); return; } }
          if (solidLocal(r)) return;
          { const w = walked(r); if (w) { for (const i of w) calledIn(i, a); return; } }
          { const g = fnValueOf(e, m, f.env); if (g) { absorb(s, summary(g), g, a, f); return; } }
          // a name bound once to an expression: that expression's value
          const i0 = r.local.inits.length === 1 && !r.local.multi && inRoot(r.fn) ? r.local.inits[0] : undefined;
          if (i0?.expr && !ts.isIdentifier(skip(i0.expr)) && (ts.isConditionalExpression(skip(i0.expr)) || ts.isBinaryExpression(skip(i0.expr)) || ts.isCallExpression(skip(i0.expr)))) return fnArg(i0.expr, how, call);
          addFail("*"); return no(`it hands \`${e.text}\`, a value that is not known to be a function of its own, to be called`, a);
        }
        if (r.top) { const c = fromBinding(binding(m, e.text), e.text, false); if (c.kind === "fns") { for (const g of c.fns) absorb(s, summary(g), g, a, f); return; } addFail("*"); return no(`it has ${c.why ?? `${e.text}, of Solid,`} called`, a); }
        if (GLOBAL_FNS[e.text] === "prim" && isGlobal(e, m)) { if (THROWS.has(e.text)) addFail("*"); return; }
        addFail("*"); return no(`it has ${e.text}, a global, called`, a);
      }
      if (ts.isConditionalExpression(e)) { expr(e.condition); fnArg(e.whenTrue, how, call); return fnArg(e.whenFalse, how, call); }
      if (ts.isBinaryExpression(e) && [K.BarBarToken, K.QuestionQuestionToken, K.AmpersandAmpersandToken].includes(e.operatorToken.kind)) { if (e.operatorToken.kind === K.AmpersandAmpersandToken) expr(e.left); else fnArg(e.left, how, call); return fnArg(e.right, how, call); }
      if (ts.isPropertyAccessExpression(e) && how !== "then" && !depth.later && !afterSomeAwait(call)) {
        const b = skip(e.expression), r = ts.isIdentifier(b) ? resolve(b, m) : undefined, pi = r?.local ? paramIndex(r) : undefined;
        if (pi !== undefined && !root.parameters[pi].dotDotDotToken && !reassigned(r, m) && (!root.parameters[pi].initializer || (ts.isObjectLiteralExpression(skip(root.parameters[pi].initializer)) && !skip(root.parameters[pi].initializer).properties.length))) { readName(e); s.fields.set(`${pi}.${e.name.text}`, [pi, [e.name.text], place(a)]); addFail("*"); return; }
      }
      // a static function of the language that only computes: `Math.round`, `Number.isFinite`
      if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(skip(e.expression)) && isGlobal(skip(e.expression), m)) { const o = skip(e.expression).text, k = e.name.text; if ((o === "Math" && k !== "random") || (/^(Number|String|Array|Object)$/.test(o) && STATIC[o][k] === "prim")) return; }
      expr(e);
      if (ts.isCallExpression(e)) {
        const c = callee(e, m);
        if (c.kind === "builtin" && c.name === ".bind") return fnArg(c.on, how, call);
        if (c.kind === "solid" && c.api.gives) return;
        const g = fnValueOf(e, m, f.env); if (g) { absorb(s, summary(g), g, a, f); return; }
      } else { const g = fnValueOf(e, m, f.env); if (g) { absorb(s, summary(g), g, a, f); return; } }
      addFail("*"); no("it has a computed value called as a function", a);
    };
    /** The parameters whose elements a name is, where a built-in walks (a part of) what the fn was given. */
    const walked = r => {
      if (r.local.multi || r.local.inits.length !== 1 || r.local.inits[0].param !== 0 || !inRoot(r.fn) || r.fn === root) return undefined;
      const [fnN, fnP] = up(r.fn); const ce = fnP && ts.isCallExpression(fnP) && fnP.arguments.includes(fnN) ? skip(fnP.expression) : undefined;
      let b = ce && ts.isPropertyAccessExpression(ce) && CALLBACK_SYNC.has(ce.name.text) && !/^reduce|^replace/.test(ce.name.text) ? skip(ce.expression) : undefined; let deeper = false;
      while (b && (ts.isPropertyAccessExpression(b) || ts.isElementAccessExpression(b))) { b = skip(b.expression); deeper = true; }
      const rb = b && ts.isIdentifier(b) ? resolve(b, m) : undefined;
      if (!rb?.local || rb.fn !== root || !paramOnly(rb, 0)) return undefined;
      if (deeper && [...localTaint(rb)].some(i => root.parameters[i].dotDotDotToken)) return undefined;
      return localTaint(rb);
    };
    /** The callback parameter `pi` is called now: its caller's function (spec/09 MO-8j). */
    const called = pi => { if (root.parameters[pi].dotDotDotToken) return calledIn(pi, root); s.calls.add(pi); addFail("*"); };
    /** A function that parameter `pi` *holds* is called: not a callback the fn was given, but code it found. */
    const calledIn = (pi, at) => { if (!s.deep.has(pi)) { s.deep.add(pi); s.pure.push({ why: `it calls a function it finds in its argument \`${paramName(pi)}\``, ...place(at), param: true, params: [], deep: pi }); } addFail("*"); };
    const calledLater = (pi, text, at) => { if (!s.later.has(pi)) { s.later.add(pi); s.pure.push({ why: `it calls back \`${text}\` later: the call starts work`, ...place(at), param: true, params: [], effect: true }); } addFail("*"); };
    /** Whether an `await` may have been passed when `n` runs, in the async functions around it. */
    const afterSomeAwait = n => {
      for (let fn = fnOf(n); isFn(fn); fn = fnOf(fn)) {
        if (isAsync(fn)) { let hit = false; const loops = []; for (let q = n.parent; q && q !== fn; q = q.parent) if (ts.isIterationStatement(q, false)) loops.push(q); const look = x => { if (hit || (isFn(x) && x !== fn)) return; if ((ts.isAwaitExpression(x) || (ts.isForOfStatement(x) && x.awaitModifier)) && (x.end <= n.getStart() || (ts.isForOfStatement(x) && loops.includes(x)) || loops.some(l => x.pos >= l.pos && x.end <= l.end) || (n.pos >= x.pos && n.end <= x.end && ts.isForOfStatement(x)))) hit = true; ts.forEachChild(x, look); }; look(fn); if (hit) return true; }
        if (fn === root) return false;
      }
      return false;
    };
    /** A value that is run only if it is a function (what Solid is given as a first value, `replace`'s second). */
    const maybeRun = (a, how, n) => {
      const e = skip(a);
      if (isFn(e)) return fnArg(e, how, n);
      if (ts.isConditionalExpression(e)) { expr(e.condition); maybeRun(e.whenTrue, how, n); return maybeRun(e.whenFalse, how, n); }
      if (ts.isBinaryExpression(e) && [K.BarBarToken, K.QuestionQuestionToken, K.AmpersandAmpersandToken].includes(e.operatorToken.kind)) { maybeRun(e.left, how, n); return maybeRun(e.right, how, n); }
      const g = fnValueOf(e, m, f.env); if (g && (!ts.isIdentifier(e) || !resolve(e, m).local || !inRoot(resolve(e, m).fn))) { if (!ts.isIdentifier(e)) expr(e); absorb(s, summary(g), g, a, f); return; }
      if (ts.isIdentifier(e)) {
        const r = resolve(e, m);
        if (r.local) { const fnInit = r.local.inits.length === 1 && (r.local.inits[0].fn ?? (r.local.inits[0].expr && isFn(skip(r.local.inits[0].expr)) ? skip(r.local.inits[0].expr) : undefined)); if (fnInit && inRoot(r.fn)) return runNamed(fnInit, false); }
        const pi = r.local ? paramIndex(r) : undefined;
        if (pi !== undefined) { if (root.parameters[pi].initializer) maybeRun(root.parameters[pi].initializer, how, n); s.maybe.set(`${pi}`, [pi, []]); return; }
      }
      expr(e);
      // (a part of what the fn was given: its declared type says whether a function stands there)
      const path = []; let b = e; while (ts.isPropertyAccessExpression(b)) { path.unshift(b.name.text); b = skip(b.expression); }
      for (const i of taint(e)) s.maybe.set(`${i}.${path.join(".")}`, [i, ts.isIdentifier(b) && resolve(b, m).local && paramIndex(resolve(b, m)) === i ? path : null]);
    };
    /** What a callback of the caller's is given: it may run any function among it, now. */
    const given = (a, at) => {
      const e = skip(ts.isSpreadElement(a) ? a.expression : a);
      if (isFn(e)) return fnArg(e, "run", at);
      if (ts.isObjectLiteralExpression(e)) { expr(e); for (const p of e.properties) { if (isFn(p)) inner(p); else if (ts.isPropertyAssignment(p)) given(p.initializer, at); else if (ts.isShorthandPropertyAssignment(p)) given(p.name, at); else if (ts.isSpreadAssignment(p)) given(p.expression, at); } return; }
      if (ts.isArrayLiteralExpression(e)) { for (const x of e.elements) given(x, at); return; }
      if (ts.isConditionalExpression(e)) { expr(e.condition); given(e.whenTrue, at); return given(e.whenFalse, at); }
      const g = fnValueOf(e, m, f.env);
      if (ts.isIdentifier(e)) {
        const r = resolve(e, m); if (isResolver(r.local ? r : { local: { inits: [] } })) return;
        const pi = r.local ? paramIndex(r) : undefined;
        if (pi !== undefined) { s.gives.add(pi); return; }
        const i0 = r.local && r.local.inits.length === 1 && inRoot(r.fn) ? r.local.inits[0] : undefined;
        const lit = i0?.fn ?? (i0?.expr && (isFn(skip(i0.expr)) ? skip(i0.expr) : undefined));
        if (lit) return runNamed(lit, false);
        if (i0?.expr && (ts.isObjectLiteralExpression(skip(i0.expr)) || ts.isArrayLiteralExpression(skip(i0.expr)))) { expr(e); return given(i0.expr, at); }
      }
      expr(e);
      if (g) absorb(s, summary(g), g, a, f);
    };
    /** What a call of a function that is read does with the functions it is given: runs them, now or later. */
    const passed = (t, g, as, n) => {
      const spread = as.findIndex(a => ts.isSpreadElement(a));
      const each = (set, run) => { for (const i of set) { if (spread >= 0 && spread <= i) { const w = `its arguments are spread into ${g.name ?? "a function"}, which calls one of them`; for (const x of as.slice(spread)) for (const p of taint(x)) calledIn(p, n); addFail("*"); no(w, n); continue; } const rest = !!g.node.parameters?.[i]?.dotDotDotToken; for (const a of rest ? as.slice(i) : as[i] ? [as[i]] : []) run(a, rest); } };
      each(t.calls, a => fnArg(a, "run", n));
      each(t.later, a => fnArg(a, "then", n));
      for (const [i, path] of t.fields.values()) {
        if (spread >= 0 && spread <= i) { addFail("*"); no(`its arguments are spread into ${g.name ?? "a function"}, which calls a field of one`, n); continue; }
        const a = as[i] && skip(as[i]); if (!a || a.kind === K.NullKeyword || (ts.isIdentifier(a) && a.text === "undefined")) continue;
        if (ts.isObjectLiteralExpression(a)) { let hit; for (const q of a.properties) { if (ts.isSpreadAssignment(q) || (q.name && ts.isComputedPropertyName(q.name))) hit = "?"; else if (nameOf(q) === path[0]) hit = q; } if (hit === "?") { addFail("*"); no("it has a field of a record it spreads called", n); } else if (hit && ts.isPropertyAssignment(hit)) fnArg(hit.initializer, "run", n); else if (hit && ts.isShorthandPropertyAssignment(hit)) fnArg(hit.name, "run", n); else if (hit) inner(hit); continue; }
        const r = ts.isIdentifier(a) ? resolve(a, m) : undefined, pi = r?.local ? paramIndex(r) : undefined;
        if (pi !== undefined && !root.parameters[pi].dotDotDotToken && !reassigned(r, m) && !root.parameters[pi].initializer && !afterSomeAwait(n) && !depth.later) { s.fields.set(`${pi}.${path[0]}`, [pi, path, place(n)]); continue; }
        addFail("*"); no(`it has \`${path[0]}\` of a value called: not known to be a function of its own`, n);
      }
      each(t.gives, a => given(a, n));
      for (const [i, path] of t.maybe.values()) { const a = as[i]; if (a && path && !path.length) maybeRun(a, "run", n); else if (a) { for (const x of taint(a)) s.maybe.set(`${x}.*`, [x, null]); held(a, n); } }
      each(t.deep, (a, rest) => { if (rest) fnArg(a, "run", n); else held(a, n); });
    };
    /** Every function a value holds is run: a list written out, a list of a name bound once to one, else what it is part of. */
    const held = (a, n) => {
      const e = skip(a);
      if (ts.isArrayLiteralExpression(e)) { for (const x of e.elements) { if (ts.isSpreadElement(x)) held(x.expression, n); else fnArg(x, "run", n); } return; }
      if (ts.isLiteralExpression(e) || e.kind === K.NullKeyword) return;
      const ps = ts.isIdentifier(e) || ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e) ? [...taint(e)] : [];
      if (ps.length && partOnly(e, 0)) { for (const i of ps) calledIn(i, n); return; }
      addFail("*"); no("it has functions called that a value holds: not known to be functions of its own", n);
    };
    const ran = new Set();
    const runNamed = (fn, later) => { const k = later ? `${fn.pos}L` : `${fn.pos}`; if (ran.has(k)) return; ran.add(k); if (later) { const was = depth.later, wasFails = fails; depth.later = true; fails = s.fails; inner(fn); depth.later = was; fails = wasFails; } else inner(fn); };
    /** `resolve` and `reject` of `new Promise((resolve, reject) => …)`, and what `Promise.withResolvers()` hands out. */
    const isResolver = r => { const i = r.local.inits[0]; if (r.local.inits.length !== 1 || i.param === undefined || i.param > 1) return false; const [n, p] = up(r.fn); return !!p && ts.isNewExpression(p) && p.arguments?.[0] === n && ts.isIdentifier(skip(p.expression)) && skip(p.expression).text === "Promise" && isGlobal(skip(p.expression), m); };
    /** A name bound to what one of Solid's makers hands back: a signal's reader or setter, a memo. */
    const solidLocal = r => r.local.inits.length === 1 && !r.local.multi && (() => { let i = r.local.inits[0]; while (i.part) i = i.part; if (!i.expr) return false; const e = skip(i.expr); if (!ts.isCallExpression(e)) return false; const c = callee(e, m); return c.kind === "solid" && !!c.api.gives; })();
    const pat = p => { if (!p || ts.isIdentifier(p)) return; for (const e of p.elements ?? []) { if (ts.isOmittedExpression(e)) continue; if (e.propertyName && ts.isComputedPropertyName(e.propertyName)) expr(e.propertyName.expression); else if (!e.dotDotDotToken) { const k = e.propertyName ?? e.name; if (ts.isObjectBindingPattern(p) && k.text !== undefined) s.reads.add(k.text); } else if (ts.isObjectBindingPattern(p)) s.reads.add("*"); if (e.initializer) expr(e.initializer); pat(e.name); } };
    const inner = fn => { for (const p of fn.parameters ?? []) { pat(p.name); if (p.initializer) expr(p.initializer); } if (!fn.body) return; if (ts.isBlock(fn.body)) block(fn.body); else expr(fn.body); };

    const args = (call, c) => {
      for (const [i, a] of (call.arguments ?? []).entries()) {
        const e = ts.isSpreadElement(a) ? a.expression : a;
        expr(e);
      }
    };
    /** A call of a value the code shows to be a function — a parameter of the factory that made this one (by the
     *  call's arguments), what a call of a function that is read handed back: read as that function's call. */
    const viaValue = (n, as, label) => {
      const g = ts.isCallExpression(n) ? fnValueOf(n.expression, m, f.env) : undefined; if (!g) return false;
      const t = summary(g); absorb(s, t, g, n, f, x => meets(x, g, as));
      as.forEach((a, i) => { const e = skip(ts.isSpreadElement(a) ? a.expression : a); if (t.mutates.has(i)) writeTo(e, n, `given to ${g.name ?? label}, which changes it`); else if (t.may.has(i)) { const v = val(e); if (!(v.f > 0 || v.r === 0)) { for (const x of taint(e)) s.may.add(x); no(`it gives ${e.getText().slice(0, 30)} to ${g.name ?? label}, which may change it`, n); } } if (t.keeps.has(i)) for (const x of taint(e)) s.keeps.add(x); });
      passed(t, g, as, n);
      for (const a of as) { const e = skip(ts.isSpreadElement(a) ? a.expression : a); if (isFn(e)) fnArg(e, "run", n); else expr(e); }
      { const ce = skip(n.expression); if (ts.isCallExpression(ce)) for (const a of ce.arguments) { const e = skip(ts.isSpreadElement(a) ? a.expression : a); if (isFn(e)) kept(e); else expr(e); } }
      return true;
    };
    // ---- what a constructor is given (the table's rules) ----
    const CLOCK = "the clock, or the time zone";
    const callName = e => { const c = skip(e.expression); return ts.isPropertyAccessExpression(c) && ts.isIdentifier(skip(c.expression)) && isGlobal(skip(c.expression), m) ? `${skip(c.expression).text}.${c.name.text}` : undefined; };
    /** A value the code shows to be a primitive, and no symbol. */
    const prim = (e, d = 0) => {
      e = skip(e); if (!e || d > 12) return false;
      if (ts.isStringLiteralLike(e) || ts.isNumericLiteral(e) || ts.isBigIntLiteral(e) || ts.isTemplateExpression(e) || ts.isTypeOfExpression(e) || ts.isVoidExpression(e) || ts.isDeleteExpression(e) || ts.isPrefixUnaryExpression(e) || ts.isPostfixUnaryExpression(e) || e.kind === K.TrueKeyword || e.kind === K.FalseKeyword || e.kind === K.NullKeyword) return true;
      if (ts.isConditionalExpression(e)) return prim(e.whenTrue, d + 1) && prim(e.whenFalse, d + 1);
      if (ts.isBinaryExpression(e)) { const k = e.operatorToken.kind; return k === K.BarBarToken || k === K.AmpersandAmpersandToken || k === K.QuestionQuestionToken ? prim(e.left, d + 1) && prim(e.right, d + 1) : k === K.CommaToken || k === K.EqualsToken ? prim(e.right, d + 1) : !(k === K.BarBarEqualsToken || k === K.AmpersandAmpersandEqualsToken || k === K.QuestionQuestionEqualsToken); }
      if (ts.isPropertyAccessExpression(e) && e.name.text === "length") return plainList(e.expression, d + 1) || prim(e.expression, d + 1);
      if (ts.isCallExpression(e)) { const c = callee(e, m); return c.kind === "builtin" && (/^Math\./.test(c.name) || /^(String|Number|Boolean|BigInt|parseInt|parseFloat|isNaN|isFinite|JSON\.stringify|Array\.isArray)$/.test(c.name)) || c.kind === "method" && /^(join|trim|slice|replace|replaceAll|toLowerCase|toUpperCase|padStart|padEnd|substring|charAt|charCodeAt|repeat|indexOf|toFixed)$/.test(c.name) && (prim(c.on, d + 1) || (c.name === "join" && plainList(c.on, d + 1))); }
      if (ts.isIdentifier(e)) {
        const r = resolve(e, m);
        if (r.global !== undefined) return /^(undefined|NaN|Infinity)$/.test(e.text);
        if (r.top) { const bs = binding(m, e.text); return !!bs && bs.every(x => x.m === m && x.b.kind === "var" && !constant(m, x.name) && !!x.b.init && prim(x.b.init, d + 1)); }
        if (!inRoot(r.fn)) return false;
        const pi = paramIndex(r); if (pi !== undefined) return !!f.plain?.has(pi) && !reassigned(r, m) && (!root.parameters[pi].initializer || prim(root.parameters[pi].initializer, d + 1));
        return r.local.inits.length > 0 && r.local.inits.every(i => i.none || (i.expr ? (i.expr === e || prim(i.expr, d + 1)) : i.loop && ts.isForInStatement(i.loop)));
      }
      return false;
    };
    /** A list that is known plain: an array (or a set, a map, a string) made here by the language, its own iterator the
     *  language's. `pairs`: each of its items is one too. */
    const plainList = (e, d = 0, pairs = false) => {
      e = skip(e); if (!e || d > 12) return false;
      if (e.kind === K.NullKeyword || ts.isVoidExpression(e) || (ts.isIdentifier(e) && e.text === "undefined")) return true;
      if (!pairs && ts.isStringLiteralLike(e)) return true;
      if (ts.isArrayLiteralExpression(e)) return e.elements.every(x => !pairs || (ts.isSpreadElement(x) ? plainList(x.expression, d + 1, true) : !ts.isOmittedExpression(x) && ts.isArrayLiteralExpression(skip(x))));   // (what is spread is spread by the code, into an array)
      if (ts.isConditionalExpression(e)) return plainList(e.whenTrue, d + 1, pairs) && plainList(e.whenFalse, d + 1, pairs);
      if (ts.isBinaryExpression(e) && (e.operatorToken.kind === K.BarBarToken || e.operatorToken.kind === K.QuestionQuestionToken)) return plainList(e.left, d + 1, pairs) && plainList(e.right, d + 1, pairs);
      if (ts.isNewExpression(e)) { const c = callee(e, m); return c.made === "map" || (!pairs && (c.made === "set" || c.made === "array" || c.made === "typed")); }
      if (ts.isCallExpression(e)) {
        const name = callName(e);
        if (name) return name === "Object.entries" || (!pairs && /^(Object\.(keys|values|getOwnPropertyNames)|Array\.(from|of)|Reflect\.ownKeys)$/.test(name));
        const c = callee(e, m); if (c.kind !== "method") return false;
        if (c.name === "entries" && /^(map|array|set)$/.test(kind(c.on) ?? "")) return plainList(c.on, d + 1);
        // (a method of what the function was given is the language's, as the reading takes every other: `xs.map(f)` is an array)
        const list = plainList(c.on, d + 1) || partOnly(c.on, 0);
        if (/^(slice|filter|toSorted|toReversed)$/.test(c.name)) return (pairs ? plainList(c.on, d + 1, true) : list) || (!pairs && c.name === "slice" && prim(c.on, d + 1));
        if (c.name === "map") { const g = e.arguments[0] && skip(e.arguments[0]); return list && (!pairs || (!!g && ts.isArrowFunction(g) && ts.isArrayLiteralExpression(skip(g.body)))); }
        return !pairs && (/^(concat|flat|flatMap)$/.test(c.name) ? list : c.name === "split" ? prim(c.on, d + 1) : /^(keys|values)$/.test(c.name) && /^(map|array|set)$/.test(kind(c.on) ?? "") && plainList(c.on, d + 1));
      }
      if (ts.isIdentifier(e)) {
        const r = resolve(e, m);
        if (r.top) { const bs = binding(m, e.text); return !!bs && bs.every(x => x.b?.kind === "var" && !constant(x.m, x.name) && x.b.init && ts.isArrayLiteralExpression(skip(x.b.init)) && (!pairs || skip(x.b.init).elements.every(y => ts.isArrayLiteralExpression(skip(y))))); }
        if (!r.local || !inRoot(r.fn)) return false;
        const pi = paramIndex(r); const rest = pi !== undefined && !!root.parameters[pi].dotDotDotToken;
        // (a parameter is what the row's type says it is: a list, a list of pairs)
        if (pi !== undefined && f.lists?.has(pi) && !reassigned(r, m) && (!root.parameters[pi].initializer || plainList(root.parameters[pi].initializer, d + 1, pairs))) return !pairs || f.lists.get(pi) === "pairs";
        if (!rest && !(r.local.inits.length > 0 && r.local.inits.every(i => i.none || (i.expr && plainList(i.expr, d + 1, pairs))))) return false;
        if (rest && (pairs || reassigned(r, m))) return false;
        return refs(r.fn, r.name, m, x => x.local === r.local).every(id => onlyListed(id, pairs) || after(id, e, r.fn));
      }
      return false;
    };
    /** Whether `id` is `e`, or reached only once `e` has been: written later, in no loop, in no function that may be called before. */
    const after = (id, e, fn) => { if (fnOf(e) !== fn || (id !== e && id.pos < e.end)) return false; for (let n = e.parent; n !== fn; n = n.parent) if (ts.isIterationStatement(n, false)) return false; for (let n = id.parent; n !== fn; n = n.parent) if (ts.isFunctionDeclaration(n)) return false; return true; };
    /** A use of a list's name that leaves its iterator the language's (and, of pairs, its items as they were). */
    const onlyListed = (id, pairs) => {
      const [n, p] = up(id); if (!p) return false;
      if (isWriteRef(id)) return ts.isBinaryExpression(p) && p.operatorToken.kind === K.EqualsToken;
      if (ts.isReturnStatement(p) || (ts.isArrowFunction(p) && p.body === n) || ts.isIfStatement(p) || (ts.isPrefixUnaryExpression(p) && p.operator === K.ExclamationToken)) return true;
      if (ts.isNewExpression(p)) return p.expression !== n && callee(p, m).keeps?.startsWith("parts");
      if (ts.isPropertyAccessExpression(p) && p.expression === n) { if (p.name.text === "length") return true; const [c, q] = up(p); if (!q || !ts.isCallExpression(q) || q.expression !== c) return false;
        // (a callback is handed the list itself after its item and its index; what answers the list is another name of it)
        const name = p.name.text, shown = q.arguments.every(a => { a = skip(a); return isFn(a) ? ts.isArrowFunction(a) && a.parameters.length < (/^reduce/.test(name) ? 4 : 3) && !a.parameters.some(x => x.dotDotDotToken) : !CALLBACK_SYNC.has(name) || prim(a); });
        return shown && (name in READ ? READ[name] !== "same" || /^reduce/.test(name) : MUTATORS.has(name) && (/^(push|pop|shift|unshift|splice|delete|clear)$/.test(name) || ts.isExpressionStatement(up(q)[1]))) && (!pairs || /^(slice|keys|includes|indexOf|join)$/.test(name)); }
      if (pairs) return false;
      if (ts.isSpreadElement(p) || (ts.isForOfStatement(p) && p.expression === n)) return true;
      if (ts.isElementAccessExpression(p) && p.expression === n) { const [c, q] = up(p); const w = !!q && ((ts.isBinaryExpression(q) && q.left === c && q.operatorToken.kind >= K.FirstAssignment && q.operatorToken.kind <= K.LastAssignment) || ts.isDeleteExpression(q) || ts.isPostfixUnaryExpression(q) || (ts.isPrefixUnaryExpression(q) && q.operator !== K.ExclamationToken) || ts.isArrayLiteralExpression(q) || ts.isPropertyAssignment(q)); return !w || prim(p.argumentExpression); }
      return ts.isCallExpression(p) && p.expression !== n && /^(Object\.(keys|values|entries|freeze)|Array\.(from|isArray))$/.test(callName(p) ?? "");
    };
    const RULE = T({
      any: () => undefined, run: () => undefined,
      prim: a => prim(a) ? undefined : "it converts a value that is not known to be a primitive",
      list: a => plainList(a) ? undefined : "it iterates a value that is not known to be a plain list",
      pairs: a => plainList(a, 0, true) ? undefined : "it iterates a value that is not known to be a plain list of pairs",
      text: a => prim(a) || ts.isRegularExpressionLiteral(skip(a)) ? undefined : "its pattern is not known to be text",
      buffer: a => kind(a) === "buffer" ? undefined : "its buffer is not known to be one the call made",
      fill: a => prim(a) || kind(a) === "buffer" || kind(a) === "typed" || (ts.isArrayLiteralExpression(skip(a)) && skip(a).elements.every(x => !ts.isSpreadElement(x) && prim(x))) ? undefined : "it reads a value that is not known to be a length, a plain list of numbers or a buffer the call made",
      plain: a => { const e = skip(a); return prim(e) || (ts.isObjectLiteralExpression(e) && e.properties.every(p => (ts.isPropertyAssignment(p) && !ts.isComputedPropertyName(p.name) && p.name.text !== "__proto__" && (p.name.text === "cause" || prim(p.initializer))) || (ts.isShorthandPropertyAssignment(p) && p.name.text === "cause"))) ? undefined : "it reads a value that is not known to be a plain record"; },
      time: a => { const number = e => { e = skip(e); return ts.isNumericLiteral(e) || (ts.isPrefixUnaryExpression(e) && e.operator !== K.ExclamationToken && prim(e)) || (ts.isBinaryExpression(e) && [K.MinusToken, K.AsteriskToken, K.SlashToken, K.PercentToken].includes(e.operatorToken.kind) && prim(e.left) && prim(e.right)) || (ts.isBinaryExpression(e) && e.operatorToken.kind === K.PlusToken && number(e.left) && number(e.right)); }; const e = skip(a); return number(e) || (ts.isStringLiteralLike(e) && /^\d{4}-\d\d-\d\d(T\d\d:\d\d(:\d\d(\.\d+)?)?Z)?$/.test(e.text)) ? undefined : CLOCK; },
    });
    /** What a rule says of an argument; of a parameter of this function, its callers are asked (`wants`). */
    const asked = (k, a) => {
      const w = RULE[k](a); if (!w || k === "time" || k === "buffer" || k === "plain") return w;
      const e = skip(a), r = ts.isIdentifier(e) ? resolve(e, m) : undefined, i = r?.local ? paramIndex(r) : undefined;
      if (i === undefined || reassigned(r, m) || root.parameters[i].dotDotDotToken || (root.parameters[i].initializer && RULE[k](root.parameters[i].initializer))) return w;
      if (!s.wants.some(x => x.i === i && x.k === k)) s.wants.push({ i, k, why: `${w} (its parameter \`${e.text}\`)`, ...place(a) });
      return undefined;
    };
    const meets = (x, g, as) => !as.slice(0, x.i + 1).some(a => ts.isSpreadElement(a)) && (!as[x.i] || !asked(x.k, as[x.i]));
    /** Why making one is not known to only compute, by the table; undefined where it is. */
    const ruled = (c, as) => {
      const of = i => c.rules[i] ?? (c.rules.at(-1).endsWith("…") ? c.rules.at(-1) : undefined);
      if (c.made === "date" && as.length !== 1) return CLOCK;
      for (const [i, a] of as.entries()) { if (ts.isSpreadElement(a)) { if (c.rules[0] === "any…" && plainList(a.expression)) continue; return "its arguments are spread"; } const k = of(i)?.replace("…", ""); const w = k && asked(k, a); if (w) return w; }
      return undefined;
    };
    /** What a function written in this one is given where it is called: run, where it calls the parameter it is given as. */
    const given0 = (fn, as, n) => { const t = ts.isBlock(fn.body ?? fn) || fn.body ? localSummary(fn) : undefined; if (t) passed(t, { node: fn, name: fn.name?.text ?? "a function of its own" }, as, n); for (const a of as) { const e = skip(ts.isSpreadElement(a) ? a.expression : a); if (isFn(e)) { if (!t || t.escapes.has(as.indexOf(a))) fnArg(e, "run", n); else kept(e); } else expr(e); } };
    const localSummary = fn => { const t = { ...optimistic(), escapes: new Set() }; (fn.parameters ?? []).forEach((q, i) => { if (!ts.isIdentifier(q.name)) return; const l = locals(fn).get(q.name.text); for (const id of refs(fn, q.name.text, m, x => x.local === l)) { const [x, p] = up(id); if (p && ts.isCallExpression(p) && p.expression === x) (q.dotDotDotToken ? t.deep : t.calls).add(i); else if (p && (ts.isCallExpression(p) || ts.isNewExpression(p)) && (p.arguments ?? []).includes(x)) { t.gives.add(i); t.escapes.add(i); } else if (p && !ts.isBinaryExpression(p) && !ts.isPrefixUnaryExpression(p) && !ts.isTypeOfExpression(p) && !ts.isPropertyAccessExpression(p) && !ts.isTemplateSpan(p)) t.escapes.add(i); } }); return t; };
    const call = (n, c = callee(n, m)) => {
      const as = n.arguments ?? [];
      const isNew = ts.isNewExpression(n);
      const plain = () => { for (const a of as) { const e = skip(ts.isSpreadElement(a) ? a.expression : a); if (isFn(e)) kept(e); else expr(e); } };
      switch (c.kind) {
        case "either": for (const x of c.of) call(n, x); return;
        case "builtin": {
          if (THROWS.has(c.name)) addFail("*");
          if (c.name === "JSON.stringify") s.reads.add("toJSON()");
          if (c.rules) {
            const w = ruled(c, as); if (w) no(`${c.name}: ${w}`, n, w === CLOCK && as.length !== 1);
            if (HELD[c.made]) { holds(s, f, n, HELD[c.made]); for (const a of as) for (const i of taint(a)) s.keeps.add(i); }
          }
          if (/^Promise\./.test(c.name)) { if (c.name === "Promise.reject") addFail(as[0] ? classOf(as[0]) : "*"); else if (!as.every(a => { const e = skip(a); return ts.isArrayLiteralExpression(e) ? e.elements.every(x => settled(x)) : settled(e); })) addFail("*"); }
          if (c.clears) { for (const a of as) expr(a); return; }
          if (c.name === ".bind") { expr(c.on); for (const a of as) expr(a); return; }
          if (c.gives === "target" && as[0] && c.name !== "Object.freeze" && c.name !== "Object.isFrozen") writeTo(as[0], n, c.name);
          if (c.name === "Object.freeze" && as[0]) { const v = val(as[0]); if (v.f === 0) no("it freezes what the call did not make (Object.freeze)", n); }
          as.forEach((a, i) => { const e = skip(ts.isSpreadElement(a) ? a.expression : a); if (c.sync && (c.name === "new Promise" ? i === 0 : i === 1)) fnArg(e, "run", n); else if (i === 1 && (c.name === "JSON.parse" || c.name === "JSON.stringify")) { if (ts.isArrayLiteralExpression(e)) expr(e); else maybeRun(e, "run", n); } else if (isFn(e)) kept(e); else expr(e); });
          return;
        }
        case "later": {
          if (c.timer && (c.name === "setTimeout" || c.name === "queueMicrotask")) { as.forEach((a, i) => { if (i === c.at[0]) fnArg(a, "then", n); else expr(a); }); return; }
          if (c.observer) { plain(); return; }   // an observer made observes nothing yet: `.observe(…)` is the call that registers
          plain(); return no(`${c.name ?? "an observer"}: it registers with the platform`, n, true);
        }
        case "solid": {
          s.makes ||= !!c.api.makes;
          as.forEach((a, i) => { const how = c.api.args?.[i]; const e = skip(a); if (how === "later") { if (isFn(e)) kept(e); else expr(e); } else if (how) { if (isFn(e) && isAsync(e)) no(`${c.name}: an async computation starts work`, a); if (VALUE_OR_FN.has(c.name)) maybeRun(a, how === "track" ? "track" : "run", n); else fnArg(a, how === "track" ? "track" : "run", n); } else if (isFn(e)) kept(e); else expr(e); });
          return;
        }
        case "iife": given0(c.fn, as, n); inner(c.fn); return;
        case "super": if (!f.ctor) no("super(…) outside a constructor", n); for (const a of as) expr(a); return;
        case "local": {
          const r = c.r; const pi = paramIndex(r);
          if (!isNew && solidLocal(r)) { for (const a of as) maybeRun(ts.isSpreadElement(a) ? a.expression : a, "run", n); return; }
          if (!isNew && pi !== undefined) { for (const a of as) given(a, n); if (root.parameters[pi].initializer) fnArg(root.parameters[pi].initializer, "run", n); if (depth.later || afterSomeAwait(n)) return calledLater(pi, r.name, n); return called(pi); }
          const localFn = !isNew && !r.local.multi && r.local.inits.length === 1 && inRoot(r.fn) && (r.local.inits[0].fn ?? (r.local.inits[0].expr && isFn(skip(r.local.inits[0].expr)) ? skip(r.local.inits[0].expr) : undefined));
          if (localFn) { given0(localFn, as, n); runNamed(localFn, false); return; }
          for (const a of as) { const e = skip(ts.isSpreadElement(a) ? a.expression : a); if (isFn(e)) kept(e); else expr(e); }
          if (isNew) return no(`new ${r.name}(…): a class that is a value`, n);
          if (isResolver(r)) { if (r.local.inits[0].param === 1 && as[0]) addFail(classOf(as[0]), s.fails); else if (as[0] && !settled(as[0])) addFail("*", s.fails); return; }
          const fnInit = !r.local.multi && r.local.inits.length === 1 && (r.local.inits[0].fn ?? (r.local.inits[0].expr && isFn(skip(r.local.inits[0].expr)) ? skip(r.local.inits[0].expr) : undefined));
          void fnInit;
          // a function the code shows it to be: a parameter of the factory that made this one (by the call's
          // arguments), what a call of one of the module's functions handed back
          if (viaValue(n, as, r.name)) return;
          // an element of a list the function was given, called where a built-in walks the list: its caller's function,
          // as a callback parameter is
          { const w = !depth.later && walked(r); if (w) { for (const i of w) calledIn(i, n); return; } }
          addFail("*"); return no(`it calls \`${r.name}\`, a value it was handed or computed, as a function`, n);
        }
        case "fns": {
          for (const g0 of c.fns) {
            const g = as.some(a => ts.isSpreadElement(a)) ? g0 : calledWith(g0, as.length);
            const t = summary(g); absorb(s, t, g, n, f, x => meets(x, g, as)); if (t.given && as.length) no(t.given, n);
            as.forEach((a, i) => { const e = skip(ts.isSpreadElement(a) ? a.expression : a); if (t.mutates.has(i)) writeTo(e, n, `given to ${g.name}, which changes it`); else if (t.may.has(i)) { const v = val(e); if (!(v.f > 0 || v.r === 0)) { for (const x of taint(e)) s.may.add(x); no(`it gives ${e.getText().slice(0, 30)} to ${g.name}, which may change it`, n); } } if (t.keeps.has(i)) for (const x of taint(e)) s.keeps.add(x);  });
            passed(t, g, as, n);
            if (g.method && /\bthis\b/.test(g.node.getText())) no(`${g.name} reads \`this\``, n);
          }
          for (const a of as) { const e = skip(ts.isSpreadElement(a) ? a.expression : a); if (isFn(e)) fnArg(e, "run", n); else expr(e); }
          return;
        }
        case "method": {
          expr(c.on); s.reads.add(`${c.name}()`); readName(c.access);
          const name = c.name; const k = kind(c.on); const v = val(c.on);
          // (a rest parameter is an array, whatever its elements are)
          const rest = e => { e = skip(e); const r = ts.isIdentifier(e) ? resolve(e, m) : undefined; const pi = r?.local ? paramIndex(r) : undefined; return pi !== undefined && !!root.parameters[pi].dotDotDotToken && !reassigned(r, m); };
          const recvOpaque = !rest(c.on) && [...taint(c.on)].some(i => f.opaque?.has(i));
          const cb = how => as.forEach(a => { const e = skip(ts.isSpreadElement(a) ? a.expression : a); const i = as.indexOf(a); if (name === "replace" || name === "replaceAll") { if (i === 1) maybeRun(a, how, n); else expr(e); } else if (PROMISE_LATER.has(name) && !(k in MUTATE)) fnArg(e, "then", n); else if (isFn(e) || (CALLBACK_SYNC.has(name) && i === 0)) fnArg(e, how, n); else expr(e); });
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
          if (/^toLocale|^localeCompare$/.test(name)) return no(`.${name}(…): the answer is the locale's and the time zone's`, n, true);
          return no(`it calls .${name}(…), a method that is not read`, n);
        }
        default: if (!isNew && c.kind === "unknown" && viaValue(n, as, "a function")) return; plain(); addFail("*"); { const ce = skip(n.expression); if (ts.isCallExpression(ce) || ts.isNewExpression(ce) || ts.isPropertyAccessExpression(ce) || ts.isElementAccessExpression(ce)) expr(ce); } return no(isNew && c.kind === "unknown" && /^new /.test(c.why ?? "") ? `${c.why}: not known to only compute` : `it calls ${c.why ?? "code that is not read"}`, n, c.effect);
      }
    };
    /** A function that is a member of what the call makes: run by whatever reads, or calls, its name (`reads`), and by the
     *  language where it calls one of that name by itself. */
    const madeFn = (fn, p) => {
      s.made.add(fn); const [x, q] = up(p.parent); const name = nameOf(p);
      const dn = q && ts.isCallExpression(q) && q.expression !== x ? q.expression.getText() : q && ts.isPropertyAssignment(q) && ts.isCallExpression(up(q.parent)[1] ?? q) ? up(q.parent)[1].expression.getText() : "";
      if (/^(Object|Reflect)\.(defineProperty|defineProperties|create)$/.test(dn) && (name === "get" || name === "set")) inner(fn);
    };
    /** A function that is handed back or stored: not run by the call. What it closes over is kept past the call. */
    const kept = fn => { const v = n => { if (ts.isIdentifier(n) && isRef(n)) { const r = resolve(n, m); if (r.local && inRoot(r.fn)) for (const i of localTaint(r)) s.keeps.add(i); } ts.forEachChild(n, v); }; v(fn); };
    const assign = (target, n) => {
      const t = skip(target);
      if (ts.isIdentifier(t)) { const r = resolve(t, m); if (r.local) { if (!inRoot(r.fn)) no(`it assigns ${t.text}, a variable of the function around it`, n); return; } return no(r.top ? `it assigns ${t.text}, a variable of the module` : `it assigns ${t.text}, a global`, n, !r.top); }
      if (ts.isPropertyAccessExpression(t) || ts.isElementAccessExpression(t)) { readName(t); expr(t.expression); if (ts.isElementAccessExpression(t)) expr(t.argumentExpression); return writeTo(t.expression, n, "an assignment"); }
      if (ts.isArrayLiteralExpression(t)) { for (const x of t.elements) if (!ts.isOmittedExpression(x)) assign(ts.isSpreadElement(x) ? x.expression : x, n); return; }
      if (ts.isObjectLiteralExpression(t)) { for (const p of t.properties) { if (ts.isShorthandPropertyAssignment(p)) { s.reads.add(p.name.text); assign(p.name, n); if (p.objectAssignmentInitializer) expr(p.objectAssignmentInitializer); } else if (ts.isPropertyAssignment(p)) { if (ts.isComputedPropertyName(p.name)) { expr(p.name.expression); s.reads.add("*"); } else s.reads.add(p.name.text); assign(p.initializer, n); } else if (ts.isSpreadAssignment(p)) assign(p.expression, n); } return; }
      if (ts.isBinaryExpression(t) && t.operatorToken.kind === K.EqualsToken) { assign(t.left, n); expr(t.right); return; }
      no("it assigns to a computed place", n);
    };
    const expr = n => {
      if (!n) return;
      n = skip(n);
      if (isFn(n)) { const r = role(n, m); if (r.kind === "run") inner(n); else kept(n); return; }
      if (ts.isClassExpression(n)) return classOfCall(n);
      if (ts.isIdentifier(n)) {
        if (!isRef(n)) return;
        const r = resolve(n, m);
        if (r.local) { if (!inRoot(r.fn)) freeRead(n, r); return; }
        if (r.global !== undefined) { if (!GLOBAL_VALUES.has(r.global) && !(r.global in GLOBAL_FNS)) no(r.global === "Date" || r.global === "performance" ? `${r.global}: the clock` : /^(window|document|navigator|location|localStorage|sessionStorage|globalThis|self|process|history|screen)$/.test(r.global) ? `it reads ${r.global}: the environment` : r.global === "console" ? "console: it writes output" : `it reads ${r.global}, a global that is not known to only compute`, n, /^(Date|performance|window|document|navigator|location|localStorage|sessionStorage|globalThis|self|process|history|screen|console)$/.test(r.global)); return; }
        return topRead(n, r);
      }
      if (n.kind === K.ThisKeyword) { if (!f.ctor && !isField) no("it reads `this`", n); return; }
      // `typeof window === "undefined"`: a test of where the code runs, as Solid's `isServer` is
      if (ts.isTypeOfExpression(n) && ts.isIdentifier(skip(n.expression)) && /^(window|document|navigator|self)$/.test(skip(n.expression).text) && resolve(skip(n.expression), m).global !== undefined && isTest(n)) { s.env ??= { what: `typeof ${skip(n.expression).text}`, ...place(n) }; return; }
      if (n.kind === K.SuperKeyword) return;
      if (ts.isCallExpression(n) || ts.isNewExpression(n)) return call(n);
      if (ts.isTaggedTemplateExpression(n)) { const e = skip(n.tag); const c = ts.isIdentifier(e) && !resolve(e, m).local && resolve(e, m).global === undefined ? fromBinding(binding(m, e.text), e.text, false) : ts.isPropertyAccessExpression(e) && e.name.text === "raw" && ts.isIdentifier(skip(e.expression)) && skip(e.expression).text === "String" ? { kind: "ok" } : { kind: "unknown", why: "a template's tag that is not read" }; if (c.kind === "fns") for (const g of c.fns) { const t = summary(g); absorb(s, t, g, n, f); if (ts.isTemplateExpression(n.template)) passed(t, g, [ts.factory.createNull(), ...n.template.templateSpans.map(x => x.expression)], n); } else if (c.kind !== "ok") { addFail("*"); no(`it calls ${c.why}`, n); } if (ts.isTemplateExpression(n.template)) for (const sp of n.template.templateSpans) expr(sp.expression); return; }
      if (ts.isBinaryExpression(n)) {
        const k = n.operatorToken.kind;
        if (k >= K.FirstAssignment && k <= K.LastAssignment) { assign(n.left, n); return expr(n.right); }
        if (k === K.InstanceOfKeyword && ts.isIdentifier(skip(n.right))) { const r = resolve(skip(n.right), m); const bs = r.top && binding(m, r.name); for (const x of bs ?? []) if (x.b?.kind === "class" && x.b.node.members.some(y => y.name && ts.isComputedPropertyName(y.name) && y.modifiers?.some(z => z.kind === K.StaticKeyword))) no(`it tests \`instanceof ${r.name}\`, a class with a member of a computed name`, n); }
        expr(n.left); return expr(n.right);
      }
      if (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) { if (n.operator === K.PlusPlusToken || n.operator === K.MinusMinusToken) return assign(n.operand, n); return expr(n.operand); }
      if (ts.isDeleteExpression(n)) { const t = skip(n.expression); if (ts.isPropertyAccessExpression(t) || ts.isElementAccessExpression(t)) { expr(t.expression); if (ts.isElementAccessExpression(t)) expr(t.argumentExpression); return writeTo(t.expression, n, "delete"); } return; }
      if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
        // what a bundler writes in for the build: `process.env.NODE_ENV`, `import.meta.env.DEV` — one value for as
        // long as the code runs; `import.meta.env.SSR` is a test of where it runs
        { const txt = n.getText().replace(/\s+/g, ""); if (txt === "process.env.NODE_ENV" && resolve(skip(skip(n.expression).expression), m).global !== undefined) return; if (/^import\.meta\.env\.(DEV|PROD|MODE)$/.test(txt)) return; if (txt === "import.meta.env.SSR") { if (isTest(n)) { s.env ??= { what: txt, ...place(n) }; return; } return no("it reads import.meta.env.SSR: the environment (where the code runs)", n, true); } }
        const o = skip(n.expression);
        if (ts.isIdentifier(o)) {
          const r = resolve(o, m);
          if (r.global !== undefined && !r.local) { const name = ts.isPropertyAccessExpression(n) ? n.name.text : undefined; if (r.global === "Math" || r.global === "Number" || r.global === "Symbol" || (r.global === "arguments")) { if (ts.isElementAccessExpression(n)) expr(n.argumentExpression); return; } if (r.global === "import" ) return; void name; }
          // Solid's own record of a hydration under way: `sharedConfig.hydrating` is a test of when the code runs, as
          // `isServer` is of where (the server's page stands until the browser's has taken it over)
          if (r.top && !r.local && r.top.kind === "import" && ts.isPropertyAccessExpression(n)) { const bs = binding(m, o.text); if (bs && bs.length && bs.every(x => x.solid === "sharedConfig")) { if (n.name.text === "hydrating" && isTest(n)) { s.env ??= { what: "sharedConfig.hydrating", ...place(n) }; return; } return no(`it reads sharedConfig.${n.name.text}: Solid's hydration state (the environment)`, n, true); } }
          if (r.top?.kind === "ns") { const name = ts.isPropertyAccessExpression(n) ? n.name.text : undefined; const bs = name ? imported(m, r.top.from, name) : undefined; if (!bs) return no(`it reads ${o.text}.${name ?? "[…]"}: a module that is not read`, n); return bindingRead(bs, n, `${o.text}.${name}`); }
        }
        readName(n); expr(n.expression); if (ts.isElementAccessExpression(n)) expr(n.argumentExpression); return;
      }
      if (ts.isAwaitExpression(n)) { if (!settled(n.expression)) addFail("*"); return expr(n.expression); }
      if (ts.isYieldExpression(n)) { no("a generator: it runs when it is asked, not when it is called", n); return expr(n.expression); }
      if (ts.isObjectLiteralExpression(n)) { for (const p of n.properties) { if (ts.isPropertyAssignment(p)) { if (ts.isComputedPropertyName(p.name)) expr(p.name.expression); if (isFn(skip(p.initializer))) madeFn(skip(p.initializer), p); expr(p.initializer); } else if (ts.isShorthandPropertyAssignment(p)) { if (SPECIAL.has(p.name.text)) fnArg(p.name, "run", n); expr(p.name); } else if (ts.isSpreadAssignment(p)) { s.reads.add("*"); expr(p.expression); } else if (isFn(p)) { if (ts.isComputedPropertyName(p.name)) expr(p.name.expression); madeFn(p, p); kept(p); } } return; }
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) { no("it renders (JSX)", n); return; }
      if (ts.isMetaProperty(n)) { no("import.meta: the environment", n, true); return; }
      ts.forEachChild(n, c => { if (ts.isTypeNode?.(c)) return; expr(c); });
    };
    /** A read of a name of the function that made this one (a closure's free variable): what every call of the made
     *  function shares. A function, a primitive written out, a constant of the module — by the factory's arguments —
     *  is the same at every call; a variable that is assigned again, or a value the factory built, is state. */
    const freeRead = (id, r) => {
      const ok = (e, mm, env, d) => { e = skip(e); if (!e || d > 12) return false; if (fnValueOf(e, mm, env)) return true; if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) { let b = e; while (ts.isPropertyAccessExpression(b) || ts.isElementAccessExpression(b)) b = skip(b.expression); if (ts.isIdentifier(b) && mm === m) { const q = resolve(b, mm); if (q.local && inRoot(q.fn)) return true; } } if (ts.isIdentifier(e)) { const q = resolve(e, mm); if (q.local && mm === m && inRoot(q.fn)) return true; if (q.local) return held(q, mm, env, d + 1); if (q.top) { const bs = binding(mm, e.text); return !!bs && bs.every(x => x.b && (x.b.kind === "fn" || x.b.kind === "class" || (x.b.kind === "var" && !constant(x.m, x.name)))); } return e.text === "undefined"; } return literal(e, mm, 0) === 0; };
      const held = (q, mm, env, d) => { const b = envGet(env, q.local); if (b) return b.undef || ok(b.expr, b.m, b.env, d); if (reassigned(q, mm) || q.local.inits.length !== 1) return false; const i0 = q.local.inits[0]; return !!i0.fn || (!!i0.expr && ok(i0.expr, mm, env, d)); };
      if (reassigned(r, m)) return no(`it reads ${id.text}, a variable of the function that made it, which is assigned again: state its calls share`, id);
      if (!held(r, m, f.env, 0)) no(`it reads ${id.text}, a value the function that made it holds: not known to be the same at every call`, id);
    };
    /** A read of a name of the module. */
    const topRead = (id, r) => { const bs = binding(m, id.text); if (!bs) return no(`it reads ${id.text}: ${r.top.kind === "import" || r.top.kind === "ns" ? "another module's, which is not read" : "a name the module declares twice"}`, id); bindingRead(bs, id, id.text); };
    const bindingRead = (bs, at, name) => {
      for (const x of bs) {
        if (x.solid === "DEV" || x.solid === "isDev") continue;   // the build's: one value for as long as the code runs
        if (x.solid) { if (x.solid === "isServer" && isTest(at)) { s.env ??= { what: "isServer", ...place(at) }; continue; } if (!SOLID_API[x.solid]) no(`it reads ${x.solid}, of Solid: ${x.solid === "isServer" || x.solid === "isDev" ? "the environment" : "not known to be a constant"}`, at, x.solid === "isServer"); continue; }
        const b = x.b;
        if (b.kind === "fn" || b.kind === "class") continue;
        if (b.kind === "var" && b.isConst && b.init && envTest(b.init, x.m, 0)) { if (isTest(at)) { s.env ??= { what: name, ...place(at) }; continue; } no(`it reads ${name}: the environment (where the code runs)`, at, true); continue; }
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
    /** Whether a test is false for certain, as this call is read: a parameter the call was not given (`undefined`), a
     *  chain that asks of one with `?.`, `a && …` of such, a comparison of one with `undefined`. */
    const absent = e => {
      e = skip(e); if (!e || !f.env) return false;
      const undef = x => { x = skip(x); if (!ts.isIdentifier(x)) return false; const r = resolve(x, m); return !!r.local && r.fn === root && !reassigned(r, m) && !!envGet(f.env, r.local)?.undef; };
      if (undef(e)) return true;
      if (ts.isBinaryExpression(e)) { const k = e.operatorToken.kind; if (k === K.AmpersandAmpersandToken) return absent(e.left); if (k === K.ExclamationEqualsEqualsToken || k === K.ExclamationEqualsToken) { const nothing = x => { x = skip(x); return (ts.isIdentifier(x) && x.text === "undefined") || ts.isVoidExpression(x) || (k === K.ExclamationEqualsToken && x.kind === K.NullKeyword); }; return (undef(e.left) && nothing(e.right)) || (undef(e.right) && nothing(e.left)); } return false; }
      let b = e, opt = false;
      while (ts.isPropertyAccessExpression(b) || ts.isElementAccessExpression(b) || ts.isCallExpression(b)) { opt = !!b.questionDotToken; b = skip(b.expression); }
      return opt && undef(b);
    };
    /** A class written in the call: what evaluating it runs. */
    const classOfCall = c => { const h = c.heritageClauses?.find(x => x.token === K.ExtendsKeyword)?.types[0]?.expression; if (h) expr(h); for (const mem of c.members) { if (mem.name && ts.isComputedPropertyName(mem.name)) expr(mem.name.expression); if (ts.isClassStaticBlockDeclaration?.(mem)) block(mem.body); else if (ts.isPropertyDeclaration(mem) && mem.initializer && mem.modifiers?.some(x => x.kind === K.StaticKeyword)) expr(mem.initializer); } if ([c, ...c.members].some(x => ts.canHaveDecorators?.(x) && ts.getDecorators?.(x)?.length)) no("a decorator: code that is not read", c); };
    const readName = e => { s.reads.add(ts.isPropertyAccessExpression(e) ? e.name.text : ts.isStringLiteralLike(skip(e.argumentExpression)) ? skip(e.argumentExpression).text : ts.isNumericLiteral(skip(e.argumentExpression)) ? "#" : "*"); };
    const block = b => { for (const st of b.statements) stmt(st); };
    const stmt = n => {
      if (!n) return;
      if (ts.isFunctionDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) return;
      if (ts.isClassDeclaration(n)) return classOfCall(n);
      if (ts.isBlock(n)) return block(n);
      if (ts.isVariableStatement(n)) { for (const d of n.declarationList.declarations) decl(d); return; }
      if (ts.isExpressionStatement(n)) return expr(n.expression);
      if (ts.isReturnStatement(n)) { if (n.expression) { const e = skip(n.expression); if (isFn(e)) kept(e); else { if (!settled(e)) addFail("*"); expr(e); } } return; }
      if (ts.isIfStatement(n)) { expr(n.expression); if (!absent(n.expression)) stmt(n.thenStatement); return stmt(n.elseStatement); }
      if (ts.isThrowStatement(n)) { expr(n.expression); return addFail(classOf(n.expression)); }
      if (ts.isTryStatement(n)) {
        if (n.catchClause) { const outer = fails; const inside = new Set(); fails = inside; block(n.tryBlock); fails = outer; caughtSets.set(n.catchClause, inside); pat(n.catchClause.variableDeclaration?.name); block(n.catchClause.block); }
        else block(n.tryBlock);
        if (n.finallyBlock) block(n.finallyBlock);
        return;
      }
      if (ts.isForOfStatement(n) || ts.isForInStatement(n)) { if (n.awaitModifier) no("for await: it reads a stream", n); if (ts.isVariableDeclarationList(n.initializer)) for (const d of n.initializer.declarations) pat(d.name); else assign(n.initializer, n); expr(n.expression); return stmt(n.statement); }
      if (ts.isForStatement(n)) { if (n.initializer) { if (ts.isVariableDeclarationList(n.initializer)) for (const d of n.initializer.declarations) decl(d); else expr(n.initializer); } expr(n.condition); expr(n.incrementor); return stmt(n.statement); }
      if (ts.isWhileStatement(n) || ts.isDoStatement(n)) { expr(n.expression); return stmt(n.statement); }
      if (ts.isSwitchStatement(n)) { expr(n.expression); for (const c of n.caseBlock.clauses) { if (ts.isCaseClause(c)) expr(c.expression); for (const st of c.statements) stmt(st); } return; }
      if (ts.isLabeledStatement(n)) return stmt(n.statement);
      if (ts.isWithStatement?.(n)) return no("with: names that are not the code's", n);
      if (ts.isBreakOrContinueStatement(n) || ts.isEmptyStatement(n) || n.kind === K.DebuggerStatement) return;
      ts.forEachChild(n, c => (ts.isStatement?.(c) ? stmt(c) : expr(c)));
    };
    const decl = d => { pat(d.name); if (d.initializer) { const e = skip(d.initializer); if (isFn(e)) { /* a named function: read where it is called, or kept */ if (!namedUsedOnlyAsCallee(d, e)) kept(e); } else expr(e); } };
    /** A function bound to a name is run where the name is called; referenced any other way, it is kept. */
    const namedUsedOnlyAsCallee = (d, fn) => { if (!ts.isIdentifier(d.name)) return false; const host = fnOf(d); const scope = host && isFn(host) ? host : m.sf; const all = refs(scope, d.name.text, m, r => !!r.local && r.local.inits.some(i => i.expr && skip(i.expr) === fn)); return all.every(id => { const [n, p] = up(id); return p && ts.isCallExpression(p) && p.expression === n || (p && ts.isCallExpression(p) && p.arguments.includes(n)); }); };

    for (const p of root.parameters ?? []) { pat(p.name); if (p.initializer) expr(p.initializer); }
    if (!body) return;
    // function declarations of the body that are handed on (not only called) are kept
    if (ts.isBlock(body)) {
      const hoisted = n => { if (ts.isFunctionDeclaration(n) && n.name) { const host = fnOf(n); const scope = host && isFn(host) ? host : m.sf; const all = refs(scope, n.name.text, m, r => !!r.local && r.local.inits.some(i => i.fn === n)); if (!all.every(id => { const [x, p] = up(id); return p && ts.isCallExpression(p) && (p.expression === x || p.arguments.includes(x)); })) kept(n); return; } if (isFn(n) || ts.isClassLike(n)) return; ts.forEachChild(n, hoisted); };
      hoisted(body); block(body);
    } else { const e = skip(body); if (isFn(e)) kept(e); else { if (!settled(e)) addFail("*"); expr(e); } }
    // the members of what the call made, by the names the call reads and the language does: code the call may run
    if (!isField && !root[Symbol.for("rx.infer.members")]) {
      const memberName = x => x.parent && (ts.isPropertyAssignment(x.parent) || ts.isPropertyDeclaration(x.parent)) && x.parent.initializer && skip(x.parent.initializer) === x ? nameOf(x.parent) : nameOf(x);
      const done = new Set();
      for (let more = true; more;) { more = false; for (const fn of [...s.made]) { const name = memberName(fn); const acc = ts.isGetAccessorDeclaration(fn) || ts.isSetAccessorDeclaration(fn); if (done.has(fn) || !fn.body || !((SPECIAL.has(name) && (name !== "toJSON" || s.reads.has("toJSON()"))) || s.reads.has(acc ? name : `${name}()`) || (acc && s.reads.has("*")))) continue; done.add(fn); more = true; if (inRoot(fn)) { if (fn.asteriskToken) no("a generator among what it makes", fn); inner(fn); } else { const g = { m: modOf(fn) ?? m, node: fn, name: `a member \`${name === "@computed" ? "[…]" : name}\` of what it makes` }; const t = summary(g), own = x => x.why === "it reads `this`" && !x.param;   // (what a getter reads of the thing the call made is the call's)
          absorb(s, acc ? { ...t, pure: t.pure.filter(x => !own(x)) } : t, g, root, f); if (fn.asteriskToken || (!acc && /\bthis\b/.test(fn.getText()))) no(`${g.name} is run`, root); } } }
    }
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
    if (ts.isCallExpression(e)) { const c = skip(e.expression); if (ts.isIdentifier(c) && c.text === "Symbol" && !m.top.has("Symbol")) return 0; if (ts.isPropertyAccessExpression(c) && c.getText() === "Symbol.for") return 0; if (ts.isIdentifier(c)) { const bs = binding(m, c.text); if (bs && bs.every(x => x.solid === "createContext")) return 0; } if (solidName(c, m) === "createContext") return 0; }
    if (ts.isPrefixUnaryExpression(e) && ts.isNumericLiteral(e.operand)) return 0;
    if (ts.isTemplateExpression(e)) return e.templateSpans.every(sp => literal(sp.expression, m, d + 1) === 0) ? 0 : undefined;
    if (ts.isIdentifier(e)) { if (e.text === "undefined" || e.text === "NaN" || e.text === "Infinity") return 0; const b = m.top.get(e.text); if (b?.kind === "var" && b.isConst && b.init && !m.written.has(e.text)) return literal(b.init, m, d + 1); if (b?.kind === "fn" || b?.kind === "class") return 0; return undefined; }
    if (ts.isArrayLiteralExpression(e)) { let k = 0; for (const x of e.elements) { if (ts.isSpreadElement(x) || ts.isOmittedExpression(x)) return undefined; const q = literal(x, m, d + 1); if (q === undefined) return undefined; k = Math.max(k, q); } return k + 1; }
    if (ts.isObjectLiteralExpression(e)) { let k = 0; for (const p of e.properties) { if (!ts.isPropertyAssignment(p) || ts.isComputedPropertyName(p.name)) return undefined; const pn = p.name.text; if (pn === "valueOf" || pn === "toString" || pn === "toJSON" || pn === "then" || pn === "__proto__") return undefined; const q = literal(p.initializer, m, d + 1); if (q === undefined) return undefined; k = Math.max(k, q); } return k + 1; }
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(skip(e.expression)) && skip(e.expression).getText() === "Object.freeze" && e.arguments.length === 1) return literal(e.arguments[0], m, d + 1);
    if (ts.isNewExpression(e) && ts.isIdentifier(skip(e.expression)) && /^(Map|Set)$/.test(skip(e.expression).text) && isGlobal(skip(e.expression), m)) { if (!e.arguments?.length) return 1; const q = literal(e.arguments[0], m, d + 1); return q === undefined ? undefined : q; }
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
      if (c.kind === "builtin") { const g = c.gives; if (g === "target") return i === 0 ? (v.f > 0 ? flow(p, v, m, depth + 1) : c.name === "Object.freeze" || c.name === "Object.isFrozen" ? flow(p, v, m, depth + 1) : bad(`is changed in place (${c.name})`)) : flow(p, v, m, depth + 1); if (g === "prim" || g === "deep") return undefined; if (c.made) return c.made === "proxy" ? bad("is given to a Proxy, whose traps may change it") : c.keeps === "nothing" ? undefined : flow(p, heldBy(c, v), m, depth + 1); return flow(p, g === "copy" ? wrap(access(v)) : g === "copy2" ? { ...wrap(access(v), 2), pairs: true } : g === "elem" ? access(v) : g === "fresh" ? { r: v.r, f: 1 } : v, m, depth + 1); }
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
        for (const g of r.fns) { const us = callbackUses(g, r.index, r.field, seen); if (!us.length) return "reentry"; for (const u of us) { if (u.how === "escape" || u.how === "reentry") return "reentry"; if (u.how === "sync") worst = "sync"; } }
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
    const key = `${f.node.pos}\0${f.m.file}\0${index}\0${field ?? ""}\0${f.env?.id ?? ""}`;
    if (usesMemo.has(key)) return usesMemo.get(key);
    if (usesBusy.has(key)) return [];   // met again while it is read (recursion): the reading under way finds what there is
    usesBusy.add(key);
    const out = []; const m = f.m; const fn = f.node;
    const p = fn.parameters?.[index];
    // kept only when nothing was being read above it: a reading made inside another may have met that one unfinished
    const done = () => { usesBusy.delete(key); if (!usesBusy.size) usesMemo.set(key, out); return out; };
    if (!p || !fn.body) return done();
    if (p.dotDotDotToken) { out.push({ how: "escape", why: "a rest parameter", ...place(p) }); return done(); }
    { let dyn; const look = n => { if (ts.isIdentifier(n) && (n.text === "arguments" || n.text === "eval") && isRef(n)) dyn ??= n; ts.forEachChild(n, look); }; look(fn); if (dyn) { out.push({ how: "escape", why: `it uses \`${dyn.text}\`, which may be the callback`, ...place(dyn) }); return done(); } }
    /** Whether a function may hand back an object the code makes: a record written out, an instance of a class of its own. */
    const makesOwn = (g, d) => {
      if (d > 6 || !g.node.body) return true;
      const own = e => { e = e && skip(e); if (!e) return false; if (ts.isConditionalExpression(e)) return own(e.whenTrue) || own(e.whenFalse); if (ts.isBinaryExpression(e)) return own(e.left) || own(e.right); const v = valOf(e, g.m, g.env); if (!v) { const r = ts.isIdentifier(e) ? resolve(e, g.m) : undefined; return !!r?.local && r.local.inits.some(i => i.expr && i.expr !== e && own(i.expr)); } if (ts.isObjectLiteralExpression(v.e) || ts.isClassExpression(v.e)) return true; if (v.e !== e && (ts.isConditionalExpression(v.e) || ts.isBinaryExpression(v.e))) return own(v.e); if (ts.isNewExpression(v.e)) return callee(v.e, v.m).kind === "fns"; if (ts.isCallExpression(v.e)) { const c = callee(v.e, v.m); return c.kind === "fns" && c.fns.some(x => makesOwn(x, d + 1)); } return false; };
      if (!ts.isBlock(g.node.body)) return own(g.node.body);
      let hit = false; const find = n => { if (hit || isFn(n) || ts.isClassLike(n)) return; if (ts.isReturnStatement(n) && own(n.expression)) hit = true; ts.forEachChild(n, find); }; find(g.node.body); return hit;
    };
    /** Whether the receiver of a method named as the platform's (\`addEventListener\`, \`then\`) may be an object whose method is the
     *  code's own, or its caller's. */
    const ownMethod = call => {
      const ce = skip(call.expression); if (!ts.isPropertyAccessExpression(ce) && !ts.isElementAccessExpression(ce)) return false;
      const on = skip(ce.expression); let b = on; while (ts.isPropertyAccessExpression(b) || ts.isElementAccessExpression(b)) b = skip(b.expression);
      if (ts.isIdentifier(b)) { const q = resolve(b, m); if (b === on && q.local && q.fn === fn && q.local.inits.length === 1 && q.local.inits[0].param !== undefined && f.opaque?.get?.(q.local.inits[0].param) === "self") return true; }
      const v = valOf(on, m, f.env); if (!v) return false;
      if (ts.isObjectLiteralExpression(v.e) || ts.isClassExpression(v.e)) return true;
      if (ts.isNewExpression(v.e)) { const c = callee(v.e, v.m); return c.kind === "fns"; }
      if (ts.isCallExpression(v.e)) { const c = callee(v.e, v.m); return c.kind === "fns" && c.fns.some(g => isFn(g.node) && !isAsync(g.node) && makesOwn(g, 0)); }
      return false;
    };
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
        if (c.kind === "later") return c.method && ownMethod(par) ? use("escape", `given to .${c.name}(…) of an object that may have a method of its own`, par) : c.at.includes(i) ? use("later", `given to ${c.name ?? "an observer"}`, par) : use("escape", `given to ${c.name ?? "an observer"} where it is not the listener`, par);
        if (c.kind === "solid") { const how = c.api.args?.[i]; return how === "later" ? use("later", `given to ${c.name}, which runs it after, outside tracking`, par) : how ? use(at("sync"), `given to ${c.name}, which runs it in a computation`, par) : use("escape", `given to ${c.name}`, par); }
        if (c.kind === "builtin") return c.sync && (c.name === "new Promise" ? i === 0 : true) ? use(at("sync"), `given to ${c.name}, which calls it`, par) : use("escape", `given to ${c.name}`, par);
        if (c.kind === "method" && c.name === "removeEventListener") return ownMethod(par) ? use("escape", "given to .removeEventListener(…) of an object that may have a method of its own", par) : undefined;   // taken off: not called
        if (c.kind === "method") return PROMISE_LATER.has(c.name) && ownMethod(par) ? use("escape", `given to .${c.name}(…) of an object that may have a method of its own`, par) : PROMISE_LATER.has(c.name) ? use("later", `given to .${c.name}(…)`, par) : CALLBACK_SYNC.has(c.name) ? use(at("sync"), `given to .${c.name}(…), which calls it`, par) : use("escape", `given to .${c.name}(…), a method that is not read`, par);
        if (c.kind === "fns") { for (const g of c.fns) for (const u of callbackUses(g, i, undefined, seen)) out.push({ ...u, how: u.how === "escape" ? "escape" : at(u.how === "reentry" ? "reentry" : u.how), why: `${g.name}: ${u.why}` }); return; }
        if (c.kind === "local" || c.kind === "unknown") { const g = ts.isCallExpression(par) ? fnValueOf(par.expression, m, f.env) : undefined; if (g) { for (const u of callbackUses(g, i, undefined, seen)) out.push({ ...u, how: u.how === "escape" ? "escape" : at(u.how === "reentry" ? "reentry" : u.how), why: `${g.name ?? "a function it was made with"}: ${u.why}` }); return; } }
        return use("escape", `given to ${c.why ?? (c.kind === "local" ? `${c.r.name}(…)` : "code that is not read")}`, par);
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
      if (ts.isJsxExpression(par) && ts.isJsxAttribute(par.parent)) {
        const tag = tagOf(par.parent); const an = par.parent.name.getText();
        if (isElementTag(tag)) return /^on[A-Z]/.test(an) || an === "ref" ? use("later", `the element's ${an}`, par) : use("escape", `given to <${tag.getText()}> as ${an}`, par);
        return use("escape", `given to <${tag.getText()}> as ${an}`, par);   // (a component: what it does with the prop is its own row's)
      }
      // `onClick={[cb, data]}`: Solid calls the first with the second, when the event comes
      if (ts.isArrayLiteralExpression(par) && par.elements[0] === n) { const [an2, ap2] = up(par); if (ap2 && ts.isJsxExpression(ap2) && ts.isJsxAttribute(ap2.parent) && isElementTag(tagOf(ap2.parent)) && /^on[A-Z]/.test(ap2.parent.name.getText())) return use("later", `the element's ${ap2.parent.name.getText()}`, par); void an2; }
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
        if (fname !== null && fname !== field) return;
        const [an, ap] = up(par);
        if (ap && ts.isBinaryExpression(ap) && ap.left === an && ap.operatorToken.kind === K.EqualsToken) return;
        // (read by a computed name, `rec[k]`: any field, this one among them — followed as this one)
        return value(par, 1);
      }
      if (ts.isVariableDeclaration(par) && par.initializer === n) return pattern(par.name, d);
      if (ts.isCallExpression(par) || ts.isNewExpression(par)) {
        const i = (par.arguments ?? []).indexOf(n); if (i < 0) return;
        const c = callee(par, m); const t = timing(par, f);
        if (c.kind === "fns") { for (const g of c.fns) for (const u of callbackUses(g, i, field, seen)) out.push({ ...u, how: u.how === "escape" || u.how === "reentry" ? u.how : u.how === "later" || t === "later" ? "later" : t === "reentry" ? "reentry" : u.how, why: `${g.name}: ${u.why}` }); return; }
        if (c.kind === "local" || c.kind === "unknown") { const g = ts.isCallExpression(par) ? fnValueOf(par.expression, m, f.env) : undefined; if (g) { for (const u of callbackUses(g, i, field, seen)) out.push({ ...u, how: u.how === "escape" || u.how === "reentry" ? u.how : u.how === "later" || t === "later" ? "later" : t === "reentry" ? "reentry" : u.how, why: `${g.name ?? "a function it was made with"}: ${u.why}` }); return; } }
        if (c.kind === "builtin" && (c.gives === "prim") && c.name !== "JSON.stringify") return;   // (its keys: a field is then read by a computed name, which is followed where it is written)
        if (c.kind === "builtin" && c.name === "Object.entries") return listOf(par, true, d + 1);
        if (c.kind === "builtin" && c.name === "Object.values") return listOf(par, false, d + 1);
        if (c.kind === "builtin" && c.name === "Object.assign") { if (i === 0 || ts.isObjectLiteralExpression(skip(par.arguments[0]))) return whole(par, d + 1); return use("escape", "the record is copied into another object", par); }
        // Solid's `omit` and `merge` hand back the record's fields, read when they are asked for: but those `omit` names
        if (c.kind === "solid" && c.name === "omit" && i === 0) { if (par.arguments.slice(1).some(a => ts.isStringLiteralLike(skip(a)) && skip(a).text === field)) return; return whole(par, d + 1); }
        if (c.kind === "solid" && c.name === "merge") return whole(par, d + 1);
        return use("escape", `the record is given to ${c.why ?? c.name ?? "code that is not read"}`, par);
      }
      // `{ ...rec, a }`: a record with the field, unless a later property of the same name takes its place
      if (ts.isSpreadAssignment(par) && ts.isObjectLiteralExpression(par.parent)) { const ps = par.parent.properties; if (ps.slice(ps.indexOf(par) + 1).some(q => (ts.isPropertyAssignment(q) || ts.isShorthandPropertyAssignment(q) || ts.isMethodDeclaration(q)) && q.name && (ts.isIdentifier(q.name) || ts.isStringLiteralLike(q.name)) && q.name.text === field)) return; return whole(par.parent, d + 1); }
      // `<button {...rec}>`: Solid sets an element's `on…` as its listener, calls its `ref` when the element is made,
      // renders its `children` (a function among them is called in a computation), and sets every other as an attribute;
      if (ts.isJsxSpreadAttribute(par)) {
        const tag = tagOf(par);
        if (isElementTag(tag)) { if (/^on[A-Z]/.test(field) || field === "ref") return use("later", `spread on <${tag.text}>, where ${field} is the element's ${field === "ref" ? "ref" : "listener"}`, par); if (field === "children") return use("sync", `spread on <${tag.text}>, which renders its children`, par); if (/^on/.test(field)) return use("escape", `spread on <${tag.text}>`, par); return; }
        return use("escape", `the record is spread on <${tag.getText()}>, which is not read`, par);
      }
      if (ts.isSpreadAssignment(par) || ts.isSpreadElement(par)) return use("escape", "the record is spread into another", par);
      if (ts.isBinaryExpression(par)) { const k = par.operatorToken.kind; if (k === K.EqualsToken && par.right === n) return use("escape", "the record is stored", par); if ((k === K.QuestionQuestionToken || k === K.BarBarToken || k === K.AmpersandAmpersandToken) && (par.right === n || k !== K.AmpersandAmpersandToken)) return whole(par, d + 1); return; }
      if (ts.isConditionalExpression(par)) return par.condition === n ? undefined : whole(par, d + 1);
      if (ts.isPrefixUnaryExpression(par) || ts.isTypeOfExpression(par) || ts.isIfStatement(par) || ts.isExpressionStatement(par)) return;
      if (ts.isForInStatement(par)) return;   // its keys: a field is then read by a computed name
      if (ts.isPropertyAssignment(par) || ts.isShorthandPropertyAssignment(par) || ts.isArrayLiteralExpression(par) || ts.isReturnStatement(par) || ts.isArrowFunction(par) || ts.isJsxExpression(par)) return use("escape", "the record is handed on", par);
      return use("escape", "the record is used in a way that is not followed", par);
    };
    /** The references to a name declared at `id`, each given to `each`. */
    const eachRef = (id, each) => { const host = fnOf(id); const scope = host && isFn(host) ? host : m.sf; const l = isFn(scope) ? locals(scope).get(id.text) : undefined; if (!l) return use("escape", "bound to a name of the module", id); if (visited.has(l)) return; visited.add(l); if (l.count > 1) return use("escape", `${id.text} is bound more than once`, id); for (const r of refs(scope, id.text, m, x => x.local === l)) if (!isAssignTarget(r)) each(r); };
    /** `node` is a list made from the record: its values (`Object.values(rec)`), or its `[key, value]` pairs. */
    const listOf = (node, pairs, d = 0) => {
      if (d > 30) return use("escape", "handed on further than is followed", node);
      const [n, par] = up(node); if (!par) return;
      const what = pairs ? "entries" : "values";
      const item = pat => {
        if (!pairs) return ts.isIdentifier(pat) ? name(pat, 1) : use("escape", "a value of the record is taken apart", pat);
        if (ts.isArrayBindingPattern(pat)) { const e = pat.elements[1]; if (!e || ts.isOmittedExpression(e)) return; if (e.dotDotDotToken || !ts.isIdentifier(e.name) || pat.elements.length > 2) return use("escape", "a pair of the record is taken apart further", pat); return name(e.name, 1); }
        if (ts.isIdentifier(pat)) return eachRef(pat, r => { const [rn, rp] = up(r); if (rp && ts.isElementAccessExpression(rp) && rp.expression === rn && ts.isNumericLiteral(skip(rp.argumentExpression))) return skip(rp.argumentExpression).text === "1" ? value(rp, 1) : undefined; if (rp && ts.isVariableDeclaration(rp) && rp.initializer === rn) return item(rp.name); use("escape", "a pair of the record goes where it is not followed", r); });
        return use("escape", "a pair of the record is taken apart as a record", pat);
      };
      if (ts.isForOfStatement(par) && par.expression === n) return ts.isVariableDeclarationList(par.initializer) ? item(par.initializer.declarations[0].name) : use("escape", `the record's ${what} are walked into a name declared elsewhere`, par);
      if (ts.isPropertyAccessExpression(par) && par.expression === n) {
        const [pn, pp] = up(par); const mn = par.name.text;
        if (mn === "length") return;
        if (!(pp && ts.isCallExpression(pp) && pp.expression === pn) || !/^(forEach|filter|some|every)$/.test(mn)) return use("escape", `the record's ${what} are given to .${mn}`, par);
        const cb = skip(pp.arguments[0]);
        if (mn === "filter" && cb && ts.isIdentifier(cb) && cb.text === "Boolean" && resolve(cb, m).global !== undefined) return listOf(pp, pairs, d + 1);
        if (!cb || !isFn(cb)) return use("escape", `the record's ${what} are given to .${mn}(…) with a function that is not written there`, pp);
        if (cb.parameters[0]) item(cb.parameters[0].name);
        return mn === "filter" ? listOf(pp, pairs, d + 1) : undefined;
      }
      if (ts.isVariableDeclaration(par) && par.initializer === n && ts.isIdentifier(par.name)) return eachRef(par.name, r => listOf(r, pairs, d + 1));
      if (ts.isExpressionStatement(par)) return;
      return use("escape", `the record's ${what} go where they are not followed`, par);
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

  // ---- what a function reads from above, and what it provides beneath: Solid's contexts, and JSX ----
  // The facts are Solid's and @solidjs/web's (08 CN-8: no package is named): `useContext(C)` throws where nothing above
  // provides `C` and `createContext` was given no default (`undefined` is none; `null` is a value); a context is its own
  // provider component (`<C value={v}>…</C>`, or `createComponent(C, { value, get children() { … } })` where a package
  // ships JavaScript); what is written among a provider's children is created beneath it, and an expression written
  // anywhere else is evaluated where it stands — so a `props.children` read outside the provider makes the children
  // outside it, wherever the result is put. A lower-case tag is an element; `Show`, `For` and the rest are Solid's.
  /** The export of Solid an expression names (`useContext`, `createComponent`, `Show`…). */
  function solidName(e, m) {
    e = skip(e);
    if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(skip(e.expression))) { const r = resolve(skip(e.expression), m); return !r.local && r.top?.kind === "ns" && SOLID.test(r.top.from) ? e.name.text : undefined; }
    if (!ts.isIdentifier(e)) return undefined;
    const r = resolve(e, m); if (r.local || !r.top) return undefined;
    const bs = binding(m, e.text); return bs && bs.length && bs.every(x => x.solid && x.solid === bs[0].solid) ? bs[0].solid : undefined;
  }
  /** The context an expression's value is: a `createContext(…)` the code shows it to be. `required`: no default, so a
   *  read with nothing above throws; `nullish`: its default is `null` (a read answers it, and the code may then throw). */
  function ctxOf(e, m, env) {
    const v = valOf(e, m, env); if (!v || !ts.isCallExpression(v.e) || solidName(v.e.expression, v.m) !== "createContext") return undefined;
    const a0 = v.e.arguments[0]; let none = !a0, nul = false;
    if (a0) { const d = valOf(a0, v.m, v.env); const x = d ? d.e : skip(a0); none = (ts.isIdentifier(x) && x.text === "undefined" && !d?.name) || ts.isVoidExpression(x); nul = x.kind === K.NullKeyword; if (ts.isIdentifier(skip(a0))) { const r = resolve(skip(a0), v.m); if (r.local) { const b = envGet(v.env, r.local); if (b?.undef) none = true; else if (!b) { none = false; nul = false; } } } }
    return { key: `${v.m.file}:${v.e.pos}:${v.env?.id ?? ""}`, node: v.e, m: v.m, env: v.env, name: v.name, required: none, nullish: none || nul };
  }
  /** A JSX element, or `createComponent(Tag, { … })` written out: its tag, what is written on it, and what is written
   *  among its children (`kids`: nodes that are created beneath it). */
  function elementOf(n, m) {
    if (ts.isJsxElement(n)) return { node: n, tag: n.openingElement.tagName, attrs: [...n.openingElement.attributes.properties], kids: [...n.children], jsx: true };
    if (ts.isJsxSelfClosingElement(n)) return { node: n, tag: n.tagName, attrs: [...n.attributes.properties], kids: [], jsx: true };
    if (ts.isCallExpression(n) && n.arguments.length >= 1 && solidName(n.expression, m) === "createComponent") {
      const p = n.arguments[1] && skip(n.arguments[1]); const attrs = [], kids = [];
      if (p && ts.isObjectLiteralExpression(p)) { for (const q of p.properties) { const pn = q.name && (ts.isIdentifier(q.name) || ts.isStringLiteralLike(q.name)) ? q.name.text : undefined; if (pn === "children") kids.push(q); else attrs.push(q); } }
      else if (p) attrs.push(p);
      return { node: n, tag: n.arguments[0], attrs, kids, whole: p && !ts.isObjectLiteralExpression(p) ? p : undefined };
    }
    return undefined;
  }
  /** Whether `node` is written among the children of the element `el`. */
  /** Whether `node` is written in the `value` an element is given (a provider's value: what its readers get, beneath it). */
  const inValue = (node, el) => { for (let n = node; n && n !== el.node; n = n.parent) { if (ts.isJsxAttribute(n) && n.parent?.parent === (ts.isJsxElement(el.node) ? el.node.openingElement : el.node)) return n.name.getText() === "value"; if ((ts.isPropertyAssignment(n) || ts.isGetAccessorDeclaration(n)) && el.attrs.includes(n)) return (ts.isIdentifier(n.name) || ts.isStringLiteralLike(n.name)) && n.name.text === "value"; } return false; };
  const beneath = (node, el) => { if (el.jsx) { if (!ts.isJsxElement(el.node)) return false; for (let n = node; n && n !== el.node; n = n.parent) if (n.parent === el.node) return n !== el.node.openingElement && n !== el.node.closingElement; return false; } for (let n = node; n && n !== el.node; n = n.parent) if (el.kids.includes(n)) return true; return false; };
  const SOLID_FLOW = new Set(["Show", "For", "Switch", "Match", "Loading", "Reveal", "Portal", "Repeat", "Dynamic", "Errored", "NoHydration", "Hydration"]);
  const ctxMemo = new Map(); const ctxBusy = new Set(); let ctxSpent = 0;
  /** The contexts a call of `f` reads from above: `must` — on every path, and it throws without one; `may` — on some
   *  path, or when a function it hands back or keeps is called; `opaque` — code it calls or renders that is not read,
   *  which may read more. A read beneath a provider the function itself renders is not from above. */
  function ctxReads(f) {
    const key = `${f.m.file}\0${f.node.pos}\0${f.env?.id ?? ""}`;
    if (ctxMemo.has(key)) return ctxMemo.get(key);
    const out = { must: new Map(), may: new Map(), opaque: [] };
    if (ctxBusy.has(key)) return out;   // met again while it is read (recursion): the reading under way finds what there is
    // a reading that goes on past what any module's own code needs (a library of combinators, each made by the last)
    // stops, and says so: what is beyond it may read a context
    if (ctxBusy.size > 80 || ++ctxSpent > 6000) { out.opaque.push({ why: "it calls more functions, each made by another, than are followed", ...place(f.node) }); return out; }
    ctxBusy.add(key);
    const m = f.m, env = f.env, root = f.node;
    // (under `runWithOwner(owner, …)` a context is looked up from that owner, not from where the function is called:
    // a provider above the call does not answer it, so it is no `uses` of the call's — and not nothing either)
    const ELSEWHERE = "\0another owner";
    const add = (c, alw, prov, at) => { if (prov.has(c.key)) return; if (prov.has(ELSEWHERE)) { out.opaque.push({ why: `it reads ${c.name ?? "a context"} under another owner (runWithOwner): a provider above the call does not answer it`, ...(at.file ? at : place(at)) }); return; } (alw ? out.must : out.may).set(c.key, { ...c, at: at.file ? at : place(at) }); };
    const take = (t, alw, prov) => { for (const c of t.must.values()) add(c, alw, prov, c.at); for (const c of t.may.values()) add(c, false, prov, c.at); for (const o of t.opaque) out.opaque.push(o); };
    const opaque = (why, at) => out.opaque.push({ why, ...place(at) });
    // a value that is another package's, or a context's: what calling it runs is not read
    const foreignOf = new Map();
    const foreign = (e, d = 0) => {
      e = skip(e); if (!e || d > 16) return false;
      if (ts.isIdentifier(e)) {
        const r = resolve(e, m);
        if (r.local) { const b = envGet(env, r.local); if (b) return false; if (foreignOf.has(r.local)) return foreignOf.get(r.local); foreignOf.set(r.local, false); const v = r.local.inits.some(i => { while (i.part) i = i.part; return i.expr ? foreign(i.expr, d + 1) : i.loop ? foreign(i.loop.expression, d + 1) : false; }); foreignOf.set(r.local, v); return v; }
        if (r.top) { if (r.top.kind === "import" || r.top.kind === "ns") return !SOLID.test(r.top.from) && !binding(m, e.text); if (r.top.kind === "var" && r.top.init && !isFn(skip(r.top.init))) { if (foreignOf.has(r.top)) return foreignOf.get(r.top); foreignOf.set(r.top, false); const v = !valOf(e, m, env) || foreign(r.top.init, d + 1); foreignOf.set(r.top, v); return v; } return false; }
        return false;
      }
      if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e) || ts.isAwaitExpression(e)) return foreign(e.expression, d + 1);
      if (ts.isConditionalExpression(e)) return foreign(e.whenTrue, d + 1) || foreign(e.whenFalse, d + 1);
      if (ts.isBinaryExpression(e)) { const k = e.operatorToken.kind; return k === K.BarBarToken || k === K.AmpersandAmpersandToken || k === K.QuestionQuestionToken ? foreign(e.left, d + 1) || foreign(e.right, d + 1) : false; }
      if (ts.isCallExpression(e)) { const sn = solidName(e.expression, m); if (sn) return sn === "useContext"; const g = fnValueOf(e.expression, m, env); if (g) { const t = ctxReads(g); return t.must.size > 0 || t.may.size > 0 || t.opaque.length > 0; } return unread(e.expression) !== undefined || foreign(e.expression, d + 1); }
      return false;
    };
    /** Why calling `ce` runs code that is not read — undefined where it does not (a built-in, a value the caller gave). */
    const unread = ce => {
      let b = skip(ce); while (b && (ts.isPropertyAccessExpression(b) || ts.isElementAccessExpression(b) || ts.isCallExpression(b))) b = skip(b.expression);
      if (!b) return undefined;
      if (b.kind === K.ThisKeyword || b.kind === K.SuperKeyword) return "a method of `this`";
      if (!ts.isIdentifier(b)) return isFn(b) || ts.isObjectLiteralExpression(b) || ts.isArrayLiteralExpression(b) || ts.isStringLiteralLike(b) || ts.isTemplateExpression(b) || ts.isParenthesizedExpression(b) ? undefined : "a value that is computed";
      const r = resolve(b, m);
      if (r.global !== undefined) return r.global === "eval" || r.global === "Function" ? `${r.global}: code made from a string` : undefined;
      if (r.local) return foreign(b) ? `${b.text}, which holds a context's value or another package's` : undefined;
      if (r.top.kind === "import" || r.top.kind === "ns") { if (SOLID.test(r.top.from)) return undefined; return `${b.text}, of ${r.top.from}: code that is not read`; }
      if (r.top.kind === "var" && foreign(b)) return `${b.text}, a value made by code that is not read`;
      if (r.top.kind === "class") return `${b.text}, a class`;
      return undefined;
    };
    /** `const v = useContext(C)` followed by `if (!v) throw …`: a default of `null` that the code refuses. */
    const refused = call => {
      const [n, p] = up(call); if (!p || !ts.isVariableDeclaration(p) || p.initializer !== n || !ts.isIdentifier(p.name)) return false;
      const st = p.parent?.parent; const list = st && ts.isVariableStatement(st) && st.parent && (ts.isBlock(st.parent) || ts.isSourceFile(st.parent)) ? st.parent.statements : undefined; if (!list) return false;
      const v = p.name.text; const isV = e => ts.isIdentifier(skip(e)) && skip(e).text === v;
      const nothing = e => { e = skip(e); return e.kind === K.NullKeyword || (ts.isIdentifier(e) && e.text === "undefined") || ts.isVoidExpression(e); };
      const test = e => { e = skip(e); if (ts.isPrefixUnaryExpression(e) && e.operator === K.ExclamationToken) return isV(e.operand); if (ts.isBinaryExpression(e)) { const k = e.operatorToken.kind; if (k === K.EqualsEqualsToken || k === K.EqualsEqualsEqualsToken) return (isV(e.left) && nothing(e.right) && (k === K.EqualsEqualsToken || skip(e.right).kind === K.NullKeyword)) || (isV(e.right) && nothing(e.left) && (k === K.EqualsEqualsToken || skip(e.left).kind === K.NullKeyword)); if (k === K.BarBarToken) return test(e.left); } return false; };
      const throws = s => ts.isThrowStatement(s) || (ts.isBlock(s) && s.statements.length > 0 && ts.isThrowStatement(s.statements[0]));
      for (let i = list.indexOf(st) + 1; i < list.length; i++) { const s = list[i]; if (ts.isIfStatement(s) && test(s.expression) && throws(s.thenStatement)) return true; if (exits(s)) return false; }
      return false;
    };
    const exits = st => { let found = false; const v = n => { if (found || isFn(n) || ts.isClassLike(n)) return; if (ts.isReturnStatement(n)) { found = true; return; } ts.forEachChild(n, v); }; v(st); return found; };
    const optional = e => { for (e = skip(e); e && (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e) || ts.isCallExpression(e)); e = skip(e.expression)) if (e.questionDotToken) return true; return false; };
    const fn = (g, alw, prov) => { for (const q of g.parameters ?? []) if (q.initializer) scan(q.initializer, false, prov); if (!g.body) return; if (ts.isBlock(g.body)) stmts(g.body.statements, alw, prov); else top(g.body, alw, prov); };
    const stmts = (list, alw, prov) => { let a = alw; for (const st of list) { stmt(st, a, prov); if (a && !ts.isReturnStatement(st) && exits(st)) a = false; } };
    const stmt = (n, alw, prov) => {
      if (!n) return;
      if (ts.isFunctionDeclaration(n)) return fn(n, false, prov);
      if (ts.isClassDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) return;
      if (ts.isBlock(n)) return stmts(n.statements, alw, prov);
      if (ts.isVariableStatement(n)) { for (const d of n.declarationList.declarations) if (d.initializer) scan(d.initializer, alw, prov); return; }
      if (ts.isExpressionStatement(n)) return scan(n.expression, alw, prov);
      if (ts.isReturnStatement(n)) return n.expression ? top(n.expression, alw, prov) : undefined;
      if (ts.isIfStatement(n)) { scan(n.expression, alw, prov); stmt(n.thenStatement, false, prov); return stmt(n.elseStatement, false, prov); }
      if (ts.isThrowStatement(n)) return scan(n.expression, alw, prov);
      if (ts.isTryStatement(n)) { stmts(n.tryBlock.statements, alw && !n.catchClause, prov); if (n.catchClause) stmts(n.catchClause.block.statements, false, prov); if (n.finallyBlock) stmts(n.finallyBlock.statements, alw, prov); return; }
      if (ts.isForOfStatement(n) || ts.isForInStatement(n)) { scan(n.expression, alw, prov); return stmt(n.statement, false, prov); }
      if (ts.isForStatement(n)) { if (n.initializer) { if (ts.isVariableDeclarationList(n.initializer)) { for (const d of n.initializer.declarations) if (d.initializer) scan(d.initializer, alw, prov); } else scan(n.initializer, alw, prov); } if (n.condition) scan(n.condition, alw, prov); if (n.incrementor) scan(n.incrementor, false, prov); return stmt(n.statement, false, prov); }
      if (ts.isWhileStatement(n)) { scan(n.expression, alw, prov); return stmt(n.statement, false, prov); }
      if (ts.isDoStatement(n)) { stmt(n.statement, alw, prov); return scan(n.expression, alw, prov); }
      if (ts.isSwitchStatement(n)) { scan(n.expression, alw, prov); for (const c of n.caseBlock.clauses) { if (ts.isCaseClause(c)) scan(c.expression, false, prov); stmts(c.statements, false, prov); } return; }
      if (ts.isLabeledStatement(n)) return stmt(n.statement, alw, prov);
      ts.forEachChild(n, c => (ts.isStatement?.(c) ? stmt(c, false, prov) : scan(c, false, prov)));
    };
    /** What a function hands back: an element written there is made when the function is called. */
    const top = (e, alw, prov) => { const x = skip(e); if (x && (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || elementOf(x, m))) return element(x, alw, prov); scan(e, alw, prov); };
    const element = (n, alw, prov) => {
      const el = elementOf(n, m);
      const tag = el.tag; const lower = ts.isIdentifier(tag) && /^[a-z]/.test(tag.text) || ts.isJsxNamespacedName?.(tag) || ts.isStringLiteralLike(skip(tag));
      let under = prov;
      if (!lower) {
        const c = ctxOf(tag, m, env);
        if (c) { under = new Set(prov); under.add(c.key); }
        else { const sn = solidName(tag, m); const g = sn ? undefined : fnValueOf(tag, m, env); if (g) take(ctxReads(g), alw, prov); else if (!sn || !SOLID_FLOW.has(sn)) { const w = sn ? `Solid's ${sn}` : unread(tag); if (w) opaque(`it renders ${w}: a component that is not read`, n); } }
      }
      for (const a of el.attrs) { if (ts.isJsxAttribute(a)) { if (a.initializer && ts.isJsxExpression(a.initializer) && a.initializer.expression) scan(a.initializer.expression, false, prov); } else if (ts.isJsxSpreadAttribute(a)) scan(a.expression, false, prov); else if (ts.isPropertyAssignment(a)) scan(a.initializer, false, prov); else if (isFn(a)) fn(a, false, prov); else if (ts.isSpreadAssignment(a)) scan(a.expression, false, prov); else if (ts.isShorthandPropertyAssignment(a)) scan(a.name, false, prov); else scan(a, false, prov); }
      for (const k of el.kids) { if (ts.isJsxText(k)) continue; if (ts.isJsxExpression(k)) { if (k.expression) scan(k.expression, false, under); } else if (ts.isPropertyAssignment(k)) scan(k.initializer, false, under); else if (isFn(k)) fn(k, false, under); else if (ts.isShorthandPropertyAssignment(k)) scan(k.name, false, under); else scan(k, false, under); }
    };
    /** A call of a value that is one of several the code shows — `isDev ? fn => … : onCleanup`, what a factory hands
     *  back on one path or another: each is read, as what the call may do. False where one of them is not shown. */
    const either = (e, prov, d) => {
      e = skip(e); if (!e || d > 8) return false;
      if (solidName(e, m)) return true;
      const g = fnValueOf(e, m, env); if (g) { take(ctxReads(g), false, prov); return true; }
      if (ts.isConditionalExpression(e)) return either(e.whenTrue, prov, d + 1) && either(e.whenFalse, prov, d + 1);
      if (ts.isBinaryExpression(e) && (e.operatorToken.kind === K.BarBarToken || e.operatorToken.kind === K.QuestionQuestionToken)) return either(e.left, prov, d + 1) && either(e.right, prov, d + 1);
      if (ts.isIdentifier(e)) {   // a name bound once to such a choice, here or in the module it comes from
        const r = resolve(e, m);
        if (r.local) { if (envGet(env, r.local) || r.local.inits.length !== 1 || !r.local.inits[0].expr || reassigned(r, m)) return false; return ts.isIdentifier(skip(r.local.inits[0].expr)) ? false : either(r.local.inits[0].expr, prov, d + 1); }
        if (!r.top) return false;
        const bs = binding(m, e.text); const x = bs && bs.length === 1 && !bs[0].solid ? bs[0] : undefined;
        if (!x || x.b.kind !== "var" || !x.b.isConst || !x.b.init || x.b.pattern || x.m.written.has(x.name)) return false;
        const t = ctxReads.choice(x, d); if (!t) return false; take(t, false, prov); return true;
      }
      // what a factory that is read hands back, whichever of its functions that is: all it holds is read, as what
      // the call may do
      if (ts.isCallExpression(e)) { const fac = fnValueOf(e.expression, m, env); if (!fac || e.arguments.some(x => ts.isSpreadElement(x)) || Math.max(env?.depth ?? 0, fac.env?.depth ?? 0) >= MAX_DEPTH) return false; take(ctxReads({ ...fac, env: bindEnv(fac, e, m, env) }), false, prov); return true; }
      return false;
    };
    /** `new C(…)` of a class the code declares: its constructor and its fields' initializers run now, and its methods
     *  whenever what holds the object calls them. */
    const made = (ce, alw, prov) => {
      const c = ts.isIdentifier(ce) ? fromBinding(binding(m, ce.text), ce.text, true) : undefined; if (!c || c.kind !== "fns" || resolve(ce, m).local) return false;
      for (const k of c.fns) {
        const h = k.node.heritageClauses?.find(x => x.token === K.ExtendsKeyword)?.types[0]?.expression;
        if (h && !(ts.isIdentifier(skip(h)) && resolve(skip(h), k.m).global !== undefined)) return false;
        const t = ctxReads.classOf(k); take(t, alw, prov);
      }
      return true;
    };
    const scan = (n, alw, prov) => {
      n = skip(n); if (!n) return;
      if (isFn(n)) return fn(n, false, prov);
      if (ts.isClassExpression(n) || ts.isTypeNode?.(n)) return;
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) return element(n, false, prov);
      if (ts.isJsxFragment(n)) { for (const k of n.children) { if (ts.isJsxExpression(k)) { if (k.expression) scan(k.expression, false, prov); } else if (!ts.isJsxText(k)) scan(k, false, prov); } return; }
      if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
        const as = n.arguments ?? []; const isNew = ts.isNewExpression(n);
        const a = alw && !optional(n);
        const sn = isNew ? undefined : solidName(n.expression, m);
        if (sn === "useContext") { const c = as[0] && ctxOf(as[0], m, env); if (!c) opaque("it reads a context the code does not show to be one the module makes", n); else if (c.required || (c.nullish && refused(n))) add(c, a, prov, n); return; }
        if (sn === "createComponent") return element(n, false, prov);
        // a memo computes when it is made, unless it is made `lazy` (Solid 2: `lazy` defers it to its first read)
        const eager = sn === "createMemo" && (!as[1] || (ts.isObjectLiteralExpression(skip(as[1])) && skip(as[1]).properties.every(q => ts.isPropertyAssignment(q) && (ts.isIdentifier(q.name) || ts.isStringLiteralLike(q.name)) && (q.name.text !== "lazy" || skip(q.initializer).kind === K.FalseKeyword))));
        if (sn === "runWithOwner") { const under = new Set(prov); under.add(ELSEWHERE); as.forEach((x, i) => { const e = skip(x); if (i === 1 && isFn(e)) fn(e, a, under); else if (i === 1) { const g = fnValueOf(e, m, env); if (g) take(ctxReads(g), a, under); else scan(e, a, prov); } else scan(e, a, prov); }); return; }
        if (sn) { const api = SOLID_API[sn]; as.forEach((x, i) => { const e = skip(x); const how = eager && i === 0 ? "run" : api?.args?.[i]; if (isFn(e)) fn(e, how === "run" && a, prov); else if (how && ts.isIdentifier(e)) { const g = fnValueOf(e, m, env); if (g) take(ctxReads(g), how === "run" && a, prov); else scan(e, a, prov); } else scan(e, a, prov); }); return; }
        const ce = skip(n.expression);
        if (!isNew && isFn(ce)) { fn(ce, a, prov); for (const x of as) scan(ts.isSpreadElement(x) ? x.expression : x, a, prov); return; }
        const g = isNew ? undefined : fnValueOf(n.expression, m, env);
        if (g) take(ctxReads(g), a, prov);
        else if (isNew) { if (!(ts.isIdentifier(ce) && resolve(ce, m).global !== undefined) && !made(ce, a, prov)) opaque(`it calls new ${ce.getText().slice(0, 30)}: a class that is not read`, n); }
        else if (!either(n.expression, prov, 0)) { const w = unread(ce); if (w) opaque(`it calls ${w}`, n); }
        if (!ts.isIdentifier(ce)) scan(ce, a, prov);
        for (const x of as) { const e = skip(ts.isSpreadElement(x) ? x.expression : x); if (isFn(e)) fn(e, false, prov); else scan(e, a, prov); }
        return;
      }
      if (ts.isConditionalExpression(n)) { scan(n.condition, alw, prov); scan(n.whenTrue, false, prov); return scan(n.whenFalse, false, prov); }
      if (ts.isBinaryExpression(n)) { const k = n.operatorToken.kind; const short = k === K.BarBarToken || k === K.AmpersandAmpersandToken || k === K.QuestionQuestionToken || k === K.BarBarEqualsToken || k === K.AmpersandAmpersandEqualsToken || k === K.QuestionQuestionEqualsToken; scan(n.left, alw, prov); return scan(n.right, alw && !short, prov); }
      if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) { scan(n.expression, alw, prov); if (ts.isElementAccessExpression(n)) scan(n.argumentExpression, alw && !n.questionDotToken, prov); return; }
      if (ts.isObjectLiteralExpression(n)) { for (const q of n.properties) { if (ts.isPropertyAssignment(q)) { if (ts.isComputedPropertyName(q.name)) scan(q.name.expression, alw, prov); scan(q.initializer, alw, prov); } else if (ts.isSpreadAssignment(q)) scan(q.expression, alw, prov); else if (isFn(q)) fn(q, false, prov); } return; }
      if (ts.isIdentifier(n) || ts.isLiteralExpression(n)) return;
      ts.forEachChild(n, c => { if (!ts.isTypeNode?.(c)) scan(c, alw, prov); });
    };
    try { fn(root, true, new Set()); } catch (e) { if (options.debug) throw e; opaque(`could not be read (${String(e?.message ?? e).slice(0, 80)})`, root); }
    for (const k of out.must.keys()) out.may.delete(k);
    ctxBusy.delete(key); if (!ctxBusy.size) ctxMemo.set(key, out);
    return out;
  }
  /** A class's own code, as `new` of it runs it: `{ must, may, opaque }` as `ctxReads` gives. */
  ctxReads.classOf = k => { const out = { must: new Map(), may: new Map(), opaque: [] }; for (const mem of k.node.members) { const fnode = ts.isConstructorDeclaration(mem) || ts.isMethodDeclaration(mem) || ts.isGetAccessorDeclaration(mem) || ts.isSetAccessorDeclaration(mem) ? mem : ts.isPropertyDeclaration(mem) && mem.initializer && isFn(skip(mem.initializer)) ? skip(mem.initializer) : undefined; if (!fnode || !fnode.body) { if (ts.isPropertyDeclaration(mem) && mem.initializer && !isFn(skip(mem.initializer)) && (ts.isCallExpression(skip(mem.initializer)) || ts.isNewExpression(skip(mem.initializer))) && !(ts.isNewExpression(skip(mem.initializer)) && ts.isIdentifier(skip(skip(mem.initializer).expression)) && resolve(skip(skip(mem.initializer).expression), k.m).global !== undefined)) out.opaque.push({ why: `a field of ${k.name} is made by a call`, ...place(mem) }); continue; } const t = ctxReads({ m: k.m, node: fnode, env: undefined }); const ctor = ts.isConstructorDeclaration(mem); for (const c of t.must.values()) (ctor ? out.must : out.may).set(c.key, c); for (const c of t.may.values()) out.may.set(c.key, c); out.opaque.push(...t.opaque); } return out; };
  /** A value of a module that is a choice between functions (`const f = dev ? a : b`): what a call of it may do. */
  ctxReads.choice = (x, d) => { const e = skip(x.b.init); if (!ts.isConditionalExpression(e) && !(ts.isBinaryExpression(e) && (e.operatorToken.kind === K.BarBarToken || e.operatorToken.kind === K.QuestionQuestionToken))) return undefined; const out = { must: new Map(), may: new Map(), opaque: [] }; const each = b => { b = skip(b); if (solidName(b, x.m)) return true; const g = fnValueOf(b, x.m, undefined); if (g) { const t = ctxReads(g); for (const c of [...t.must.values(), ...t.may.values()]) out.may.set(c.key, c); out.opaque.push(...t.opaque); return true; } if (ts.isConditionalExpression(b)) return each(b.whenTrue) && each(b.whenFalse); return false; }; return (ts.isConditionalExpression(e) ? each(e.whenTrue) && each(e.whenFalse) : each(e.left) && each(e.right)) ? out : undefined; };
  /** Every use the code makes of the record a function takes as parameter `index` (a component's props): each
   *  `{ field, node, why }` — `field` the one read there, or null where the record goes whole (spread, handed on,
   *  read by a computed name) — at `node`, the place in `f` where it happens. Followed through names it is bound to,
   *  Solid's `omit` and `merge` (which read nothing until they are asked), and the functions of the module it is given to. */
  function recordUses(f, index, seen = new Set()) {
    const out = []; const m = f.m, root = f.node; const p = root.parameters?.[index]; if (!p) return out;
    const k = `${m.file}\0${root.pos}\0${index}\0${f.env?.id ?? ""}`; if (seen.has(k)) return out; seen.add(k);
    // `except`: the fields Solid's `omit` took off the record before it got here — a field read there is nothing
    const use = (field, node, why, except) => { if (field !== null && except?.has(field)) return; out.push({ field, node, why, except: field === null ? except : undefined }); };
    const apart = (pat, node, except) => { if (!ts.isObjectBindingPattern(pat)) return use(null, node, "the record is taken apart as a list", except); for (const e of pat.elements) { if (e.dotDotDotToken) { use(null, node, "the rest of the record is taken", except); continue; } const key = e.propertyName ?? e.name; use(ts.isIdentifier(key) || ts.isStringLiteralLike(key) ? key.text : null, node, "taken out of the record", except); } };
    if (!ts.isIdentifier(p.name)) { apart(p.name, p); return out; }
    const visited = new Set();
    const names = (id, except) => { const host = fnOf(id); const scope = host && isFn(host) ? host : m.sf; const l = isFn(scope) ? locals(scope).get(id.text) : undefined; if (!l) return use(null, id, "the record is bound to a name of the module", except); if (visited.has(l)) return; visited.add(l); if (l.count > 1 || refs(scope, id.text, m, x => x.local === l).some(isWriteRef)) return use(null, id, `${id.text} is bound more than once`, except); for (const r of refs(scope, id.text, m, x => x.local === l)) rec(r, except); };
    /** `node` is the record, as an expression. */
    const rec = (node, except) => {
      const [n, par] = up(node); if (!par) return;
      if ((ts.isPropertyAccessExpression(par) || ts.isElementAccessExpression(par)) && par.expression === n) { const name = ts.isPropertyAccessExpression(par) ? par.name.text : ts.isStringLiteralLike(skip(par.argumentExpression)) ? skip(par.argumentExpression).text : null; return use(name, par, name === null ? "read by a computed name" : `${name} is read`, except); }
      if (ts.isVariableDeclaration(par) && par.initializer === n) return ts.isIdentifier(par.name) ? names(par.name, except) : apart(par.name, par, except);
      if (ts.isCallExpression(par) && par.expression !== n) {
        const i = par.arguments.indexOf(n); const sn = solidName(par.expression, m);
        if (sn === "omit" && i === 0) { const ks = par.arguments.slice(1).map(a => skip(a)); return rec(par, ks.every(a => ts.isStringLiteralLike(a)) ? new Set([...(except ?? []), ...ks.map(a => a.text)]) : except); }
        if (sn === "merge") return rec(par, undefined);
        if (sn === "createComponent" && i === 1) { const g = fnValueOf(par.arguments[0], m, f.env); if (g && !except) return out.push({ via: { g, index: 0 }, node: par, why: g.name ?? "a component" }); return use(null, par, "the record is given to a component that is not read", except); }
        const g = i >= 0 && !sn ? fnValueOf(par.expression, m, f.env) : undefined;
        if (g && !except) return out.push({ via: { g, index: i }, node: par, why: g.name ?? "a function" });
        return use(null, par, g ? `the record is given to ${g.name ?? "a function"}` : "the record is given to code that is not read", except);
      }
      if (ts.isJsxSpreadAttribute(par)) { const tag = tagOf(par); if (!isElementTag(tag) && !except) { const g = fnValueOf(tag, m, f.env); if (g) return out.push({ via: { g, index: 0 }, node: par, why: `<${g.name ?? "a component"}>` }); } return use(null, par, `the record is spread on <${tag.getText()}>`, except); }
      if (ts.isExpressionStatement(par) || ts.isTypeOfExpression(par) || ts.isPrefixUnaryExpression(par) || (ts.isIfStatement(par) && par.expression === n) || (ts.isConditionalExpression(par) && par.condition === n)) return;
      if (ts.isBinaryExpression(par) && (par.operatorToken.kind === K.InKeyword || par.operatorToken.kind === K.EqualsEqualsEqualsToken || par.operatorToken.kind === K.ExclamationEqualsEqualsToken)) return;
      use(null, par, "the record is handed on", except);
    };
    names(p.name, undefined);
    return out;
  }
  /** Whether a value may be another package's, or one made by code that is not read: a name of an import that is
   *  not followed, a value of the module made by a call that is not, a local bound to either. */
  function mayBeUnread(e, m, d) {
    e = skip(e); if (!e) return false; if (d > 12) return true;
    if (e.kind === K.ThisKeyword) return true;
    if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) return mayBeUnread(e.expression, m, d + 1);
    if (ts.isConditionalExpression(e)) return mayBeUnread(e.whenTrue, m, d + 1) || mayBeUnread(e.whenFalse, m, d + 1);
    if (ts.isBinaryExpression(e)) return mayBeUnread(e.left, m, d + 1) || mayBeUnread(e.right, m, d + 1);
    if (ts.isCallExpression(e)) { const sn = solidName(e.expression, m); if (sn) return false; return !fnValueOf(e.expression, m, undefined) ? mayBeUnread(e.expression, m, d + 1) : false; }
    if (!ts.isIdentifier(e)) return false;
    const r = resolve(e, m);
    if (r.local) return !r.local.multi && r.local.inits.some(i => { while (i.part) i = i.part; return i.expr ? mayBeUnread(i.expr, m, d + 1) : i.loop ? mayBeUnread(i.loop.expression, m, d + 1) : false; });
    if (!r.top) return false;
    if (r.top.kind === "import" || r.top.kind === "ns") return !SOLID.test(r.top.from) && !binding(m, e.text);
    if (r.top.kind === "var") return !!r.top.init && !isFn(skip(r.top.init)) && mayBeUnread(r.top.init, m, d + 1);
    return false;
  }
  /** The function a factory hands back, whatever it is called with: every `return` of it the same function. */
  function returnedFn(g) {
    const node = g.node; if (!node.body || node.asteriskToken || isAsync(node)) return undefined;
    const rets = [];
    if (ts.isBlock(node.body)) { const find = n => { if (isFn(n) || ts.isClassLike(n)) return; if (ts.isReturnStatement(n)) rets.push(n.expression); ts.forEachChild(n, find); }; find(node.body); } else rets.push(node.body);
    let out;
    for (const r of rets) { const v = r ? fnValueOf(r, g.m, g.env) : undefined; if (!v) return undefined; if (out && (out.node !== v.node || out.env !== v.env)) return undefined; out = v; }
    return out;
  }
  /** The contexts a component provides to what it is given: each `{ ctx, inside, outside }` — the uses of its props
   *  written among the children of a provider of that context the function renders, and the uses that are not. With
   *  no provider written in the function: `[]`, and `clean` says the code shows that nothing it renders could be one. */
  function providesOf(f, index = 0, seen = new Set()) {
    const m = f.m, env = f.env, root = f.node;
    const k = `${m.file}\0${root.pos}\0${index}\0${env?.id ?? ""}`; if (seen.has(k)) return { list: [], clean: false }; seen.add(k);
    const found = []; let clean = true;
    // (a component the caller gave — a prop, a parameter of the factory — is the caller's: what it provides is its own row's)
    const find = n => { const el = !isFn(n) || n === root ? elementOf(n, m) : undefined; if (el) { const lower = ts.isIdentifier(el.tag) && /^[a-z]/.test(el.tag.text); if (!lower) { const c = ctxOf(el.tag, m, env); if (c) found.push({ c, el }); else { const sn = solidName(el.tag, m); const g = sn ? undefined : fnValueOf(el.tag, m, env); if (g) { if (!providesOf(g, 0, new Set(seen)).clean) clean = false; } else if (!(sn && SOLID_FLOW.has(sn)) && (sn || mayBeUnread(el.tag, m, 0))) clean = false; } } } else if (ts.isCallExpression(n) && ctxOf(n.expression, m, env)) clean = false; /* a context called by hand (`C({ value, … })`) is a provider too, and is not followed */ ts.forEachChild(n, find); };
    if (root.body) find(root.body);
    const uses = recordUses(f, index);
    // the record given whole to a function or a component that is read: what that one does with it, there
    const given = uses.filter(u => u.via).map(u => ({ u, p: providesOf(u.via.g, u.via.index, seen), all: recordUses(u.via.g, u.via.index) }));
    const by = new Map(); const ctx = c => { if (!by.has(c.key)) by.set(c.key, { ctx: c, els: [] }); return by.get(c.key); };
    for (const x of found) ctx(x.c).els.push(x.el);
    for (const g of given) for (const x of g.p.list) ctx(x.ctx);
    const here = n => place(n);
    const list = [...by.values()].map(({ ctx: c, els }) => {
      const inside = [], outside = [];
      for (const u of uses) {
        // (among the provider's children, or in the value it is given: a context's value reaches only what reads it,
        // which is beneath)
        const under = els.some(el => beneath(u.node, el) || inValue(u.node, el));
        if (!u.via) { (under ? inside : outside).push({ field: u.field, why: u.why, except: u.except && [...u.except], ...here(u.node) }); continue; }
        const g = given.find(x => x.u === u); const sub = g.p.list.find(x => x.ctx.key === c.key);
        if (under) { inside.push({ field: null, why: `${u.why}, beneath the provider`, ...here(u.node) }); continue; }
        if (sub) { inside.push(...sub.inside.map(o => ({ ...o, why: `${u.why}: ${o.why}` }))); outside.push(...sub.outside.map(o => ({ ...o, why: `${u.why}: ${o.why}` }))); }
        // a function that renders no provider of it: what it reads of the record, it reads there
        else for (const x of g.all) outside.push({ field: x.via ? null : x.field, except: x.except && [...x.except], why: x.via ? `the record is given to ${u.why}, which hands it on to ${x.why}` : `${u.why}: ${x.why}`, ...here(u.node) });
      }
      return { ctx: c, inside, outside };
    });
    return { list, clean: clean && !uses.some(u => !u.via && u.field === null) && given.every(g => g.p.clean && !g.p.list.length) };
  }

  // ---- what its owner keeps ----
  /** Solid's calls that need no owner, though they make something: a root makes its own, and `onSettled` is a handler's too (EF-7). */
  const OWNERLESS = new Set(["createRoot", "onSettled"]);
  const boundMemo = new Map();
  /** Whether a call of `f` makes what its owner keeps — a node, a cleanup, a context read — on every path that returns
   *  (MO-10a): undefined where it does, else the path that does not. `getOwner() ? onCleanup(fn) : fn`
   *  counts (`soft`) where its answer is thrown away and what was given to it is not handed back: with no owner what the
   *  call did could not be undone. A path taken
   *  only on the server (`isServer`) is not asked: the word refuses nothing there, which has no handlers. */
  function unbound(f, soft = false) {
    const k = `${f.m.file}\0${f.node.pos}\0${f.node.end}\0${f.env?.id ?? ""}\0${soft}`; if (boundMemo.has(k)) return boundMemo.get(k);
    const at = (why, n) => ({ why, ...place(n) });
    boundMemo.set(k, at("it calls itself before it makes anything", f.node));
    const m = f.m, g0 = f.node; let bad;
    const miss = n => { bad ??= at("it returns without making what its owner keeps", n); };
    /** The side of a test that is the browser's: true, false, or undefined where it is no test of where the code runs. */
    const browser = e => { e = skip(e); if (ts.isPrefixUnaryExpression(e) && e.operator === K.ExclamationToken) { const b = browser(e.operand); return b === undefined ? b : !b; } if (!envTest(e, m, 0)) return undefined; return serverWhen(e, m, 0) === undefined ? undefined : !serverWhen(e, m, 0); };
    const fnMakes = (g, n) => !unbound(g, soft || (!!n && thrown(n)));
    /** A call whose answer goes nowhere, given no function of this one that it hands back. */
    const thrown = n => { const [, p] = up(n); if (!p || !ts.isExpressionStatement(p)) return false; return (n.arguments ?? []).every(a => { a = skip(a); const r = ts.isIdentifier(a) ? resolve(a, m) : undefined; return !r?.local || !isFn(r.fn) || refs(g0, r.name, m, x => x.local === r.local).every(id => { for (let q = id.parent; q && q !== g0; q = q.parent) if (ts.isReturnStatement(q)) return false; return true; }); }); };
    const runs = e => { e = skip(e); return isFn(e) && !isAsync(e) && !e.asteriskToken && (ts.isBlock(e.body) ? (() => { const was = bad; bad = undefined; const made = block(e.body.statements, false); const ok = made && !bad; bad = was; return ok; })() : expr(e.body)); };
    const of = (c, n) => {
      if (c.kind === "either") return c.of.every(x => of(x, n));
      if (c.kind === "solid") return (c.api.makes && !OWNERLESS.has(c.name)) || c.name === "useContext" || (c.name === "untrack" && !!n.arguments[0] && runs(n.arguments[0]));
      if (c.kind === "fns") return c.fns.every(g => fnMakes(g, n));
      if (c.kind === "iife") return runs(c.fn);
      const g = ts.isCallExpression(n) && !bindsSolid(n, m) ? fnValueOf(n.expression, m, f.env) : undefined; return !!g && fnMakes(g, n);
    };
    /** Whether evaluating an expression makes it, whatever its parts answer. */
    const expr = e => {
      e = e && skip(e); if (!e || isFn(e) || ts.isClassLike(e) || ts.isOptionalChain(e) || ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return false;   // (JSX makes its parts when they are read)
      if (ts.isCallExpression(e) || ts.isNewExpression(e)) { return of(callee(e, m), e) || (e.arguments ?? []).some(a => expr(ts.isSpreadElement(a) ? a.expression : a)) || (ts.isPropertyAccessExpression(skip(e.expression)) && expr(skip(e.expression).expression)); }
      if (ts.isConditionalExpression(e)) { if (soft && owner(e.condition) && expr(e.whenTrue)) return true; const b = browser(e.condition); return expr(e.condition) || (b !== undefined ? expr(b ? e.whenTrue : e.whenFalse) : expr(e.whenTrue) && expr(e.whenFalse)); }
      if (ts.isBinaryExpression(e)) { const o = e.operatorToken.kind; if (o === K.AmpersandAmpersandToken && soft && owner(e.left)) return expr(e.right); if (o === K.AmpersandAmpersandToken || o === K.BarBarToken || o === K.QuestionQuestionToken || o === K.AmpersandAmpersandEqualsToken || o === K.BarBarEqualsToken || o === K.QuestionQuestionEqualsToken) { const b = o === K.AmpersandAmpersandToken ? browser(e.left) : undefined; return expr(e.left) || (b === true && expr(e.right)); } return expr(e.left) || expr(e.right); }
      let any = false; ts.forEachChild(e, c => { if (!any && !ts.isTypeNode?.(c)) any = ts.isObjectLiteralElementLike?.(c) && !isFn(c) ? (ts.isPropertyAssignment(c) ? expr(c.initializer) : ts.isSpreadAssignment(c) && expr(c.expression)) : expr(c); });
      return any;
    };
    const owner = e => { e = skip(e); if (!ts.isCallExpression(e)) return false; const c = callee(e, m); return c.kind === "solid" && c.name === "getOwner"; };
    /** Whether a list of statements has made it by its end; `made`: it already had. A path that returns before is a miss. */
    const block = (list, made) => { for (const st of list) { const r = stmt(st, made); if (r === "gone") return true; made = r; } return made; };
    const stmt = (n, made) => {
      if (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) return made;
      if (ts.isBlock(n)) { const r = blockOf(n.statements, made); return r; }
      if (ts.isExpressionStatement(n)) return made || expr(n.expression);
      if (ts.isVariableStatement(n)) return made || n.declarationList.declarations.some(d => expr(d.initializer));
      if (ts.isReturnStatement(n)) { if (!made && !expr(n.expression)) miss(n); return "gone"; }
      if (ts.isThrowStatement(n)) return "gone";
      if (ts.isIfStatement(n)) {
        if (soft && owner(n.expression) && !n.elseStatement) return made || stmt(n.thenStatement, made) === true;
        made = made || expr(n.expression); const b = browser(n.expression);
        const one = s => s ? stmt(s, made) : made;
        if (b !== undefined) return one(b ? n.thenStatement : n.elseStatement);
        const x = one(n.thenStatement), y = one(n.elseStatement);
        return x === "gone" ? y : y === "gone" ? x : x && y;
      }
      if (ts.isTryStatement(n)) { const x = stmt(n.tryBlock, made), y = n.catchClause ? stmt(n.catchClause.block, made) : x; const z = n.finallyBlock ? stmt(n.finallyBlock, made) : made; return z === true ? true : x === "gone" && y === "gone" ? "gone" : x === true && y === true; }
      // a loop, a switch: may not run; what it returns is a path all the same
      const inside = c => { if (isFn(c) || ts.isClassLike(c)) return; if (ts.isReturnStatement(c)) { if (!made && !expr(c.expression)) miss(c); return; } ts.forEachChild(c, inside); }; inside(n);
      return made;
    };
    const blockOf = (list, made) => { for (const st of list) { const r = stmt(st, made); if (r === "gone") return "gone"; made = r; } return made; };
    let made = false;
    if (!g0.body || isAsync(g0) || g0.asteriskToken || f.cls) bad = at(f.cls ? "a class" : "it is async, or a generator: what follows has no owner", g0);
    else if (!ts.isBlock(g0.body)) { if (!expr(g0.body)) miss(g0.body); }
    // (`if (!keys.length) return;` before anything else: a call that does nothing and answers nothing — no use of it is of that)
    else { const does = e => { let d = false; const v = n => { if (d || isFn(n)) return; if (ts.isCallExpression(n) || ts.isNewExpression(n) || ts.isBinaryExpression(n) && n.operatorToken.kind >= K.FirstAssignment && n.operatorToken.kind <= K.LastAssignment || (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && n.operator !== K.ExclamationToken && n.operator !== K.MinusToken) d = true; else ts.forEachChild(n, v); }; v(e); return d; };
      const guard = st => { if (!ts.isIfStatement(st) || st.elseStatement || does(st.expression)) return false; const b = ts.isBlock(st.thenStatement) ? st.thenStatement.statements : [st.thenStatement]; return b.length === 1 && ts.isReturnStatement(b[0]) && !b[0].expression; };
      let i = 0; while (guard(g0.body.statements[i] ?? g0)) i++;
      made = blockOf(g0.body.statements.slice(i), false); if (made === false) miss(g0); }
    boundMemo.set(k, bad); return bad;
  }
  /** Whether a test is true on the server (`isServer`, `typeof window === "undefined"`) or in the browser. */
  function serverWhen(e, m, d) {
    e = skip(e); if (d > 6) return undefined;
    if (ts.isPrefixUnaryExpression(e)) { const x = serverWhen(e.operand, m, d + 1); return x === undefined ? x : !x; }
    if (ts.isBinaryExpression(e)) { const s = [skip(e.left), skip(e.right)].find(ts.isStringLiteralLike); const eq = e.operatorToken.kind === K.EqualsEqualsEqualsToken || e.operatorToken.kind === K.EqualsEqualsToken; return s?.text === "undefined" ? eq : s?.text === "object" ? !eq : undefined; }
    const bs = ts.isIdentifier(e) ? binding(m, e.text) : undefined; if (!bs) return undefined;
    const vs = bs.map(x => x.solid ? true : serverWhen(x.b.init, x.m, d + 1)); return vs.every(v => v === vs[0]) ? vs[0] : undefined;
  }
  /** A call of a name a call of Solid's gave (a setter, an accessor): no function that is read. */
  const bindsSolid = (n, m) => { const e = skip(n.expression); if (!ts.isIdentifier(e)) return false; const r = resolve(e, m); let i = r.local?.inits[0]; while (i?.part) i = i.part; return !!i?.expr && ts.isCallExpression(skip(i.expr)) && callee(skip(i.expr), m).kind === "solid"; };

  /** Whether what parameter `index` of `g` is given, and every part of it, stays in the call: read, changed, handed back as
   *  the answer, and nothing else (a draft is kept nowhere and changed by nothing that runs after: spec/09 MO-10i). */
  function stays(g, index, seen) {
    const k = `${g.m.file}\0${g.node.pos}\0${index}`; if (seen.has(k)) return true; seen.add(k);
    const m = g.m, root = g.node, p = root.parameters?.[index];
    if (!p || !root.body || isAsync(root) || root.asteriskToken || p.dotDotDotToken || /\b(arguments|eval)\b/.test(root.body.getText())) return false;
    const named = new Set();
    const name = id => { if (!ts.isIdentifier(id)) return (id.elements ?? []).every(e => ts.isOmittedExpression(e) || name(e.name)); const host = fnOf(id); if (!isFn(host)) return false; const l = locals(host).get(id.text); if (!l) return false; if (named.has(l)) return true; named.add(l); return refs(host, id.text, m, x => x.local === l).every(q => { for (let f = fnOf(q); f !== root; f = fnOf(f)) { if (!isFn(f)) return false; if (f === host) break; if (isAsync(f) || f.asteriskToken || role(f, m).kind !== "run") return false; } return goes(q); }); };
    const goes = node => {
      const [n, q] = up(node); if (!q) return false;
      if (ts.isShorthandPropertyAssignment(q) || (ts.isPropertyAssignment(q) && q.initializer === n)) return goes(q.parent);
      if (ts.isArrayLiteralExpression(q)) return goes(q);
      if (ts.isSpreadElement(q) || ts.isSpreadAssignment(q)) return goes(q.parent);
      if ((ts.isPropertyAccessExpression(q) || ts.isElementAccessExpression(q)) && q.expression === n) {
        const [a, b] = up(q);
        if (b && ts.isCallExpression(b) && b.expression === a) {
          const w = ts.isPropertyAccessExpression(q) ? q.name.text : "";
          if (!(w in READ) && !MUTATORS.has(w) && !KIND_READ.map[w]) return false;
          if (PROMISE_LATER.has(w)) return false;
          for (const x of b.arguments) { const e = skip(x); if (isFn(e)) { if (isAsync(e) || !e.parameters.every(y => name(y.name))) return false; } else if (ts.isIdentifier(e) && CALLBACK_SYNC.has(w) && b.arguments.indexOf(x) === 0) { const c = fnValueOf(e, m, g.env); if (!c || !c.node.parameters.every((_, i) => stays(c, i, seen))) return false; } }
          return READ[w] === "prim" ? true : goes(b);
        }
        return goes(q);
      }
      if (ts.isElementAccessExpression(q)) return true;
      if (ts.isVariableDeclaration(q)) return name(q.name);
      if (ts.isForOfStatement(q) && q.expression === n) return ts.isVariableDeclarationList(q.initializer) && !q.awaitModifier && name(q.initializer.declarations[0].name);
      if (ts.isBinaryExpression(q)) {
        const o = q.operatorToken.kind;
        if (o === K.BarBarToken || o === K.QuestionQuestionToken || o === K.AmpersandAmpersandToken || o === K.CommaToken) return goes(q);
        if (o >= K.FirstAssignment && o <= K.LastAssignment) {
          if (q.left === n) return true;
          if (o !== K.EqualsToken) return o !== K.BarBarEqualsToken && o !== K.AmpersandAmpersandEqualsToken && o !== K.QuestionQuestionEqualsToken;
          const l = skip(q.left);
          if (ts.isIdentifier(l)) { const r = resolve(l, m); if (!r.local || !isFn(r.fn)) return false; for (let f = r.fn; f !== root; f = fnOf(f)) if (!isFn(f)) return false; return refs(r.fn, l.text, m, x => x.local === r.local).every(x => isWriteRef(x) || goesOnce(x)) && goes(q); }
          // a part put back in the thing itself: \`list[0] = list[1]\`
          let b = l; while (ts.isPropertyAccessExpression(b) || ts.isElementAccessExpression(b)) b = skip(b.expression);
          const r = ts.isIdentifier(b) ? resolve(b, m) : undefined;
          return !!r?.local && r.fn === root && r.local.inits.length === 1 && r.local.inits[0].param === index;
        }
        return true;
      }
      if (ts.isConditionalExpression(q)) return q.condition === n || goes(q);
      if (ts.isPrefixUnaryExpression(q) || ts.isPostfixUnaryExpression(q) || ts.isTypeOfExpression(q) || ts.isVoidExpression(q) || ts.isDeleteExpression(q) || ts.isTemplateSpan(q) || ts.isIfStatement(q) || ts.isWhileStatement(q) || ts.isDoStatement(q) || ts.isForStatement(q) || ts.isForInStatement(q) || ts.isSwitchStatement(q) || ts.isCaseClause(q) || ts.isExpressionStatement(q) || ts.isComputedPropertyName(q)) return true;
      if (ts.isReturnStatement(q) || (ts.isArrowFunction(q) && q.body === n)) { const f = ts.isArrowFunction(q) && q.body === n ? q : fnOf(q); return f === root || role(f, m).kind === "run"; }
      if (ts.isCallExpression(q) && q.expression !== n) {
        const i = q.arguments.indexOf(n), c = callee(q, m);
        if (c.kind === "fns") return c.fns.every(x => !x.cls && stays(x, i, seen)) && goes(q);
        if (c.kind === "builtin") return c.gives === "prim" || c.gives === "deep" ? c.name !== "JSON.parse" : c.name !== ".bind" && !/^Promise\./.test(c.name) && (c.gives !== "target" || i === 0 || ts.isObjectLiteralExpression(skip(q.arguments[0])) || rooted(q.arguments[0])) && goes(q);
        if (c.kind === "method") return MUTATORS.has(c.name) && rooted(c.on);   // put in the thing itself
      }
      return false;
    };
    const rooted = e => { let b = skip(e); while (ts.isPropertyAccessExpression(b) || ts.isElementAccessExpression(b)) b = skip(b.expression); const r = ts.isIdentifier(b) ? resolve(b, m) : undefined; return !!r?.local && r.fn === root && r.local.inits.length === 1 && r.local.inits[0].param === index; };
    const once = new Set(); const goesOnce = x => { if (once.has(x)) return true; once.add(x); return goes(x); };
    return ts.isIdentifier(p.name) && name(p.name);
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
      let bs = exported(file, head), parts = rest;
      // `export * as Kit from "./kit.js"`, and `import * as Kit …; export { Kit }`: a member is that module's export
      if (!bs && parts.length) { const mm = load(file); const e = mm?.exports.get(head); if (e?.ns) { bs = imported(mm, e.ns, parts[0]); parts = parts.slice(1); } }
      if (bs && parts.length && bs.every(x => x.b?.kind === "ns")) { const next = []; for (const x of bs) { const r = imported(x.m, x.b.from, parts[0]); if (!r) { next.length = 0; bs = undefined; break; } next.push(...r); } if (bs) { bs = next; parts = parts.slice(1); } }
      if (!bs) return { unread: `${head} is not followed to a declaration in ${path.basename(file)}`, files };
      for (const x of bs) {
        if (x.solid) return { unread: `${head} is Solid's own`, files };
        const b = x.b;
        // the function it is: one the module declares, or what the code shows a call to hand back (a value made by a
        // call), a member of a record written out, of `Object.assign(fn, { … })`
        let v = b.kind === "fn" && !x.m.written.has(x.name) ? { m: x.m, node: b.node } : b.kind === "var" && b.isConst && !x.m.written.has(x.name) && (b.init || b.pattern) ? { expr: ts.factory.createIdentifier(x.name), m: x.m, env: undefined } : undefined;
        for (const part of parts) v = v && !v.node ? memberOf(v.expr, part, v.m, v.env) : undefined;
        const fv = v && (v.node ? v : fnValueOf(v.expr, v.m, v.env));
        if (!fv || !isFn(fv.node)) return { unread: `${name} is ${b.kind === "class" ? "a class" : "not a function the code shows (a value made by a call that is not followed, or assigned again)"} in ${path.basename(x.m.file)}`, files };
        fns.push({ m: fv.m, node: fv.node, env: fv.env, name, opaque: types.opaque, plain: types.plain, lists: types.lists, refs: types.refs, method: parts.length > 0 || !!fv.method, made: !!fv.env });
      }
    }
    const classes = file => { const out = new Map(); const m = load(file); if (!m) return out; for (const [en] of m.exports) { const bs = exported(file, en); if (bs && bs.length === 1 && bs[0].b?.kind === "class") out.set(bs[0].b.node, en); } return out; };
    return rounds(() => {
      const ss = fns.map(g => g.opaque?.size || g.plain?.size || g.lists?.size || g.refs?.size ? read(g) : summary(g));
      const why = []; for (const [i, s] of ss.entries()) { for (const w of s.pure) if (w.deep === undefined || !(fns[i].node.parameters?.[w.deep]?.dotDotDotToken && /^(fn|data)$/.test(types.shape?.(w.deep, []) ?? "any"))) why.push(w); for (const w of s.wants) why.push(w);
        // what it does with the functions it is given, by what the row's types say of them (no type: any)
        const shape = (k, path) => types.shape?.(k, path) ?? "any", pn = k => { const q = fns[i].node.parameters?.[k]; return q && ts.isIdentifier(q.name) ? q.name.text : `#${k + 1}`; };
        for (const k of s.calls) if (!types.refs?.has(k) && shape(k, []) === "void") why.push({ why: `it calls \`${pn(k)}\`, a callback that answers nothing: it is run for what it does`, ...place(fns[i].node) });
        for (const [k, path, at] of s.fields.values()) if (!/^(fn|data)$/.test(shape(k, path))) why.push({ why: `it calls \`${pn(k)}.${path[0]}\`, which its type does not show to be a callback that answers something`, ...at });
        for (const k of s.gives) if (!/^(data|param)$/.test(shape(k, []))) why.push({ why: `it gives \`${pn(k)}\`, which may be a function, to a callback, which may call it or keep it`, ...place(fns[i].node) });
        for (const [k, path] of s.maybe.values()) if (!path || shape(k, path) !== "data") why.push({ why: `it runs \`${[pn(k), ...path ?? ["…"]].join(".")}\` if it is a function, which its type does not rule out`, ...place(fns[i].node) });
        if (fns[i].method && /\bthis\b/.test(fns[i].node.getText())) why.push({ why: "a method that reads `this`", ...place(fns[i].node) }); if (fns[i].node.asteriskToken) why.push({ why: "a generator", ...place(fns[i].node) }); }
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
        if (ss.every(s => s.mutates.has(index)) && ss.every(s => !s.keeps.has(index)) && fns.every(g => stays(g, index, new Set()))) return "changes";
        if (ss.some(s => s.mutates.has(index))) return undefined;
        // never: every use of the parameter only reads
        for (const g of fns) { const p = g.node.parameters?.[index]; if (!p || p.dotDotDotToken) return undefined; const m = g.m; const names = []; const pn = q => { if (ts.isIdentifier(q)) names.push(q); else for (const e of q.elements ?? []) if (!ts.isOmittedExpression(e)) pn(e.name); }; pn(p.name); flow.returning = true; try { for (const id of names) for (const r of refs(g.node, id.text, m, x => x.fn === g.node)) if (flow(r, FOREIGN, m, 0)) return undefined; } finally { flow.returning = false; } }
        return "never";
      };
      const draftWhy = index => { for (const s of ss) if (s.mutates.has(index)) return s.mutates.get(index); return undefined; };
      // contexts: what every build must read from above (a context is named by where it is made: the builds of a
      // package each make their own, so the names are compared), and what the component provides
      const reads = fns.map(g => ctxReads(g));
      const ctxName = c => c.name ?? "context";
      const uses = { must: [...reads[0].must.values()].filter(c => reads.every(t => [...t.must.values()].some(x => ctxName(x) === ctxName(c)))), may: reads.flatMap(t => [...t.may.values(), ...[...t.must.values()].filter(c => !reads.every(u => [...u.must.values()].some(x => ctxName(x) === ctxName(c))))]), opaque: reads.flatMap(t => t.opaque) };
      const provides = index => { const ps = fns.map(g => providesOf(g, index)); return { list: ps[0].list.filter(x => ps.every(q => q.list.some(y => ctxName(y.ctx) === ctxName(x.ctx)))).map(x => ({ ctx: x.ctx, inside: ps.flatMap(q => q.list.filter(y => ctxName(y.ctx) === ctxName(x.ctx)).flatMap(y => y.inside)), outside: ps.flatMap(q => q.list.filter(y => ctxName(y.ctx) === ctxName(x.ctx)).flatMap(y => y.outside)) })), clean: ps.every(q => q.clean && !q.list.length) }; };
      /** A factory's component (the function the fn hands back): the contexts the code shows it to provide. */
      const madeProvides = () => fns.flatMap(g => { const r = returnedFn(g); return r ? providesOf(r, 0).list : []; });
      return { files, uses, provides, madeProvides, reads: at => fns.every(g => readsPart(g, at)), wrote: index => ss.some(x => x.may.has(index) || x.mutates.has(index)), pure: !why.length, why, makes: ss.some(s => s.makes), unbound: () => fns.map(g => g.method && /\bthis\b/.test(g.node.getText()) ? { why: "a method that reads `this`", ...place(g.node) } : unbound(g)).find(Boolean), rejects, rejectsWhy, isAsync: fns.every(g => isAsync(g.node)), fns, handler, draft, draftWhy };
    });
  }
  /** The context the export `name` of `spec` is (a `createContext(…)` the module hands out), by its key. */
  function contextKey(spec, dir, name) { for (const file of targets(spec, dir)) { const bs = exported(file, name); const x = bs && bs.length === 1 && !bs[0].solid ? bs[0] : undefined; if (!x) continue; const c = ctxOf(ts.factory.createIdentifier(x.name), x.m, undefined); if (c) return c.key; } return undefined; }
  return { exportFacts, targets, load, exported, exportedNames, contextKey };
}

module.exports = { create };
