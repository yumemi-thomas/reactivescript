// MO-8v, the adversarial half: code a word must not be written over, and what must not be written.
//   words/cases.json        functions that do one thing a word must not cover, hidden as code hides it, and their honest twins
//                           (`lost`: honest, and no form the reading lists: no word, and why)
//   words/adversarial.json  packages whose fact was established by RUNNING them (`fact`): the row that `rx-declare` drafts may
//                           not match `not`. Two reviews wrote them against the reading that was here before, and 757 were
//                           written against this one (compiler/words); q, r and v, a listener's `handler` (`has`: a true one)
//   words/review.json       the same, of a third review (s d m w h x) and of what was written around each fix of it (n1 to n5)
//   node test/words-cases.js [--shard i/n]
const fs = require("node:fs"), path = require("node:path");
const { ask } = require("../src/rxc.js");
const { declare } = require("../src/declare.js");
const arg = process.argv.indexOf("--shard"), [si, sn] = arg > 0 ? process.argv[arg + 1].split("/").map(Number) : [1, 1];
const repo = path.resolve(__dirname, "../../.."), ws = path.join(__dirname, `../.test/words-cases-${si}`);
fs.rmSync(ws, { recursive: true, force: true }); fs.mkdirSync(path.join(ws, "node_modules/kit"), { recursive: true });
for (const d of fs.readdirSync(path.join(repo, "ref/node_modules"))) if (!d.startsWith(".")) fs.symlinkSync(path.join(repo, "ref/node_modules", d), path.join(ws, "node_modules", d), "dir");
fs.writeFileSync(path.join(ws, "package.json"), '{"type":"module"}');
fs.writeFileSync(path.join(ws, "node_modules/kit/package.json"), '{"name":"kit","version":"1.0.0","type":"module","exports":"./index.js"}');
fs.writeFileSync(path.join(ws, "node_modules/kit/index.js"), "export const mystery = x => globalThis.mystery(x);\nexport const Foreign = p => globalThis.mystery(p);\n");
let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 400)}` : ""}`); } };

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, "words/cases.json"), "utf8"));
const has = (x, w) => w === "pure" ? !!x.pure?.ok : w === "handler" ? !!Object.values(x.handlers ?? {})[0]?.ok : w === "uses" ? x.uses?.length > 0 : w === "provides" ? !!x.provides?.ok : !!x.instantiates?.ok;
cases.forEach((c, i) => {
  if (i % sn !== si - 1) return;
  const id = c.id.split("/")[2], name = new RegExp(`export (?:const|(?:async )?function\\*?|class) ${id}\\b`).test(c.code) ? id : [...c.code.matchAll(/export (?:const|(?:async )?function\*?) (\w+)/g)].pop()?.[1] ?? "default";
  const f = c.id.replace(/\W/g, "_") + (c.jsx ? ".jsx" : ".js"); fs.writeFileSync(path.join(ws, f), c.code);
  const any = { k: "any" };
  const r = ask("words", { spec: `./${f}`, from: fs.realpathSync(ws), exports: [{ name, kind: c.component ? "component" : "fn", handlers: c.word === "handler" ? [[c.index, c.field ?? null]] : [], refs: [], plain: [], params: c.types ?? [any, any, any] }] });
  const x = r.exports?.[name] ?? {};
  // (a file that changes a built-in, or makes code of text, leaves no word anywhere)
  if (c.ok && !c.lost) ok(`${c.id}: read`, r.exports && !x.unread, r.unread ?? x.unread);
  ok(`${c.id}: ${c.ok && !c.lost ? "" : "no "}${c.word}`, has(x, c.word) === (c.ok && !c.lost), JSON.stringify(x).slice(0, 300));
});

["adversarial", "review"].flatMap(f => JSON.parse(fs.readFileSync(path.join(__dirname, `words/${f}.json`), "utf8"))).forEach((c, i) => {
  if (i % sn !== si - 1) return;
  const name = `zz-${c.id.replace("/", "-")}`, dir = path.join(ws, "node_modules", name); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(Object.fromEntries(Object.entries({ name, version: "1.0.0", type: "module", exports: { ".": { types: "./index.d.ts", default: "./index.js" } }, ...c.pkg }).filter(([, v]) => v !== null))));
  for (const [f, text] of Object.entries({ "index.js": c.js, "index.d.ts": c.d, ...c.files })) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), text); }
  let rows; try { rows = declare(name, ws, {}, { infer: true, written: true }).split("\n").filter(l => l.startsWith("export ")).join("\n"); } catch (e) { rows = `error: ${e.message}`; }
  if (c.has) ok(`${c.id}: /${c.has}/`, new RegExp(c.has, "m").test(rows) && !rows.startsWith("error:"), rows);   // an honest one: its word is written
  // (MO-10b, 2026-11-26: a fn whose answer holds a function that does something is not `pure` — or it is, calling it only
  // computing, and that function is marked `io` in the row, which a view may not call: the whole result, or the part named)
  else ok(`${c.id}: not /${c.not}/ (${c.fact})`, (!new RegExp(c.not, "m").test(rows) || /\): io \(|[[,] ?io \(/.test(rows) || new RegExp(`\\b${c.fact}\\??: io \\(`).test(rows)) && !rows.startsWith("error:"), rows);
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
