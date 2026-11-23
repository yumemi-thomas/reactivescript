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

/** The placement rows and draft rows of a `.d.rx`, per declaration line. */
function rowsOf(text) {
  const fns = [], comps = [];
  const lines = text.split("\n").map(l => l.replace(/\/\/.*$/, ""));
  // a row is its line and the lines after it, up to the next row (a word on a later line is the row's)
  const rowAt = i => { let j = i + 1; while (j < lines.length && !/^\s*(export|import)\b/.test(lines[j])) j++; return lines.slice(i, j).join("\n"); };
  lines.forEach((l, i) => {
    let m;
    if ((m = /^\s*export\s+(?:server\s+|client\s+)?(?:pure\s+)?fn\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)/.exec(l))) {
      const row = rowAt(i);
      const nestsIn = /\bnests\(\s*([\w$]+)\s+in\s+([\w$]+)\s*\)/.exec(row);
      const rendersIn = /\)\s*(?::[\s\S]*?)?\brenders\(\s*([A-Z][\w$.]*)\s*\)/.exec(row)?.[1] ?? null;   // MO-11u
      const mode = /\)\s*:\s*Component\b/.test(l) ? "factory" : null;
      // MO-11s: no word, and a `Component` among its parameters: nothing to show, but a component it calls with no owner is said
      const cautious = !mode && !nestsIn && !rendersIn && /\bComponent\b/.test(row.slice(0, closeOfParams(row)));
      // draft callbacks: in a parameter (`(update: (draft s: T) => …)`) or in a function part of a tuple result
      const draftPart = (() => { const r = /\)\s*:\s*\[(.*)\]\s*(?:$|\b(?:uses|provides|nests|renders|instantiates)\b)/.exec(l); if (!r) return -1; let d = 0, from = 0, idx = 0; const t = r[1]; for (let j = 0; j <= t.length; j++) { const c = t[j]; if (j === t.length || (c === "," && d === 0)) { if (/\(\s*draft\s+[\w$]/.test(t.slice(from, j))) return idx; idx++; from = j + 1; } else if ("([{<".includes(c)) d++; else if (")]}".includes(c) || (c === ">" && t[j - 1] !== "=")) d--; } return -1; })();
      if (mode || nestsIn || rendersIn || cautious || draftPart >= 0) fns.push({ name: m[1], line: i + 1, mode, nestsIn: nestsIn && { kids: nestsIn[1], inside: nestsIn[2] }, rendersIn, cautious, draftPart });
    } else if ((m = /^\s*export\s+component\s+([A-Za-z_$][\w$.]*)\s*[(<]/.exec(l))) {
      comps.push({ name: m[1], line: i + 1, componentProps: componentProps(rowAt(i)) });
    }
  });
  return { fns, comps };
}
/** The index where a fn row's parameter list closes (its first `(` matched). */
function closeOfParams(row) {
  const open = row.indexOf("("); if (open < 0) return row.length; let d = 0;
  for (let j = open; j < row.length; j++) { const c = row[j]; if ("([{<".includes(c)) d++; else if (")]}".includes(c) || (c === ">" && row[j - 1] !== "=")) { if (--d === 0) return j; } }
  return row.length;
}
/** MO-11c: the props of a component row whose type is a `Component`, or holds one in a record or an array (a function
 *  type is no such prop: what it is given is the library's to call). */
