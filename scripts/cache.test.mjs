// scripts/lib/cache.mjs, held to what it says: the same key and the same answers of the crate give the result kept; another
// file, folder, flag, variable or answer does not; a failure is not kept, nor what an operation answered itself; off in CI.
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const dir = mkdtempSync(path.join(os.tmpdir(), "rx-cache-")), lib = path.join(import.meta.dirname, "lib/cache.mjs");
process.env.RX_CACHE_DIR = path.join(dir, "cache"); for (const k of ["CI", "RX_NO_CACHE"]) delete process.env[k];
const cache = await import(lib);
assert.ok(cache.enabled);
let runs = 0; const op = (key, answers, { ok = true, value = "v", trace = [{ ask: { q: 1 }, said: cache.said("a") }], files = {} } = {}) => { const r = cache.resultSync("t", key, a => answers[a.q], () => { runs++; return { value, trace, files }; }); r.keep(ok); return r; };
const hit = (...a) => { const n = runs, r = op(...a); assert.equal(runs, n, "run again"); return r; }, miss = (...a) => { const n = runs, r = op(...a); assert.equal(runs, n + 1, "used again"); return r; };
const yes = { 1: "a" };
// the key, whole, in any order of its fields
miss({ a: 1, b: [1, 2] }, yes); assert.equal(hit({ b: [1, 2], a: 1 }, yes).value, "v"); miss({ a: 1, b: [2, 1] }, yes); miss({ a: "1", b: [1, 2] }, yes); miss({ a: 1, b: [1, 2], c: 0 }, yes);
// the crate's answers: one that differs, one that is not given, one that throws
miss({ a: 1, b: [1, 2] }, { 1: "x" }, { ok: false }); miss({ a: 1, b: [1, 2] }, {}, { ok: false });
{ const n = runs; cache.resultSync("t", { a: 1, b: [1, 2] }, () => { throw new Error(); }, () => { runs++; return { value: 0, trace: [] }; }); assert.equal(runs, n + 1); }
hit({ a: 1, b: [1, 2] }, yes);
// two revisions' results side by side: a program whose answers differ has one for each
miss({ two: 1 }, yes, { value: "old" }); miss({ two: 1 }, { 1: "b" }, { value: "new", trace: [{ ask: { q: 1 }, said: cache.said("b") }] }); assert.equal(hit({ two: 1 }, yes).value, "old"); assert.equal(hit({ two: 1 }, { 1: "b" }).value, "new");
// a failure is not kept, nor a result whose trace is not known, nor what the operation itself made the answer to
miss({ f: 1 }, yes, { ok: false }); miss({ f: 1 }, yes, { ok: false }); miss({ g: 1 }, yes, { trace: null }); miss({ g: 1 }, yes, { trace: null });
miss({ h: 1 }, yes, { trace: [{ ask: { q: 1 }, said: cache.said("before") }] }); miss({ h: 1 }, yes);
// what it wrote is written again with it, and taken back when the answers differ
const f = path.join(dir, "made/x"); miss({ w: 1 }, yes, { files: { [f]: "made" } }); hit({ w: 1 }, yes); assert.equal(readFileSync(f, "utf8"), "made"); writeFileSync(f, "mine"); miss({ w: 1 }, { 1: "z" }, { ok: false }); assert.equal(readFileSync(f, "utf8"), "mine"); rmSync(f); miss({ w: 1 }, { 1: "z" }, { ok: false }); assert.ok(!existsSync(f));
// no key: never kept
miss(null, yes); miss(null, yes);
// another checkout: a path of this one is no part of a key or a value
{ miss({ p: `${cache.repo}/x` }, yes, { value: `at ${cache.repo}/y` }); const z = readdirSync(path.join(dir, "cache/results"), { recursive: true }).filter(x => x.endsWith(".gz")); for (const x of z) assert.ok(!execFileSync("gunzip", ["-c", path.join(dir, "cache/results", x)], { encoding: "utf8" }).includes(cache.repo)); assert.equal(hit({ p: `${cache.repo}/x` }, yes).value, `at ${cache.repo}/y`); }
// content, not dates: a file changed and dated back, one added, removed, renamed, a link pointed elsewhere
const t = path.join(dir, "tree"); mkdirSync(path.join(t, "a/b"), { recursive: true }); writeFileSync(path.join(t, "a/b/x"), "1"); writeFileSync(path.join(t, "y"), "2"); symlinkSync("y", path.join(t, "l"));
const h0 = cache.treeHash(t); assert.equal(cache.treeHash(t), h0);
const st = statSync(path.join(t, "y")); writeFileSync(path.join(t, "y"), "3"); utimesSync(path.join(t, "y"), st.atime, st.mtime); const h1 = cache.treeHash(t); assert.notEqual(h1, h0);
writeFileSync(path.join(t, "y"), "2"); assert.equal(cache.treeHash(t), h0);
writeFileSync(path.join(t, "z"), ""); assert.notEqual(cache.treeHash(t), h0); rmSync(path.join(t, "z")); assert.equal(cache.treeHash(t), h0);
rmSync(path.join(t, "l")); symlinkSync("a", path.join(t, "l")); assert.notEqual(cache.treeHash(t), h0);
assert.notEqual(cache.treeHash(path.join(t, "none")), cache.treeHash(path.join(t, "a")));
// an environment variable that a tool reads is in the key; how many run at once is not
process.env.RX_GENERATE = "0"; const e1 = JSON.stringify(cache.environment()); delete process.env.RX_GENERATE; const e2 = JSON.stringify(cache.environment()); process.env.RX_JOBS = "3"; assert.equal(JSON.stringify(cache.environment()), e2); assert.notEqual(e1, e2);
// off: CI, RX_NO_CACHE, --no-cache, --write
for (const [env, args] of [[{ CI: "1" }, []], [{ RX_NO_CACHE: "1" }, []], [{}, ["--no-cache"]], [{}, ["--write"]]]) assert.equal(execFileSync(process.execPath, ["--input-type=module", "-e", `import { enabled } from ${JSON.stringify(lib)}; console.log(enabled)`, "--", ...args], { encoding: "utf8", env: { ...process.env, ...env } }).trim(), "false");
// bounded: the least recently used go
const out = execFileSync(process.execPath, ["--input-type=module", "-e", `import * as c from ${JSON.stringify(lib)}; import { randomBytes } from "node:crypto"; for (let i = 0; i < 8; i++) { const r = c.resultSync("big", { i }, () => undefined, () => ({ value: randomBytes(300000).toString("base64"), trace: [] })); r.keep(true); await new Promise(r => setTimeout(r, 15)); } c.resultSync("big", { i: 0 }, () => undefined, () => { throw 1; }); c.prune(); const left = []; for (let i = 0; i < 8; i++) { const r = c.resultSync("big", { i }, () => undefined, () => ({ value: 0, trace: [] })); if (r.hit) left.push(i); } console.log(left.join())`], { encoding: "utf8", env: { ...process.env, RX_CACHE_DIR: path.join(dir, "small"), RX_CACHE_MB: "1" } }).trim();
assert.ok(/^0,.*7$/.test(out) && out.split(",").length < 8, `kept: ${out}`);
rmSync(dir, { recursive: true, force: true });
console.log("cache: keys, answers, failures, files, checkouts, environment, size, off: as stated");
