// Which hand-written words of the tasks' and the coverage entries' declarations a correct program needs. A word that the
// code does not prove (`rx-declare --audit`) and no run holds (`rx-verify`) is taken off its row, and both checkers read the
// good programs again: where they are accepted it has no use, and is left off for the words after it (`pure` first: of
// `pure` and `instantiates`, which each let a component make the call, the second says less); where one is refused the
// word is needed, and the diagnostic is recorded (bench/needed.txt: the author's own claims, in the app's own declaration).
//   node bench/needed.mjs [filter] [--write] [--apply]      (--apply: the words no program needs are taken off the sources) after a run of bench/run.mjs (it reads the staged programs)
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";
import { here, ws, repo, stage, both, isHost, own, claimsIn } from "./harness.mjs";
import { entries } from "./coverage.mjs";
const require_ = createRequire(import.meta.url);
const { rowsOf } = require_("../tooling/rx-language-server/src/rows.js");
const args = process.argv.slice(2), filter = args.find(a => !a.startsWith("--"));

/** A row's text without one word. */
export function without(text, word) {
  const tail = w => text.replace(new RegExp(`\\s+${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`), "");
  if (word === "pure") return text.replace(/\bpure\s+fn\b/, "fn");
  const h = /^handler\((.*)\)$/.exec(word); if (h) { const f = h[1].split(".").pop(); return text.replace(new RegExp(`(\\b${f}\\??\\s*:\\s*)handler\\s+`), "$1"); }
  if (/^draft\(/.test(word)) return text.replace(/\bdraft\s+/, "");
  if (/^nests\(/.test(word)) return text.replace(/\s+nests\([^)]*\)/, "");
  const list = /^(uses|provides|rejects)\((.*)\)$/.exec(word);
  if (list) { const names = list[2].split(/\s*\|\s*/); return text.replace(new RegExp(`\\s+${list[1]}\\(([^)]*)\\)`), (m, inner) => { const left = list[1] === "rejects" ? [] : inner.split(",").map(x => x.trim()).filter(x => !names.includes(x)); return left.length ? ` ${list[1]}(${left.join(", ")})` : ""; }); }
  return tail(word);
}
const one = async (id, from) => {
  const task = (await import(pathToFileURL(path.join(from, from.includes("/coverage/") ? "use.mjs" : "task.mjs")).href)).default;
  const dir = from.includes("/coverage/") ? stage(id, from) : stage(id);
  if (task.prepare) await task.prepare(dir);
  const programs = task.entries ?? [task.entry ?? "main.rx"];
  const refused = () => programs.flatMap(e => { const r = both(path.join(dir, e), task.spa, task.host); const at = [...new Map([...r.crate.diagnostics, ...r.ref.diagnostics].map(d => [`${d.code} ${path.basename(d.file ?? e)}:${d.line}`, 1])).keys()]; return at; });
  const out = [];
  if (refused().length) throw new Error(`${id}: the good program is refused as it stands`);
  for (const file of own(dir, n => n.endsWith(".d.rx"))) {
    const raw = readFileSync(file, "utf8"); if (isHost(raw)) continue;
    const { claims } = claimsIn(dir, file); let lines = raw.split("\n");
    for (const row of rowsOf(file)) for (const c of claims.filter(c => c.name === row.name && c.line === row.line && c.by === "unverified" && c.word).sort((a, b) => (b.word === "pure") - (a.word === "pure"))) {
      const text = lines.slice(row.line - 1, row.end).join("\n"), cut = without(text, c.word);
      const x = { id, file: path.relative(dir, file), name: row.name, word: c.word, why: c.why }; out.push(x);
      if (cut === text) { x.problem = "not taken off"; continue; }
      const next = [...lines.slice(0, row.line - 1), ...cut.split("\n"), ...lines.slice(row.end)];
      writeFileSync(file, next.join("\n")); x.refused = refused();
      if (x.refused.length) writeFileSync(file, lines.join("\n")); else lines = next;
    }
    if (args.includes("--apply") && lines.join("\n") !== raw) writeFileSync(path.join(from, from.includes("/coverage/") ? "" : "src", path.relative(dir, file)), lines.join("\n"));
    writeFileSync(file, raw);
  }
  return out;
};
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const one1 = args.indexOf("--one") >= 0 ? args[args.indexOf("--one") + 1] : null;
  if (one1) { const [id, from] = one1.split("|"); let r; try { r = await one(id, from); } catch (e) { r = { error: String(e.stack ?? e) }; } writeFileSync(path.join(ws, "tasks", `${id}.needed.json`), JSON.stringify(r)); process.exit(0); }
  const all = [...readdirSync(path.join(here, "tasks")).filter(t => existsSync(path.join(here, "tasks", t, "task.mjs"))).map(t => [t, path.join(here, "tasks", t)]), ...entries().map(e => [`cover-${e.replaceAll("/", "-")}`, path.join(here, "coverage", e)])].filter(([id]) => !filter || id.includes(filter));
  const { spawn } = await import("node:child_process"); const found = []; let k = 0;
  await Promise.all(Array.from({ length: Math.max(1, Number(process.env.BENCH_JOBS) || Math.floor(os.availableParallelism() / 2)) }, async () => { while (k < all.length) { const [id, from] = all[k++]; await new Promise(res => { const p = spawn(process.execPath, [new URL(import.meta.url).pathname, "--one", `${id}|${from}`, ...(args.includes("--apply") ? ["--apply"] : [])], { stdio: ["ignore", "ignore", "inherit"] }); p.on("close", res); }); const r = JSON.parse(readFileSync(path.join(ws, "tasks", `${id}.needed.json`), "utf8")); if (r.error) console.error(r.error); else found.push(...r); } }));
  found.sort((a, b) => a.id.localeCompare(b.id) || a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
  const kind = w => w.replace(/\(.*$/, ""), count = (xs, f) => Object.entries(xs.reduce((o, x) => { for (const n of [].concat(f(x))) o[n] = (o[n] ?? 0) + 1; return o; }, {})).sort((a, b) => b[1] - a[1]).map(([n, v]) => `${v} ${n}`).join(", ") || "none";
  const need = found.filter(x => x.refused?.length), free = found.filter(x => !x.refused?.length);
  const line = x => `  ${x.id}/${x.file}: ${x.name}: ${x.word}${x.refused?.length ? ` — without it: ${x.refused.join(", ")}` : x.problem ? ` — ${x.problem}` : ""}\n      not proven: ${x.why}`;
  const text = `Hand-written words no tool has shown, in the declarations of the tasks and of the coverage entries (bench/needed.mjs): each is the app author's own claim, in the app's own declaration. None is in a generated declaration, which holds only words the code proves.\n\n${need.length} a correct program is refused without (${count(need, x => kind(x.word))}; by diagnostic: ${count(need, x => [...new Set(x.refused.map(r => r.split(" ")[0]))])}):\n${need.map(line).join("\n")}\n\n${free.length} no program needs${free.length ? ` (they go):\n${free.map(line).join("\n")}` : "."}\n`;
  console.log(text);
  if (args.includes("--write") && !filter) writeFileSync(path.join(here, "needed.txt"), text.replaceAll(ws, "bench/.out/ws"));
}
