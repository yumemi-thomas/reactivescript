#!/usr/bin/env node
// `rx-verify <file.d.rx>...`: run a declaration's JS module and check the rows that running can check (09 MO-8f's sibling:
// TY-6 checks what types can, this checks what running can). For each declared export: it exists, and a fn is a function.
// For each hook declared `uses(…)` that needs no arguments: called with nothing providing its context, it must throw
// (Solid's `useContext` finds nothing, and the library refuses), or the row claims a need the hook does not have. The
// rest is listed as not verified, with why. A failure that only says there is no browser (no `window`) is not
// verified either; `--dom` runs with happy-dom's browser globals (@happy-dom/global-registrator, from the project).
//
// Probes: `lib.probe.mjs` (or .js) beside `lib.d.rx` may give what only the app has. It exports `probes`, by hook name,
// `{ args: () => [...], fail?: () => [...], run?: result => … }` (the arguments as JS passes them: a `ref` parameter is
// an accessor; `run` uses the result, for a hook that reads its context only then, as a mutation's `mutateAsync`), and
// `provide(children)`, the providers a `uses(…)` hook needs, as a tree (`createComponent(Ctx, { value, get children() {
// return children() } })`). With them: a `uses(…)` hook that needs arguments is run with no provider (it, or `run`, must throw);
// and the hook is mounted (@solidjs/universal) under `provide`, beneath an errored boundary, and every field of its
// declared result (a record's fields, a tuple's parts, a `ref` result) is read in a render effect: a part that holds
// (Solid's NotReadyError) or fails without `holds` or `fails(…)` on it is a mismatch, as is a `ref` part that is not an
// accessor; under `fail`'s arguments a `fails(C)` field must fail with a C. A `pure` fn (one that makes nothing) is
// called twice with the same arguments and must answer alike. A component that `provides(c)` is mounted (with the
// probe's `props`) around a hook of the same file that uses only what it provides, which must then run cleanly.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const JS = [".js", ".mjs", ".jsx"];

