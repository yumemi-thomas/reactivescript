#!/usr/bin/env node
// `rx-verify [--dom] [--record] [--json] <file.d.rx>...`: run a declaration's JS module and check what running can check
// of its rows (09 MO-8f's sibling: TY-6 checks what types can, this checks what running can).
//
// A row makes claims, each under a name of its own, as the crate's parser reads the row (src/rows.js; `obligations` in
// compiler/src/parse.rs): `exists`, `pure`, `uses:<context>`, `provides:<context>`, `rejects`, `fields`, `fails`,
// `callbacks:<position>`, `draft`, `placement`, `through:<component>`. Every result below is about one claim, by that
// name, and says one of: `held`, `read` (`pure` alone), `mismatch`, `unverified`, `n/a`. A claim no check answers is `unverified`. Nothing
// printed that is not about a claim (the count of words read from the code) is a result, and none is recorded.
//
//   exists      the export is there, of its kind.
//   pure        refuted by running (two calls that answer differently; the server and a browser's globals answering
//               differently, 10 SV-7c; an argument changed, a global left, the clock asked): running cannot show a fn is
//               pure, so the claim is never held. It is `read` where the fn's own code only computes (`rx-declare --audit`,
//               09 MO-8w) and no run refutes it; what a getter or a callback among its arguments does is the caller's.
//   uses:c      evidence tied to `c`: the hook (or the component) fails or warns with no provider, runs cleanly under a
//               provider of each context it names, and — where it names several — fails again with only `c`'s taken
//               away. A provider of `c` is a component of the same file declared `provides(c)`, or the probe's
//               `providers.c`; a row that names one context may be run under the probe's `provide`. A failure with no
//               provider and nothing to run it under says only that something is missing: `unverified`.
//   provides:c  the component mounted around a hook or a part of the same file that uses `c` alone and fails without it,
//               which must then run cleanly; or, where no row of the file uses `c`, the probe's `uses.c`.
//   rejects     under the probe's failing arguments (`fail`) the fn rejects with a class its row names.
//               (each result held by running is tested: run again over the module changed so that the claim is false, it
//               must not be held — src/verify-mutate.js)
//   fields      mounted under the probe's providers, every part of the declared result read in a render effect: a `ref`
//               part is an accessor; two reads of it answer alike, a `pending` one is seen to
//               wait; a plain part that waits or fails where it is read has no row (MO-10l).
//   fails       under the probe's failing arguments a part declared `fails(E)` fails with E.
//   callbacks   src/verify-place.js: each function-typed position wrapped in a spy.
//   draft       a `draft` parameter is changed during the call and not after; a draft callback is handed an object
//               whose writes the library keeps.
//   placement   src/verify-place.js, against the probe's scene.
//
// Probes: `lib.probe.mjs` (or .js) beside `lib.d.rx` gives what only the app has. It exports `probes`, by export name —
// `{ args: () => [...], fail?: () => [...], run?: result => …, act?, props?, inside?, around?: (children, solid, lib) => … }` (the arguments as JS passes
// them: a `ref` parameter is an accessor) — and `provide(children, solid)`, `providers: { c: (children, solid) => … }`,
// `scene(lib, h)`. `--dom` runs with happy-dom's browser globals (@happy-dom/global-registrator, from the project).
// `--json` prints `[{ file, results: [{ line, name, ob, status, what }], audit }]` and nothing else. RXV_DEBUG=1 names
// each export on stderr as it is checked.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const { rowsOf, claimOf, describe } = require("../src/rows.js");
const { render, settle, hushed, noRenderer } = require("../src/render.js");
const place = require("../src/verify-place.js");
const { mutationsOf, falsified, mutant } = require("../src/verify-mutate.js");

const short = (e, n = 60) => String(e?.message || e?.name || e?.constructor?.name || e).slice(0, n);
const notReady = e => e?.name === "NotReadyError" || e?.constructor?.name === "NotReadyError";

/** Mount `hook(...args)` under `provide` (the probe's providers, or a component's) and an errored boundary; read each
 *  part in a render effect; then the probe's `run(result)`. What the console was told meanwhile is `warned`. */
async function mount(ctx, hook, args, parts, run, provide = ctx.probeMod?.provide) {
  const s = ctx.solid;
  const seen = new Map(parts.map(f => [f.path.join("."), { pending: false, value: false, failed: null, notAccessor: false, unsteady: null }]));
  let boundary = null, result, runError = null, renderError = null, dispose = () => {}, reached = false;
  const Probe = () => {
    reached = true;
    const r = (result = hook(...args));
    for (const f of parts) {
      const st = seen.get(f.path.join("."));
      s.createRenderEffect(() => { try { let v = r; for (const p of f.path) v = v?.[p]; if (f.ref) { if (typeof v !== "function") { st.notAccessor = true; return { v }; } st.read = v; v = v(); } return { v }; } catch (e) { if (notReady(e)) { st.pending = true; throw e; } return { e }; } },
        x => { if ("e" in x) st.failed = x.e; else st.value = true; });
    }
    return null;
  };
  const errored = () => s.createComponent(s.Errored, { fallback: e0 => { boundary = typeof e0 === "function" ? e0() : e0; return null; }, get children() { return s.createComponent(Probe, {}); } });
  const quiet = hushed();
  try {
    try { dispose = await render(() => provide ? provide(errored, s) : errored(), ctx.resolve); }   // a provider may throw as it mounts (props the probe did not give)
    catch (e) { if (noRenderer(e)) throw e; renderError = e; return { seen, boundary, runError, renderError, warned: quiet.warned }; }
    for (let i = 0; i < 20; i++) { s.flush(); await new Promise(r => setTimeout(r, 10)); if (reached && [...seen.values()].every(x => x.value || x.failed) || boundary) break; }
    // settled, two reads of a `ref` part answer alike: one that makes a value at each read is no reader
    for (const st of seen.values()) if (st.read && st.value) { try { const [v, w] = s.untrack(() => [st.read(), st.read()]); if (!same(v, w) || (identified(v) || typeof v === "function") && v !== w) st.unsteady = `${show(v)} then ${show(w)}`; } catch { /* waits, or fails: said above */ } }
    if (run) { try { await run(result); } catch (e) { runError = e; } }
    dispose();
  } finally { quiet.restore(); }
  if (!reached && !boundary) renderError = new Error("the provider renders nothing of what it is given");
  return { seen, boundary, runError, renderError, warned: quiet.warned };
}

/** `uses(c)` by running, the evidence tied to each context named (the head of this file). `run(wrap)` renders or calls
 *  the subject under `wrap` (`(children, solid) => view`; null: with no provider) and answers what it threw or warned,
 *  or null; `providerOf(c)` is `{ wrap, name }` or undefined. One result for each context. */
