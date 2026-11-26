// Pin move 30e7805eb → 50a4bfdde (Solid #4906, "run stores on the thin engine, delete the deep engine"): a store proxy
// no longer answers `$TARGET` (the deleted deep engine's record). At 30e7805eb `v[$TARGET] !== undefined` told a store
// proxy (a store, an optimistic store, a projection, a record or list inside one) from a merge/omit view and a plain
// object; at 50a4bfdde it is false for every value. `v[$PROXY] === v && v[$RECORD] === undefined` gives the old answers
// on both. Not a Solid bug: `$TARGET` was the deep engine's internal record, and #4906 deletes it ("the symbol-keyed legacy
// record is gone with the representation", store/index.ts). Every failure of the first ci on 50a4bfdde was our runtime
// asking `$TARGET` (pin-effect-store.mjs: the same effects fire on both pins in plain Solid).
// Run: node --conditions=browser --conditions=development repros/pin-4906-target.mjs
import { createStore, createOptimisticStore, createProjection, $TARGET, $PROXY, $RECORD, merge, omit, flush, createRoot } from "@solidjs/signals";
const isStore = v => v !== null && typeof v === "object" && v[$PROXY] === v && v[$RECORD] === undefined;
createRoot(() => {
  const [s] = createStore({ rows: [{ id: 1, sub: { a: 1 } }] });
  const [o] = createOptimisticStore([{ id: 1 }]);
  const p = createProjection(() => [{ id: 1 }], [], { key: "id" });
  const [s2] = createStore(d => { d.x = s.rows.length; }, {});
  flush();
  const m = merge({ a: 1 }, s), om = omit(s, "rows");
  for (const [n, v] of Object.entries({ store: s, row: s.rows[0], sub: s.rows[0].sub, list: s.rows, opt: o, proj: p, projRow: p[0], derived: s2, merge: m, omit: om, plain: { a: 1 }, arr: [1] }))
    console.log(n.padEnd(8), "TARGET", String(v[$TARGET] !== undefined).padEnd(5), "PROXY===v", String(v[$PROXY] === v).padEnd(5), "RECORD", String(v[$RECORD] !== undefined).padEnd(5), "isStore", isStore(v));
});
