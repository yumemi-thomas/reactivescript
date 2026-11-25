import fs from "node:fs";
const read = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return { testResults: [] }; } };
// what is not rewritten in .rx (kept from the original, or left out: README.md): its tests say nothing of the rewrite
const NOT = { keyed: /^keyArray|^Rerun/, keyboard: /^createShortcut|^createKeyDown /, "form-control": /makeAnnounce|createAnnounce|createReducedMotion/, storage: /./, pagination: /^createInfiniteScroll|InfiniteScroll/, sortable: /^(ascending|descending|by|combine|reverse|makeSorted|sortedIndex|sortedIndexBy|insertSorted)\b/, "resize-observer": /^createResizeObserver/ };
const out = {};
for (const b of ["1", "0"]) for (const m of ["test", "ssr"]) for (const f of read(`.results/${b}-${m}.json`).testResults) {
  const p = /original\/([\w-]+)\//.exec(f.name)?.[1]; if (!p) continue; const o = ((out[p] ??= {})[`${b}-${m}`] ??= { pass: 0, fail: 0, failed: [] });
  if (!f.assertionResults.length) { o.fail++; o.failed.push(f.name.split("/").pop() + ": " + f.message.slice(0, 200)); }
  for (const t of f.assertionResults) if (NOT[p]?.test(t.fullName)) { o.skip = (o.skip ?? 0) + 1; } else if (t.status === "passed") o.pass++; else if (t.status === "failed") { o.fail++; o.failed.push(t.fullName + " :: " + (t.failureMessages[0] ?? "").split("\n")[0].slice(0, 160)); }
}
const s = o => o ? `${o.pass}/${o.pass + o.fail}${o.skip ? ` (+${o.skip} not counted)` : ""}` : "-";
for (const [p, o] of Object.entries(out).sort()) console.log(p.padEnd(18), "original", s(o["1-test"]), s(o["1-ssr"]), " rx", s(o["0-test"]), s(o["0-ssr"]));
if (process.argv.includes("-v")) for (const [p, o] of Object.entries(out)) for (const k of ["0-test", "0-ssr", "1-test", "1-ssr"]) for (const f of o[k]?.failed ?? []) console.log(p, k, f);
