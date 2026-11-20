// rx-verify's placement and draft checks (09 MO-11r, MO-10i): the rows that say where a library renders the components a
// program gives it, and which callback parameters are its drafts, checked by running the library.
//
// Placement needs a scene: the probe file (`lib.probe.mjs`) exports `scene(lib, h)`, which builds a small app from `lib`
// (the module's exports, instrumented) and returns a view to mount (`() => h.s.createComponent(lib.RouterProvider, …)`).
// `h.component(name, inner?)` makes a component that records where it renders; give those to the library where a program
// would give its own. Every recording component, and every JS component a row names (a made component, a component whose
// prop renders what a value carries, an outlet), provides the chain of recording ids above it through one context, so
// where a component renders is read the way Solid itself finds a context: up its owners. Then each row is checked:
//   - a fn handing back a Component: what it was given renders inside the made component;
//   - `renders`: inside the component that called the fn;   `renders(root, …)`: not inside it;
//   - `renders(later)`: inside a JS component whose prop is declared `renders T`;
//   - `nests(children in component)`: each entry's component inside its record's component;
//   - `nests(component under parent)`: each value's component inside its parent value's component, at an `outlet`.
// A row whose components the scene never renders is not verified, and says so. `draft` rows need no scene: the fn is
// called (with the probe's `args`, else `{}`), and a draft callback must be handed an object whose writes the library keeps.