async function usesClaims({ name, line, contexts, run, providerOf, fails }) {
  const each = (status, what) => contexts.map(c => ({ line, ob: `uses:${c}`, status, what: what(c) }));
  const alone = await run(null);
  if (alone.env) return each("unverified", c => `${name}: uses(${c}) not run: it needs a browser (${alone.failed}); run rx-verify with --dom`);
  if (!alone.failed) return each("mismatch", c => `${name}: declared uses(${c}), but with no provider it neither throws nor warns: does it read a context?`);
  fails.set(name, alone.failed);
  const provs = new Map(contexts.map(c => [c, providerOf(c)]));
  const missing = contexts.filter(c => !provs.get(c));
  if (missing.length) return each("unverified", c => `${name}: uses(${c}) not shown: with no provider it fails (${alone.failed}), which says something is missing and not that it is ${c} — nothing here provides ${missing.join(", ")} to run it with and without: a component of this file declared provides(${missing[0]}), or the probe's providers.${missing[0]}`);
  const under = cs => cs.length ? (children, s) => cs.reduceRight((kids, c) => () => provs.get(c).wrap(kids, s), children)() : null;
  const said = [...new Set(contexts.map(c => provs.get(c).name))].join(", ");
  const full = await run(under(contexts));
  if (full.failed) return each("unverified", c => `${name}: uses(${c}) not shown: it fails under ${said} too (${full.failed}), as it does with no provider (${alone.failed}): what it wants is not what is provided there`);
  const out = [];
  for (const c of contexts) {
    const ob = `uses:${c}`;
    if (contexts.length === 1) { out.push({ line, ob, status: "held", what: `${name}: uses(${c}) holds: with no provider it fails (${alone.failed}), and under ${said} it runs` }); continue; }
    if (contexts.some(o => o !== c && provs.get(o).wrap === provs.get(c).wrap)) { out.push({ line, ob, status: "unverified", what: `${name}: uses(${c}) not shown apart: ${provs.get(c).name} provides ${c} and another context it names at once, so taking one away is not run — give each its own in the probe's providers` }); continue; }
    const without = await run(under(contexts.filter(o => o !== c)));
    out.push(without.failed ? { line, ob, status: "held", what: `${name}: uses(${c}) holds: it runs under ${said}, and with only ${c}'s provider taken away it fails (${without.failed})` }
      : { line, ob, status: "mismatch", what: `${name}: declared uses(${c}), but it runs with every provider it names but ${c}'s: it does not need ${c}` });
  }
  return out;
}

async function verify(file) {
  const rows = rowsOf(file);
  let js = require("../src/beside.js").jsOf(file);
  const base = file.slice(0, -".d.rx".length);
  const dir = path.dirname(path.resolve(file));
  const probeFile = [".probe.mjs", ".probe.js"].map(x => base + x).find(f => fs.existsSync(f));
  const probeMod = probeFile ? await import(pathToFileURL(path.resolve(probeFile)).href) : null;
  // 09 MO-14: a host declaration (`host.d.rx`) declares no JS module's exports: its view is checked against the probe's scene
  const hostRow = rows.find(r => r.kind === "host");
  if (hostRow) {
    // MO-14g: a declaration derived from the router's tree is first held to it — one that has fallen behind is a
    // mismatch before anything is run — and its probe is handed the routes (the scene's third argument), so the scene
    // is the tree's and restates none of it
    const H = require("../src/host-routes.js"); const stale = H.drift(file);
    if (stale?.stale) return { results: rows.flatMap(row => row.obligations.map(ob => ({ line: row.line, ob, status: "mismatch", what: `HOST_VIEW_STALE: ${H.message(file, stale)}` }))) };
    const view = detached => place.verifyHost({ rows, probeMod, detached, routes: stale ? rx => H.sceneRoutes(file, rx) : undefined, resolve: p => pathToFileURL(require.resolve(p, { paths: [dir, __dirname] })).href });
    const host = await view(false);
    if (host.some(r => r.status === "held")) noEvidence(host.filter(r => r.status === "held"), await view(true), "detached");
    if (!js) return { results: host };
    const own = await tested(file, rows, js, probeMod, probeFile);   // a module's own rows beside the view
    return { ...own, results: [...host, ...own.results.filter(r => !host.some(h => h.line === r.line && h.ob === r.ob))] };
  }
  return tested(file, rows, js, probeMod, probeFile);
}

/** The module verified, and each claim held by running tested: the probe is run again over the module changed so that the
 *  claim is false (src/verify-mutate.js), and one that is held all the same was shown by nothing. */
async function tested(file, rows, js, probeMod, probeFile) {
  const all = await verifyModule(file, rows, js, probeMod, probeFile);
  const at = r => rows.find(x => r.line >= x.line && r.line <= x.end);
  const ran = r => r.status === "held" && r.by !== "code";
  process.on("unhandledRejection", () => {});   // (a module changed to reject is called where nothing awaits it, too)
  for (const kind of mutationsOf(all.results.filter(ran).flatMap(r => [].concat(r.ob)))) {
    const claims = all.results.filter(r => ran(r) && [].concat(r.ob).some(ob => falsified(kind, ob)));
    const only = rows.filter(x => claims.some(r => at(r) === x) || x.kind !== "fn" && x.kind !== "component" || x.facts.uses?.length || x.facts.provides?.length);
    const again = (await verifyModule(file, only, js, probeMod, probeFile, kind)).results;
    noEvidence(claims, again, kind);
  }
  return all;
}
/** The claims a changed module shows as well: shown by nothing. */
function noEvidence(claims, again, kind) {
  for (const r of claims) if (again.some(a => a.line === r.line && a.ob === r.ob && a.status === "held")) Object.assign(r, { status: "unverified", what: `${r.what} — which is not evidence: the probe shows the same of a module changed so that the claim is false (${kind}; src/verify-mutate.js). Use what the probe is handed (lib, the result), not the library it imports` });
}

/** RX_VERIFY_READING=<file>: the audit (`rx-declare --audit --json`) of one declaration, made by whoever runs this — of the
 *  file and the text it names, or it is not used. */
