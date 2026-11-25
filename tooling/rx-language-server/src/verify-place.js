// rx-verify's placement and draft checks (09 MO-11r, MO-10i): the rows that say where a library renders the components a
// program gives it, and which callback parameters are its drafts, checked by running the library.
//
// Placement needs a scene: the probe file (`lib.probe.mjs`) exports `scene(lib, h)`, which builds a small app from `lib`
// (the module's exports, instrumented) and returns a view to mount (`() => h.s.createComponent(lib.RouterProvider, …)`).
// `h.component(name, inner?)` makes a component that records where it renders; give those to the library where a program
// would give its own. Every recording component, and every component a declared factory made, provides the chain of
// recording ids above it through one context, so where a component renders is read the way Solid itself finds a
// context: up its owners. Then each row is checked:
//   - a fn handing back a Component: what it was given renders inside the made component;
//   - `nests(children in component)`: each entry's component inside its record's component;
//   - `renders(H)` (MO-11u): what the fn was given renders beneath an application of H, the file's own component
//     (every application of H in the scene is recorded, as a made component is);
//   - a component's prop whose type is, or holds, a `Component` (MO-11c, DV-24): what the prop was given renders
//     beneath that application of the component — one it mounts elsewhere, later, is a mismatch.
// And, for every fn the scene gives a recording component — a fn with no word too (MO-11s) — a component the library
// calls with no owner at all is reported: Solid's `useContext` throws there in development (NoOwnerError) and finds
// nothing above in production, and nothing it makes is ever
// disposed, which is less than the root of its own the cautious placement assumes.
// A row whose components the scene never renders is not verified, and says so. `draft` rows need no scene: the fn is
// called (with the probe's `args`, else `{}`), and a draft callback must be handed an object whose writes the library keeps.

const { render, settle, hushed, noRenderer } = require("./render.js");

/** The placement rows and draft rows among a declaration's rows (src/rows.js): a fn that hands back a component, one
 *  with `nests(…)` or `renders(H)`, one with no word and a `Component` among its parameters (`cautious`, MO-11s), one
 *  whose result has a part that hands its callback a draft (`draftPart`, the part's index or field); a component with
 *  props that take components (MO-11c: a `Component`, or a record or an array that holds one). */
