// TY: every scenario's program, projected to TSX (types/project.ts) and checked by TypeScript with Solid's JSX types.
// A program the checker accepts must type-check; a rejected variant `-- reject: TS2322` must fail with that code, on its
// `.rx` line. One TypeScript program holds every projection, so the libraries are read once.
// node --experimental-strip-types types/run.ts [filter]      DEBUG=1 prints each projection with its errors
// RX_CRATE=1: the projection is the crate's (`rxc project`, compiler/), not types/project.ts's (CP-5)
import { createRequire } from "node:module";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, relative, join } from "node:path";
import { parseScenario, moduleSet, type Scenario } from "../src/scenario.ts";
import { checkModules } from "../src/check.ts";
import { projectModules, PRELUDE, type Projected } from "./project.ts";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { loadModules } from "../src/modules.ts";

const rxc = fileURLToPath(new URL("../../compiler/target/release/rxc", import.meta.url));
/** RX_CRATE=1: the crate's projection of the program, read from the same files ref/ reads. */
function crateProjection(sc: Scenario, src: string): Projected[] {
  const files: Record<string, string> = {};
  const read = (p: string) => { const s = p === sc.entry ? src : sc.modules.get(p) ?? (existsSync(p) ? readFileSync(p, "utf8") : undefined); if (s !== undefined) files[p] = s; return s; };
  loadModules(sc.entry, read);
  const out = JSON.parse(execFileSync(rxc, ["project"], { input: JSON.stringify([{ id: 0, entry: sc.entry, files, conformance: true }]), maxBuffer: 1 << 28 }).toString());
  return out.programs[0].files;
}