/** The placement rows and draft rows of a `.d.rx`, per declaration line. */
function rowsOf(text) {
  const fns = [], comps = [];
  text.split("\n").forEach((l0, i) => {
    const l = l0.replace(/\/\/.*$/, "");
    let m;
    if ((m = /^\s*export\s+(?:server\s+|client\s+)?(?:pure\s+)?fn\s+([A-Za-z_$][\w$]*)/.exec(l))) {
      const nestsIn = /\bnests\(\s*([\w$]+)\s+in\s+([\w$]+)\s*\)/.exec(l), nestsUnder = /\bnests\(\s*([\w$]+)\s+under\s+([\w$]+)\s*\)/.exec(l);
      const mode = /\brenders\(\s*later\s*\)/.test(l) ? "later" : /\brenders\(\s*root\b/.test(l) ? "root" : /\brenders\b(?!\s*\()/.test(l.replace(/:\s*renders\s/g, "")) ? "here" : /\)\s*:\s*Component\b/.test(l) ? "factory" : null;
      // draft callbacks: in a parameter (`(update: (draft s: T) => …)`) or in a function part of a tuple result
      const draftPart = (() => { const r = /\)\s*:\s*\[(.*)\]\s*(?:$|\b(?:uses|provides|renders|nests|instantiates)\b)/.exec(l); if (!r) return -1; let d = 0, from = 0, idx = 0; const t = r[1]; for (let j = 0; j <= t.length; j++) { const c = t[j]; if (j === t.length || (c === "," && d === 0)) { if (/\(\s*draft\s+[\w$]/.test(t.slice(from, j))) return idx; idx++; from = j + 1; } else if ("([{<".includes(c)) d++; else if (")]}".includes(c) || (c === ">" && t[j - 1] !== "=")) d--; } return -1; })();
      if (mode || nestsIn || nestsUnder || draftPart >= 0) fns.push({ name: m[1], line: i + 1, mode, nestsIn: nestsIn && { kids: nestsIn[1], inside: nestsIn[2] }, nestsUnder: nestsUnder && { inside: nestsUnder[1], parent: nestsUnder[2] }, draftPart });
    } else if ((m = /^\s*export\s+component\s+([A-Za-z_$][\w$.]*)\s*\(/.exec(l))) {
      const carried = [...l.matchAll(/([\w$]+)\??\s*:\s*renders\s/g)].map(x => x[1]);
      comps.push({ name: m[1], line: i + 1, outlet: /\boutlet\b/.test(l.slice(l.lastIndexOf(")"))), carried });
    }
  });
  return { fns, comps };
}

/** Walk a value for the recording components in it (records, arrays; a cycle or depth stops it). */
function componentsIn(v, known, out = new Set(), seen = new Set(), depth = 0) {
  if (typeof v === "function" && known.has(v)) { out.add(known.get(v)); return out; }
  if (!v || typeof v !== "object" || seen.has(v) || depth > 6) return out;
  seen.add(v);
  for (const x of Array.isArray(v) ? v : Object.values(v)) componentsIn(x, known, out, seen, depth + 1);
  return out;
}

async function verifyPlacement({ text, mod, probeMod, dir, resolve }) {
  const { fns, comps } = rowsOf(text);
  const out = [];
  if (!fns.length && !comps.some(c => c.outlet || c.carried.length)) return out;
  const s = await import(resolve("solid-js"));
  // drafts first: they need no scene
  for (const f of fns.filter(f => f.draftPart >= 0)) {
    const fn = mod[f.name]; if (typeof fn !== "function") continue;
    const args = probeMod?.probes?.[f.name]?.args?.() ?? [{}];
    let seen, kept = false, err = null;
    s.createRoot(dispose => {
      try {
        const r = fn(...args); const setter = Array.isArray(r) ? r[f.draftPart] : undefined;
        if (typeof setter !== "function") throw new Error(`its result's part ${f.draftPart} is not a function`);
        setter(d => { seen = d; if (d && typeof d === "object") d.__rxVerifyDraft = 1; });
        s.flush?.();
        const store = r.find((x, i) => i !== f.draftPart && x && typeof x === "object");
        kept = store ? store.__rxVerifyDraft === 1 : true;
      } catch (e) { err = e; }
      dispose();
    });
    out.push(err ? { line: f.line, status: "unverified", what: `${f.name}: draft not run (${String(err.message ?? err).slice(0, 60)}); give its arguments in a probe` }
      : !seen || typeof seen !== "object" ? { line: f.line, status: "fail", what: `${f.name}: declared a draft callback, but the callback is handed ${seen === undefined ? "nothing" : typeof seen}, not an object to change (MO-10i)` }
      : !kept ? { line: f.line, status: "fail", what: `${f.name}: declared a draft callback, but a write to what it is handed is not kept (MO-10i)` }
      : { line: f.line, status: "ok", what: `${f.name}: draft holds: its callback is handed an object, and a write to it is kept` });
  }
  const placing = fns.filter(f => f.mode || f.nestsIn || f.nestsUnder);
  const siteComps = comps.filter(c => c.outlet || c.carried.length);
  if (!placing.length && !siteComps.length) return out;
  if (process.env.RXV_DEBUG) require("node:fs").writeSync(2, "[rx-verify] scene\n");
  if (typeof probeMod?.scene !== "function") {
    for (const f of placing) out.push({ line: f.line, status: "unverified", what: `${f.name}: where it renders what it is given is not run: give a scene in the probe (scene(lib, h))` });
    for (const c of siteComps) out.push({ line: c.line, status: "unverified", what: `${c.name}: ${c.outlet ? "outlet" : "renders"} not run: give a scene in the probe` });
    return out;
  }
  // the instrumentation: one context carries the chain of recording ids above wherever something renders
  const MARK = s.createContext(null);
  const chains = new Map();   // recording id → the chain of ids above it, as rendered (the last render)
  const known = new Map();    // recording component → its name
  let seq = 0;
  const mark = (id, render) => props => { const chain = [...(s.useContext(MARK) ?? []), id]; chains.set(id, chain); return s.createComponent(MARK, { value: chain, get children() { return render(props); } }); };
  const h = { s, component: (name, inner) => { const C = mark(name, props => inner ? inner(props) : null); known.set(C, name); return C; } };
  const calls = [];           // { fn, args, result, caller (the chain where it was called), made (a made component's id) }
  const sites = new Map();    // JS component name → the recording ids of its renders (outlet, renders-prop components)
  const lib = new Proxy(mod, { get(t, k) {
    const v = t[k]; if (typeof k !== "string" || typeof v !== "function") return v;
    const site = siteComps.find(c => c.name === k);
    if (site) return mark(`${k}#site`, props => { sites.set(k, [...new Set([...(sites.get(k) ?? []), `${k}#site`])]); return s.createComponent(v, props); });
    const f = placing.find(x => x.name === k);
    if (!f) return v;
    return (...args) => {
      const rec = { fn: k, row: f, args, caller: [...(s.useContext(MARK) ?? [])] };
      let result = v(...args);
      if (f.mode === "factory" && typeof result === "function") { const id = `${k}#made${++seq}`; const made = result; rec.made = id; result = mark(id, props => s.createComponent(made, props)); }
      rec.result = result; calls.push(rec); return result;
    };
  } });
  // members (`Dialog.Trigger`) of an object a row names
  for (const c of siteComps.filter(c => c.name.includes("."))) { const [o, p] = c.name.split("."); if (mod[o]?.[p]) { /* reached through lib[o][p]: not instrumented here */ } }
  let dispose = () => {}, renderError = null;
  try {
    const view = await probeMod.scene(lib, h);
    if (typeof document !== "undefined" && document.body) {
      const web = await import(resolve("@solidjs/web"));
      const el = document.createElement("div"); document.body.appendChild(el);
      dispose = web.render(view, el);
    } else {
      const { createRenderer } = await import(resolve("@solidjs/universal"));
      const n = { createElement: t => ({ t, c: [] }), createTextNode: x => ({ x }), replaceText: (a, v) => { a.x = v; }, isTextNode: a => "x" in a, setProperty() {}, insertNode: (p, a) => { (p.c ??= []).push(a); a.p = p; }, removeNode: (p, a) => { p.c = (p.c ?? []).filter(y => y !== a); }, getParentNode: a => a.p, getFirstChild: a => a.c?.[0], getNextSibling: () => undefined };
      dispose = createRenderer(n).render(view, { t: "root", c: [] });
    }
  } catch (e) { renderError = e; }
  for (let i = 0; i < 40; i++) { s.flush?.(); await new Promise(r => setTimeout(r, 15)); }
  if (probeMod.act) { try { await probeMod.act(lib, h); } catch {} for (let i = 0; i < 40; i++) { s.flush?.(); await new Promise(r => setTimeout(r, 15)); } }
  if (renderError) {
    for (const f of placing) out.push({ line: f.line, status: "unverified", what: `${f.name}: the scene threw as it rendered (${String(renderError.message ?? renderError).slice(0, 60)})` });
    dispose(); return out;
  }
  const rendered = name => chains.get(name);
  const under = (name, id) => !!rendered(name)?.slice(0, -1).includes(id);
  const valueOf = rec => rec.result;
  for (const f of placing) {
    const recs = calls.filter(r => r.fn === f.name);
    if (!recs.length) { out.push({ line: f.line, status: "unverified", what: `${f.name}: the scene does not call it` }); continue; }
    const bad = [], good = [], unseen = new Set();
    for (const r of recs) {
      const given = [...componentsIn(r.args, known)];
      // nests(component under parent): each value's component inside its parent value's component, at an outlet
      if (f.nestsUnder) {
        const a = r.args.find(x => x && typeof x === "object" && f.nestsUnder.inside in x);
        const child = a && known.get(a[f.nestsUnder.inside]);
        let pv = a?.[f.nestsUnder.parent]; if (typeof pv === "function") { try { pv = pv(); } catch { pv = undefined; } }
        const pr = calls.find(x => valueOf(x) === pv);
        const pa = pr?.args.find(x => x && typeof x === "object" && f.nestsUnder.inside in x);
        const parent = pa && known.get(pa[f.nestsUnder.inside]);
        if (child && parent) {
          if (!rendered(child)) unseen.add(child);
          else if (!under(child, parent)) bad.push(`${child} renders outside its parent's ${parent}`);
          else { const outlets = siteComps.filter(c => c.outlet).map(c => `${c.name}#site`); const ch = rendered(child); const pi = ch.indexOf(parent); if (outlets.length && !ch.slice(pi + 1).some(id => outlets.includes(id))) bad.push(`${child} renders inside ${parent}, but not at an outlet`); else good.push(`${child} inside ${parent}${outlets.length ? ", at its outlet" : ""}`); }
        }
      }
      // nests(children in component): each entry's component inside its record's component
      if (f.nestsIn) {
        const walk = v => { if (!v || typeof v !== "object") return; if (Array.isArray(v)) return v.forEach(walk); const host = known.get(v[f.nestsIn.inside]); if (host) for (const k of [].concat(v[f.nestsIn.kids] ?? [])) { const kid = k && known.get(k[f.nestsIn.inside]); if (kid) { if (!rendered(kid)) unseen.add(kid); else if (under(kid, host)) good.push(`${kid} inside ${host}`); else bad.push(`${kid} renders outside ${host}`); } } Object.values(v).forEach(x => typeof x === "object" && walk(x)); };
        r.args.forEach(walk);
      }
      for (const c of given) {
        if (!rendered(c)) { unseen.add(c); continue; }
        if (f.mode === "factory" && r.made) { if (!under(c, r.made)) bad.push(`${c} renders outside the component ${f.name} made`); else good.push(`${c} inside the made component`); }
        if (f.mode === "here" && r.caller.length) { if (!under(c, r.caller[r.caller.length - 1])) bad.push(`${c} renders outside where ${f.name} was called`); else good.push(`${c} where it was called`); }
        if (f.mode === "root" && r.caller.length) { if (under(c, r.caller[r.caller.length - 1])) bad.push(`${c} renders inside where ${f.name} was called, not under a root of the library's own`); else good.push(`${c} under a root of its own`); }
        if (f.mode === "later") { const ids = siteComps.filter(sc => sc.carried.length).map(sc => `${sc.name}#site`); if (!ids.some(id => under(c, id))) bad.push(`${c} renders outside every component whose prop renders what a value carries`); else good.push(`${c} inside ${rendered(c).find(id => ids.includes(id)).replace("#site", "")}`); }
      }
    }
    if (bad.length) out.push({ line: f.line, status: "fail", what: `${f.name}: ${[...new Set(bad)].join("; ")}` });
    else if (good.length) out.push({ line: f.line, status: "ok", what: `${f.name}: placement holds: ${[...new Set(good)].slice(0, 4).join("; ")}${unseen.size ? ` (not rendered by the scene: ${[...unseen].join(", ")})` : ""}` });
    else out.push({ line: f.line, status: "unverified", what: `${f.name}: the scene renders none of what it gives it${unseen.size ? ` (${[...unseen].join(", ")})` : ""}` });
  }
  for (const c of siteComps) {
    const ids = sites.get(c.name);
    out.push(ids ? { line: c.line, status: "ok", what: `${c.name}: rendered by the scene, its ${c.outlet ? "outlet" : "renders prop"} checked with the rows above` } : { line: c.line, status: "unverified", what: `${c.name}: the scene does not render it` });
  }
  dispose();
  return out;
}

/** Render `view` (the browser build when there is a document, as with --dom; else a universal renderer); what it threw
 *  or warned while rendering, synchronously. */
async function renderOnce(view, resolve) {
  const s = await import(resolve("solid-js"));
  const warned = [], saved = [console.warn, console.error];
  console.warn = console.error = (...a) => { warned.push(a.map(String).join(" ")); };
  let error = null, dispose = () => {};
  try {
    const wrapped = () => s.createComponent(s.Errored, { fallback: e => { error ??= typeof e === "function" ? e() : e; return null; }, get children() { return view(); } });
    if (typeof document !== "undefined" && document.body) { const web = await import(resolve("@solidjs/web")); const el = document.createElement("div"); document.body.appendChild(el); dispose = web.render(wrapped, el); }
    else { const { createRenderer } = await import(resolve("@solidjs/universal")); const n = { createElement: t => ({ t, c: [] }), createTextNode: x => ({ x }), replaceText: (a, v) => { a.x = v; }, isTextNode: a => "x" in a, setProperty() {}, insertNode: (p, a) => { (p.c ??= []).push(a); a.p = p; }, removeNode: (p, a) => { p.c = (p.c ?? []).filter(y => y !== a); }, getParentNode: a => a.p, getFirstChild: a => a.c?.[0], getNextSibling: () => undefined }; dispose = createRenderer(n).render(wrapped, { t: "root", c: [] }); }
    // flushed synchronously and disposed before yielding: a context a component reads, it reads as it renders, and a
    // component left mounted with nothing above it can keep scheduling work (TanStack's Outlet with no router does)
    for (let i = 0; i < 5; i++) s.flush?.();
  } catch (e) { error ??= e; }
  finally { try { dispose(); } catch {} [console.warn, console.error] = saved; }
  return { error, warned };
}

/** MO-12b for a component (a kit's compound part, `Dialog.Trigger … uses(dialog)`): rendered alone it must fail or warn,
 *  and rendered inside a component of the same file that provides what it uses, it must not. Props come from the probe
 *  (`probes["Dialog.Trigger"].props()`), else none; `probes[Provider].around(children, s)` renders it inside the provider
 *  where its children prop would not reach (a router renders its routes, not its children). */
async function verifyComponentUses({ comps, at, probeMod, resolve }) {
  const out = [];
  const s = await import(resolve("solid-js"));
  const propsOf = n => probeMod?.probes?.[n]?.props?.() ?? {};
  for (const c of comps.filter(c => c.usesNames?.length)) { if (process.env.RXV_DEBUG) require("node:fs").writeSync(2, `[rx-verify] uses of ${c.name}\n`);
    const C = at(c.name); if (typeof C !== "function") continue;
    const alone = await renderOnce(() => s.createComponent(C, propsOf(c.name)), resolve);
    if (!alone.error && !alone.warned.length) { out.push({ line: c.line, status: "fail", what: `${c.name}: declared uses(${c.usesNames.join(", ")}), but rendered with no provider it neither fails nor warns` }); continue; }
    const prov = comps.find(p => p !== c && p.providesNames?.length && c.usesNames.every(u => p.providesNames.includes(u)) && typeof at(p.name) === "function");
    if (!prov) { out.push({ line: c.line, status: "ok", what: `${c.name}: uses(…) holds: rendered with no provider it ${alone.error ? "fails" : "warns"} (no provider in this file to render it under)` }); continue; }
    const P = at(prov.name);
    // inside it: as its children, or as the probe says (`probes.RouterProvider.around(children, s)`, for a provider that
    // renders something else than its children: a router renders its routes)
    const around = probeMod?.probes?.[prov.name]?.around;
    const part = () => s.createComponent(C, propsOf(c.name));
    const inside = await renderOnce(() => around ? around(part, s) : s.createComponent(P, Object.defineProperty({ ...propsOf(prov.name) }, "children", { get: part, enumerable: true })), resolve);
    out.push(inside.error ? { line: c.line, status: "fail", what: `${c.name}: inside ${prov.name}, which declares provides(${prov.providesNames.join(", ")}), it still fails (${String(inside.error.message ?? inside.error).slice(0, 50)})` }
      : { line: c.line, status: "ok", what: `${c.name}: uses(…) holds: it ${alone.error ? "fails" : "warns"} alone and renders inside ${prov.name}` });
  }
  return out;
}

/** MO-10g: a closure passed where a fn's declaration types a parameter as a function (or a record parameter's field) is
 *  checked as a handler: imperative scope, untracked. Running the fn with the probe's arguments, each such callback is
 *  wrapped in a spy; the probe's `run(result)` or `act(result)` makes the library call it (a debounce's returned fn, a
 *  mutation's mutate). A callback the library calls inside a computation (Solid's `getObserver()` is set) is a mismatch:
 *  its reads would track and its writes land in owned scope. One it calls outside one holds; one it never calls is not
 *  verified. */
async function verifyCallbacks({ fns, at, probeMod, resolve, mount }) {
  const out = [];
  const s = await import(resolve);
  for (const f of fns) {
    const fn = at(f.name); const probe = probeMod?.probes?.[f.name];
    if (typeof fn !== "function") continue;
    if (!probe?.args) { out.push({ line: f.line, status: "unverified", what: `${f.name}: callback${f.cbs.length > 1 ? "s" : ""} ${f.cbs.map(c => c.name).join(", ")} not run: give its arguments in a probe` }); continue; }
    const seen = new Map(f.cbs.map(c => [c.name, { calls: 0, tracked: 0 }]));
    const spy = (c, g) => typeof g !== "function" ? g : (...a) => { const st = seen.get(c.name); st.calls++; if (s.getObserver?.()) st.tracked++; return g(...a); };
    const wrapRec = (cs, v) => { if (!v || typeof v !== "object") return v; const o = { ...v }; for (const c of cs) if (c.field in o) o[c.field] = spy(c, o[c.field]); return o; };
    const args = probe.args().slice();
    const byIndex = new Map(); for (const c of f.cbs) byIndex.set(c.index, [...byIndex.get(c.index) ?? [], c]);
    for (const [i, cs] of byIndex) {
      const direct = cs.find(c => !c.field);
      if (direct) args[i] = cs[0].ref && typeof args[i] === "function" && args[i].length === 0 ? args[i] : spy(direct, args[i]);
      else args[i] = cs[0].ref && typeof args[i] === "function" ? (orig => () => wrapRec(cs, orig()))(args[i]) : wrapRec(cs, args[i]);
    }
    // under the probe's providers and an errored boundary, as a hook is mounted; then its run and act, and time for what
    // the library schedules (a fetch's callback, a debounce)
    const settle = async () => { for (let i = 0; i < 10; i++) { s.flush?.(); await new Promise(r => setTimeout(r, 20)); } };
    const m = await mount(fn, args, async r => { await settle(); if (probe.run) await probe.run(r); if (probe.act) await probe.act(r); await settle(); });
    const err = m.renderError ?? m.boundary ?? m.runError;
    for (const c of f.cbs) {
      const st = seen.get(c.name);
      if (c.tracked) { out.push(st.tracked ? { line: f.line, status: "ok", what: `${f.name}: ${c.name} is tracked, as declared: the library calls it inside a computation (MO-10j)` }
        : st.calls ? { line: f.line, status: "ok", what: `${f.name}: ${c.name} is declared tracked, but the library calls it outside tracking: a handler would do (stricter than needed)` }
        : { line: f.line, status: "unverified", what: `${f.name}: callback ${c.name} never called by the probe: give an act that makes the library call it` }); continue; }
      out.push(st.tracked ? { line: f.line, status: "fail", what: `${f.name}: the library calls ${c.name} inside a computation (tracked), but a closure there is checked as a handler (MO-10g): its reads would be tracked by the library and its writes refused by Solid: write \`${c.field ?? c.name.split(".").pop()}: tracked (…) => …\` (MO-10j)` }
        : st.calls ? { line: f.line, status: "ok", what: `${f.name}: callback ${c.name} holds: the library calls it outside tracking, as a handler` }
        : { line: f.line, status: "unverified", what: `${f.name}: callback ${c.name} never called by the probe${err ? ` (it threw: ${String(err.message ?? err).slice(0, 40)})` : ""}: give an act that makes the library call it` });
    }
  }
  return out;
}

module.exports = { verifyPlacement, verifyComponentUses, verifyCallbacks, rowsOf };