function given(file) {
  if (!process.env.RX_VERIFY_READING) return undefined;
  try { const g = JSON.parse(fs.readFileSync(process.env.RX_VERIFY_READING, "utf8")); return g.file === path.resolve(file) && g.text === fs.readFileSync(file, "utf8") && Array.isArray(g.read.rows) ? g.read : undefined; } catch { return undefined; }
}
/** `mutation`: the module is changed by it, and only what running shows is asked. */
async function verifyModule(file, rows, js, probeMod, probeFile, mutation) {
  // MO-8k's first place (2026-11-23): a project's declaration of a package, `rx-types/<spec>.d.rx`, declares the module
  // that import resolves to from the folder that holds `rx-types/` — found as the checker finds the declaration, the
  // other way round
  if (!js) {
    const parts = path.resolve(file).split(path.sep); const at = parts.lastIndexOf("rx-types");
    if (at > 0) { const spec = parts.slice(at + 1).join("/").slice(0, -".d.rx".length); js = require("../src/load.js").resolveModule(spec, parts.slice(0, at).join(path.sep)) || undefined; }
  }
  const checked = rows.filter(r => ["fn", "component", "error", "const"].includes(r.kind));
  if (!js) return { results: checked.map(r => ({ line: r.line, ob: "exists", status: "mismatch", what: `${r.name}: no JS module beside ${path.basename(file)}, and it is not a project's declaration of a package that resolves (rx-types/<package>.d.rx)` })) };
  require("../src/load.js").compileJsx(path.dirname(path.resolve(js)));   // a package that ships .jsx runs compiled (its solid build)
  // a module node cannot load (one that imports a bundler's virtual module): nothing of it is run, and nothing is said to hold
  let mod; try { mod = await import(pathToFileURL(path.resolve(js)).href); }
  catch (e) { return { unread: `${path.basename(js)} does not load here (${short(e, 90)})`, results: checked.flatMap(r => r.obligations.map(ob => ({ line: r.line, ob, status: "unverified", what: `${r.name}: not run: ${path.basename(js)} does not load here (${short(e, 90)})` }))) }; }
  const dir = path.dirname(path.resolve(js));
  const resolve = p => pathToFileURL(require.resolve(p, { paths: [dir, __dirname] })).href;
  const solid = await import(resolve("solid-js"));
  if (mutation) mod = mutant(mod, rows, mutation, solid);
  const ctx = { mod, probeMod, dir, resolve, solid };
  const { createRoot } = solid;
  const out = [];
  // MO-11q: `Dialog.Trigger` is a member of `Dialog`. MO-8t: and `toaster.show` a method of `toaster`, called on it
  const at = n => { const ks = n.split("."); let o = ks[0] in mod ? mod : mod.default ?? mod, of; for (const k of ks)   /* (a CommonJS build's re-exports are its default's) */ { of = o; o = o?.[k]; } return ks.length > 1 && typeof o === "function" && !/^[A-Z]/.test(ks[ks.length - 1]) ? o.bind(of) : o; };
  // MO-8w: which of the file's words the code proves is read from the code (src/declare-audit.js): a word that is proven
  // is held, below, to what the reading claims; the rest are a person's, and are run as any row is
  let read = null;
  if (process.env.RX_VERIFY_READ !== "0" && !mutation) { try { read = given(file) ?? require("../src/declare-audit.js").auditFile(file); } catch (e) { read = null; if (process.env.RXV_DEBUG) fs.writeSync(2, `[rx-verify] the code was not read: ${e?.message ?? e}\n`); } }
  const proven = new Map();   // export → claim → why the code proves it
  const audit = { proven: 0, unproven: 0 };
  for (const row of read?.rows ?? []) for (const w of row.words) {
    audit[w.verdict]++;
    const ob = claimOf(w.word);
    if (w.verdict === "proven" && ob) { if (!proven.has(row.name)) proven.set(row.name, new Map()); proven.get(row.name).set(ob, w.why); }
  }
  const reading = new Map([...proven].map(([n, m]) => [n, new Set(m.keys())]));
  const probes = probeMod?.probes ?? {};
  const propsOf = n => probes[n]?.props?.() ?? {};
  const classOf = c => c === "Error" ? Error : typeof mod[c] === "function" ? mod[c] : typeof globalThis[c] === "function" ? globalThis[c] : null;
  const isA = (e, classes) => classes.some(c => { const C = classOf(c); return C && e instanceof C; });
  // a provider of `c` in this file: a component declared `provides(c)`, mounted around what is run (as its children, or
  // as its probe says — `around`, for a provider that renders something else than its children: a router its routes)
  const around = p => probes[p.name]?.around ? (children, s) => probes[p.name].around(children, s, mod) : ((children, s) => s.createComponent(at(p.name), Object.defineProperty({ ...propsOf(p.name) }, "children", { get: () => children(), enumerable: true })));
  const wraps = new Map();
  const providerOf = (c, alone) => {
    const p = checked.find(p => (p.kind === "component" || probes[p.name]?.around) && p.facts.provides?.includes(c) && typeof at(p.name) === "function");
    if (p) { if (!wraps.has(p.name)) wraps.set(p.name, around(p)); return { wrap: wraps.get(p.name), name: p.name }; }
    if (typeof probeMod?.providers?.[c] === "function") { if (!wraps.has(`providers.${c}`)) wraps.set(`providers.${c}`, (children, s) => probeMod.providers[c](children, s, mod)); return { wrap: wraps.get(`providers.${c}`), name: `the probe's providers.${c}` }; }
    if (alone && typeof probeMod?.provide === "function") return { wrap: probeMod.provide, name: "the probe's providers" };
    return undefined;
  };
  // what failed only for want of a browser (no `window` here) is no evidence either way: run with --dom
  const failure = (e, warned) => e ? { failed: short(e), env: environmental(e) } : warned?.length ? { failed: `it warns: ${warned[0].slice(0, 60)}` } : { failed: null };
  const owns = new Map();   // a hook's providers, as its uses(c) was run under
  const called = new Set();   // `line:claim`, where a run was made that could have refuted the claim and showed nothing
  const failsAlone = new Map();   // hooks and parts that fail with no provider, each with what it fails with: what a provides(c) is shown through
  const fns = checked.filter(r => r.kind === "fn"), comps = checked.filter(r => r.kind === "component");

  for (const row of checked) {
    const x = row.facts, line = row.line, name = row.name, obs = new Set(row.obligations);
    if (process.env.RXV_DEBUG) fs.writeSync(2, `[rx-verify] ${name}${mutation ? ` (${mutation})` : ""}\n`);
    const push = (ob, status, what, more) => out.push({ line, ob, status, what: `${name}: ${what}`, ...more });
    // a row that is mounted needs a renderer; where the project has none installed, that row is not run, and the others are
    try {
      const v = at(name);
      if (v === undefined) { push("exists", "mismatch", `${path.basename(js)} exports nothing by that name`); continue; }
      if (row.kind === "const") { push("exists", "held", "a value, exported"); continue; }
      if (row.kind === "error") { const ok = typeof v === "function" && v.prototype instanceof Error; push("exists", ok ? "held" : "mismatch", ok ? "an Error subclass" : "declared an error, but is not an Error subclass"); continue; }
      if (typeof v !== "function") { push("exists", "mismatch", `declared a ${row.kind}, but is a ${typeof v}`); continue; }
      push("exists", "held", `exported, a function`, { quiet: true });
      if (row.kind === "component") continue;   // its claims are run below, once every hook's are known

      const probe = probes[name];
      const required = x.params.filter(p => !p.optional && !p.rest).length;
      const runnable = !!probe?.args || !required;
      const args = () => probe?.args?.() ?? [];
      const code = proven.get(name) ?? new Map(), read = reading.get(name) ?? new Set();
      let own;   // the providers of the contexts the row names, where this file or the probe has each

      // pure: refuted by running, never shown by it (RFC 28)
      if (!mutation && x.pure && runnable) {
        const bad = []; called.add(`${line}:pure`);
        // MO-8v: what a `pure` says the fn does not do, whoever wrote it: it changes nothing it is given, leaves nothing on the
        // global object, asks no clock and no chance, and what it answers is not changed later (by a timer it left to run)
        const seen = watched(createRoot, v, args(), x.params.flatMap((p, i) => p.ref ? [i] : []));
        if (obs.has("pure") || read.has("pure")) try { await seen.result; } catch { /* what it rejects with is the row's rejects(…) */ }
        const did = [...seen.done()]; if (seen.scheduled()) { await new Promise(r => setTimeout(r, 30)); for (const b of seen.done()) if (!did.includes(b)) did.push(b.replace(/^it /, "it later ")); if (seen.changed()) did.push("what it answered is changed later"); }
        if (read.has("pure")) bad.push(...did.map(b => `read from its code as pure, but when it is called ${b}: the reading is wrong — remove the word, and report it`));
        // (a primitive's: what it makes may ask the clock; it changes nothing it is given)
        else bad.push(...did.filter(b => obs.has("pure") || /changes what it is given/.test(b)).map(b => `declared pure, but when it is called ${b}`));
        // what another fn of the file does between two calls (one the probe has arguments for) is nothing a pure one knows of
        if (obs.has("pure") && !bad.length && !x.uses?.length) for (const other of fns) {
          if (other === row || other.facts.pure || other.facts.uses?.length || !probes[other.name]?.args || typeof at(other.name) !== "function") continue;
          let a, b, threw = false; const text = v => { try { return JSON.stringify(v, (k, y) => typeof y === "function" ? "fn" : y); } catch { return undefined; } };
          createRoot(d => { try { a = text(v(...args())); } catch { threw = true; } d(); });
          try { const r = at(other.name)(...probes[other.name].args()); if (typeof r?.then === "function") await r; } catch { /* its own rows say */ }
          createRoot(d => { try { b = text(v(...args())); } catch { threw = true; } d(); });
          if (!threw && a !== undefined && b !== undefined && a !== b && text(args()) === text(args())) { bad.push(`declared pure, but it answers differently after ${other.name} is called (${String(a).slice(0, 30)} then ${String(b).slice(0, 30)})`); break; }
        }
        let ran = false;
        if (obs.has("pure") && !bad.length) {   // (a fn that makes something each call is not alike on two calls by design)
          let a, b, threw = null, across = null, asked = false;
          createRoot(d => { try { a = v(...args()); b = v(...args()); } catch (e) { threw = e; } d(); });
          asked = typeof a?.then === "function";
          try { [a, b] = await Promise.all([a, b]); } catch (e) { threw ??= e; }
          ran = !threw;
          if (threw) push("pure", "unverified", `pure not run: it threw (${short(threw, 50)})`);
          // (what a promise answers is data, and `pure` says of a loader that it is safe to ask again, R-io-4: a later
          // answer may be another one, and refutes nothing)
          else if (!same(a, b) && asked) { ran = false; push("pure", "unverified", `pure not shown: asked twice it answers differently (${show(a)} then ${show(b)}), as a loader's data may; that it writes nothing is not seen by running`); }
          else if (!same(a, b)) bad.push(`declared pure, but two calls with the same arguments answer differently (${show(a)} then ${show(b)})`);
          // 10 SV-7c: that a `pure` fn answers alike on the server and in the browser is part of the word, and a build
          // cannot see it (hydration adopts the server's text). So it is run on the other side too — this process has a
          // browser's globals (--dom) or has not, a second one the other way — and a plain answer that is steady on each
          // side and differs between them refutes the row. (`server` and `client` fns run on one side only.)
          else if ((across = x.side ? null : otherSide(js, name, probeFile)) && plain(a) && !same(a, across.value)) bad.push(`declared pure, but it answers differently on the server and in the browser (${show(across.dom ? a : across.value)} with no window, ${show(across.dom ? across.value : a)} with one): a page rendered on the server would show one and hydrate with the other. What only the browser knows is \`client\` JS, asked as a question (10 SV-7b, SV-7c)`);
        }
        if (bad.length) push("pure", "mismatch", bad.join("; "));
        else if (ran && !code.has("pure")) push("pure", "unverified", "pure not contradicted: two calls with the same arguments answer alike, which cannot show a fn is pure");
      }

      // instantiates (MO-10a): where nothing owns what it makes, Solid's development build says so, or it throws; a call that
      // returns with no report needs no owner (a run with one set of arguments: one path). In a process of its own: the build
      if (!mutation && /\)[^()]*\binstantiates\b/.test(row.text.replace(/"(?:[^"\\]|\\.)*"/g, "")) && runnable && x.side !== "server") {
        const r = unowned(js, name, probeFile);
        if (r?.reports) push("instantiates", "held", `instantiates holds: with no owner Solid reports it (${r.reports})`, { quiet: true });
        else if (!r || r.threw !== undefined) push("instantiates", "unverified", `instantiates not run: ${r ? `with no owner it threw (${r.threw})` : "Solid's development build did not answer"}`, { quiet: true });
        else if (read.has("instantiates")) push("instantiates", "mismatch", "instantiates was read from the code, but called with no owner it returns, and Solid reports nothing: the reading is wrong — remove the word, and report it");
        // (an author's: the call is made once, whatever it makes — a client, a bus — and no run shows that)
        else push("instantiates", "unverified", "instantiates not shown: called with no owner it returns, and Solid reports nothing", { quiet: true });
      }

      // rejects(E): what its promise rejects with, under the probe's failing arguments
      if (obs.has("rejects")) {
        const classes = x.rejects; let shown = false, bad = false;
        // (the probe's own arguments are called with where calling is already asked for: a `pure` fn, a reading of the code)
        for (const [which, given] of [["the probe's arguments", (x.pure || read.has("rejects")) && probe?.args], ["the probe's failing arguments", probe?.fail]]) {
          if (!given) continue;
          let got = null; try { await v(...given()); } catch (e) { got = e ?? new Error("undefined"); }
          if (got && !isA(got, classes)) { bad = true; push("rejects", "mismatch", `declared to reject with ${classes.join(" | ")} alone, but under ${which} it rejects with ${got?.constructor?.name ?? typeof got}${got?.message ? ` (${String(got.message).slice(0, 40)})` : ""}`); }
          else if (got) { shown = true; push("rejects", "held", `under ${which} it rejects with ${got.constructor.name}, as its row says`); }
        }
        if (!shown && !bad && !code.has("rejects")) push("rejects", "unverified", probe?.fail ? "rejects(…) not shown: under the probe's failing arguments nothing rejects" : "rejects(…) not run: give failing arguments as the probe's fail");
      }

      // uses(c): with no provider, and under one
      if (x.uses.length) {
        if (!runnable) for (const c of x.uses) push(`uses:${c}`, "unverified", `uses(${c}) not run, it needs ${required} argument${required > 1 ? "s" : ""} (give them in a probe)`);
        else {
          let aloneWarned = [];
          const run = async wrap => {
            if (wrap) { const m = await mount(ctx, v, args(), [], probe?.run, wrap); const e = m.renderError ?? (m.boundary && !notReady(m.boundary) ? m.boundary : null) ?? m.runError; return failure(e, m.warned.filter(w => aloneWarned.includes(w))); }
            let threw = null, dispose = () => {}, result; const quiet = hushed();   // a hook may warn, not throw, with no provider (TanStack Router's `useRouter must be used inside a <RouterProvider>`)
            try {
              createRoot(d => { dispose = d; try { result = v(...args()); } catch (e) { threw = e; } });
              if (!threw && probe?.run) { try { await probe.run(result); } catch (e) { threw = e; } }   // a hook that reads its context lazily: the probe uses what it gave
              dispose();
            } finally { quiet.restore(); }
            aloneWarned = quiet.warned;
            if (!threw && !quiet.warned.length) { const m = await mount(ctx, v, args(), [], probe?.run, null); threw = m.renderError ?? (m.boundary && !notReady(m.boundary) ? m.boundary : null) ?? m.runError; aloneWarned = m.warned; return failure(threw, m.warned); }   // one that reads its context in a computation of its own
            return failure(threw, quiet.warned);
          };
          const rs = await usesClaims({ name, line, contexts: x.uses, run, providerOf: c => providerOf(c, x.uses.length === 1), fails: failsAlone });
          out.push(...rs);
          // what it is mounted under below, to read its parts: the providers it was just shown to run with
          const ps = x.uses.map(c => providerOf(c, x.uses.length === 1));
          if (ps.every(Boolean)) owns.set(name, own = (children, s) => [...new Set(ps.map(p => p.wrap))].reduceRight((kids, w) => () => w(kids, s), children)());
        }
      }

      // fields, fails: every part of the result read where it is mounted
      if (x.parts.length && runnable) {
        const fails = x.parts.filter(f => f.fails.length);
        const ran = await mount(ctx, v, args(), x.parts, null, own);
        const key = f => f.path.join("."), label = f => key(f) || "the result";
        const envErr = [ran.renderError, ran.boundary, ...x.parts.map(f => ran.seen.get(key(f)).failed)].find(environmental);
        if (envErr) push("fields", "unverified", `not run: it needs a browser (${short(envErr, 40)}); run rx-verify with --dom`);
        else if (ran.renderError) push("fields", "unverified", `not run: it threw as it mounted (${short(ran.renderError, 50)}); give its providers in the probe`);
        else {
          const bad = [];
          for (const f of x.parts) {
            const st = ran.seen.get(key(f));
            // MO-10d: an accessor's read may hold, whatever its row says; a plain part that does is one a row cannot describe (MO-8r)
            if (st.pending && !f.ref) bad.push(`${key(f)} holds (its first read is not ready): a plain field that waits where it is read has no row — hand it out as a function from a module of the app's own, declared \`pending ref\` (MO-10l)`);
            if (st.notAccessor) bad.push(`${label(f)} is declared ref, but is not an accessor (a function)`);
            if (st.unsteady) bad.push(`${label(f)} is declared ref, but each read makes another value (${st.unsteady}): a reader is read as often as the program names it — declare it a function, \`() => T\`, which is called where an event is handled (MO-10b)`);
            if (st.failed && !f.ref) bad.push(`${key(f)} fails (${short(st.failed, 40)}) where it is read: a plain field that does has no row — hand it out as a function, declared \`fails(…) ref\` (MO-10l)`);
          }
          // (a failure of a hook given nothing, with nothing around it but a provider given nothing, says that something is missing — a provider
          // its row does not name, a device this page has not — and not what its parts do)
          const bare = ran.boundary && !fails.length && !notReady(ran.boundary) && !probe?.args && !probe?.provide && !probeMod?.provide && (!own || !checked.some(p => p.kind === "component" && p.facts.provides.some(c => x.uses.includes(c)) && probes[p.name]) && !x.uses.some(c => probeMod?.providers?.[c]));
          if (bare) { push("fields", "unverified", `its fields are not read: run alone it fails (${short(ran.boundary, 60)}) — if it wants a provider, its row says uses(…); else give what it needs in the probe`); continue; }
          if (ran.boundary && !fails.length && !notReady(ran.boundary)) bad.push(`it fails into the errored boundary (${short(ran.boundary, 40)}), and no field is declared fails(…)`);
          const heldSeen = x.parts.filter(f => f.pending && ran.seen.get(key(f)).pending).map(label);
          // MO-10l: an accessor that waited and whose row does not say so — the row says less (MO-10d), and the checker asks for no region
          const quiet = x.parts.filter(f => f.ref && !f.pending && ran.seen.get(key(f)).pending).map(label);
          const loud = x.parts.filter(f => f.ref && !f.fails.length && ran.seen.get(key(f)).failed).map(label);
          if (bad.length) push("fields", "mismatch", bad.join("; "));
          else if (x.parts.some(f => f.pending && !ran.seen.get(key(f)).pending)) push("fields", "unverified", `its fields read as declared, but ${x.parts.filter(f => f.pending && !ran.seen.get(key(f)).pending).map(label).join(", ")}, declared pending, never waited: give arguments in the probe under which it does`);
          else if (!obs.has("fields")) push("fields", "na", "no part of its result has a word (ref, pending, fails): nothing is claimed of them");
          else push("fields", "held", `its fields read as declared${heldSeen.length ? ` (${heldSeen.join(", ")} held, then answered)` : ""}${quiet.length ? `; ${quiet.join(", ")} waited where it was read: \`pending ref\` would have the checker ask for a loading region above its reads (MO-10l)` : ""}${loud.length ? `; ${loud.join(", ")} failed where it was read: \`fails(…) ref\` would have it ask for an errored one (MO-10l)` : ""}`);
          if (fails.length) {
            if (!probe?.fail) push("fails", "unverified", "fails(…) not run (give failing arguments as the probe's fail)");
            else {
              const r2 = await mount(ctx, v, probe.fail(), x.parts, null, own);
              const got = r2.boundary ?? fails.map(f => r2.seen.get(key(f)).failed).find(Boolean);
              const classes = [...new Set(fails.flatMap(f => f.fails))];
              if (got && isA(got, classes)) push("fails", "held", `under the failing arguments it fails with ${got.constructor?.name ?? "an error"}, as declared`);
              else push("fails", "mismatch", `under the failing arguments ${got ? `it fails with ${got.constructor?.name}, not ${classes.join(" or ")}` : "nothing fails"}`);
            }
          }
        }
      }

      // MO-10i (2026-11-22): a `draft` parameter. The fn is run with the probe's arguments, what it is given at that
      // position watched: it must change it during the call (else the word claims a change the fn does not make), and
      // must not change it after it returned (else it kept the draft, which the word says it does not)
      const drafts = x.params.flatMap((p, i) => p.draft ? [i] : []);
      if (drafts.length) {
        if (!probe?.args) push("draft", "unverified", "its `draft` parameter is not run: with the arguments it is called with (a probe's `args`) it is checked to change what it is given during the call, and not after");
        else {
          let during = 0, after = 0, returned = false, threw = null;
          const watch = o => o === null || typeof o !== "object" ? o : new Proxy(o, {
            get: (t, k, r) => watch(Reflect.get(t, k, r)),
            set: (t, k, val) => { returned ? after++ : during++; return Reflect.set(t, k, val); },
            deleteProperty: (t, k) => { returned ? after++ : during++; return Reflect.deleteProperty(t, k); },
          });
          try { await v(...probe.args().map((a, i) => drafts.includes(i) ? watch(a) : a)); } catch (e) { threw = e; }
          returned = true;
          await new Promise(r => setTimeout(r, 20));
          if (threw) push("draft", "unverified", `its \`draft\` parameter is not run: it threw (${short(threw, 50)})`);
          else if (after) push("draft", "mismatch", "declared to change its `draft` parameter during the call, but it changed it after it returned: it kept what it was given");
          else if (!during) push("draft", "mismatch", "its parameter is declared `draft`, but with the probe's arguments it changed nothing of what it was given");
          else if (await keeps(v, probe.args, drafts)) push("draft", "mismatch", "its parameter is declared `draft`, but after the call it keeps what it was given");
          else push("draft", "held", `it changes its \`draft\` parameter in place during the call (${during} write${during === 1 ? "" : "s"}), and not after`);
        }
      }
    } catch (e) { if (!noRenderer(e)) throw e; for (const ob of row.obligations.filter(ob => ob !== "exists" && !out.some(r => r.line === line && r.ob === ob))) push(ob, "unverified", "not run: it is mounted to be read, with @solidjs/universal, which is not installed here (npm i -D @solidjs/universal)"); }
  }

  // a component's uses(c) (MO-12b, a kit's compound part): rendered alone and inside what provides it
  for (const row of comps.filter(c => c.facts.uses.length && typeof at(c.name) === "function")) {
    if (process.env.RXV_DEBUG) fs.writeSync(2, `[rx-verify] uses of ${row.name}\n`);
    const part = () => solid.createComponent(at(row.name), propsOf(row.name));
    let alone;
    const run = async wrap => { let seen = false; const inner = () => { seen = true; return part(); }; const r = await place.renderOnce(() => wrap ? wrap(inner, solid) : part(), resolve, wrap && (() => seen)); if (!wrap) alone = r; else if (!seen && !r.error) return { failed: "the provider renders nothing of what it is given" }; const same = wrap && alone ? r.warned.filter(w => alone.warned.includes(w)) : r.warned; return failure(r.error, same); };
    const rs = await usesClaims({ name: row.name, line: row.line, contexts: row.facts.uses, run, providerOf: c => providerOf(c, row.facts.uses.length === 1), fails: failsAlone });
    out.push(...rs);
  }
  // provides(c) (MO-12c, RFC 28): each context is its own claim, answered only by actual provision: a hook or a part of
  // the same file that uses `c` and nothing else, shown to fail (or warn) with no provider, runs cleanly under the
  // component. A hook declared `uses(a, b)` cannot tell which of the two it read, so it answers neither
  // (a fn that makes the provider — a router's factory — with the probe's `around`)
  for (const row of checked.filter(c => c.facts.provides?.length && (c.kind === "component" || probes[c.name]?.around) && typeof at(c.name) === "function")) {
    const wrap = wraps.get(row.name) ?? around(row); const runs = new Map();
    const only = (r, c) => r.facts.uses.length === 1 && r.facts.uses[0] === c && failsAlone.has(r.name);
    for (const c of row.facts.provides) {
      const push = (status, what) => out.push({ line: row.line, ob: `provides:${c}`, status, what: `${row.name}: ${what}` });
      // one that fails under the component as it fails alone found no provider; one that fails otherwise wants something
      // else there (a probe's props), which says nothing of `c`
      // (and where the component fails by itself as the part does alone, both want something else that is missing)
      const bare = await place.renderOnce(() => wrap(() => null, solid), resolve);
      const still = (n, e) => failure(e).failed === failsAlone.get(n) && failure(bare.error).failed === failsAlone.get(n) ? push("unverified", `provides(${c}) not shown: it fails by itself (${short(bare.error)}), as ${n} does alone: give what it needs in the probe`)
        : failure(e).failed === failsAlone.get(n) ? push("mismatch", `declared provides(${c}), but ${n}, which uses it, still fails under it (${short(e)})`)
        : push("unverified", `provides(${c}) not shown: ${n}, which uses it, fails under it for another reason (${short(e)}) than alone (${failsAlone.get(n)}): give what it needs in the probe`);
      const hook = fns.find(h => only(h, c) && (probes[h.name]?.args || !h.facts.params.some(p => !p.optional && !p.rest)) && typeof at(h.name) === "function");
      // …and where it is made later, under the provider already mounted
      const later = async (what, Part) => { const r = await place.renderLater(wrap, Part, resolve); if (r.made && r.error) push("mismatch", `declared provides(${c}), but ${what} made later under it (a conditional turned on) fails (${short(r.error)}): what it provides is there only while its body runs, which no context is`); };
      const part = !hook && comps.find(p => p !== row && only(p, c) && typeof at(p.name) === "function");
      // no row of the file uses it: the probe's own hook (`uses.c`), which must fail with no provider
      const own = !hook && !part && probeMod?.uses?.[c];
      if (own) {
        const Own = () => { own(mod); return null; };   // (handed the module: the one this verifier runs, which a project's import may not be)
        const alone = await place.renderOnce(() => solid.createComponent(Own, {}), resolve); let seen = false;
        const inside = await place.renderOnce(() => wrap(() => { seen = true; return solid.createComponent(Own, {}); }, solid), resolve, () => seen);
        if (!alone.error && !alone.warned.length) push("unverified", `provides(${c}) not shown: the probe's uses.${c} does not fail without it`);
        else if (!seen) push("unverified", `provides(${c}) not shown: it renders nothing of what it is given here${inside.error ? ` (${short(inside.error)})` : ""}: give its props, or an around, in the probe`);
        else if (inside.error) push("mismatch", `declared provides(${c}), but the probe's uses.${c} still fails under it (${short(inside.error)})`);
        else push("held", `provides(${c}) holds: the probe's uses.${c}, which fails without it, runs under it`), await later(`the probe's uses.${c}`, Own);
        continue;
      }
      try {
        if (part) {   // MO-11q: a kit's part, rendered inside the component (it must not fail)
          let seen = false;
          const inside = await place.renderOnce(() => wrap(() => { seen = true; return solid.createComponent(at(part.name), propsOf(part.name)); }, solid), resolve, () => seen);
          if (!seen && !inside.error) { push("unverified", `provides(${c}) not shown: it renders nothing of what it is given here (${part.name}): give its props, or an around, in the probe`); continue; }
          if (inside.error) still(part.name, inside.error);
          else push("held", `provides(${c}) holds: ${part.name}, which uses it alone, fails without it and renders under it`), await later(part.name, () => solid.createComponent(at(part.name), propsOf(part.name)));
          continue;
        }
        if (!hook) { push("unverified", `provides(${c}) not run: no hook or component in this file uses ${c} alone and is shown to fail without it (with a probe's arguments if it needs any)`); continue; }
        if (!runs.has(hook.name)) runs.set(hook.name, await mount(ctx, at(hook.name), probes[hook.name]?.args?.() ?? [], [], null, wrap));
        const ran = runs.get(hook.name);
        if (ran.renderError) push("unverified", `provides(${c}) not run: it threw as it mounted (${short(ran.renderError, 50)}); give its props as the probe's props`);
        else if (ran.boundary && !notReady(ran.boundary)) still(hook.name, ran.boundary);
        else {
          // …and of every other view it is given: none is run where the context is not (a value that reads it, a test of it)
          let outside;
          for (const p of row.kind === "component" && !probes[row.name]?.around ? row.facts.props.filter(p => p.view && p.name !== "children") : []) {
            const r = await place.renderOnce(() => solid.createComponent(at(row.name), Object.defineProperty({ ...propsOf(row.name) }, p.name, { get: () => solid.createComponent(() => { at(hook.name)(...(probes[hook.name]?.args?.() ?? [])); return null; }, {}), enumerable: true })), resolve);
            if (r.error && failure(r.error).failed === failsAlone.get(hook.name)) { outside = p.name; break; }
          }
          if (outside) push("mismatch", `declared provides(${c}), but ${hook.name}, in its prop ${outside}, fails as it does alone: the component runs that view outside the provider`);
          else push("held", `provides(${c}) holds: ${hook.name}, which fails without it, runs under it`), await later(hook.name, () => { at(hook.name)(...(probes[hook.name]?.args?.() ?? [])); return null; });
        }
      } catch (e) { if (!noRenderer(e)) throw e; push("unverified", `provides(${c}) not run: it is mounted with @solidjs/universal, which is not installed here (npm i -D @solidjs/universal)`); }
    }
  }
  // MO-10g: callbacks, by running: a closure at a declared function-typed position is checked as a handler (each its
  // own claim, `callbacks:<position>`, RFC 29); a component's function-typed props, by rendering it
  out.push(...(await place.verifyCallbacks({ reading, fns: fns.filter(r => r.facts.callbacks.length), at, probeMod, solid, mount: (fn, args, run, name) => mount(ctx, fn, args, [], run, owns.get(name)) })));
  out.push(...(await place.verifyComponentCallbacks({ comps: comps.filter(r => r.facts.props.some(p => p.function)), at, probeMod, solid, resolve })));
  // MO-11r, MO-10i: where it renders what it is given (with the probe's scene), and its draft callbacks
  out.push(...(await place.verifyPlacement({ rows: checked, mod, probeMod, solid, resolve })));

  // MO-8w: a claim the code proves and no run answered: `pure`, which no run can show, is `read`; another is not held by the
  // reading that wrote it
  for (const row of checked) for (const [ob, why] of proven.get(row.name) ?? []) {
    const mine = out.filter(r => r.line === row.line && [].concat(r.ob).includes(ob));
    if (mine.some(r => r.status === "mismatch" || r.status === "held")) continue;
    for (const r of mine) out.splice(out.indexOf(r), 1);   // an `unverified` the proof answers
    if (ob === "pure") { out.push({ line: row.line, ob, status: "read", by: "code", what: `${row.name}: pure is read from the code (${why}: what a getter or a callback among its arguments does is the caller's), ${mine.length || called.has(`${row.line}:${ob}`) ? "and no run contradicts it" : "which was not run"}` }); continue; }
    out.push({ line: row.line, ob, status: "unverified", by: "code", what: `${row.name}: ${describe(ob)} is read from the code (${why}), ${mine.length ? `and not shown by running: ${mine.map(r => r.what.replace(/^[^:]+: /, "")).join("; ").slice(0, 200)}` : "and no run was made of it: give the probe what it needs"}` });
  }
  out.push(...require("../src/strict.js").unanswered(file, out));
  const order = new Map(out.map((r, i) => [r, i]));
  out.sort((a, b) => a.line - b.line || order.get(a) - order.get(b));
  return { results: out, audit: read?.rows.length ? audit : undefined };
}