const out = fileURLToPath(new URL("../.types/", import.meta.url)); rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
/** The tooling's checker (tsrs, TypeScript 7): the suite holds what `rx-tsc` and the editor do, to the same verdicts. */
const tooling = createRequire(new URL("../../tooling/rx-language-server/src/", import.meta.url));
const { checker, versions, tsrs } = tooling("./checker.js"), { diagnosticsOf } = tooling("./program.js");
const { JsxEmit, ModuleKind, ModuleResolutionKind } = tsrs();
const opts = {
  jsx: JsxEmit.Preserve, jsxImportSource: "@solidjs/web", strict: true, noImplicitAny: false, useUnknownInCatchVariables: false,
  target: 9 /* ES2022 */, module: ModuleKind.ESNext, moduleResolution: ModuleResolutionKind.Bundler, allowImportingTsExtensions: true,
  noEmit: true, skipLibCheck: true, lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.esnext.d.ts"], types: [], moduleDetection: 3 /* force */,
};
type Unit = { sc: string; title: string; expect: string | null; dir: string; files: Map<string, Projected> };
const units: Unit[] = [];
const filter = process.argv[2];
const sdir = new URL("../../scenarios/", import.meta.url);
let seq = 0;
const unasked: string[] = [];                                                    // what the checker refused: its types cannot be asked, and nothing else would say so
function add(sc: Scenario, title: string, src: string, expect: string | null, whole = false) {
  let set; try { set = moduleSet(sc, src); } catch (e) { unasked.push(`${sc.name} ${title}: ${(e as Error).message}`); return; }
  const ds = checkModules(set, false, whole).diags; if (ds.length) { unasked.push(`${sc.name} ${title}: refused by the checker — ${ds.map(d => `${d.code} line ${d.line}`).join(", ")}`); return; }
  const dir = join(out, `${sc.name}.${seq++}`); const root = dirname(set.entry.startsWith("/") ? set.entry : "/" + set.entry);
  const files = new Map<string, Projected>();
  for (const p of process.env.RX_CRATE ? crateProjection(sc, src) : projectModules(set)) {
    const rel = relative(root, p.path.startsWith("/") ? p.path : "/" + p.path); const f = join(dir, rel);
    mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, p.code); files.set(f, p);
  }
  for (const [p, text] of sc.modules) if (/(^|\/)node_modules\/.*package\.json$/.test(p)) { const f = join(dir, relative(root, p.startsWith("/") ? p : "/" + p)); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); }   // MO-10c: a package's own, so its projected `.d.ts` resolves
  writeFileSync(join(dir, "__prelude.ts"), PRELUDE);
  units.push({ sc: sc.name, title, expect, dir, files });
}
for (const f of readdirSync(sdir).filter(f => f.endsWith(".md") && f !== "TEMPLATE.md" && !f.startsWith("OPEN-") && (!filter || f.includes(filter))).sort()) {
  const sc = parseScenario(f.replace(/\.md$/, ""), readFileSync(new URL(f, sdir), "utf8"), fileURLToPath(sdir));
  add(sc, "Program", sc.program, null);
  for (const t of sc.tables) if (t.program) add(sc, t.title, t.program, null);
  sc.accepted.forEach((a, i) => add(sc, `accepted #${i}`, a.program, a.untyped ? "" : null, a.whole));
  for (const rj of sc.rejected) if (rj.types) add(sc, `types ${rj.rule}`, rj.program, rj.rule);
}
const roots = units.flatMap(u => [...u.files.keys()].filter(f => f.endsWith(".tsx")));
const t0 = Date.now();
type Diagnostic = { file?: string; line: number; column: number; code: number; message: string };
const ck = checker(out);
const { program, dispose } = ck.program({ roots, options: opts });
const diags: Diagnostic[] = diagnosticsOf(program, opts); dispose();
const byFile = new Map<string, Diagnostic[]>(); for (const d of diags) { const k = d.file ?? "(global)"; let l = byFile.get(k); if (!l) byFile.set(k, (l = [])); l.push(d); }
let pass = 0, fail = 0;
const scenarios = new Map<string, string[]>();
for (const u of units) {
  const got: string[] = [];
  for (const [f, p] of u.files) for (const d of byFile.get(f) ?? []) {
    const line = d.file ? d.line - 1 : 0;
    const msg0 = d.message.replace(/\n/g, " "); const own = /"(WIRE_VALUE|MISSING_AWAIT): ([^"]*)"/.exec(msg0);   // a rule the projection states as a type
    if (own) { got.push(`${own[1]} ${p.rx.split("/").pop()}:${p.lines[line] ?? "?"}: ${own[2]}`); continue; }
    got.push(`TS${d.code} ${p.rx.split("/").pop()}:${p.lines[line] ?? "?"}: ${msg0.slice(0, Number(process.env.MSG ?? 220))}`);
    if (process.env.DEBUG) console.log(`--- ${f}\n${p.code.split("\n").map((l, i) => `${String(i + 1).padStart(3)}${i === line ? ">" : " "} ${l}`).join("\n")}`);
  }
  const lines = scenarios.get(u.sc) ?? []; scenarios.set(u.sc, lines);
  if (u.expect === null) { if (got.length) { fail++; lines.push(`  ✗ ${u.title}: ${got.join("\n      ")}`); } else { pass++; lines.push(`  ✓ ${u.title}: types check`); } }
  else { const hit = got.find(g => u.expect === "" || g.startsWith(u.expect + " ")); if (hit) { pass++; lines.push(`  ✓ ${u.title}: ${hit}`); } else { fail++; lines.push(`  ✗ ${u.title}: expected ${u.expect || "a type error (-- untyped)"}, got ${got.join(" | ") || "no error"}`); } }
}
for (const u of unasked) { fail++; console.log(`✗ ${u}`); }
for (const d of byFile.get("(global)") ?? []) { fail++; console.log(`✗ global: TS${d.code} ${d.message}`); }
for (const [sc, lines] of scenarios) { console.log(`${lines.some(l => l.includes("✗")) ? "FAIL" : "PASS"} ${sc}`); for (const l of lines) console.log(l); }
console.log(`\n${pass} pass, ${fail} fail (TypeScript ${versions().typescript}, tsrs ${versions().tsrs}, ${roots.length} projected modules${process.env.RX_CRATE ? " from the crate" : ""}, ${Date.now() - t0} ms)`);
process.exit(fail ? 1 : 0);
