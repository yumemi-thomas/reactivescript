// What makes a claim `held` by running evidence: the same probe fails when the library does not do what the row says.
// For each kind of claim, the module changed so that the claim is false, the rest of it left as it is; rx-verify runs the
// probe again over it, and a claim that is held all the same was shown by nothing (bin/verify.js: it is `unverified`).
//
//   uses       the hook or the part reads no context (it does nothing).
//   provides   the component renders its children and provides nothing.
//   ignored    a `handler` is never called: what the library is given there does nothing.
//   tracked    a `handler` is called inside a computation, at the moments the library calls it.
//   rejects    what it rejects with is of no class the row names.
//   fields     each `ref` part of the result is its value, not an accessor (and a `pending` one never waits, MO-10l).
//   failing    a part that fails answers (undefined) instead.
//   draft      the fn changes nothing of what it is given; a draft callback's setter does nothing.
//   placement  what it is given is rendered from a root of its own, under nothing.

const KINDS = { uses: ["uses"], provides: ["provides"], callbacks: ["ignored", "tracked"], rejects: ["rejects"], fields: ["fields"], fails: ["failing"], draft: ["draft"], placement: ["placement"] };
/** The mutations that test the claims `obs` (names of claims that were held by running). */
const mutationsOf = obs => [...new Set([...obs].flatMap(ob => KINDS[ob.replace(/:.*$/, "")] ?? []))];
/** The claims a mutation makes false. */
const falsified = (kind, ob) => (KINDS[ob.replace(/:.*$/, "")] ?? []).includes(kind);

/** `mod` with the exports `rows` make claims of changed by `kind`. */
function mutant(mod, rows, kind, s) {
  const changed = new Map();   // "Dialog.Trigger" → its replacement
  const of = n => n.split(".").reduce((o, k) => o?.[k], mod);
  const tracked = g => (...a) => { let r; s.createRoot(d => { s.createRenderEffect(() => { r = g(...a); }, () => {}); s.flush?.(); d(); }); return r; };
  const cb = g => typeof g !== "function" ? g : kind === "ignored" ? () => undefined : tracked(g);
  const inRecord = (fields, v) => { if (!v || typeof v !== "object") return v; const o = Object.create(Object.getPrototypeOf(v), Object.getOwnPropertyDescriptors(v)); for (const f of fields) if (f in o) Object.defineProperty(o, f, { value: cb(v[f]), enumerable: true, configurable: true, writable: true }); return o; };
  const detached = C => Object.assign(props => s.runWithOwner(null, () => s.createRoot(() => C(props))), C);
  const away = (v, depth = 0) => typeof v === "function" ? detached(v) : Array.isArray(v) ? v.map(x => away(x, depth + 1)) : v && typeof v === "object" && depth < 6 && Object.getPrototypeOf(v) === Object.prototype ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, away(x, depth + 1)])) : v;
  const part = (r, path, f) => { if (!path.length) return f(r); if (r === null || typeof r !== "object") return r; const o = Array.isArray(r) ? [...r] : Object.create(Object.getPrototypeOf(r), Object.getOwnPropertyDescriptors(r)); Object.defineProperty(o, path[0], { value: part(r[path[0]], path.slice(1), f), enumerable: true, configurable: true, writable: true }); return o; };
  for (const row of rows) {
    const x = row.facts, v = of(row.name); if (typeof v !== "function") continue;
    const dot = row.name.lastIndexOf("."), self = dot < 0 ? undefined : of(row.name.slice(0, dot));
    const call = (...a) => /\.[a-z]\w*$/.test(row.name) ? v.apply(self, a) : v(...a);
    const set = f => changed.set(row.name, f);
    if (kind === "uses" && x.uses?.length) set(() => undefined);
    if (kind === "provides" && x.provides?.length) set(row.kind === "component" ? props => props.children : () => props => props.children);
    if ((kind === "ignored" || kind === "tracked") && row.kind === "fn" && x.callbacks?.some(c => c.handler)) {
      const cbs = x.callbacks.filter(c => c.handler);
      set((...args) => {
        for (const i of new Set(cbs.map(c => c.index))) {
          const mine = cbs.filter(c => c.index === i), g = args[i];
          if (mine.some(c => !c.field)) args[i] = cb(g);
          else args[i] = x.params[i]?.ref && typeof g === "function" ? () => inRecord(mine.map(c => c.field), g()) : inRecord(mine.map(c => c.field), g);
        }
        return call(...args);
      });
    }
    if ((kind === "ignored" || kind === "tracked") && row.kind === "component" && x.props.some(p => p.handler)) {
      const names = x.props.filter(p => p.handler).map(p => p.name);
      set(props => { const o = {}; for (const k of Object.keys(props)) { if (names.includes(k)) o[k] = cb(props[k]); else Object.defineProperty(o, k, { get: () => props[k], enumerable: true, configurable: true }); } return v(o); });
    }
    if (kind === "rejects" && row.kind === "fn") set(async (...a) => { try { return await call(...a); } catch { throw "no Error at all"; } });
    if (kind === "fields" && x.parts?.length) set((...a) => x.parts.filter(p => p.ref).reduce((r, p) => part(r, p.path, () => undefined), call(...a)));
    if (kind === "failing" && x.parts?.some(p => p.fails.length)) set((...a) => x.parts.filter(p => p.fails.length).reduce((r, p) => part(r, p.path, () => () => undefined), call(...a)));
    if (kind === "draft" && row.kind === "fn" && (x.params.some(p => p.draft) || x.parts?.some(p => p.draft))) set(x.params.some(p => p.draft) ? () => undefined : (...a) => x.parts.filter(p => p.draft).reduce((r, p) => part(r, p.path, () => () => undefined), call(...a)));
    if (kind === "placement" && row.kind === "fn") set((...a) => call(...a.map((y, i) => x.params[i]?.ref && typeof y === "function" ? () => away(y()) : away(y))));
    if (kind === "placement" && row.kind === "component" && x.props.some(p => p.component || p.components)) {
      const names = x.props.filter(p => p.component || p.components).map(p => p.name);
      set(props => { const o = {}; for (const k of Object.keys(props)) Object.defineProperty(o, k, { get: () => names.includes(k) ? away(props[k]) : props[k], enumerable: true, configurable: true }); return v(o); });
    }
  }
  // a member (`Dialog.Trigger`, `toaster.show`) is changed on its object, seen through a proxy
  const over = (v, at) => {
    const own = changed.get(at), below = [...changed.keys()].some(n => n.startsWith(`${at}.`));
    const base = own ? Object.assign((...a) => own(...a), typeof v === "function" ? v : {}) : v;
    if (!below || (typeof v !== "object" && typeof v !== "function") || !v) return base;
    return new Proxy(typeof v === "function" ? (...a) => base(...a) : Object.create(v), { get: (_t, k) => typeof k === "string" ? over(v[k], `${at}.${k}`) : v[k], has: (_t, k) => k in v, apply: (_t, _th, a) => base(...a) });
  };
  return Object.fromEntries(Object.keys(mod).map(k => [k, over(mod[k], k)]));
}
module.exports = { mutationsOf, falsified, mutant };