/** The declaration's exports, as far as the runner needs them. */
function exportsOf(text) {
  const out = [];
  text.split("\n").forEach((l0, i) => {
    const l = l0.replace(/\/\/.*$/, "");
    let m;
    if ((m = /^\s*export\s+(?:server\s+|client\s+)?(pure\s+)?fn\s+([A-Za-z_$][\w$]*)(?:<[^(]*>)?\s*\(/.exec(l))) {
      const close = matching(l, m.index + m[0].length - 1);
      const params = splitTop(l.slice(m.index + m[0].length, close)).map(p => p.trim()).filter(Boolean);
      const after = l.slice(close + 1).replace(/^\s*:\s*/, "");
      const ret = after.split(/\s(?=uses\(|provides\(|nests\(|renders\b|instantiates\b|rejects\()/)[0].trim();
      const fields = ret.startsWith("{") ? fieldsOf(ret) : ret.startsWith("[") ? partsOf(ret) : /^ref\s/.test(ret) ? [{ path: [], holds: false, fails: [], ref: true }] : null;
      const inst = /\binstantiates\b|\brenders\b|\bnests\(|\bprovides\(/.test(l) || /\bComponent\b/.test(ret) || params.some(q => /^ref\s/.test(q));
      out.push({ kind: "fn", name: m[2], line: i + 1, pure: !!m[1], inst, required: params.filter(p => !/^(ref\s+)?[\w$]+\?/.test(p)).length, uses: /\buses\(/.test(l), usesNames: names(l, "uses"), holds: /\bholds\b|\bfails\(/.test(l), fields });
    } else if ((m = /^\s*export\s+component\s+([A-Za-z_$][\w$]*)/.exec(l))) out.push({ kind: "component", name: m[1], line: i + 1, provides: /\bprovides\(/.test(l), providesNames: names(l, "provides") });
    else if ((m = /^\s*export\s+error\s+([A-Za-z_$][\w$]*)/.exec(l))) out.push({ kind: "error", name: m[1], line: i + 1 });
  });
  return out;
}

/** The contexts a row names: `uses(a, b)` gives [a, b]. */
function names(l, word) { const m = new RegExp(`\\b${word}\\(([^)]*)\\)`).exec(l); return m ? m[1].split(",").map(x => x.trim()).filter(Boolean) : []; }
/** A field's or a part's rows, then its type: `ref holds fails(E) T`. */
function rowsOf(ty) {
  let holds = false, fails = [], ref = false;
  for (;;) { let k; if ((k = /^ref\s+/.exec(ty))) { ref = true; ty = ty.slice(k[0].length); } else if ((k = /^holds\b\s*/.exec(ty))) { holds = true; ty = ty.slice(k[0].length); } else if ((k = /^fails\(([^)]*)\)\s*/.exec(ty))) { fails = k[1].split(",").map(x => x.trim()).filter(Boolean); ty = ty.slice(k[0].length); } else break; }
  return { holds, fails, ref, ty };
}
/** A declared tuple result's parts (MO-10b): `[ref any, (v: any) => void]`, by index. */
function partsOf(t) {
  const body = t.trim().slice(1, matching(t.trim(), 0));
  return splitTop(body).map((x, i) => { const r = rowsOf(x.trim()); return { path: [String(i)], holds: r.holds, fails: r.fails, ref: r.ref }; });
}
/** The index of the bracket closing the one at `i`. */
function matching(s, i) {
  let d = 0;
  for (let j = i; j < s.length; j++) { if ("({[<".includes(s[j])) d++; else if (")}]>".includes(s[j]) && !(s[j] === ">" && s[j - 1] === "=")) { if (--d === 0) return j; } }
  return s.length;
}
/** `a, b` at depth 0. */
function splitTop(s) {
  const out = []; let d = 0, from = 0;
  for (let j = 0; j < s.length; j++) { const c = s[j]; if ("({[<".includes(c)) d++; else if (")}]>".includes(c) && !(c === ">" && s[j - 1] === "=")) d--; else if ((c === "," || c === ";") && d === 0) { out.push(s.slice(from, j)); from = j + 1; } }
  out.push(s.slice(from)); return out.filter(x => x.trim());
}
/** A declared record result's fields, as paths: `{ data: holds fails(Error) any; at: { x: number } }` gives
 *  [{ path: ["data"], holds: true, fails: ["Error"] }, { path: ["at", "x"], … }]: what each read may do (MO-10f). */
function fieldsOf(t, pre = []) {
  const body = t.trim().slice(1, matching(t.trim(), 0));
  const out = [];
  for (const f of splitTop(body)) {
    const m = /^\s*([A-Za-z_$][\w$]*)\??\s*:\s*([\s\S]*)$/.exec(f); if (!m) continue;
    const { holds, fails, ref, ty } = rowsOf(m[2].trim());
    const path = [...pre, m[1]];
    if (ty.startsWith("{") && !holds && !fails.length && !ref) out.push(...fieldsOf(ty, path)); else out.push({ path, holds, fails, ref });
  }
  return out;
}

/** Mount `hook(...args)` under the probe's providers and an errored boundary; read each field in a render effect. */
async function mount(dir, mod, probeMod, hook, args, fields, run, provide = probeMod?.provide) {
  const from = p => pathToFileURL(require.resolve(p, { paths: [dir, __dirname] })).href;
  const s = await import(from("solid-js"));
  const { createRenderer } = await import(from("@solidjs/universal"));
  const n = { createElement: t => ({ t, c: [] }), createTextNode: x => ({ x }), replaceText: (a, v) => { a.x = v; }, isTextNode: a => "x" in a, setProperty() {}, insertNode: (p, a) => { (p.c ??= []).push(a); a.p = p; }, removeNode: (p, a) => { p.c = (p.c ?? []).filter(y => y !== a); }, getParentNode: a => a.p, getFirstChild: a => a.c?.[0], getNextSibling: () => undefined };
  const R = createRenderer(n);
  const seen = new Map(fields.map(f => [f.path.join("."), { pending: false, value: false, failed: null, notAccessor: false }]));
  let boundary = null, result, runError = null;
  const Probe = () => {
    const r = (result = hook(...args));
    for (const f of fields) {
      const k = f.path.join("."), st = seen.get(k);
      s.createRenderEffect(() => { try { let v = r; for (const p of f.path) v = v?.[p]; if (f.ref) { if (typeof v !== "function") { st.notAccessor = true; return { v }; } v = v(); } return { v }; } catch (e) { if (e?.name === "NotReadyError" || e?.constructor?.name === "NotReadyError") { st.pending = true; throw e; } return { e }; } },
        x => { if ("e" in x) st.failed = x.e; else st.value = true; });
    }
    return null;
  };
  const errored = () => s.createComponent(s.Errored, { fallback: e0 => { boundary = typeof e0 === "function" ? e0() : e0; return null; }, get children() { return s.createComponent(Probe, {}); } });
  let dispose = () => {}, renderError = null;   // a provider that throws as it mounts (props the probe did not give)
  try { dispose = R.render(() => provide ? provide(errored, s) : errored(), { t: "root", c: [] }); } catch (e) { renderError = e; return { seen, boundary, runError, renderError }; }
  for (let i = 0; i < 20; i++) { s.flush(); await new Promise(r => setTimeout(r, 10)); if ([...seen.values()].every(x => x.value || x.failed) || boundary) break; }
  if (run) { try { await run(result); } catch (e) { runError = e; } }
  dispose();
  return { seen, boundary, runError, renderError };
}

async function verify(file) {
  const base = file.slice(0, -".d.rx".length);
  const js = JS.map(x => base + x).find(f => fs.existsSync(f));
  if (!js) return [{ line: 1, status: "fail", what: `no JS module beside ${path.basename(file)}` }];
  const mod = await import(pathToFileURL(path.resolve(js)).href);
  const probeFile = [".probe.mjs", ".probe.js"].map(x => base + x).find(f => fs.existsSync(f));
  const probeMod = probeFile ? await import(pathToFileURL(path.resolve(probeFile)).href) : null;
  const dir = path.dirname(path.resolve(js));
  const { createRoot } = await import(pathToFileURL(require.resolve("solid-js", { paths: [path.dirname(path.resolve(js))] })).href);
  const out = [];
  for (const x of exportsOf(fs.readFileSync(file, "utf8"))) {
    const v = mod[x.name];
    if (v === undefined) { out.push({ line: x.line, status: "fail", what: `${x.name}: ${path.basename(js)} exports nothing by that name` }); continue; }
    if (x.kind === "error") { const ok = typeof v === "function" && v.prototype instanceof Error; out.push({ line: x.line, status: ok ? "ok" : "fail", what: `${x.name}: ${ok ? "an Error subclass" : "declared an error, but is not an Error subclass"}` }); continue; }
    if (typeof v !== "function") { out.push({ line: x.line, status: "fail", what: `${x.name}: declared a ${x.kind}, but is a ${typeof v}` }); continue; }
    const probe = probeMod?.probes?.[x.name];
    if (x.kind === "fn" && x.uses) {
      if (x.required && !probe?.args) out.push({ line: x.line, status: "unverified", what: `${x.name}: uses(…) not run, it needs ${x.required} argument${x.required > 1 ? "s" : ""} (give them in a probe)` });
      else {
        let threw = null, dispose = () => {}, result;
        createRoot(d => { dispose = d; try { result = v(...(probe?.args?.() ?? [])); } catch (e) { threw = e; } });
        if (!threw && probe?.run) { try { await probe.run(result); } catch (e) { threw = e; } }   // a hook that reads its context lazily: the probe uses what it gave
        dispose();
        // the control: under its providers, the same `run` must not throw, or the probe (not the row) is what failed
        const control = threw && probe?.run && probeMod?.provide ? (await mount(dir, mod, probeMod, v, probe.args?.() ?? [], [], probe.run)).runError : null;
        if (control) out.push({ line: x.line, status: "unverified", what: `${x.name}: the probe's run throws under its providers too (${String(control.message || control).slice(0, 60)}): fix the probe` });
        else out.push(threw ? { line: x.line, status: "ok", what: `${x.name}: uses(…) holds: with no provider it throws (${String(threw.message || threw.name || threw).slice(0, 60)})` }
          : { line: x.line, status: "fail", what: `${x.name}: declared uses(…), but called with no provider it does not throw: does it read a context?` });
      }
      if (!x.fields) continue;
    }
    if (x.kind === "fn" && x.fields && (probe?.args || !x.required)) {
      const fails = x.fields.filter(f => f.fails.length);
      const ran = await mount(dir, mod, probeMod, v, probe?.args?.() ?? [], x.fields);
      // what failed only for want of a browser (no `window` here) is no evidence either way: run with --dom
      const envErr = [ran.boundary, ...x.fields.map(f => ran.seen.get(f.path.join(".")).failed)].find(environmental);
      if (envErr) { out.push({ line: x.line, status: "unverified", what: `${x.name}: not run: it needs a browser (${String(envErr.message ?? envErr).slice(0, 40)}); run rx-verify with --dom` }); continue; }
      const bad = [];
      for (const f of x.fields) {
        const st = ran.seen.get(f.path.join("."));
        if (st.pending && !f.holds) bad.push(`${f.path.join(".")} holds (its first read is not ready), and is not declared holds`);
        if (st.notAccessor) bad.push(`${f.path.join(".") || "the result"} is declared ref, but is not an accessor (a function)`);
        if (st.failed && !f.fails.length) bad.push(`${f.path.join(".")} fails (${String(st.failed?.message ?? st.failed).slice(0, 40)}), and is not declared fails(…)`);
      }
      if (ran.boundary && !fails.length && !(ran.boundary?.name === "NotReadyError")) bad.push(`it fails into the errored boundary (${String(ran.boundary?.message ?? ran.boundary).slice(0, 40)}), and no field is declared fails(…)`);
      const held = x.fields.filter(f => f.holds).map(f => f.path.join("."));
      const heldSeen = held.filter(k => ran.seen.get(k).pending);
      out.push(bad.length ? { line: x.line, status: "fail", what: `${x.name}: ${bad.join("; ")}` }
        : { line: x.line, status: "ok", what: `${x.name}: its fields read as declared${heldSeen.length ? ` (${heldSeen.join(", ")} held, then answered)` : ""}` });
      if (fails.length) {
        if (!probe?.fail) out.push({ line: x.line, status: "unverified", what: `${x.name}: fails(…) not run (give failing arguments as the probe's fail)` });
        else {
          const r2 = await mount(dir, mod, probeMod, v, probe.fail(), x.fields);
          const got = r2.boundary ?? fails.map(f => r2.seen.get(f.path.join(".")).failed).find(Boolean);
          const classes = [...new Set(fails.flatMap(f => f.fails))];
          const ok = got && classes.some(c => c === "Error" ? got instanceof Error : typeof mod[c] === "function" && got instanceof mod[c]);
          out.push(ok ? { line: x.line, status: "ok", what: `${x.name}: under the failing arguments it fails with ${got.constructor?.name ?? "an error"}, as declared` }
            : { line: x.line, status: "fail", what: `${x.name}: under the failing arguments ${got ? `it fails with ${got.constructor?.name}, not ${classes.join(" or ")}` : "nothing fails"}` });
        }
      }
      continue;
    }
    // pure (MO-8): with the same arguments, two calls answer alike (promises awaited); a fn that makes something is not run
    if (x.kind === "fn" && x.pure && !x.inst && !x.uses && (probe?.args || !x.required)) {
      let a, b, threw = null;
      createRoot(d => { try { a = v(...(probe?.args?.() ?? [])); b = v(...(probe?.args?.() ?? [])); } catch (e) { threw = e; } d(); });
      try { [a, b] = await Promise.all([a, b]); } catch (e) { threw ??= e; }
      out.push(threw ? { line: x.line, status: "unverified", what: `${x.name}: pure not run: it threw (${String(threw.message ?? threw).slice(0, 50)})` }
        : same(a, b) ? { line: x.line, status: "ok", what: `${x.name}: pure: two calls with the same arguments answer alike` }
        : { line: x.line, status: "fail", what: `${x.name}: declared pure, but two calls with the same arguments answer differently (${show(a)} then ${show(b)})` });
      continue;
    }
    // provides(c) (MO-12c): under the component, a hook of the same file that uses only what it provides runs cleanly
    if (x.kind === "component" && x.providesNames.length) {
      const all = exportsOf(fs.readFileSync(file, "utf8"));
      const hook = all.find(h => h.kind === "fn" && h.usesNames.length && h.usesNames.every(c => x.providesNames.includes(c)) && (probeMod?.probes?.[h.name]?.args || !h.required) && typeof mod[h.name] === "function");
      if (!hook) { out.push({ line: x.line, status: "unverified", what: `${x.name}: provides(…) not run: no hook in this file uses only what it provides (with a probe's arguments if it needs any)` }); continue; }
      const props = probe?.props?.() ?? {};
      const wrap = (children, sol) => sol.createComponent(v, Object.defineProperty({ ...props }, "children", { get: () => children(), enumerable: true }));
      const ran = await mount(dir, mod, probeMod, mod[hook.name], probeMod?.probes?.[hook.name]?.args?.() ?? [], [], null, wrap);
      if (ran.renderError) { out.push({ line: x.line, status: "unverified", what: `${x.name}: provides(…) not run: it threw as it mounted (${String(ran.renderError.message ?? ran.renderError).slice(0, 50)}); give its props as the probe's props` }); continue; }
      out.push(ran.boundary && ran.boundary?.name !== "NotReadyError" ? { line: x.line, status: "fail", what: `${x.name}: declared provides(${x.providesNames.join(", ")}), but ${hook.name} under it still fails (${String(ran.boundary.message ?? ran.boundary).slice(0, 60)})` }
        : { line: x.line, status: "ok", what: `${x.name}: provides(…) holds: ${hook.name} runs under it` });
      continue;
    }
    const left = [x.pure && "pure", x.holds && "holds/fails", x.provides && "provides"].filter(Boolean);
    out.push({ line: x.line, status: left.length ? "unverified" : "ok", what: `${x.name}: a ${x.kind}${left.length ? `; ${left.join(", ")} not run (${x.inst && x.pure ? "it makes something each call: two calls are not alike by design" : "it needs what the app passes: give it in a probe"})` : ""}` });
  }
  return out;
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

(async () => {
  const dom = process.argv.includes("--dom");
  const files = process.argv.slice(2).filter(a => a !== "--dom");
  if (dom) {   // a browser's globals, from happy-dom, resolved from the project: its hooks then run as in a page
    let reg;
    try { reg = require(require.resolve("@happy-dom/global-registrator", { paths: [process.cwd(), __dirname] })); }
    catch { process.stderr.write("rx-verify --dom: install @happy-dom/global-registrator in the project\n"); process.exit(2); }
    reg.GlobalRegistrator.register({ url: "http://localhost/" });
  }
  if (!files.length) { process.stderr.write("usage: rx-verify <file.d.rx>...\n"); process.exit(2); }
  let fails = 0;
  for (const f of files) {
    for (const r of await verify(f)) {
      if (r.status === "fail") fails++;
      process.stdout.write(`${path.relative(process.cwd(), f)}:${r.line} ${r.status === "ok" ? "ok        " : r.status === "fail" ? "MISMATCH  " : "unverified"} ${r.what}\n`);
    }
  }
  process.exit(fails ? 1 : 0);
})();