/** Calls `fn(...args)` under a root, watching what a `pure` read from the code says it does not do: `done()` lists what
 *  was seen — an argument changed, a global left behind, the clock or a random number asked for while it was called. */
function watched(createRoot, fn, args, refs = []) {
  // (what it is given: its data, and what the accessors among its arguments answer, where asked twice they answer alike)
  const data = () => { try { return [...args, ...refs.map(i => typeof args[i] === "function" && !args[i].length ? args[i]() : null)].map(x => JSON.stringify(x, (k, v) => typeof v === "function" ? undefined : v)); } catch { return undefined; } };
  const still = String(data()) === String(data()), snap = () => still ? data() : undefined;
  const page = () => { try { const d = globalThis.document; return d && d.title + d.documentElement.outerHTML; } catch { return undefined; } }, pageBefore = page();
  const before = snap(); const globals = new Set(Reflect.ownKeys(globalThis)); const asked = new Set();
  const saved = [Date.now, Math.random, globalThis.performance?.now];
  Date.now = function () { asked.add("Date.now()"); return saved[0].call(Date); };
  Math.random = function () { asked.add("Math.random()"); return saved[1].call(Math); };
  if (saved[2]) performance.now = function () { asked.add("performance.now()"); return saved[2].call(performance); };
  let result, threw = null, scheduled = false;
  const timers = ["setTimeout", "setInterval", "queueMicrotask", "setImmediate", "requestAnimationFrame"].filter(k => typeof globalThis[k] === "function").map(k => [k, globalThis[k]]);
  for (const [k, f] of timers) globalThis[k] = function (...a) { scheduled = true; return f.apply(globalThis, a); };
  const then = Promise.prototype.then; Promise.prototype.then = function (...a) { scheduled = true; return then.apply(this, a); };
  const of = v => { try { return JSON.stringify(v, (k, y) => typeof y === "function" ? "fn" : y); } catch { return undefined; } };
  let answered;
  try { createRoot(d => { try { result = fn(...args); answered = typeof result?.then === "function" ? undefined : of(result); } catch (e) { threw = e; } d(); }); }
  finally { Date.now = saved[0]; Math.random = saved[1]; if (saved[2]) performance.now = saved[2]; for (const [k, f] of timers) globalThis[k] = f; Promise.prototype.then = then; }
  return { result, threw, scheduled: () => scheduled, changed: () => answered !== undefined && of(result) !== answered, done: () => {
    const out = []; const after = snap();
    const i = before && after ? before.findIndex((x, i) => x !== after[i]) : -1;
    if (i >= 0) out.push(`it changes what it is given (${String(before[i]).slice(0, 30)} to ${String(after[i]).slice(0, 30)})`);
    const left = Reflect.ownKeys(globalThis).filter(k => !globals.has(k)); if (left.length) out.push(`it left ${left.map(String).slice(0, 3).join(", ")} on the global object`);
    if (page() !== pageBefore) out.push("it changes the page");
    if (asked.size) out.push(`it asked ${[...asked].join(" and ")}`);
    return out;
  } };
}
/** Whether a fn keeps what it is given: what it was given is still there when nothing else has it (and what the probe makes
 *  with no call is not). */
