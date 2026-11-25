// The process the benchmark's tools run in (scripts/lib/tools.mjs): it answers as a process of its own does, again when a
// library's file, the tool's source or the environment changes, and not at all where it cannot be sure.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ask, end, lend } from "./lib/tools.mjs";

const repo = path.resolve(import.meta.dirname, ".."), bin = path.join(repo, "tooling/rx-language-server/bin");
const at = realpathSync(mkdtempSync(path.join(os.tmpdir(), "rx-tools-test-"))), kit = path.join(at, "node_modules/kit");
mkdirSync(path.join(at, "rx-types"), { recursive: true }); mkdirSync(kit, { recursive: true }); mkdirSync(path.join(at, "app"));
for (const d of ["solid-js", "@solidjs"]) symlinkSync(realpathSync(path.join(repo, "ref/node_modules", d)), path.join(at, "node_modules", d), "dir");
writeFileSync(path.join(at, "package.json"), '{"type":"module"}');
writeFileSync(path.join(kit, "package.json"), JSON.stringify({ name: "kit", version: "1.0.0", type: "module", exports: { ".": { types: "./index.d.ts", default: "./index.js" } } }));
const types = t => writeFileSync(path.join(kit, "index.d.ts"), `export declare function twice(n: ${t}): number;\n`);
types("number"); writeFileSync(path.join(kit, "index.js"), "export function twice(n) { return n * 2 }\n");
writeFileSync(path.join(at, "rx-types/kit.d.rx"), "export pure fn twice(n: number): number\n");
const env = { ...process.env }; delete env.RXC;
const fresh = (b, args, e = env) => { const r = spawnSync(process.execPath, ["--conditions=browser", path.join(bin, b), ...args], { cwd: at, env: e, encoding: "utf8" }); return { status: r.status, signal: r.signal, stdout: r.stdout, stderr: r.stderr }; };
const same = (what, b, args, e = env) => { const r = ask(b, args, { cwd: at, env: e }); assert.deepEqual(r, fresh(b, args, e), what); return r.stdout; };
let n = 0; const ok = what => { n++; console.log(`✓ ${what}`); };
try {
  const worker = lend(); Object.assign(process.env, worker.env);
  const first = same("a draft", "declare.js", ["kit"]); assert.match(first, /number/); ok("a draft is what a process of its own drafts");
  same("again", "declare.js", ["kit"]); ok("…and again, over what the first left");
  const audit = same("an audit", "declare.js", ["--audit", "--json", "rx-types/kit.d.rx"]); assert.match(audit, /"proven"/); ok("an audit");
  types("string"); const second = same("a library's types changed", "declare.js", ["kit"]); assert.match(second, /string/); ok("a library's declaration that changed (its size too little to see) is read again");
  writeFileSync(path.join(kit, "index.js"), "export function twice(n) { n.k = 2; return n; }\n");
  assert.match(same("a library's code changed", "declare.js", ["--audit", "--json", "rx-types/kit.d.rx"]), /"(contradicted|unproven)"/); ok("a library's code that changed is read again");
  same("no such package", "declare.js", ["none"]); ok("a tool that fails: its status and what it says");   // (or `again`)
} catch (e) { if (e.code !== "ERR_ASSERTION" || e.actual !== undefined) throw e; ok("a tool that throws is left to a process of its own"); }
process.env.RX_TOOLS = lend().env.RX_TOOLS;
{
  // what a run leaves in the environment, the folder and the arguments is not the next one's
  const { ask } = await import("./lib/tools.mjs?2");
  const r = ask("declare.js", ["--audit", "--json", "rx-types/kit.d.rx"], { cwd: at, env: { ...env, RX_INFER_SOLID: "0" } });
  assert.deepEqual(r, fresh("declare.js", ["--audit", "--json", "rx-types/kit.d.rx"], { ...env, RX_INFER_SOLID: "0" }));
  assert.deepEqual(ask("declare.js", ["--audit", "--json", "rx-types/kit.d.rx"], { cwd: at, env }), fresh("declare.js", ["--audit", "--json", "rx-types/kit.d.rx"])); ok("an environment is one request's");
  assert.equal(ask("there-is-none.js", [], { cwd: at, env }), undefined); ok("a tool that is not there: no answer");
}
{
  const w = lend(), { ask } = await import("./lib/tools.mjs?3"); process.env.RX_TOOLS = w.env.RX_TOOLS;
  process.kill(Number(w.env.RX_TOOLS.split("|")[1]), "SIGKILL"); await new Promise(res => setTimeout(res, 300));   // (reaped: its parent is this process)
  assert.equal(ask("declare.js", ["kit"], { cwd: at, env, timeout: 20000 }), undefined); ok("a worker that is gone: no answer");
}
{
  // the reading rx-verify is given is of the file as it is, or is not used
  const decl = path.join(at, "rx-types/kit.d.rx"), verify = given => JSON.parse(fresh("verify.js", ["--json", "rx-types/kit.d.rx"], { ...env, RX_VERIFY_READING: given }).stdout)[0].audit ?? { proven: 0 };
  writeFileSync(path.join(kit, "index.js"), "export function twice(n) { return n * 2 }\n");
  const real = JSON.parse(fresh("declare.js", ["--audit", "--json", "rx-types/kit.d.rx"]).stdout)[0], f = path.join(at, "given.json");
  const put = (file, text, read) => { writeFileSync(f, JSON.stringify({ file, text, read })); return f; }, text = readFileSync(decl, "utf8"), none = { ...real, rows: [] };
  assert.equal(verify(put(decl, text, real)).proven, 1); assert.equal(verify(put(decl, text, none)).proven, 0);
  assert.equal(verify(put(decl, `${text}\n`, none)).proven, 1); assert.equal(verify(put(`${decl}x`, text, none)).proven, 1); ok("a reading of another file, or of another text, is not used");
}
await end(); rmSync(at, { recursive: true, force: true });
console.log(`${n} held`);
process.exit(n === 10 ? 0 : 1);
