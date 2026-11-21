// Formisch (its Solid 2 build) and Solid 2's store from .rx (spec/09 MO-10i, E-10), end to end: examples/formisch installed
// from npm into .out/formisch (once; again when its package.json changes), with this package, the runtime and the language
// server linked as installed; type-checked by rx-tsc (the .rx with the libraries' own types, its .d.rx against them, TY-6)
// and refused where it should be; built by Vite; and driven in Chromium: the form validates with valibot and its submit
// writes an .rx source, and the store is written through its setter's draft.
// The Node-API build first (`npm run build` here), the WebAssembly one (`cargo build --lib --release --target
// wasm32-unknown-unknown`), and the runtime's (`npm run build` in ../runtime). Usage: node compiler/test/formisch.mjs
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const ws = path.join(here, ".out/formisch");
const pkg = readFileSync(path.join(repo, "examples/formisch/package.json"), "utf8");
mkdirSync(ws, { recursive: true });
if (!existsSync(path.join(ws, "node_modules/@formisch/solid")) || (existsSync(path.join(ws, "package.json")) && readFileSync(path.join(ws, "package.json"), "utf8") !== pkg)) {
  writeFileSync(path.join(ws, "package.json"), pkg);
  execFileSync("npm", ["install", "--no-audit", "--no-fund", "--silent", "--legacy-peer-deps"], { cwd: ws, stdio: "inherit" });
}
rmSync(path.join(ws, "src"), { recursive: true, force: true });
for (const f of ["src", "index.html", "vite.config.mjs", "tsconfig.json"]) cpSync(path.join(repo, "examples/formisch", f), path.join(ws, f), { recursive: true });
const rx = path.join(ws, "node_modules/@reactivescript"); rmSync(rx, { recursive: true, force: true }); mkdirSync(path.join(rx, "runtime"), { recursive: true });
symlinkSync(path.join(repo, "compiler"), path.join(rx, "compiler"));
symlinkSync(path.join(repo, "tooling/rx-language-server"), path.join(rx, "language-server"));
for (const f of ["package.json", "dist", "rx-lib.d.ts"]) cpSync(path.join(repo, "runtime", f), path.join(rx, "runtime", f), { recursive: true });

let pass = 0, fail = 0;
const check = (name, ok, got) => { ok ? pass++ : fail++; console.log(`${ok ? "  ✓" : "  ✗"} ${name}${ok ? "" : `\n      ${JSON.stringify(got).slice(0, 500)}`}`); };
const rxTsc = () => { try { execFileSync(process.execPath, [path.join(rx, "language-server/bin/tsc.js"), "--noEmit", "-p", "tsconfig.json"], { cwd: ws, encoding: "utf8" }); return ""; } catch (e) { return String(e.stdout ?? "") + String(e.stderr ?? ""); } };
const main = path.join(ws, "src/main.rx"); const good = readFileSync(main, "utf8");
check("rx-tsc: main.rx with Formisch's, valibot's and Solid's types, and the .d.rx against them (TY-6)", rxTsc() === "", rxTsc());
const refused = (name, edit, want) => { const bad = edit(good); if (bad === good) { check(name, false, "the edit did not apply"); return; } writeFileSync(main, bad); const out = rxTsc(); writeFileSync(main, good); check(name, want.test(out), out); };
refused("the draft itself is not reassigned: the callback returns the new value (MO-10i)", s => s.replace("{ d.done := v => v + 1 }", "{ d := { items: [], done: 0 } }"), /WRITE_TO_NON_SOURCE/);
refused("a draft's field is written with its own type (TS2345)", s => s.replace("d.done := v => v + 1", "d.done := \"many\""), /main\.rx\(\d+,\d+\): error TS2345/);
refused("a closure made in the callback may not name the draft: a loop is the statement (DRAFT_ESCAPES)", s => s.replace("for (const item of d.items) { d.done := d.done + 1 }", "d.items.forEach((item) => { d.done := d.done + 1 })"), /DRAFT_ESCAPES/);
refused("the setter is called by its own name, not passed on (DRAFT_ESCAPES)", s => s.replace("setTodos((d) => { kept := d.items })", "let set = setTodos; set((d) => { kept := d.items })"), /DRAFT_ESCAPES/);
refused("a schema that reads a source is still a snapshot (E-10)", s => s.replace("form = createForm({ schema: schema })", "form = createForm({ schema: object({ email: pipe(string(), minLength(len(text))) }) })"), /SNAPSHOT_ARGUMENT/);
execFileSync(process.execPath, [path.join(ws, "node_modules/vite/bin/vite.js"), "build"], { cwd: ws, stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, RX_TYPECHECK: "0" } });

const dist = path.join(ws, "dist");
const http = createServer((req, res) => { const f = path.join(dist, req.url === "/" ? "index.html" : req.url.split("?")[0]); if (!existsSync(f)) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html"); res.end(readFileSync(f)); });
await new Promise(r => http.listen(0, "127.0.0.1", r));
const { chromium } = createRequire(path.join(repo, "ref/package.json"))("playwright");
const browser = await chromium.launch(); const page = await browser.newPage();
const problems = []; page.on("console", m => { if (["error", "warning"].includes(m.type())) problems.push(m.text().slice(0, 200)); }); page.on("pageerror", e => problems.push(String(e).slice(0, 200)));
const text = async () => (await page.textContent("body")).replace(/\s+/g, " ").trim();
const until = async ok => { for (let i = 0; i < 60; i++) { if (await ok()) return true; await page.waitForTimeout(50); } return false; };
await page.goto(`http://127.0.0.1:${http.address().port}/`);
check("mounted: the form and the list", await until(async () => (await text()).includes("Sign in") && (await text()).includes("0 of 0 done")), await text());
await page.click(".submit");
check("an empty submit shows valibot's messages", await until(async () => (await text()).includes("Enter a valid email") && (await text()).includes("At least 8 characters")), await text());
await page.fill(".email", "ann@example.com"); await page.fill(".password", "longenough1"); await page.click(".submit");
check("a valid submit writes the .rx source from onSubmit", await until(async () => (await text()).includes("signed in: ann@example.com") && !(await text()).includes("Enter a valid email")), await text());
await page.fill(".text", "milk"); await page.click(".add"); await page.fill(".text", "eggs"); await page.click(".add");
check("the store's draft is appended to through its setter", await until(async () => (await text()).includes("milkeggs") && (await text()).includes("0 of 2 done")), await text());
await page.click(".finish");
check("and a field of it written", await until(async () => (await text()).includes("1 of 2 done")), await text());
// MO-10i (ruled 2026-11-22): a read of the draft is a copy — Solid's draft is the store itself, live and tracked, so a
// source that held it would follow the store; and a loop is the statement, in the callback's own scope
await page.click(".keep");
check("what is read out of the draft is kept as it was", await until(async () => (await text()).includes("2 kept")), await text());
await page.fill(".text", "tea"); await page.click(".add");
check("...and does not follow the store when it changes (a copy, not Solid's live draft)", await until(async () => (await text()).includes("1 of 3 done")) && (await text()).includes("2 kept"), await text());
await page.click(".all");
check("a loop over the draft's items writes the draft (for … of)", await until(async () => (await text()).includes("3 of 3 done")), await text());
check("no console errors or warnings", problems.length === 0, problems);
await browser.close(); http.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