async function keeps(fn, args, which) {
  let gc; try { require("node:v8").setFlagsFromString("--expose-gc"); gc = require("node:vm").runInNewContext("gc"); } catch { return false; }
  const make = async call => { const a = args(); const refs = which.flatMap(i => a[i] !== null && typeof a[i] === "object" ? [new WeakRef(a[i])] : []); if (call) try { await fn(...a); } catch { /* said already */ } return refs; };
  const gone = async refs => { for (let i = 0; i < 8; i++) { await new Promise(r => setTimeout(r, 5)); gc(); if (refs.every(r => !r.deref())) return true; } return false; };
  const given = await make(true), control = await make(false);
  return await gone(control) && !await gone(given);
}
/** A value whose identity is what it is: an instance of a class (an AbortSignal, an element), not data. */
const identified = v => v !== null && typeof v === "object" && !Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v));
/** Plain data: what two machines can be compared on (no function, no class instance, no accessor). */
function plain(v, seen = new Set()) {
  if (v === null || ["string", "number", "boolean", "undefined"].includes(typeof v)) return true;
  if (typeof v !== "object" || seen.has(v)) return false; seen.add(v);
  if (Array.isArray(v)) return v.every(x => plain(x, seen));
  return Object.getPrototypeOf(v) === Object.prototype && Object.values(v).every(x => plain(x, seen));
}
/** SV-7c: a fn's answer on the other side — a second process with a browser's globals when this one has none, and the
 *  other way round: `{ value, dom }`, or null when it could not be asked (no happy-dom, it threw, it is not steady). */