function placementRows(rows) {
  const fns = [], comps = [];
  for (const row of rows) {
    const f = row.facts;
    if (row.kind === "fn") {
      const mode = f.shape === "comp" ? "factory" : null;
      const cautious = !mode && !f.nests && !f.renders && f.params.some(p => /\bComponent\b/.test(p.type ?? ""));
      const draftPart = f.parts.find(p => p.draft)?.path[0];
      if (mode || f.nests || f.renders || cautious || draftPart !== undefined) fns.push({ name: row.name, line: row.line, mode, nestsIn: f.nests, rendersIn: f.renders, cautious, draftPart, refs: f.params.flatMap((p, i) => p.ref ? [i] : []) });
    } else if (row.kind === "component") comps.push({ name: row.name, line: row.line, componentProps: f.props.filter(p => p.component || p.components).map(p => p.name) });
  }
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

async function verifyPlacement({ rows, mod, probeMod, solid: s, resolve }) {
  const { fns, comps } = placementRows(rows);
  const results = [], out = { push: r => results.push({ ob: "placement", ...r }) };
  const propComps = comps.filter(c => c.componentProps.length);   // MO-11c, DV-24: components given components in props
  if (!fns.length && !propComps.length) return results;
  // drafts first: they need no scene
  for (const f of fns.filter(f => f.draftPart !== undefined)) {
    const fn = mod[f.name]; if (typeof fn !== "function") continue;
    const args = probeMod?.probes?.[f.name]?.args?.() ?? [{}];
    let seen, kept = false, err = null;
    s.createRoot(dispose => {
      try {
        const r = fn(...args); const setter = r?.[f.draftPart];
        if (typeof setter !== "function") throw new Error(`its result's part ${f.draftPart} is not a function`);
        setter(d => { seen = d; if (d && typeof d === "object") d.__rxVerifyDraft = 1; });
        s.flush?.();
        const store = Object.entries(r).find(([k, x]) => k !== f.draftPart && x && typeof x === "object")?.[1];
        kept = store ? store.__rxVerifyDraft === 1 : true;
      } catch (e) { err = e; }
      dispose();
    });
    out.push(err ? { line: f.line, ob: "draft", status: "unverified", what: `${f.name}: draft not run (${String(err.message ?? err).slice(0, 60)}); give its arguments in a probe` }
      : !seen || typeof seen !== "object" ? { line: f.line, ob: "draft", status: "mismatch", what: `${f.name}: declared a draft callback, but the callback is handed ${seen === undefined ? "nothing" : typeof seen}, not an object to change (MO-10i)` }
      : !kept ? { line: f.line, ob: "draft", status: "mismatch", what: `${f.name}: declared a draft callback, but a write to what it is handed is not kept (MO-10i)` }
      : { line: f.line, ob: "draft", status: "held", what: `${f.name}: draft holds: its callback is handed an object, and a write to it is kept` });
  }
  const placing = fns.filter(f => f.mode || f.nestsIn || f.rendersIn);
  const watched = fns.filter(f => f.mode || f.nestsIn || f.rendersIn || f.cautious);   // every fn that is given components
  if (!watched.length && !propComps.length) return results;
  if (process.env.RXV_DEBUG) require("node:fs").writeSync(2, "[rx-verify] scene\n");
  if (typeof probeMod?.scene !== "function") {
    for (const f of placing) out.push({ line: f.line, status: "unverified", what: `${f.name}: where it renders what it is given is not run: give a scene in the probe (scene(lib, h))` });
    for (const c of propComps) out.push({ line: c.line, status: "unverified", what: `${c.name}: where it renders the component${c.componentProps.length > 1 ? "s" : ""} given as ${c.componentProps.join(", ")} is not run: give a scene in the probe (scene(lib, h)) that applies it with h.component(…) there (MO-11c, DV-24)` });
    return results;
  }
  // the instrumentation: one context carries the chain of recording ids above wherever something renders
  const MARK = s.createContext(null);
  const chains = new Map();   // recording id → the chain of ids above it, as rendered (the last render)
  const known = new Map();    // recording component → its name
  let seq = 0;
  const ownerless = new Set();   // recording ids rendered with no owner at all (MO-11s: less than a root of its own)
  const above = () => { try { return s.useContext(MARK) ?? []; } catch { return []; } };   // Solid 2 throws NoOwnerError with no owner
  const mark = (id, render) => props => {
    // called with no owner: nothing is above it, and a provider cannot be made there either
    if (s.getOwner && !s.getOwner()) { ownerless.add(id); chains.set(id, [id]); try { return render(props); } catch { return null; } }
    const chain = [...above(), id]; chains.set(id, chain); return s.createComponent(MARK, { value: chain, get children() { return render(props); } });
  };
  const h = { s, component: (name, inner) => { const C = mark(name, props => inner ? inner(props) : null); known.set(C, name); return C; } };
  const calls = [];           // { fn, args, result, caller (the chain where it was called), made (a made component's id) }
  // MO-11u, MO-11c: every application of a component a fn `renders(…)` beneath, or of one given components in its props —
  // each a recording id of its own (`Toaster#app1`), with what its component props were given
  const hostNames = new Set(placing.map(f => f.rendersIn).filter(Boolean));
  const tracked = name => hostNames.has(name) || propComps.some(c => c.name === name);
  const apps = [];            // { name, id, given: Map(prop → recording names) }
  const applied = (name, C) => props => {
    const id = `${name}#app${++seq}`; const pc = propComps.find(c => c.name === name); const given = new Map();
    for (const p of pc?.componentProps ?? []) { let v; try { v = s.untrack(() => props[p]); } catch {} given.set(p, [...componentsIn(v, known)]); }
    apps.push({ name, id, given });
    return mark(id, q => s.createComponent(C, q))(props);
  };
  // a member (`Toast.List`) is reached through its object, which may itself be a component
  const wrapped = (name, v) => {
    const members = [...hostNames, ...propComps.map(c => c.name)].some(n => n.startsWith(name + "."));
    if (!members) return tracked(name) && typeof v === "function" ? applied(name, v) : v;
    if (!v || (typeof v !== "object" && typeof v !== "function")) return v;
    const self = tracked(name) && typeof v === "function" ? applied(name, v) : null;
    return new Proxy(v, { get(t, k) { const x = t[k]; return typeof k === "string" ? wrapped(`${name}.${k}`, x) : x; }, ...(self ? { apply(_t, _th, a) { return self(...a); } } : {}) });
  };
  const lib = new Proxy(mod, { get(t, k) {
    const v = t[k]; if (typeof k !== "string") return v;
    if (tracked(k) || [...hostNames, ...propComps.map(c => c.name)].some(n => n.startsWith(k + "."))) return wrapped(k, v);
    // MO-8t: a method with a row of its own (`toaster.show`, `toast.success`) is recorded as a fn is, called on its object
    const methods = watched.filter(x => x.name.startsWith(k + "."));
    const recorded = (name, row, call) => (...args) => {
      const rec = { fn: name, row, args: args.map((a, i) => row.refs?.includes(i) && typeof a === "function" ? s.untrack(a) : a), caller: [...above()] };   // a `ref` argument is an accessor of what it is given
      let result = call(args);
      if (row.mode === "factory" && typeof result === "function") { const id = `${name}#made${++seq}`; const made = result; rec.made = id; result = mark(id, props => s.createComponent(made, props)); }
      rec.result = result; calls.push(rec); return result;
    };
    const withMethods = target => !methods.length ? target : new Proxy(target, { get(o, m) { const x = o[m]; const row = typeof m === "string" && typeof x === "function" ? methods.find(y => y.name === `${k}.${m}`) : undefined; return row ? recorded(row.name, row, args => x.apply(v, args)) : x; } });
    if (typeof v !== "function") return v && typeof v === "object" ? withMethods(v) : v;
    const f = watched.find(x => x.name === k);
    if (!f) return withMethods(v);
    return withMethods(Object.assign(recorded(k, f, args => v(...args)), v));   // with the fn's own members (`toast.custom`): the scene may call them, as an app does
  } });
  let dispose = () => {}, renderError = null;
  try {
    dispose = await render(await probeMod.scene(lib, h), resolve);
  } catch (e) { renderError = e; }
  await settle(s, 40, 15);
  if (probeMod.act) { try { await probeMod.act(lib, h); } catch {} await settle(s, 40, 15); }
  if (renderError) {
    for (const f of placing) out.push({ line: f.line, status: "unverified", what: `${f.name}: the scene threw as it rendered (${String(renderError.message ?? renderError).slice(0, 60)})` });
    for (const c of propComps) out.push({ line: c.line, status: "unverified", what: `${c.name}: the scene threw as it rendered (${String(renderError.message ?? renderError).slice(0, 60)})` });
    dispose(); return results;
  }
  const noOwner = (name, c) => `${name}: it calls ${c} with no owner — Solid's useContext throws there in development (NoOwnerError) and finds nothing above in production, and what the component makes (its effects, its cleanups) is never disposed. That is less than a root of its own, the least a row assumes (MO-11s): pass it a component the app renders itself, or wrap the call in the app's own JavaScript (createRoot)`;
  const rendered = name => chains.get(name);
  const under = (name, id) => !!rendered(name)?.slice(0, -1).includes(id);
  for (const f of watched) {
    const recs = calls.filter(r => r.fn === f.name);
    if (f.cautious) {   // MO-11s: no word, no claim — but a component called with no owner is less than the row assumes
      const lost = [...new Set(recs.flatMap(r => [...componentsIn(r.args, known)]).filter(c => ownerless.has(c)))];
      if (lost.length) out.push({ line: f.line, status: "mismatch", what: noOwner(f.name, lost.join(", ")) });
      continue;
    }
    if (!recs.length) { out.push({ line: f.line, status: "unverified", what: `${f.name}: the scene does not call it` }); continue; }
    const bad = [], good = [], unseen = new Set();
    for (const r of recs) {
      const given = [...componentsIn(r.args, known)];
      for (const c of given) if (ownerless.has(c)) bad.push(noOwner(f.name, c).slice(f.name.length + 2));
      // nests(children in component): each entry's component inside its record's component
      if (f.nestsIn) {
        const walk = v => { if (!v || typeof v !== "object") return; if (Array.isArray(v)) return v.forEach(walk); const host = known.get(v[f.nestsIn.inside]); if (host) for (const k of [].concat(v[f.nestsIn.kids] ?? [])) { const kid = k && known.get(k[f.nestsIn.inside]); if (kid) { if (!rendered(kid)) unseen.add(kid); else if (under(kid, host)) good.push(`${kid} inside ${host}`); else bad.push(`${kid} renders outside ${host}`); } } Object.values(v).forEach(x => typeof x === "object" && walk(x)); };
        r.args.forEach(walk);
      }
      for (const c of given) {
        if (!rendered(c)) { unseen.add(c); continue; }
        if (f.mode === "factory" && r.made) { if (!under(c, r.made)) bad.push(`${c} renders outside the component ${f.name} made`); else good.push(`${c} inside the made component`); }
        // MO-11u: beneath an application of H
        if (f.rendersIn) { if (rendered(c).slice(0, -1).some(id => id.startsWith(`${f.rendersIn}#app`))) good.push(`${c} beneath ${f.rendersIn}`); else bad.push(`${c} renders outside ${f.rendersIn}${apps.some(a => a.name === f.rendersIn) ? "" : ` (the scene applies no ${f.rendersIn})`}`); }
      }
    }
    if (bad.length) out.push({ line: f.line, status: "mismatch", what: `${f.name}: ${[...new Set(bad)].join("; ")}` });
    else if (good.length) out.push({ line: f.line, status: "held", what: `${f.name}: placement holds: ${[...new Set(good)].slice(0, 4).join("; ")}${unseen.size ? ` (not rendered by the scene: ${[...unseen].join(", ")})` : ""}` });
    else out.push({ line: f.line, status: "unverified", what: `${f.name}: the scene renders none of what it gives it${unseen.size ? ` (${[...unseen].join(", ")})` : ""}` });
  }
  // MO-11c, DV-24: a component given to a prop is credited with what is above the component it is given to — so it
  // must render beneath that application, not from a root the component makes later
  for (const c of propComps) {
    const mine = apps.filter(a => a.name === c.name);
    if (!mine.length) { out.push({ line: c.line, status: "unverified", what: `${c.name}: the scene does not apply it (lib.${c.name}, with h.component(…) as ${c.componentProps.join(", ")})` }); continue; }
    const bad = [], good = [], unseen = new Set();
    for (const a of mine) for (const [prop, names] of a.given) for (const n of names) {
      if (ownerless.has(n)) bad.push(`${n} (given as ${prop}) is called with no owner`);
      else if (!rendered(n)) unseen.add(n);
      else if (rendered(n).slice(0, -1).includes(a.id)) good.push(`${n} (given as ${prop}) beneath it`);
      else bad.push(`${n} (given as ${prop}) renders outside it: a component given to a prop is checked among the application's children (DV-24), which this one is not — wrap ${c.name} in the app's own JavaScript, or take the component as a child`);
    }
    if (bad.length) out.push({ line: c.line, status: "mismatch", what: `${c.name}: ${[...new Set(bad)].join("; ")}` });
    else if (good.length) out.push({ line: c.line, status: "held", what: `${c.name}: placement holds: ${[...new Set(good)].slice(0, 4).join("; ")}${unseen.size ? ` (not rendered by the scene: ${[...unseen].join(", ")})` : ""}` });
    else out.push({ line: c.line, status: "unverified", what: `${c.name}: the scene renders none of what it gives ${c.componentProps.join(", ")}${unseen.size ? ` (${[...unseen].join(", ")})` : ": give it h.component(…) there"}` });
  }
  dispose();
  return results;
}

/** Render `view` (the browser build when there is a document, as with --dom; else a universal renderer); what it threw
 *  or warned while rendering, synchronously. */
async function renderOnce(view, resolve, reached) {
  const s = await import(resolve("solid-js"));
  const quiet = hushed();
  let error = null, dispose = () => {};
  try {
    dispose = await render(() => s.createComponent(s.Errored, { fallback: e => { error ??= typeof e === "function" ? e() : e; return null; }, get children() { return view(); } }), resolve);
    // flushed synchronously and disposed before yielding: a context a component reads, it reads as it renders, and a
    // component left mounted with nothing above it can keep scheduling work (TanStack's Outlet with no router does)
    for (let i = 0; i < 5; i++) s.flush?.();
    for (let i = 0; i < 20 && reached && !reached() && !error; i++) { await new Promise(r => setTimeout(r, 15)); s.flush?.(); }   // a provider that renders its children later (a router, once its route has loaded)
  } catch (e) { if (noRenderer(e)) throw e; error ??= e; }
  finally { try { dispose(); } catch {} quiet.restore(); }
  return { error, warned: quiet.warned };
}

/** What fails where `part` is made later, under `wrap` already mounted (a conditional turned on): a provider is above what
 *  it is given whenever that is made, as a Solid context is, and a scope set only while its body runs is not. */
async function renderLater(wrap, part, resolve) {
  const s = await import(resolve("solid-js"));
  const [on, turn] = s.createSignal(false); let made = false;
  const quiet = hushed(); let error = null, dispose = () => {};
  try {
    dispose = await render(() => s.createComponent(s.Errored, { fallback: e => { error ??= typeof e === "function" ? e() : e; return null; }, get children() { return wrap(() => { const shown = s.createMemo(() => on() ? (made = true, s.createComponent(part, {})) : null); s.createRenderEffect(shown, () => {}); return shown; }, s); } }), resolve);
    for (let i = 0; i < 4; i++) { s.flush?.(); await new Promise(r => setTimeout(r, 15)); }
    turn(true);
    for (let i = 0; i < 4; i++) { s.flush?.(); await new Promise(r => setTimeout(r, 15)); }
  } catch (e) { if (noRenderer(e)) throw e; error ??= e; }
  finally { try { dispose(); } catch {} quiet.restore(); }
  return { error, made };
}
/** MO-10g: a closure passed where a fn's declaration types a parameter as a function (or a record parameter's field) is
 *  checked as a handler: imperative scope, untracked. Running the fn with the probe's arguments, each such callback is
 *  wrapped in a spy; the probe's `run(result)` or `act(result)` makes the library call it (a debounce's returned fn, a
 *  mutation's mutate). A callback the library calls inside a computation (Solid's `getObserver()` is set) is a mismatch:
 *  its reads would track and its writes land in owned scope. One it calls outside one holds; one it never calls is not
 *  verified. */
async function verifyCallbacks({ fns: rows, at, probeMod, solid: s, mount, reading }) {
  const out = [];
  for (const row of rows) {
    const f = { name: row.name, line: row.line, cbs: row.facts.callbacks.map(c => ({ ...c, ref: !!row.facts.params[c.index]?.ref })) };
    const fn = at(f.name); const probe = probeMod?.probes?.[f.name];
    if (typeof fn !== "function") continue;
    const unmarked = f.cbs.filter(c => !c.handler);
    if (!probe?.args && unmarked.length) { out.push({ line: f.line, ob: unmarked.map(c => `callbacks:${c.name}`), status: "na", quiet: true, what: `${f.name}: ${unmarked.map(c => c.name).join(", ")} unmarked, which claims nothing of how the library calls it` }); f.cbs = f.cbs.filter(c => c.handler); if (!f.cbs.length) continue; }
    if (!probe?.args) { out.push({ line: f.line, ob: f.cbs.map(c => `callbacks:${c.name}`), status: "unverified", what: `${f.name}: callback${f.cbs.length > 1 ? "s" : ""} ${f.cbs.map(c => c.name).join(", ")} not run: give its arguments in a probe` }); continue; }
    const seen = new Map(f.cbs.map(c => [c.name, { calls: 0, tracked: 0, during: 0, owned: 0 }]));
    // MO-8v: `during` — called while the fn's own call is still running: what a `handler` read from the code is never
    let inCall = 0;
    const called = (...a) => { inCall++; try { return fn(...a); } finally { inCall--; } };
    const spy = (c, g) => typeof g !== "function" ? g : (...a) => { const st = seen.get(c.name); st.calls++; if (s.getObserver?.()) st.tracked++; else if (!inCall && s.getOwner?.()) st.owned++; if (inCall) st.during++; return g(...a); };
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
    let m;
    try { m = await mount(called, args, async r => { await settle(s); if (probe.run) await probe.run(r); if (probe.act) await probe.act(r); await settle(s); }, f.name); }
    catch (e) { if (!noRenderer(e)) throw e; out.push({ line: f.line, ob: f.cbs.map(c => `callbacks:${c.name}`), status: "unverified", what: `${f.name}: callback${f.cbs.length > 1 ? "s" : ""} ${f.cbs.map(c => c.name).join(", ")} not run: the fn is mounted with @solidjs/universal, which is not installed here (npm i -D @solidjs/universal)` }); continue; }
    const err = m.renderError ?? m.boundary ?? m.runError;
    for (const c of f.cbs) {
      const st = seen.get(c.name);
      const ob = `callbacks:${c.name}`;   // RFC 29: each position its own claim
      const push = r => out.push({ ob, ...r });
      const never = { line: f.line, status: "unverified", what: `${f.name}: callback ${c.name} never called by the probe${err ? ` (it threw: ${String(err.message ?? err).slice(0, 40)})` : ""}: give an act that makes the library call it` };
      const field = c.field ?? c.name.split(".").pop();
      if (c.handler && st.during && !st.tracked) { push({ line: f.line, status: "mismatch", what: `${f.name}: ${c.name} ${reading?.get(f.name)?.has(ob) ? "was read from the code as a handler" : "is declared handler"}, but the library calls it while the call itself runs, where its writes are refused: ${reading?.get(f.name)?.has(ob) ? "the reading is wrong — remove the word, and report it (MO-8v)" : "drop `handler` (MO-10g)"}` }); continue; }
      if (c.handler && st.owned && !st.tracked) { push({ line: f.line, status: "mismatch", what: `${f.name}: ${c.name} is declared handler, but the library calls it with an owner set (a root, \`runWithOwner\`, a scope of its own), where a write and an action are refused: drop \`handler\` (MO-10g)` }); continue; }
      if (c.handler) { push(st.tracked ? { line: f.line, status: "mismatch", what: `${f.name}: ${c.name} is declared handler, but the library calls it inside a computation (tracked): a closure there would have its reads tracked by the library and its writes refused by Solid: drop \`handler\` — a function type without it is pure, which is right for a callback called inside a computation (MO-10g)` }
        : st.calls ? { line: f.line, status: "held", what: `${f.name}: callback ${c.name} holds: the library calls it later, with no owner and outside tracking, as a handler` } : never); continue; }
      // MO-10g (revised): an unmarked function type is a pure function, safe however the library calls it: the row claims
      // nothing of the library there, and nothing is held
      push({ line: f.line, status: "na", what: `${f.name}: ${c.name} is unmarked, which claims nothing of how the library calls it${st.calls && !st.tracked && !st.during ? " (called outside tracking: `handler` would let a closure there write, MO-10g)" : ""}` });
    }
  }
  return out;
}

/** RFC 29 (revised after review): a component's function-typed props, each its own claim (`callbacks:onPress`), checked
 *  by rendering it with the probe's props (`probes.Btn.props()`; a prop the probe does not give is a no-op), each such
 *  prop wrapped in a spy, then the probe's `act()` and time for what the component schedules. As for a fn's callbacks:
 *  a `handler` prop called inside a computation is a mismatch and called outside one holds;
 *  an unmarked one (pure) holds however it is called; one never called is not verified. */
async function verifyComponentCallbacks({ comps: rows, at, probeMod, solid: s, resolve }) {
  const out = [];
  for (const row of rows) {
    const c = { name: row.name, line: row.line, cbs: row.facts.props.filter(p => p.function).map(p => ({ name: p.name, handler: p.handler })) };
    const C = at(c.name); if (typeof C !== "function") continue;
    const probe = probeMod?.probes?.[c.name];
    const seen = new Map(c.cbs.map(cb => [cb.name, { calls: 0, tracked: 0, during: 0, owned: 0 }]));
    const given = probe?.props?.() ?? {};
    // (a getter of the probe's is kept a getter: a list of children is made where the component reads it, as an app's is)
    const props = Object.defineProperties({}, Object.getOwnPropertyDescriptors(given)); let rendering = true;
    for (const cb of c.cbs) { const g = typeof given[cb.name] === "function" ? given[cb.name] : () => undefined; props[cb.name] = (...a) => { const st = seen.get(cb.name); st.calls++; if (s.getObserver?.()) st.tracked++; else if (!rendering && s.getOwner?.()) st.owned++; if (rendering) st.during++; return g(...a); }; }
    const quiet = hushed();
    let error = null, dispose = () => {};
    try {
      // at the root, not under an Errored boundary: a boundary's children run inside its computation, where every call
      // would look tracked; here the component's body has no observer, and only what it runs in a computation has one
      const part = () => s.createComponent(C, props);
      dispose = await render(() => { const v = probe?.inside ? probe.inside(part, s) : part(); rendering = false; return v; }, resolve);   // `inside`: what a kit's part is rendered within
      rendering = false;
      await settle(s);
      if (probe?.act) { await probe.act(s); await settle(s); }
    } catch (e) { error ??= e; }
    finally { try { dispose(); } catch {} quiet.restore(); }
    for (const cb of c.cbs) {
      const st = seen.get(cb.name), ob = `callbacks:${cb.name}`;
      const never = { line: c.line, ob, status: "unverified", what: `${c.name}: prop ${cb.name} never called${error ? ` (it threw: ${String(error.message ?? error).slice(0, 40)})` : ""}: give the probe's props and an act that makes the component call it` };
      if (cb.handler) out.push(st.during && !st.tracked ? { line: c.line, ob, status: "mismatch", what: `${c.name}: prop ${cb.name} is declared handler, but the component calls it while it renders, where its writes are refused: drop \`handler\` (MO-10g)` } : st.tracked ? { line: c.line, ob, status: "mismatch", what: `${c.name}: prop ${cb.name} is declared handler, but the component calls it inside a computation (tracked): a closure there would have its reads tracked and its writes refused by Solid: drop \`handler\` (MO-10g)` }
        : st.owned ? { line: c.line, ob, status: "mismatch", what: `${c.name}: prop ${cb.name} is declared handler, but the component calls it with an owner set (a root, \`runWithOwner\`, a scope of its own), where a write and an action are refused: drop \`handler\` (MO-10g)` }
        : st.calls ? { line: c.line, ob, status: "held", what: `${c.name}: prop ${cb.name} holds: the component calls it later, with no owner and outside tracking, as a handler` } : never);
      else out.push({ line: c.line, ob, status: "na", what: `${c.name}: prop ${cb.name} is unmarked, which claims nothing of how the component calls it` });
    }
  }
  return out;
}
/** 09 MO-14: a host declaration's view (`export default component provides(c) nests(children in component) = <tree>`),
 *  checked against a scene. The probe (`host.probe.mjs`) exports `scene(rx, h)`: `rx` holds a recording component for
 *  each component the declaration imports, by the name it imports it under (one that has children in the tree renders
 *  its `children`), and `rx.tree`, the declaration's tree built of them; the scene hands back the host's view of them
 *  (the router the app's host makes, given these in place of the `.rx` components). Then: each component the tree
 *  names renders, and inside the component of the record it is a child of. For each `provides(c)`, the probe's
 *  `uses[c]` (a hook that throws or warns with no provider) is called where each recording component renders, and must do
 *  neither. For each component the declaration imports from JavaScript (MO-14f), `rx` holds a marked wrapper of the probe's
 *  `through[name]`: the scene applies it where the app's component applies the real one, and a component of the view must
 *  render inside it. `text` is the declaration with each row on one line. Null when the file states no view. */
/*  `detached`: the host's view changed so that its claims are false — each component is rendered from a root of its own. */
async function verifyHost({ rows, probeMod, resolve, routes, detached }) {
  const host = rows.find(r => r.kind === "host"); if (!host) return null;
  const line = host.line; const { tree, provides, nests } = host.facts;
  const imported = rows.filter(r => r.kind === "import").flatMap(r => r.facts.names.map(([name, alias]) => [alias, r.facts.from, r.line, name]));
  const names = imported.filter(([, from]) => from.endsWith(".rx")).map(([x]) => x);
  // MO-14f: what the declaration imports from JavaScript — the host's own components, which it renders through
  const throughRows = imported.filter(([, from]) => !from.endsWith(".rx"));   // [the name here, its module, the import's line, its name there]: the claim is the import's
  const through = throughRows.map(([x]) => x);
  const out = []; const obs = ["placement", ...provides.map(c => `provides:${c}`)];
  const all = (status, what) => [...obs.map(ob => ({ line, ob, status, what })), ...throughRows.map(([, , at, name]) => ({ line: at, ob: `through:${name}`, status, what }))];
  if (typeof probeMod?.scene !== "function") return all("unverified", `the host's view is not run: give a scene in the probe beside the declaration (scene(rx, h): the host's view of rx.${names[0] ?? "Layout"}, …)`);
  const s = await import(resolve("solid-js"));
  const MARK = s.createContext(null); const chains = new Map(); const threw = new Map();   // threw: context → the components where its hook threw
  const used = new Map();   // context → the components where its hook ran
  // whether a hook throws or warns where it is called: a library says a missing provider either way
  const complains = hook => { const quiet = hushed(); let said = false; try { hook(); } catch { said = true; } finally { quiet.restore(); } said ||= quiet.warned.length > 0; complains.last = said; return said; };
  const rx = {};
  let built;
  const parents = new Set();   // the components that have children in the tree: their recording component renders its children
  try {
    const shape = new Function(...names, `return (${tree});`)(...names.map(x => ({ __rx: x })));
    const walk = v => { if (!v || typeof v !== "object" || v.__rx) return; if (Array.isArray(v)) return v.forEach(walk); if (nests && v[nests.inside]?.__rx && [].concat(v[nests.kids] ?? []).length) parents.add(v[nests.inside].__rx); Object.values(v).forEach(walk); };
    walk(shape);
  } catch (e) { return all("unverified", `the host's tree is not read: ${String(e.message ?? e).slice(0, 60)}`); }
  const place = detached ? f => props => s.runWithOwner(null, () => s.createRoot(() => f(props))) : f => f;
  for (const name of names) rx[name] = place(props => {
    const chain = [...(s.useContext(MARK) ?? []), name]; chains.set(name, chain);
    for (const c of provides) { const hook = probeMod.uses?.[c]; if (typeof hook !== "function") continue; (complains(hook) ? threw : used).set(c, [...((complains.last ? threw : used).get(c) ?? []), name]); }
    return s.createComponent(MARK, { value: chain, get children() { return parents.has(name) ? props.children : null; } });
  });
  // a component the host renders through: the probe's own (`through.Outlet`), applied where the scene applies `rx.Outlet`
  // and marked, so that what renders inside it is seen to
  const applied = new Set();
  for (const t of through) rx[t] = props => {
    applied.add(t); const real = probeMod.through?.[t];
    return s.createComponent(MARK, { value: [...(s.useContext(MARK) ?? []), `→${t}`], get children() { return typeof real === "function" ? s.createComponent(real, props) : props.children; } });
  };
  try { built = new Function(...names, `return (${tree});`)(...names.map(x => rx[x])); } catch (e) { return all("unverified", `the host's tree is not read: ${String(e.message ?? e).slice(0, 60)}`); }
  Object.defineProperty(rx, "tree", { value: built, enumerable: false });
  let dispose = () => {}, renderError = null;
  try {
    dispose = await render(await probeMod.scene(rx, { s }, routes?.(rx)), resolve);
  } catch (e) { renderError = e; }
  const rest = () => settle(s, 40, 15);
  await rest();
  // `act` shows what the first render does not (another page). Given the routes (MO-14g) it is called for each leaf of
  // the tree in turn — `act(rx, h, route)` — so every route file is rendered without the probe naming one
  const leaves = []; const leaf = ns => (ns ?? []).forEach(n => n.children?.length ? leaf(n.children) : leaves.push(n)); leaf(routes?.(rx));
  if (probeMod.act) { for (const r of leaves.length ? leaves : [undefined]) { try { await probeMod.act(rx, { s }, r); } catch {} await rest(); } }
  try { dispose(); } catch {}
  if (renderError) return all("unverified", `the scene threw as it rendered (${String(renderError.message ?? renderError).slice(0, 60)})`);
  // placement: every component the tree names renders, a record's children inside its component
  const known = new Map(names.map(x => [rx[x], x])); const bad = [], good = [], unseen = new Set();
  const walk = (v, parent) => {
    if (!v || typeof v !== "object") return; if (Array.isArray(v)) return v.forEach(x => walk(x, parent));
    const here = nests ? known.get(v[nests.inside]) : undefined;
    for (const x of Object.values(v)) { const c = known.get(x); if (c && !chains.has(c)) unseen.add(c); }
    if (here && parent) { if (chains.has(here)) (chains.get(here).slice(0, -1).includes(parent) ? good : bad).push(chains.get(here).slice(0, -1).includes(parent) ? `${here} inside ${parent}` : `${here} renders outside ${parent}`); }
    for (const [k, x] of Object.entries(v)) walk(x, nests && k === nests.kids && here ? here : parent);
  };
  walk(built, null);
  const rendered = names.filter(x => chains.has(x));
  out.push(bad.length ? { line, ob: "placement", status: "mismatch", what: `the host's view: ${[...new Set(bad)].join("; ")}` }
    : unseen.size ? { line, ob: "placement", status: "unverified", what: `the host's view: the scene does not render ${[...unseen].join(", ")}${good.length ? ` (${[...new Set(good)].join("; ")})` : ""}: show each (a probe's act(rx, h) may navigate)` }
    : { line, ob: "placement", status: "held", what: `the host's view holds: ${good.length ? [...new Set(good)].join("; ") : `${rendered.join(", ")} rendered`}` });
  for (const c of provides) {
    const ob = `provides:${c}`;
    if (typeof probeMod.uses?.[c] !== "function") { out.push({ line, ob, status: "unverified", what: `the host's view: provides(${c}) not run: give a hook that throws or warns with no provider as the probe's uses.${c}` }); continue; }
    let alone = false; s.createRoot(d => { alone = complains(probeMod.uses[c]); d(); });
    out.push(!alone ? { line, ob, status: "unverified", what: `the host's view: provides(${c}) not shown: the probe's uses.${c} runs with no provider too` }
      : threw.get(c)?.length ? { line, ob, status: "mismatch", what: `the host's view: declared provides(${c}), but the hook that uses it fails in ${[...new Set(threw.get(c))].join(", ")}` }
      : unseen.size || !used.get(c)?.length ? { line, ob, status: "unverified", what: `the host's view: provides(${c}) not shown for ${[...unseen].join(", ") || "any component"}: the scene does not render ${unseen.size ? "them" : "one"}` }
      : { line, ob, status: "held", what: `the host's view: provides(${c}) holds: the hook that uses it runs in ${[...new Set(used.get(c))].join(", ")}` });
  }
  // MO-14f: each component the host renders through — applied by the scene inside a component of the view, it is what
  // renders that component's children
  for (const [t, , line, name] of throughRows) {
    const ob = `through:${name}`; const inside = [...chains.values()].filter(ch => ch.slice(0, -1).includes(`→${t}`)).map(ch => ch[ch.length - 1]);
    out.push(typeof probeMod.through?.[t] !== "function" ? { line, ob, status: "unverified", what: `the host's view: ${t} is not run: give the component as the probe's through.${t}, and apply rx.${t} in the scene where the app's component applies it` }
      : !applied.has(t) ? { line, ob, status: "unverified", what: `the host's view: the scene does not apply rx.${t}: apply it where the app's component does (inside the component whose children it renders)` }
      : !inside.length ? { line, ob, status: "mismatch", what: `the host's view: declared rendered through ${t}, and nothing the view names renders inside it` }
      : { line, ob, status: "held", what: `the host's view: rendered through ${t}: ${[...new Set(inside)].join(", ")}` });
  }
  return out;
}
module.exports = { renderLater, verifyPlacement, verifyCallbacks, renderOnce, verifyComponentCallbacks, verifyHost };
