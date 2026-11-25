// What a module's types say of its exports' parameters, for the reading of their code (compiler/words): read through
// tsrs, a level at a time, every request of a level in one batch. A type is said as a tree — `{ k: "num" | "prim" | "any" |
// "param" | "fn" | "arr" | "rest" | "tuple" | "map" | "set" | "promise" | "rec" | "union" | "other" }` — and what is not one
// of those is `any`, of which the reading takes nothing but that it may be passed on.
const path = require("node:path");
const { checker, tsrs } = require("./checker.js");

const OPTIONS = { strict: true, skipLibCheck: true, noEmit: true, moduleResolution: 100, allowImportingTsExtensions: true, module: 99, target: 9, jsx: 1, jsxImportSource: "@solidjs/web", types: [] };
const DEPTH = 5;
const LIB = /(?:^|[\\/])lib\.[\w.]+\.d\.ts$/;

/** @param {string} [text] the module's types, where it has none of its own (a declaration's `.d.ts`, TY-4b)
 *  @param {{ name: string, kind: "fn" | "component" }[]} rows  @returns {Map<string, { params: object[], prims: number[], plain: string[] }>} */
function rowTypes(spec, from, rows, text) {
  const out = new Map();
  let opened; try { opened = open(spec, from, text); } catch (e) { if (process.env.RX_DEBUG) console.error(e); return out; }
  const { api, ch, mod, dispose } = opened;
  try {
    if (!mod) return out;
    const t = tsrs(), TF = t.TypeFlags, SF = t.SymbolFlags;
    const run = gens => { const out = []; for (let i = 0; i < gens.length; i += 4096) out.push(...api.batch(...gens.slice(i, i + 4096))); return out; };
    let left = 40000;   // what is past it is `any`
    const prim = TF.StringLike | TF.BooleanLike | TF.BigIntLike | TF.ESSymbolLike | TF.Undefined | TF.Null | TF.Void | TF.Never | TF.EnumLike;
    const isLib = s => !!s?.declarations?.length && s.declarations.every(d => LIB.test(d.path ?? d.fileName ?? ""));
    const exports = new Map(ch.getExportsOfModule(mod).map(e => [e.name, e]));
    const want = rows.filter(r => !r.name.includes(".") && exports.has(r.name));
    const syms0 = want.map(r => exports.get(r.name)), alias = syms0.map((s, i) => [s, i]).filter(([s]) => s.flags & SF.Alias);
    const real = run(alias.map(([s]) => ch.getAliasedSymbol.gen(s))); const syms = [...syms0]; alias.forEach(([, i], k) => { syms[i] = real[k]; });
    const types = run(syms.map(s => ch.getTypeOfSymbol.gen(s)));
    const present = run(types.map(x => ch.getNonNullableType.gen(x)));
    const sigs = run(present.map(x => ch.getSignaturesOfType.gen(x, t.SignatureKind.Call)));
    const flat = sigs.flatMap((ss, i) => ss.map(s => ({ i, s })));
    const ps = run(flat.map(x => x.s.getParameters.gen()));
    const pts = flat.flatMap((x, k) => ps[k].map((p, n) => ({ x, p, n })));
    const ptypes = run(pts.map(y => ch.getTypeOfSymbol.gen(y.p)));
    let level = [];
    const trees = want.map(() => []);
    // a rest parameter: the last, where the signature takes more than its parameters
    pts.forEach((y, k) => { const rest = y.x.s.hasRestParameter && y.n === ps[flat.indexOf(y.x)].length - 1; const node = {}; (trees[y.x.i][y.n] ??= []).push({ node, rest }); level.push({ type: ptypes[k], node, d: 0 }); });
    // ---- a level at a time
    while (level.length) {
      const next = [], push = (type, d) => { const node = {}; next.push({ type, node, d }); return node; };
      const open = [];
      for (const x of level) {
        const f = x.type.flags;
        if (f & TF.NumberLike) x.node.k = "num";
        else if (f & prim) x.node.k = "prim";
        else if (f & (TF.Any | TF.Unknown) || x.d > DEPTH || left-- <= 0) x.node.k = "any";
        else open.push(x);
      }
      // unions, type parameters
      const unions = open.filter(x => x.type.flags & TF.Union), params = open.filter(x => x.type.flags & TF.TypeParameter), rest = open.filter(x => !(x.type.flags & (TF.Union | TF.TypeParameter)));
      const members = run(unions.map(x => x.type.getTypes.gen()));
      unions.forEach((x, i) => { x.node.k = "union"; x.node.m = members[i].map(y => push(y, x.d)); });
      const cons = run(params.map(x => ch.getBaseConstraintOfType.gen(x.type)));
      params.forEach((x, i) => { const c = cons[i]; if (!c || c.flags & (TF.Unknown | TF.TypeParameter)) x.node.k = "param"; else if (c.flags & TF.Any) x.node.k = "any"; else { x.node.k = "union"; x.node.m = [push(c, x.d + 1)]; x.node.of = "param"; } });
      const objects = rest.filter(x => x.type.flags & (TF.Object | TF.Intersection));
      for (const x of rest) if (!objects.includes(x)) x.node.k = "any";
      const calls = run(objects.map(x => ch.getSignaturesOfType.gen(x.type, t.SignatureKind.Call))), news = run(objects.map(x => ch.getSignaturesOfType.gen(x.type, t.SignatureKind.Construct)));
      const sym = run(objects.map(x => x.type.getSymbol.gen())), arr = run(objects.map(x => ch.isArrayType.gen(x.type))), tup = run(objects.map(x => ch.isTupleType.gen(x.type)));
      const refs = objects.map((x, i) => i).filter(i => arr[i] || tup[i] || (isLib(sym[i]) && /^(Readonly)?(Map|Set)$|^Promise$/.test(sym[i].name)));
      const args = run(refs.map(i => ch.getTypeArguments.gen(objects[i].type))); const argsOf = new Map(refs.map((i, k) => [i, args[k]]));
      const tups = objects.map((x, i) => i).filter(i => tup[i]), targets = run(tups.map(i => objects[i].type.getTarget.gen())), open2 = new Set(tups.filter((i, k) => targets[k].elementFlags.some(f => f & ~3)));
      const fns = [], recs = [];
      objects.forEach((x, i) => {
        const n = x.node, a = argsOf.get(i);
        if (calls[i].length) { n.k = "fn"; fns.push({ x, sigs: calls[i] }); }
        else if (news[i].length) n.k = "other";
        else if (arr[i]) { n.k = "arr"; n.e = push(a[0], x.d + 1); }
        else if (tup[i]) { n.k = "tuple"; n.e = a.map(y => push(y, x.d + 1)); if (open2.has(i)) { n.k = "any"; delete n.e; } }
        else if (a && /Map$/.test(sym[i].name)) { n.k = "map"; n.key = push(a[0], x.d + 1); n.e = push(a[1], x.d + 1); }
        else if (a && /Set$/.test(sym[i].name)) { n.k = "set"; n.e = push(a[0], x.d + 1); }
        else if (a) { n.k = "promise"; n.e = push(a[0], x.d + 1); }
        else if (isLib(sym[i]) && sym[i].flags & (SF.Class | SF.Interface | SF.Variable)) n.k = "other";   // (a `Record` is lib's alias, not its object)
        else recs.push(x);
      });
      // what a function answers
      const fsigs = fns.flatMap(f => f.sigs.map(s => ({ f, s }))), rets = run(fsigs.map(y => y.s.getReturnType.gen()));
      for (const f of fns) { const rs = fsigs.map((y, i) => y.f === f ? rets[i] : undefined).filter(Boolean); f.x.node.answers = "ask"; f.x.node.rets = rs.map(r => push(r, Math.max(f.x.d + 1, DEPTH - 1))); f.raw = rs; }
      const kinds = answers(run, ch, TF, fns.flatMap(f => f.raw)); let k = 0;
      for (const f of fns) { f.x.node.answers = f.raw.map(() => kinds[k++]).every(Boolean); f.x.node.r = f.x.node.rets.length === 1 ? f.x.node.rets[0] : { k: "union", m: f.x.node.rets }; delete f.x.node.rets; }
      // records
      const props = run(recs.map(x => ch.getPropertiesOfType.gen(x.type)));
      const fields = recs.flatMap((x, i) => props[i].length > 80 ? (x.node.k = "any", []) : (x.node.k = "rec", x.node.f = {}, props[i].map(p => ({ x, p }))));
      const lib = fields.filter(f => isLib(f.p) || f.p.flags & SF.Method);
      for (const f of lib) f.x.node.f[f.p.name] = { k: "other" };
      const own = fields.filter(f => !lib.includes(f)), ft = run(own.map(f => ch.getTypeOfSymbol.gen(f.p)));
      own.forEach((f, i) => { const node = push(ft[i], f.x.d + 1); f.x.node.f[f.p.name] = f.p.flags & SF.Optional ? { k: "union", m: [node, { k: "prim" }] } : node; });
      level = next;
    }
    const isPrim = n => n.k === "num" || n.k === "prim" || (n.k === "union" && n.m.every(isPrim));
    const noView = n => isPrim(n) || (n.k === "fn" && noView(n.r)) || (n.k === "union" && n.m.every(noView));
    want.forEach((r, i) => {
      const params = Array.from(trees[i], (alts, n) => {
        if (!alts?.length) return { k: "any" };
        const some = alts.filter(a => a.rest), fixed = alts.filter(a => !a.rest).map(a => a.node);
        if (some.length) { const e = some.map(a => a.node.k === "arr" ? a.node.e : { k: "any" }); return { k: "rest", e: { k: "union", m: [...e, ...fixed] } }; }
        // (a signature with fewer parameters does not take it)
        const sc = sigs[i].length; return fixed.length === 1 && sc === 1 ? fixed[0] : { k: "union", m: fixed };
      });
      // past a rest parameter of one signature, the parameters of another
      const at = params.findIndex(p => p.k === "rest"); if (at >= 0 && at < params.length - 1) params.splice(at, Infinity, { k: "any" });
      const props = params[0]?.k === "rec" ? params[0].f : {};
      out.set(r.name, { params, prims: params.flatMap((p, n) => isPrim(p) ? [n] : []), plain: Object.entries(props).filter(([, n]) => noView(n)).map(([n]) => n) });
    });
    return out;
  } finally { dispose(); }
}

