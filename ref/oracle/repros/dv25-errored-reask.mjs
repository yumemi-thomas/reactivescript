// DV-25 (spec/05), closed 2026-11-26: not a divergence. Solid's rule F-3 (#4908, 2.0.0-rc.23, its test E1): a change that only
// content behind a shown error fallback needs reveals at once. The language follows it (05 H-4); this is its plain-Solid form,
// kept as a record. rc.21 and rc.22 print `#0 nobody` at the re-ask; rc.23 and after `#2 nobody`, which every runner shows.
//   node --conditions=browser ref/oracle/repros/dv25-errored-reask.mjs
// Plain Solid 2 (no ReactiveScript): a signal `sel`, an async memo `user` over it that throws synchronously for 0, a plain
// read of `sel` beside an Errored boundary around the read of `user`. After `sel` 1 -> 0 (an error) -> 2 (pending again),
// does the frame hold `#0` until `user` answers (a transition), or show `#2` beside the boundary's old fallback?
const s = await import("solid-js");
const { createRenderer } = await import("@solidjs/universal");
const N = { createElement: t => ({ t, c: [] }), createTextNode: x => ({ x }), replaceText: (a, v) => { a.x = v; }, isTextNode: a => "x" in a, setProperty() {}, insertNode: (p, a, b) => { a.p && (a.p.c = a.p.c.filter(y => y !== a)); const i = b ? p.c.indexOf(b) : -1; i < 0 ? p.c.push(a) : p.c.splice(i, 0, a); a.p = p; }, removeNode: (p, a) => { p.c = p.c.filter(y => y !== a); }, getParentNode: a => a.p, getFirstChild: a => a.c?.[0], getNextSibling: a => { const p = a.p; return p ? p.c[p.c.indexOf(a) + 1] : undefined; } };
const R = createRenderer(N);
const text = n => "x" in n ? n.x : (n.c ?? []).map(text).join("");
let resolve;
const [sel, setSel] = s.createSignal(1);
const user = s.createMemo(() => { const v = sel(); if (v === 0) throw new Error("NotFound"); return new Promise(r => { resolve = r; }); });
const root = { t: "root", c: [] };
R.render(() => [
  R.memo(() => `#${sel()} `),
  s.createComponent(s.Errored, { fallback: () => "nobody", get children() { return R.memo(() => user()); } }),
], root);
const tick = () => new Promise(r => setTimeout(r, 20));
const frame = async label => { s.flush(); await tick(); s.flush(); console.log(label.padEnd(26), JSON.stringify(text(root))); };
await frame("mount");
resolve("Ann"); await frame("user answers Ann");
setSel(0); await frame("sel := 0 (throws)");
setSel(2); await frame("sel := 2 (asks again)");
resolve("Bo"); await frame("user answers Bo");
process.exit(0);