function componentProps(row) {
  const at = /\(\s*props\s*:/.exec(row); if (!at) return [];
  const from0 = at.index + at[0].length, end = at.index + closeOfParams(row.slice(at.index));
  // the record that closes the props: the last `{ … }` at the parameter's top level (MO-8o: the one after a `&`)
  let start = -1, stop = -1, d = 0;
  for (let j = from0; j < end; j++) { const c = row[j]; if (c === "{" && d === 0) start = j; if ("([{<".includes(c)) d++; else if (")]}".includes(c) || (c === ">" && row[j - 1] !== "=")) { d--; if (c === "}" && d === 0) stop = j; } }
  if (start < 0 || stop < start) return [];
  const body = row.slice(start + 1, stop); const out = []; let from = 0; d = 0;
  const field = f => { const k = /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*:\s*([\s\S]*)$/.exec(f); if (!k) return; const ty = k[2].replace(/^catches\([^)]*\)\s*/, "").replace(/^handler\s+/, ""); if (/\bComponent\b/.test(ty) && !/=>/.test(ty)) out.push(k[1]); };
  for (let j = 0; j <= body.length; j++) { const c = body[j]; if (j === body.length || ((c === ";" || c === "," || c === "\n") && d === 0)) { field(body.slice(from, j)); from = j + 1; } else if ("([{<".includes(c)) d++; else if (")]}".includes(c) || (c === ">" && body[j - 1] !== "=")) d--; }
  return out;
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
  const propComps = comps.filter(c => c.componentProps.length);   // MO-11c, DV-24: components given components in props
  if (!fns.length && !propComps.length) return out;
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
    out.push(err ? { line: f.line, ob: "draft", status: "unverified", what: `${f.name}: draft not run (${String(err.message ?? err).slice(0, 60)}); give its arguments in a probe` }
      : !seen || typeof seen !== "object" ? { line: f.line, ob: "draft", status: "fail", what: `${f.name}: declared a draft callback, but the callback is handed ${seen === undefined ? "nothing" : typeof seen}, not an object to change (MO-10i)` }
      : !kept ? { line: f.line, ob: "draft", status: "fail", what: `${f.name}: declared a draft callback, but a write to what it is handed is not kept (MO-10i)` }
      : { line: f.line, ob: "draft", status: "ok", what: `${f.name}: draft holds: its callback is handed an object, and a write to it is kept` });
  }
  const placing = fns.filter(f => f.mode || f.nestsIn || f.rendersIn);
  const watched = fns.filter(f => f.mode || f.nestsIn || f.rendersIn || f.cautious);   // every fn that is given components
  if (!watched.length && !propComps.length) return out;
  if (process.env.RXV_DEBUG) require("node:fs").writeSync(2, "[rx-verify] scene\n");
  if (typeof probeMod?.scene !== "function") {
    for (const f of placing) out.push({ line: f.line, status: "unverified", what: `${f.name}: where it renders what it is given is not run: give a scene in the probe (scene(lib, h))` });
    for (const c of propComps) out.push({ line: c.line, status: "unverified", what: `${c.name}: where it renders the component${c.componentProps.length > 1 ? "s" : ""} given as ${c.componentProps.join(", ")} is not run: give a scene in the probe (scene(lib, h)) that applies it with h.component(…) there (MO-11c, DV-24)` });
    return out;
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
      const rec = { fn: name, row, args, caller: [...above()] };
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
    for (const c of propComps) out.push({ line: c.line, status: "unverified", what: `${c.name}: the scene threw as it rendered (${String(renderError.message ?? renderError).slice(0, 60)})` });
    dispose(); return out;
  }
  const noOwner = (name, c) => `${name}: it calls ${c} with no owner — Solid's useContext throws there in development (NoOwnerError) and finds nothing above in production, and what the component makes (its effects, its cleanups) is never disposed. That is less than a root of its own, the least a row assumes (MO-11s): pass it a component the app renders itself, or wrap the call in the app's own JavaScript (createRoot)`;
  const rendered = name => chains.get(name);
  const under = (name, id) => !!rendered(name)?.slice(0, -1).includes(id);
  for (const f of watched) {
    const recs = calls.filter(r => r.fn === f.name);
    if (f.cautious) {   // MO-11s: no word, no claim — but a component called with no owner is less than the row assumes
      const lost = [...new Set(recs.flatMap(r => [...componentsIn(r.args, known)]).filter(c => ownerless.has(c)))];
      if (lost.length) out.push({ line: f.line, status: "fail", what: noOwner(f.name, lost.join(", ")) });
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
    if (bad.length) out.push({ line: f.line, status: "fail", what: `${f.name}: ${[...new Set(bad)].join("; ")}` });
    else if (good.length) out.push({ line: f.line, status: "ok", what: `${f.name}: placement holds: ${[...new Set(good)].slice(0, 4).join("; ")}${unseen.size ? ` (not rendered by the scene: ${[...unseen].join(", ")})` : ""}` });
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
    if (bad.length) out.push({ line: c.line, status: "fail", what: `${c.name}: ${[...new Set(bad)].join("; ")}` });
    else if (good.length) out.push({ line: c.line, status: "ok", what: `${c.name}: placement holds: ${[...new Set(good)].slice(0, 4).join("; ")}${unseen.size ? ` (not rendered by the scene: ${[...unseen].join(", ")})` : ""}` });
    else out.push({ line: c.line, status: "unverified", what: `${c.name}: the scene renders none of what it gives ${c.componentProps.join(", ")}${unseen.size ? ` (${[...unseen].join(", ")})` : ": give it h.component(…) there"}` });
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
async function verifyCallbacks({ fns, at, probeMod, resolve, mount, inferred }) {
  const out = [];
  const s = await import(resolve);
  for (const f of fns) {
    const fn = at(f.name); const probe = probeMod?.probes?.[f.name];
    if (typeof fn !== "function") continue;
    if (!probe?.args) { out.push({ line: f.line, ob: f.cbs.map(c => `callbacks:${c.name}`), status: "unverified", what: `${f.name}: callback${f.cbs.length > 1 ? "s" : ""} ${f.cbs.map(c => c.name).join(", ")} not run: give its arguments in a probe` }); continue; }
    const seen = new Map(f.cbs.map(c => [c.name, { calls: 0, tracked: 0, during: 0 }]));
    // MO-8v: `during` — called while the fn's own call is still running: what a `handler` read from the code is never
    let inCall = 0;
    const called = (...a) => { inCall++; try { return fn(...a); } finally { inCall--; } };
    const spy = (c, g) => typeof g !== "function" ? g : (...a) => { const st = seen.get(c.name); st.calls++; if (s.getObserver?.()) st.tracked++; if (inCall) st.during++; return g(...a); };
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
    let m;
    try { m = await mount(called, args, async r => { await settle(); if (probe.run) await probe.run(r); if (probe.act) await probe.act(r); await settle(); }); }
    catch (e) { if (e?.code !== "MODULE_NOT_FOUND" || !/@solidjs\/universal/.test(String(e.message))) throw e; out.push({ line: f.line, ob: f.cbs.map(c => `callbacks:${c.name}`), status: "unverified", what: `${f.name}: callback${f.cbs.length > 1 ? "s" : ""} ${f.cbs.map(c => c.name).join(", ")} not run: the fn is mounted with @solidjs/universal, which is not installed here (npm i -D @solidjs/universal)` }); continue; }
    const err = m.renderError ?? m.boundary ?? m.runError;
    for (const c of f.cbs) {
      const st = seen.get(c.name);
      const ob = `callbacks:${c.name}`;   // RFC 29: each position its own claim
      const push = r => out.push({ ob, ...r });
      const never = { line: f.line, status: "unverified", what: `${f.name}: callback ${c.name} never called by the probe${err ? ` (it threw: ${String(err.message ?? err).slice(0, 40)})` : ""}: give an act that makes the library call it` };
      const field = c.field ?? c.name.split(".").pop();
      if (c.handler && st.during && inferred?.get(f.name)?.has(`handler(${c.name})`)) { push({ line: f.line, status: "fail", what: `${f.name}: ${c.name} was read from the code as a handler (//@ inferred), but the library calls it while the call itself runs: the reading is wrong — remove the word, and report it (MO-8v)` }); continue; }
      if (c.handler) { push(st.tracked ? { line: f.line, status: "fail", what: `${f.name}: ${c.name} is declared handler, but the library calls it inside a computation (tracked): a closure there would have its reads tracked by the library and its writes refused by Solid: drop \`handler\` — a function type without it is pure, which is right for a callback called inside a computation (MO-10g)` }
        : st.calls ? { line: f.line, status: "ok", what: `${f.name}: callback ${c.name} holds: the library calls it outside tracking, as a handler` } : never); continue; }
      // MO-10g (revised): an unmarked function type is pure, which holds however the library calls it
      push(st.tracked ? { line: f.line, status: "ok", what: `${f.name}: ${c.name} is pure, as declared; the library calls it inside a computation` }
        : st.calls ? { line: f.line, status: "ok", what: `${f.name}: ${c.name} is pure, as declared; the library calls it outside tracking, so \`handler\` would let a closure there write (MO-10g)` } : never);
    }
  }
  return out;
}

/** provides(c) through a part (RFC 28): `alone` — rendered with no provider it fails or warns; `inside` — the error it
 *  still throws under the provider (`wrap(children, solid)`), or null. */
async function partUnder({ part, partProps, wrap, resolve }) {
  const s = await import(resolve("solid-js"));
  const alone = await renderOnce(() => s.createComponent(part, partProps), resolve);
  const inside = await renderOnce(() => wrap(() => s.createComponent(part, partProps), s), resolve);
  return { alone: !!(alone.error || alone.warned.length), inside: inside.error ?? null };
}
/** RFC 29 (revised after review): a component's function-typed props, each its own claim (`callbacks:onPress`), checked
 *  by rendering it with the probe's props (`probes.Btn.props()`; a prop the probe does not give is a no-op), each such
 *  prop wrapped in a spy, then the probe's `act()` and time for what the component schedules. As for a fn's callbacks:
 *  a `handler` prop called inside a computation is a mismatch and called outside one holds;
 *  an unmarked one (pure) holds however it is called; one never called is not verified. */
async function verifyComponentCallbacks({ comps, at, probeMod, resolve }) {
  const out = [];
  const s = await import(resolve("solid-js"));
  for (const c of comps) {
    const C = at(c.name); if (typeof C !== "function") continue;
    const probe = probeMod?.probes?.[c.name];
    const seen = new Map(c.cbs.map(cb => [cb.name, { calls: 0, tracked: 0 }]));
    const given = probe?.props?.() ?? {};
    const props = { ...given };
    for (const cb of c.cbs) { const g = typeof given[cb.name] === "function" ? given[cb.name] : () => undefined; props[cb.name] = (...a) => { const st = seen.get(cb.name); st.calls++; if (s.getObserver?.()) st.tracked++; return g(...a); }; }
    const warned = [], saved = [console.warn, console.error];
    console.warn = console.error = (...a) => { warned.push(a.map(String).join(" ")); };
    let error = null, dispose = () => {};
    try {
      // at the root, not under an Errored boundary: a boundary's children run inside its computation, where every call
      // would look tracked; here the component's body has no observer, and only what it runs in a computation has one
      const view = () => s.createComponent(C, props);
      if (typeof document !== "undefined" && document.body) { const web = await import(resolve("@solidjs/web")); const el = document.createElement("div"); document.body.appendChild(el); dispose = web.render(view, el); }
      else { const { createRenderer } = await import(resolve("@solidjs/universal")); const n = { createElement: t => ({ t, c: [] }), createTextNode: x => ({ x }), replaceText: (a, v) => { a.x = v; }, isTextNode: a => "x" in a, setProperty() {}, insertNode: (p, a) => { (p.c ??= []).push(a); a.p = p; }, removeNode: (p, a) => { p.c = (p.c ?? []).filter(y => y !== a); }, getParentNode: a => a.p, getFirstChild: a => a.c?.[0], getNextSibling: () => undefined }; dispose = createRenderer(n).render(view, { t: "root", c: [] }); }
      const settle = async () => { for (let i = 0; i < 10; i++) { s.flush?.(); await new Promise(r => setTimeout(r, 20)); } };
      await settle();
      if (probe?.act) { await probe.act(); await settle(); }
    } catch (e) { error ??= e; }
    finally { try { dispose(); } catch {} [console.warn, console.error] = saved; }
    for (const cb of c.cbs) {
      const st = seen.get(cb.name), ob = `callbacks:${cb.name}`;
      const never = { line: c.line, ob, status: "unverified", what: `${c.name}: prop ${cb.name} never called${error ? ` (it threw: ${String(error.message ?? error).slice(0, 40)})` : ""}: give the probe's props and an act that makes the component call it` };
      if (cb.handler) out.push(st.tracked ? { line: c.line, ob, status: "fail", what: `${c.name}: prop ${cb.name} is declared handler, but the component calls it inside a computation (tracked): a closure there would have its reads tracked and its writes refused by Solid: drop \`handler\` (MO-10g)` }
        : st.calls ? { line: c.line, ob, status: "ok", what: `${c.name}: prop ${cb.name} holds: the component calls it outside tracking, as a handler` } : never);
      else out.push(st.calls ? { line: c.line, ob, status: "ok", what: `${c.name}: prop ${cb.name} is pure, as declared; the component calls it ${st.tracked ? "inside" : "outside"} tracking` } : never);
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
async function verifyHost({ text, probeMod, resolve, routes }) {
  const lines = text.split("\n");
  const at = lines.findIndex(l => /^\s*export\s+default\s+component\b/.test(l)); if (at < 0) return null;
  const line = at + 1; const row = lines[at];
  const eq = row.indexOf("="); const words = row.slice(0, eq), tree = row.slice(eq + 1).trim();
  const provides = [...words.matchAll(/\bprovides\(([^)]*)\)/g)].flatMap(m => m[1].split(",").map(x => x.trim()).filter(Boolean));
  const n = /\bnests\(\s*([\w$]+)\s+in\s+([\w$]+)\s*\)/.exec(words); const nests = n && { kids: n[1], inside: n[2] };
  const imported = lines.flatMap((l, i) => { const m = /^\s*import\s*\{([^}]*)\}\s*from\s*(["'])(.*?)\2/.exec(l); return m ? m[1].split(",").map(x => x.trim()).filter(Boolean).map(x => [x.split(/\s+as\s+/).pop(), m[3], i + 1, x.split(/\s+as\s+/)[0]]) : []; });
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
  const complains = hook => { const saved = [console.warn, console.error]; let said = false; console.warn = console.error = () => { said = true; }; try { hook(); } catch { said = true; } finally { [console.warn, console.error] = saved; } complains.last = said; return said; };
  const rx = {};
  let built;
  const parents = new Set();   // the components that have children in the tree: their recording component renders its children
  try {
    const shape = new Function(...names, `return (${tree});`)(...names.map(x => ({ __rx: x })));
    const walk = v => { if (!v || typeof v !== "object" || v.__rx) return; if (Array.isArray(v)) return v.forEach(walk); if (nests && v[nests.inside]?.__rx && [].concat(v[nests.kids] ?? []).length) parents.add(v[nests.inside].__rx); Object.values(v).forEach(walk); };
    walk(shape);
  } catch (e) { return all("unverified", `the host's tree is not read: ${String(e.message ?? e).slice(0, 60)}`); }
  for (const name of names) rx[name] = props => {
    const chain = [...(s.useContext(MARK) ?? []), name]; chains.set(name, chain);
    for (const c of provides) { const hook = probeMod.uses?.[c]; if (typeof hook !== "function") continue; (complains(hook) ? threw : used).set(c, [...((complains.last ? threw : used).get(c) ?? []), name]); }
    return s.createComponent(MARK, { value: chain, get children() { return parents.has(name) ? props.children : null; } });
  };
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
    const view = await probeMod.scene(rx, { s }, routes?.(rx));
    if (typeof document !== "undefined" && document.body) { const web = await import(resolve("@solidjs/web")); const el = document.createElement("div"); document.body.appendChild(el); dispose = web.render(view, el); }
    else { const { createRenderer } = await import(resolve("@solidjs/universal")); const nodes = { createElement: t => ({ t, c: [] }), createTextNode: x => ({ x }), replaceText: (a, v) => { a.x = v; }, isTextNode: a => "x" in a, setProperty() {}, insertNode: (p, a) => { (p.c ??= []).push(a); a.p = p; }, removeNode: (p, a) => { p.c = (p.c ?? []).filter(y => y !== a); }, getParentNode: a => a.p, getFirstChild: a => a.c?.[0], getNextSibling: a => { const c = a.p?.c ?? []; return c[c.indexOf(a) + 1]; } }; dispose = createRenderer(nodes).render(view, { t: "root", c: [] }); }
  } catch (e) { renderError = e; }
  const settle = async () => { for (let i = 0; i < 40; i++) { s.flush?.(); await new Promise(r => setTimeout(r, 15)); } };
  await settle();
  // `act` shows what the first render does not (another page). Given the routes (MO-14g) it is called for each leaf of
  // the tree in turn — `act(rx, h, route)` — so every route file is rendered without the probe naming one
  const leaves = []; const leaf = ns => (ns ?? []).forEach(n => n.children?.length ? leaf(n.children) : leaves.push(n)); leaf(routes?.(rx));
  if (probeMod.act) { for (const r of leaves.length ? leaves : [undefined]) { try { await probeMod.act(rx, { s }, r); } catch {} await settle(); } }
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
  out.push(bad.length ? { line, ob: "placement", status: "fail", what: `the host's view: ${[...new Set(bad)].join("; ")}` }
    : unseen.size ? { line, ob: "placement", status: "unverified", what: `the host's view: the scene does not render ${[...unseen].join(", ")}${good.length ? ` (${[...new Set(good)].join("; ")})` : ""}: show each (a probe's act(rx, h) may navigate)` }
    : { line, ob: "placement", status: "ok", what: `the host's view holds: ${good.length ? [...new Set(good)].join("; ") : `${rendered.join(", ")} rendered`}` });
  for (const c of provides) {
    const ob = `provides:${c}`;
    if (typeof probeMod.uses?.[c] !== "function") { out.push({ line, ob, status: "unverified", what: `the host's view: provides(${c}) not run: give a hook that throws or warns with no provider as the probe's uses.${c}` }); continue; }
    let alone = false; s.createRoot(d => { alone = complains(probeMod.uses[c]); d(); });
    out.push(!alone ? { line, ob, status: "unverified", what: `the host's view: provides(${c}) not shown: the probe's uses.${c} runs with no provider too` }
      : threw.get(c)?.length ? { line, ob, status: "fail", what: `the host's view: declared provides(${c}), but the hook that uses it fails in ${[...new Set(threw.get(c))].join(", ")}` }
      : unseen.size || !used.get(c)?.length ? { line, ob, status: "unverified", what: `the host's view: provides(${c}) not shown for ${[...unseen].join(", ") || "any component"}: the scene does not render ${unseen.size ? "them" : "one"}` }
      : { line, ob, status: "ok", what: `the host's view: provides(${c}) holds: the hook that uses it runs in ${[...new Set(used.get(c))].join(", ")}` });
  }
  // MO-14f: each component the host renders through — applied by the scene inside a component of the view, it is what
  // renders that component's children
  for (const [t, , line, name] of throughRows) {
    const ob = `through:${name}`; const inside = [...chains.values()].filter(ch => ch.slice(0, -1).includes(`→${t}`)).map(ch => ch[ch.length - 1]);
    out.push(typeof probeMod.through?.[t] !== "function" ? { line, ob, status: "unverified", what: `the host's view: ${t} is not run: give the component as the probe's through.${t}, and apply rx.${t} in the scene where the app's component applies it` }
      : !applied.has(t) ? { line, ob, status: "unverified", what: `the host's view: the scene does not apply rx.${t}: apply it where the app's component does (inside the component whose children it renders)` }
      : !inside.length ? { line, ob, status: "fail", what: `the host's view: declared rendered through ${t}, and nothing the view names renders inside it` }
      : { line, ob, status: "ok", what: `the host's view: rendered through ${t}: ${[...new Set(inside)].join(", ")}` });
  }
  return out;
}
module.exports = { verifyPlacement, verifyComponentUses, verifyCallbacks, rowsOf, partUnder, verifyComponentCallbacks, verifyHost };