/** Whether each type is an answer: no `void`, `undefined` or `never` on any branch, in a promise or as a parameter's bound
 *  or default, and not a type that is not known. */
function answers(run, ch, TF, types) {
  const gone = TF.Void | TF.Undefined | TF.Never | TF.Any | TF.Unknown;
  const out = types.map(() => true);
  let todo = types.map((t, i) => ({ t, i, d: 0 }));
  while (todo.length) {
    const next = [];
    for (const x of todo) if (x.t.flags & gone) out[x.i] = false;
    todo = todo.filter(x => out[x.i] && x.d < 6);
    const unions = todo.filter(x => x.t.flags & TF.Union), params = todo.filter(x => x.t.flags & TF.TypeParameter), objs = todo.filter(x => x.t.flags & TF.Object);
    run(unions.map(x => x.t.getTypes.gen())).forEach((ms, k) => ms.forEach(m => next.push({ t: m, i: unions[k].i, d: unions[k].d + 1 })));
    run(params.map(x => ch.getBaseConstraintOfType.gen(x.t))).forEach((c, k) => { if (c && c !== params[k].t && !(c.flags & TF.Unknown)) next.push({ t: c, i: params[k].i, d: params[k].d + 1 }); });
    run(params.map(x => ch.getDefaultFromTypeParameter.gen(x.t))).forEach((c, k) => { if (c) next.push({ t: c, i: params[k].i, d: params[k].d + 1 }); });
    const sy = run(objs.map(x => x.t.getSymbol.gen())), ps = objs.filter((x, k) => sy[k]?.name === "Promise" || sy[k]?.name === "PromiseLike");
    run(ps.map(x => ch.getTypeArguments.gen(x.t))).forEach((as, k) => as.forEach(a => next.push({ t: a, i: ps[k].i, d: ps[k].d + 1 })));
    // a conditional or an indexed type is not known
    for (const x of todo) if (x.t.flags & (TF.Conditional | TF.IndexedAccess | TF.Substitution)) out[x.i] = false;
    todo = next;
  }
  return out;
}

function open(spec, from, text) {
  const ck = checker(from), file = path.join(from, "__rx_words__.ts"), types = path.join(from, "__rx_row_types__.d.ts"), code = `import * as m from ${JSON.stringify(text === undefined ? spec : "./__rx_row_types__")};\nexport { m };\n`;
  const { program, dispose } = ck.program({ roots: [file], files: new Map([[file, code], ...(text === undefined ? [] : [[types, text]])]), options: OPTIONS });
  const ch = program.checker ?? program.getProject().checker, sf = program.getSourceFile(file);
  return { api: ck.api, ch, program, dispose, mod: ch.getSymbolAtLocation(sf.statements[0].moduleSpecifier) };
}

module.exports = { rowTypes };
