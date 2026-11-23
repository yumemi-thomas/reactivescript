// Every rule the repository names is in the spec: an ID a scenario, a unit, a checker, a tool or a guide refers to
// (`MO-8t`, `RG-7b`, `DV-24`) is defined in spec/*.md, where a definition is the ID in bold, in a heading or first in a
// table's row. And every diagnostic a scenario expects is in spec/99-diagnostics.md or the chapter that adds it.
//   node scripts/spec-refs.mjs
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = readdirSync(path.join(root, "spec")).filter(f => f.endsWith(".md"));
const text = spec.map(f => readFileSync(path.join(root, "spec", f), "utf8")).join("\n");
const ID = /\b(?:MO|DV|RG|CN|SC|AC|EF|ST|TY|SV|SF|CP|IO)-\d+[a-z]?\b|\bR-(?:io|f)-\d+[a-z]?\b/g;
const defined = new Set();
for (const l of text.split("\n")) {
  if (/^\s*(?:[-*]\s+)?\*\*/.test(l) || /^#/.test(l) || /^\|/.test(l.trim())) for (const m of l.match(ID) ?? []) defined.add(m);
  for (const m of l.matchAll(/\*\*([^*]+)\*\*/g)) for (const id of m[1].match(ID) ?? []) defined.add(id);
}
// a rule's unlettered name stands for its lettered parts (`MO-8` for MO-8a…)
for (const id of [...defined]) defined.add(id.replace(/(\d)[a-z]$/, "$1"));
const files = execFileSync("git", ["ls-files", "scenarios", "ref/src", "ref/compile", "ref/units.ts", "compiler/src", "compiler/vite.mjs", "compiler/lib.mjs", "runtime", "guide", "tooling", "bench/*.mjs", "bench/README.md"], { cwd: root, encoding: "utf8" }).split("\n").filter(f => /\.(md|ts|rs|js|mjs)$/.test(f));
const missing = new Map(); const codes = new Map();
for (const f of files) {
  let t; try { t = readFileSync(path.join(root, f), "utf8"); } catch { continue; }
  for (const id of t.match(ID) ?? []) if (!defined.has(id)) missing.set(id, (missing.get(id) ?? new Set()).add(f));
  if (f.startsWith("scenarios/")) for (const m of t.matchAll(/\b(?:rejected|rejects|verdict|reject)[^`\n]*`([A-Z][A-Z_]{4,})`|^\s*(?:--|\/\/)\s*(?:rejected|reject)\b[^\n]*?\b([A-Z][A-Z_]{4,})\b/gm)) codes.set(m[1] ?? m[2], f);
}
let bad = 0;
for (const [id, fs] of [...missing].sort()) { bad++; console.error(`${id}: in no chapter of spec/ (${[...fs].slice(0, 3).join(", ")})`); }
for (const [c, f] of codes) if (!text.includes(`\`${c}\``)) { bad++; console.error(`${c}: expected by ${f}, in no chapter of spec/`); }
console.log(bad ? `${bad} reference${bad === 1 ? "" : "s"} to nothing` : `every rule (${defined.size} defined) and every diagnostic (${codes.size} in scenarios) that is named is in spec/`);
process.exit(bad ? 1 : 0);