function otherSide(js, name, probeFile) {
  const dom = !process.argv.includes("--dom");
  const r = require("node:child_process").spawnSync(process.execPath, [...process.execArgv, __filename, "--answer", path.resolve(js), name, probeFile ? path.resolve(probeFile) : "-", ...(dom ? ["--dom"] : [])], { cwd: process.cwd(), encoding: "utf8" });
  try { const out = JSON.parse(String(r.stdout).trim().split("\n").pop()); return out.ok ? { value: out.value, dom } : null; } catch { return null; }
}
/** A call of a fn with no owner, under Solid's development build: what Solid reports, or what it threw; null where that could not be asked. */
function unowned(js, name, probeFile) {
  const r = require("node:child_process").spawnSync(process.execPath, [...process.execArgv.filter(a => !/^--conditions=production$/.test(a)), "--conditions=browser", "--conditions=development", __filename, "--unowned", path.resolve(js), name, probeFile ? path.resolve(probeFile) : "-", ...(process.argv.includes("--dom") ? ["--dom"] : [])], { cwd: process.cwd(), encoding: "utf8", timeout: 30000 });
  try { return JSON.parse(String(r.stdout).trim().split("\n").pop()); } catch { return null; }
}
/** Structural equality, for `pure`: functions are alike when both are functions. */
function same(a, b, seen = new Set()) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a === "function") return true;
  if (typeof a !== "object") return false;
  if (seen.has(a)) return true; seen.add(a);
  if (Array.isArray(a) !== Array.isArray(b) || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => same(a[k], b[k], seen));
}
const show = v => { try { return JSON.stringify(v)?.slice(0, 30) ?? String(v); } catch { return String(v); } };

