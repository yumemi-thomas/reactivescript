// rx-declare's second pass: what running the module shows (MO-12), where its types cannot. The draft's TODOs for a hook's
// context and a provider's are replaced by rows when running settles them; rx-verify then confirms them (and checks the
// rest) against the same module.
//   - a hook that takes no arguments, called with nothing providing anything, throws: it reads a context (uses);
//   - which one: each context the module exports, provided around the hook with a placeholder value, until the hook runs;
//     a module that exports none gets one context, named after the package, for all of them;
//   - a `…Provider` component that mounts with no props and lets the hook run provides that context;
//   - a compound part (`Dialog.Trigger`, MO-11q) that throws rendered alone but renders inside its object's root (the
//     object itself, or its `Root`) reads a context that root provides.
// What running cannot settle keeps its TODO.
const path = require("node:path");
const { pathToFileURL } = require("node:url");

/** A placeholder context value: anything a hook asks of it (a field, a call) answers with itself. */
const ANY = new Proxy(function () {}, { get: (_, k) => k === Symbol.toPrimitive ? () => "" : k === "then" ? undefined : ANY, apply: () => ANY });
const ident = s => s.replace(/^@[^/]+\//, "").replace(/[^A-Za-z0-9]+(.)/g, (_, c) => c.toUpperCase()).replace(/^[^A-Za-z_$]+/, "").replace(/^./, c => c.toLowerCase()) || "context";

/** Where `spec` resolves from `from`, as a browser bundle would import it: CommonJS resolution first, else the package's
 *  `exports` under the `browser`, `import` and `default` conditions (an ESM-only package has no `require` one), a subpath
 *  pattern (`./*`) included. */
function resolveModule(spec, from) {
  try { return require.resolve(spec, { paths: [from] }); } catch {}
  if (spec.startsWith(".")) return null;
  const parts = spec.split("/"), name = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  const sub = "." + spec.slice(name.length);
  const fs = require("node:fs");
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    const pkgDir = path.join(dir, "node_modules", name), pj = path.join(pkgDir, "package.json");
    if (fs.existsSync(pj)) {
      const pkg = JSON.parse(fs.readFileSync(pj, "utf8"));
      const pick = e => typeof e === "string" ? e : Array.isArray(e) ? e.map(pick).find(Boolean) : e && typeof e === "object" ? ["browser", "import", "default"].map(k => k in e ? pick(e[k]) : null).find(Boolean) : null;
      const ex = pkg.exports;
      const map = typeof ex === "object" && ex && !Array.isArray(ex) && Object.keys(ex).some(k => k.startsWith(".")) ? ex : null;
      // a subpath pattern (`"./*": "./dist/*.js"`), as Node resolves it: the longest part before `*` wins, then the longest
      // key — the crate's and ref/src/modules.ts's `packageDeclaration`
      const pattern = () => {
        let best;
        for (const k of Object.keys(map)) { const star = k.indexOf("*"); if (star < 0 || k.lastIndexOf("*") !== star) continue; const pre = k.slice(0, star), post = k.slice(star + 1); if (sub.startsWith(pre) && sub.endsWith(post) && sub.length >= k.length && (best === undefined || star > best.indexOf("*") || (star === best.indexOf("*") && k.length > best.length))) best = k; }
        if (best === undefined) return null;
        const star = best.indexOf("*"), post = best.length - star - 1, t = pick(map[best]);
        return t ? t.split("*").join(sub.slice(star, sub.length - post)) : null;
      };
      const entry = ex === undefined ? (sub === "." ? pkg.module ?? pkg.main ?? "index.js" : sub) : map ? (sub in map ? pick(map[sub]) : pattern()) : sub === "." ? pick(ex) : null;
      const f = entry && path.join(pkgDir, entry);
      return f && fs.existsSync(f) ? f : null;
    }
    if (path.dirname(dir) === dir) return null;
  }
}

/** A package that ships only `.jsx` (its `solid` build) runs once compiled: the project's Solid compiler, through a
 *  module hook (src/jsx-hook.mjs). Without one the package is not run, and the note says why. */
