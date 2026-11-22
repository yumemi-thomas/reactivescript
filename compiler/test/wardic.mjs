// Wardic (Motion's API on Solid 2) from .rx (spec/09 MO-11q, MO-12, 07 §1a), end to end: examples/wardic installed from
// npm into .out/wardic (once; again when its package.json changes), with this package, the runtime and the language
// server linked as installed; type-checked by rx-tsc (the .rx with Wardic's own types, and its rx-types/ declarations
// against them, TY-6) and refused where it should be; built by Vite, which compiles the package's `solid` build; and
// driven in Chromium: a kit's member component as a dotted tag (`wardic.div`, imported under a capital) animates in,
// follows an .rx source, and animates out under <AnimatePresence> before it leaves the page, with the stylesheet the
// .rx imported for its effect applied.
// The Node-API build first (`npm run build` here), the WebAssembly one (`cargo build --lib --release --target
// wasm32-unknown-unknown`), and the runtime's (`npm run build` in ../runtime). Usage: node compiler/test/wardic.mjs
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const ws = path.join(here, ".out/wardic");
const pkg = readFileSync(path.join(repo, "examples/wardic/package.json"), "utf8");
mkdirSync(ws, { recursive: true });
if (!existsSync(path.join(ws, "node_modules/@wardic/solid")) || (existsSync(path.join(ws, "package.json")) && readFileSync(path.join(ws, "package.json"), "utf8") !== pkg)) {
  writeFileSync(path.join(ws, "package.json"), pkg);
  execFileSync("npm", ["install", "--no-audit", "--no-fund", "--silent", "--legacy-peer-deps"], { cwd: ws, stdio: "inherit" });
}
rmSync(path.join(ws, "src"), { recursive: true, force: true });
for (const f of ["src", "index.html", "vite.config.mjs", "tsconfig.json"]) cpSync(path.join(repo, "examples/wardic", f), path.join(ws, f), { recursive: true });
const rx = path.join(ws, "node_modules/@reactivescript"); rmSync(rx, { recursive: true, force: true }); mkdirSync(path.join(rx, "runtime"), { recursive: true });
symlinkSync(path.join(repo, "compiler"), path.join(rx, "compiler"));
symlinkSync(path.join(repo, "tooling/rx-language-server"), path.join(rx, "language-server"));
for (const f of ["package.json", "dist", "rx-lib.d.ts"]) cpSync(path.join(repo, "runtime", f), path.join(rx, "runtime", f), { recursive: true });

let pass = 0, fail = 0;
const check = (name, ok, got) => { ok ? pass++ : fail++; console.log(`${ok ? "  ✓" : "  ✗"} ${name}${ok ? "" : `\n      ${JSON.stringify(got).slice(0, 500)}`}`); };
const rxTsc = () => { try { execFileSync(process.execPath, [path.join(rx, "language-server/bin/tsc.js"), "--noEmit", "-p", "tsconfig.json"], { cwd: ws, encoding: "utf8" }); return ""; } catch (e) { return String(e.stdout ?? "") + String(e.stderr ?? ""); } };
const main = path.join(ws, "src/main.rx"); const good = readFileSync(main, "utf8");
check("rx-tsc: main.rx with Wardic's types, and rx-types/@wardic against them (TY-6)", rxTsc() === "", rxTsc());
const refused = (name, edit, want) => { writeFileSync(main, edit(good)); const out = rxTsc(); writeFileSync(main, good); check(name, want.test(out), out); };
refused("a motion element outside <WardicProvider> is refused: it reads the provider's context (MO-12)", s => s.replace("<h1>Wardic</h1>", "<h1>Wardic</h1>\n  <Motion.div>stray</Motion.div>"), /CONTEXT_NOT_FOUND/);
refused("a member's props are Wardic's own types (TS2322)", s => s.replace("transition={{ duration: 0.2 }}", 'transition={{ duration: "slow" }}'), /main\.rx\(\d+,\d+\): error TS2322/);
refused("a member the declaration does not have is refused", s => s.replaceAll("Motion.div", "Motion.section"), /UNKNOWN_COMPONENT/);
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
const card = () => page.evaluate(() => { const c = document.querySelector(".card"); return c ? { opacity: Number(getComputedStyle(c).opacity), x: new DOMMatrix(getComputedStyle(c).transform).e, border: getComputedStyle(c).borderTopColor } : null; });
check("mounted: the member component rendered its element, and it animated in", await until(async () => (await text()).includes("flipped 0") && (await card())?.opacity === 1), [await text(), await card()]);
check("the stylesheet main.rx imported for its effect applies", (await card()).border === "rgb(10, 20, 30)", await card());
await page.click(".toggle");
let leaving = null; for (let i = 0; i < 40 && !leaving; i++) { const c = await card(); if (!c) break; if (c.opacity > 0 && c.opacity < 1) leaving = c; else await page.waitForTimeout(10); }
check("hidden, it stays on the page while its exit animation runs (AnimatePresence), the .rx source written", !!leaving && (await text()).includes("flipped 1"), [leaving, await text()]);
check("…and is removed when the exit has ended", await until(async () => (await card()) === null), await card());
await page.click(".toggle");
check("shown again, it enters at the target the .rx source gives (a reactive prop of the member component)", await until(async () => { const c = await card(); return !!c && c.opacity === 1 && Math.abs(c.x - 20) < 0.5; }), await card());
check("no console errors or warnings", problems.length === 0, problems);
await browser.close(); http.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