/** A failure that says only that there is no browser here (a missing `window`, `document`, …). */
function environmental(e) {
  return !!e && (e instanceof ReferenceError || /\bis not defined\b|\b(window|document|navigator|localStorage|matchMedia)\b/.test(String(e.message ?? "")) || environmental(e.cause));
}

const LABEL = { held: "held      ", read: "read      ", mismatch: "MISMATCH  ", na: "n/a       ", unverified: "unverified" };
(async () => {
  const flags = ["--dom", "--record", "--json"];
  const dom = process.argv.includes("--dom");
  const record = process.argv.includes("--record");   // MO-8j: write what was verified beside each declaration
  const json = process.argv.includes("--json");
  const files = process.argv.slice(2).filter(a => !flags.includes(a));
  // `--answer <module.js> <export> <probe|->` (rx-verify's own second process, SV-7c): the export called with the probe's
  // arguments, twice; its answer as JSON when it is plain data and steady
  if (process.argv[2] === "--unowned") {
    process.on("unhandledRejection", () => {}); process.on("uncaughtException", () => {});
    const [, , , js, name, probeFile] = process.argv; let out = null;
    try {
      if (dom) require(require.resolve("@happy-dom/global-registrator", { paths: [process.cwd(), __dirname] })).GlobalRegistrator.register({ url: "http://localhost/" });
      const mod = await import(pathToFileURL(js).href); const probeMod = probeFile && probeFile !== "-" ? await import(pathToFileURL(probeFile).href) : null;
      const v = name.split(".").reduce((o, k) => o?.[k], mod);
      const said = []; for (const k of ["warn", "error"]) console[k] = (...a) => said.push(String(a[0]));
      let threw = null, r; try { r = v(...(probeMod?.probes?.[name]?.args?.() ?? [])); } catch (e) { threw = e; }
      if (typeof r?.then === "function") r.then(null, () => {});
      await new Promise(z => setTimeout(z, 5));
      const owner = said.find(t => /NO_OWNER|outside a reactive context|never be (?:disposed|run)|under a reactive root/i.test(t)) ?? (threw && /owner|reactive root|context/i.test(String(threw.message ?? threw)) ? String(threw.message ?? threw) : undefined);
      out = owner ? { reports: owner.replace(/\s+/g, " ").slice(0, 60) } : threw ? { threw: short(threw, 50) } : {};
    } catch { /* not asked */ }
    process.stdout.write(JSON.stringify(out) + "\n", () => process.exit(0)); return;
  }
  if (process.argv[2] === "--answer") {
    const [, , , js, name, probeFile] = process.argv; let out = { ok: false };
    try {
      if (dom) require(require.resolve("@happy-dom/global-registrator", { paths: [process.cwd(), __dirname] })).GlobalRegistrator.register({ url: "http://localhost/" });
      const mod = await import(pathToFileURL(js).href); const probeMod = probeFile && probeFile !== "-" ? await import(pathToFileURL(probeFile).href) : null;
      const v = name.split(".").reduce((o, k) => o?.[k], mod); const args = () => probeMod?.probes?.[name]?.args?.() ?? [];
      const [a, b] = await Promise.all([v(...args()), v(...args())]);
      if (plain(a) && same(a, b)) out = { ok: true, value: a };
    } catch { /* not asked */ }
    process.stdout.write(JSON.stringify(out) + "\n", () => process.exit(0)); return;
  }
  if (dom) {   // a browser's globals, from happy-dom, resolved from the project: its hooks then run as in a page
    let reg;
    try { reg = require(require.resolve("@happy-dom/global-registrator", { paths: [process.cwd(), __dirname] })); }
    catch { process.stderr.write("rx-verify --dom: install @happy-dom/global-registrator in the project\n"); process.exit(2); }
    reg.GlobalRegistrator.register({ url: "http://localhost/" });
  }
  if (!files.length) { process.stderr.write("usage: rx-verify [--dom] [--record] [--json] <file.d.rx>...\n"); process.exit(2); }
  let fails = 0, unrun = 0; const all = [];
  const say = text => { if (!json) process.stdout.write(text); };
  for (const f of files) {
    const { results, audit, unread } = await verify(f);
    if (unread) { process.stderr.write(`rx-verify: ${f}: ${unread}: none of its rows is run\n`); unrun++; }
    const names = rowsOf(f);
    for (const r of results) {
      r.name = names.find(x => r.line >= x.line && r.line <= x.end)?.name;
      if (r.status === "mismatch") fails++;
      if (!r.quiet) say(`${path.relative(process.cwd(), f)}:${r.line} ${LABEL[r.status]} ${r.what}\n`);
    }
    // (said, not recorded: it is about no claim)
    if (audit) say(`${path.relative(process.cwd(), f)}: words: ${audit.proven} read from the code (each run against what the reading claims, where there are arguments to call with), ${audit.unproven} it does not show (\`rx-declare --audit\` lists them, with what to check)\n`);
    if (record) { const at = require("../src/strict.js").writeRecord(f, results); say(`${path.relative(process.cwd(), at)}: recorded\n`); }
    all.push({ file: f, results: results.flatMap(r => [].concat(r.ob).map(ob => ({ line: r.line, name: r.name, ob, status: r.status, ...(r.by ? { by: r.by } : {}), what: r.what }))), ...(audit ? { audit } : {}) });
  }
  // (exits once it is written: a pipe takes a long answer in parts, and exiting before the last cut it short)
  process.stdout.write(json ? JSON.stringify(all) + "\n" : "", () => process.exit(fails ? 1 : unrun ? 2 : 0));
})().catch(e => { process.stderr.write(`rx-verify: ${e?.stack ?? e}\n`); process.exit(2); });