let jsxHook = null;
function compileJsx(from) {
  if (jsxHook !== null) return jsxHook;
  try {
    const compiler = require.resolve("@solidjs/compiler", { paths: [from, path.join(from, "node_modules/@solidjs/vite-plugin")] });
    require("node:module").register(pathToFileURL(path.join(__dirname, "jsx-hook.mjs")).href, { data: { compiler, from: path.join(from, "package.json") } });
    jsxHook = true;
  } catch { jsxHook = false; }
  return jsxHook;
}

async function runRows(draft, spec, from, opts = {}) {
  let file;
  file = resolveModule(spec, from);
  if (!file) return { draft, notes: [`not run: ${spec} does not resolve from ${from}`] };
  const dir = path.dirname(file);
  if (/\.(jsx|tsx)$/.test(file) && !compileJsx(from)) return { draft, notes: [`not run: ${spec} ships .jsx (its solid build); install @solidjs/compiler (the Vite plugin's) to run it here`] };
  compileJsx(from);   // a .js entry may import .jsx too
  const load = p => import(pathToFileURL(require.resolve(p, { paths: [dir, from, __dirname] })).href);
  let mod, s;
  try { mod = await import(pathToFileURL(file).href); s = await load("solid-js"); }
  catch (e) { return { draft, notes: [`not run: ${String(e.message ?? e).slice(0, 80)}`] }; }
  /** Does `hook()` run (no throw) under `wrap`? The tree is resolved in a root (no renderer: only whether it throws). */
  const runs = (hook, wrap) => {
    let threw = null, ran = false;
    // the result is read too (its fields, its accessors): a hook may look its context up only then (useMutation's client)
    const touch = r => { if (typeof r === "function" && r.length === 0) return r(); if (r && typeof r === "object") for (const k of Object.keys(r)) { const v = r[k]; if (typeof v === "function" && v.length === 0 && /^(is|get|use)?[a-z]/.test(k) && !/^(mutate|refetch|reset|navigate|set)/.test(k)) v(); } };
    // a hook that warns, not throws, with no provider (TanStack Router's `useRouter must be used inside a <RouterProvider>`)
    // is read the same way: what it warned is what it would have thrown
    const Probe = () => { ran = true; const saved = [console.warn, console.error]; console.warn = console.error = (...a) => { threw ??= new Error(a.map(String).join(" ")); }; try { touch(hook()); } catch (e) { threw = e; } finally { [console.warn, console.error] = saved; } return null; };
    s.createRoot(d => {
      try { let out = wrap ? wrap(() => s.createComponent(Probe, {})) : s.createComponent(Probe, {}); for (let n = 0; typeof out === "function" && n < 8; n++) out = out(); s.flush(); }
      catch (e) { threw ??= e; }
      d();
    });
    lastThrow = threw;
    return ran && !threw;
  };
  let lastThrow = null;
  // a missing global (`window`, `document`: running here has no DOM) or a property of nothing says nothing about contexts
  // (Solid may wrap what a computation threw: its cause is looked at too)
  const environmental = e => !!e && (e instanceof ReferenceError || e instanceof TypeError || /\bis not defined\b|Cannot read propert|\b(window|document|navigator|localStorage|matchMedia)\b/.test(String(e.message ?? "")) || environmental(e.cause));
  const lines = draft.split("\n");
  const hooks = [];
  // a hook every parameter of which is optional (`useQueryClient(client?: …)`) runs with none
  const bare = l => { const m = /^export (?:pure )?fn (use[A-Z]\w*)\(([^)]*)\)/.exec(l); return m && (!m[2].trim() || m[2].split(",").every(q => /^\s*(ref\s+)?[\w$]+\?/.test(q))) ? m[1] : null; };
  lines.forEach((l, i) => { const n = bare(l); if (n && typeof mod[n] === "function") hooks.push({ name: n, i }); });
  const contexts = Object.entries(mod).filter(([, v]) => v && typeof v === "function" && "id" in v && "defaultValue" in v);   // Solid 2's createContext
  // the name of a context the module does not export: `--context <name>`, else what its hooks call it (`useDialogContext`
  // → dialog), else its one compound object's (`Dialog.Trigger` → dialog), else the module's
  const lower = n => n.replace(/^./, c => c.toLowerCase());
  const fromHooks = [...new Set(hooks.map(h => /^use([A-Z]\w*?)Context$/.exec(h.name)?.[1]).filter(Boolean))];
  const objects = [...new Set(lines.flatMap(l => { const m = /^export component (\w+)\.\w+[(<]/.exec(l); return m ? [m[1]] : []; }))];
  const pkgCtx = opts.context ?? (fromHooks.length === 1 ? lower(fromHooks[0]) : objects.length === 1 ? lower(objects[0]) : ident(spec.startsWith(".") ? path.basename(spec).replace(/\.[^.]+$/, "") : spec));
  const needs = new Map();   // hook → context name
  const unsettled = new Set();
  const envOnly = new Map();   // hook → what it threw for want of a browser
  for (const h of hooks) {
    if (runs(mod[h.name])) continue;
    if (environmental(lastThrow)) { envOnly.set(h.name, String(lastThrow?.message ?? lastThrow).slice(0, 60)); continue; }
    const by = contexts.find(([, C]) => runs(mod[h.name], kids => s.createComponent(C, { value: ANY, get children() { return kids(); } })));
    if (by) needs.set(h.name, ident(by[0].replace(/Context$/, "")));
    else if (!contexts.length) needs.set(h.name, pkgCtx);   // a module that exports no context: one, named after it
    else unsettled.add(h.name);   // it throws under each of the module's contexts too: not (only) a context it reads
  }
  const used = [...new Set(needs.values())];
  const provided = new Map();   // provider → context names
  for (const [name, P] of Object.entries(mod)) {
    if (!/Provider$/.test(name) || typeof P !== "function") continue;
    const props = kids => new Proxy({}, { get: (_, k) => k === "children" ? kids() : typeof k === "symbol" ? undefined : ANY, has: () => true });   // props it was not given: placeholders
    for (const h of hooks) if (needs.has(h.name) && (runs(mod[h.name], kids => s.createComponent(P, { get children() { return kids(); } })) || runs(mod[h.name], kids => s.createComponent(P, props(kids))))) {
      const set = provided.get(name) ?? new Set(); set.add(needs.get(h.name)); provided.set(name, set);
    }
  }
  // MO-11q: compound parts, rendered alone, then inside their object's root
  const partNeeds = new Map();   // "Dialog.Trigger" → context name
  const rootGives = new Map();   // "Dialog" / "Dialog.Root" → context names
  const partsOf = new Map();
  for (const l of lines) { const m = /^export component (\w+)\.(\w+)[(<]/.exec(l); if (m && mod[m[1]] && typeof mod[m[1]][m[2]] === "function") partsOf.set(m[1], [...partsOf.get(m[1]) ?? [], m[2]]); }
  for (const [obj, parts] of partsOf) {
    const O = mod[obj]; const rootName = typeof O === "function" ? obj : typeof O.Root === "function" ? `${obj}.Root` : null; if (!rootName) continue;
    const Root = typeof O === "function" ? O : O.Root;
    const ctx = used.length === 1 ? used[0] : opts.context ?? lower(obj);
    for (const part of parts) {
      if (`${obj}.${part}` === rootName) continue;
      const render = () => s.createComponent(O[part], {});
      if (runs(render) || environmental(lastThrow)) continue;
      if (runs(render, kids => s.createComponent(Root, { get children() { return kids(); } }))) { partNeeds.set(`${obj}.${part}`, ctx); rootGives.set(rootName, new Set([...rootGives.get(rootName) ?? [], ctx])); }
    }
  }
  for (const c of partNeeds.values()) if (!used.includes(c)) used.push(c);
  // the same functions exported by their own names too (`Trigger` is `Dialog.Trigger`): the same rows
  const fnOf = n => n.includes(".") ? mod[n.split(".")[0]]?.[n.split(".")[1]] : mod[n];
  for (const [name, v] of Object.entries(mod)) {
    if (typeof v !== "function" || partNeeds.has(name) || rootGives.has(name)) continue;
    for (const [p, c] of [...partNeeds]) if (fnOf(p) === v) partNeeds.set(name, c);
    for (const [r, cs] of [...rootGives]) if (fnOf(r) === v) rootGives.set(name, cs);
  }
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const todo = /^\/\/ TODO (\w+): which context does this hook read\?/.exec(l);
    if (todo && needs.has(todo[1])) continue;   // settled below
    if (todo && envOnly.has(todo[1])) { out.push(`// TODO ${todo[1]}: run here it throws for want of a browser (${envOnly.get(todo[1])}): not settled; rx-verify in a browser-like setup, or read its source (MO-12b)`); continue; }
    if (todo && unsettled.has(todo[1])) { out.push(`// TODO ${todo[1]}: run with no provider it throws, and under each of this module's contexts too: does it need arguments, or another module's context? (MO-12b)`); continue; }
    if (todo && hooks.some(h => h.name === todo[1])) { out.push(`// TODO ${todo[1]}: run with no provider, and its result read, it does not throw; if it reads a context only later, add uses(…) (strict: an undeclared need passes the checker)`); continue; }
    if (todo && used.length === 1) { out.push(`// TODO ${todo[1]}: it takes arguments, so it was not run; if it reads ${used[0]} as the hooks run here do, add uses(${used[0]}) (rx-verify confirms it with a probe)`); continue; }
    const ptodo = /^\/\/ TODO (\w+): does it provide a context to its children\?/.exec(l);
    if (ptodo && provided.has(ptodo[1])) continue;
    const hook = bare(l);
    const says = (w, c) => new RegExp(`\\b${w}\\([^)]*\\b${c}\\b[^)]*\\)`).test(l);   // a row that already says it (known.js) is left as it is
    if (hook && needs.has(hook)) { out.push(says("uses", needs.get(hook)) ? l : `${l.replace(/ instantiates$/, "")} uses(${needs.get(hook)})`); continue; }
    const comp = /^export component (\w+)[(<]/.exec(l);   // `(`, or a generic component's `<` (MO-8d)
    if (comp && provided.has(comp[1])) { const add = [...provided.get(comp[1])].filter(c => !says("provides", c)); out.push(add.length ? `${l} provides(${add.join(", ")})` : l); continue; }
    const named = /^export component ([\w.]+)[(<]/.exec(l)?.[1];
    if (named && rootGives.has(named)) { const add = [...rootGives.get(named)].filter(c => !says("provides", c)); out.push(add.length ? `${l} provides(${add.join(", ")})` : l); continue; }
    if (named && partNeeds.has(named)) { out.push(says("uses", partNeeds.get(named)) ? l : `${l} uses(${partNeeds.get(named)})`); continue; }
    const ptodo2 = /^\/\/ TODO ([\w.]+): its parts likely read a context it provides/.exec(l);
    if (ptodo2 && rootGives.has(ptodo2[1])) continue;
    out.push(l);
  }
  const ctxLines = used.filter(c => !out.includes(`export context ${c}`)).map(c => `export context ${c}   // drafted by running: ${[...needs.values()].includes(c) ? "hooks that throw with no provider read it" : "compound parts that throw outside their root read it"}`);
  const at = out.findIndex(l => !l.startsWith("//"));
  const merged = at < 0 ? [...out, ...ctxLines] : [...out.slice(0, at), ...ctxLines, ...out.slice(at)];
  const text = merged.join("\n").replace(/\n\/\/ TODO: the module's contexts \([^)]*\):[^\n]*/, used.length ? "" : "$&");
  return { draft: text, notes: [`ran ${hooks.length} hook${hooks.length === 1 ? "" : "s"}: ${needs.size} read a context${provided.size ? `; ${[...provided.keys()].join(", ")} provide${provided.size === 1 ? "s" : ""} it` : ""}${partNeeds.size ? `; ${partNeeds.size} compound part${partNeeds.size === 1 ? "" : "s"} read${partNeeds.size === 1 ? "s" : ""} ${[...rootGives.keys()].join(", ")}'s context` : ""}`] };
}

module.exports = { runRows, resolveModule, compileJsx };
