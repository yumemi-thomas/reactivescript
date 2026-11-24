#!/usr/bin/env node
// What each word or form of a declaration is for, measured: it is taken off every declaration the benchmark's programs
// keep (hand-written and drafted), and the checker reads the good programs and their one-line mistakes again. A word
// earns its place where a correct program is then refused, or a mistake accepted. The crate's checker alone.
//   node proposals/words.mjs [word]      after a run of bench/run.mjs (it reads the programs staged in bench/.out)
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { here, stage, crate, own, edit } from "../bench/harness.mjs";
import { entries } from "../bench/coverage.mjs";
const { rowsOf } = createRequire(import.meta.url)("../tooling/rx-language-server/src/rows.js");
const tail = w => t => t.replace(new RegExp(`\\s+${w}\\((?:[^()]|\\([^()]*\\))*\\)(?=\\s|$|;)`, "g"), "");
const rowsAway = test => (t, f) => { const ls = t.split("\n"); for (const r of rowsOf(f)) if (test(r)) for (let i = r.line - 1; i < r.end; i++) ls[i] = "//"; return ls.join("\n"); };
const rowsOnly = cut => t => t.split("\n").map(l => { const c = /^\s*\/\//.test(l) ? 0 : -1; return c === 0 ? l : cut(l); }).join("\n");   // a comment's words are not the row's
const words = {
  handler: t => t.replace(/\bhandler\s+(?=[(<])/g, ""),
  draft: rowsOnly(t => t.replace(/([(,]\s*)draft\s+(?=[A-Za-z_])/g, "$1")),
  "uses(c)": tail("uses"), "provides(c)": tail("provides"), "nests(…)": tail("nests"), "renders(H)": tail("renders"),
  "pending/fails before ref": t => t.replace(/(?:\bpending\s+|\bfails\([^)]*\)\s+)+(?=ref\b)/g, ""),
  "method rows": rowsAway(r => /^[\w$]+\.[\w$]+$/.test(r.name ?? "") && r.kind === "fn"),
  "default rows": rowsAway(r => r.name === "default" && r.kind !== "host"),
  "context from": t => t.replace(/^(\s*export context \w+) from "[^"]*"/gm, "$1"),
  "catches(…) on a prop": t => t.replace(/\bcatches\([^)]*\)\s+/g, ""),
  "instantiates (upstream's)": t => t.replace(/\s+instantiates(?=\s|$)/g, ""),
  "pure (upstream's)": t => t.replace(/\bpure\s+fn\b/g, "fn"),
  "rejects(E) (upstream's)": tail("rejects"),
};
const only = process.argv[2], list = Object.entries(words).filter(([w]) => !only || w.startsWith(only));
const sum = Object.fromEntries(list.map(([w]) => [w, { uses: 0, programs: 0, refused: [], lost: [] }]));
const sig = d => `${d.code}@${path.basename(d.file ?? "")}:${d.line}`;
const all = [...readdirSync(path.join(here, "tasks")).filter(t => existsSync(path.join(here, "tasks", t, "task.mjs"))).map(t => [t]), ...entries().map(e => [`cover-${e.replaceAll("/", "-")}`, path.join(here, "coverage", e)])];
for (const [id, from] of all) {
  const task = (await import(pathToFileURL(path.join(from ?? path.join(here, "tasks", id), from ? "use.mjs" : "task.mjs")).href)).default;
  const dir = from ? stage(id, from) : stage(id); if (task.prepare) await task.prepare(dir);
  // Solid's own declaration is shared (09 MO-8k): a copy as the project's, so that a word can be taken off it too
  if (own(dir, n => /\.rx$/.test(n) && !n.endsWith(".d.rx")).some(f => /from "solid-js"/.test(readFileSync(f, "utf8"))) && !existsSync(path.join(dir, "rx-types/solid-js.d.rx"))) { mkdirSync(path.join(dir, "rx-types"), { recursive: true }); cpSync(path.join(here, "../declarations/solid-js/index.d.rx"), path.join(dir, "rx-types/solid-js.d.rx")); }
  const es = task.entries ?? [task.entry ?? "main.rx"], decls = own(dir, n => n.endsWith(".d.rx"));
  const refused = () => es.flatMap(e => crate(path.join(dir, e), task.spa, task.host).diagnostics);
  const base = refused(); if (base.length) { console.log(`${id}: the good program is refused as it stands: ${base.map(sig)}`); continue; }
  // the mistakes the checker refuses today; a variant that edits a declaration is left out, since the word may be what it edits
  const bads = (task.bad ?? []).filter(b => typeof b.expect === "string" && !b.ts && !b.add && b.edit && ![b.file, b.file2].some(f => f?.endsWith(".d.rx")));
  const said = b => { const undo = [edit(dir, b.file ?? es[0], b.edit)]; if (b.edit2) undo.push(edit(dir, b.file2 ?? b.file ?? es[0], b.edit2)); const r = crate(path.join(dir, b.entry ?? es[0]), b.spa ?? task.spa, task.host).diagnostics; for (const u of undo.reverse()) u(); return r; };
  const caught = new Set(bads.filter(b => said(b).some(d => d.code === b.expect)));
  for (const [w, cut] of list) {
    const raws = decls.map(f => [f, readFileSync(f, "utf8")]), next = raws.map(([f, t]) => [f, cut(t, f)]);
    const n = raws.reduce((k, [, t], i) => k + t.split("\n").filter((l, j) => l !== next[i][1].split("\n")[j]).length, 0); if (!n) continue;
    for (const [f, t] of next) writeFileSync(f, t);
    const s = sum[w]; s.uses += n; s.programs++;
    const now = refused(), old = new Set(now.map(sig));
    if (now.length) s.refused.push(`${id}: ${[...new Set(now.map(d => d.code))].join(", ")}`);
    for (const b of bads) if (caught.has(b) && !said(b).some(d => d.code === b.expect && !old.has(sig(d)))) s.lost.push(`${id}: ${b.name} (${b.expect})`);
    for (const [f, t] of raws) writeFileSync(f, t);
  }
}
console.log("\n| word or form | rows | programs | correct programs refused without it | mistakes no longer caught |\n| --- | --- | --- | --- | --- |");
for (const [w, s] of Object.entries(sum)) console.log(`| ${w} | ${s.uses} | ${s.programs} | ${s.refused.length} | ${s.lost.length} |`);
for (const [w, s] of Object.entries(sum)) { console.log(`\n${w}`); for (const x of s.refused) console.log(`  refused: ${x}`); for (const x of s.lost) console.log(`  lost: ${x}`); }
