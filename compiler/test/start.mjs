// TanStack Start (Solid 2) with .rx components (spec/11 CP-4d), end to end: examples/start installed from npm into
// .out/start (once; again when its package.json changes), with this package and the runtime linked as installed, built
// by Vite (Start's plugin, and Solid's, which loads .rx), served by its own fetch handler, and driven in Chromium: each
// URL rendered on the server, hydrated, navigated on the client, the .rx data and its typed boundary, and .rx module
// state across routes. The Node-API build first (`npm run build` here), and the runtime's (`npm run build` in ../runtime).
// Usage: node compiler/test/start.mjs
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const ws = path.join(here, ".out/start");
const pkg = readFileSync(path.join(repo, "examples/start/package.json"), "utf8");
mkdirSync(ws, { recursive: true });
if (!existsSync(path.join(ws, "node_modules/@tanstack/solid-start")) || (existsSync(path.join(ws, "package.json")) && readFileSync(path.join(ws, "package.json"), "utf8") !== pkg)) {
  writeFileSync(path.join(ws, "package.json"), pkg);
  execFileSync("npm", ["install", "--no-audit", "--no-fund", "--silent", "--legacy-peer-deps"], { cwd: ws, stdio: "inherit" });
}
rmSync(path.join(ws, "src"), { recursive: true, force: true });
for (const f of ["src", "vite.config.ts", "serve.mjs"]) cpSync(path.join(repo, "examples/start", f), path.join(ws, f), { recursive: true });
// this package and the runtime, as installed (the runtime copied: its peers are the app's Solid)
const rx = path.join(ws, "node_modules/@reactivescript"); rmSync(rx, { recursive: true, force: true }); mkdirSync(path.join(rx, "runtime"), { recursive: true });
symlinkSync(path.join(repo, "compiler"), path.join(rx, "compiler"));
for (const f of ["package.json", "dist"]) cpSync(path.join(repo, "runtime", f), path.join(rx, "runtime", f), { recursive: true });
execFileSync(process.execPath, [path.join(ws, "node_modules/vite/bin/vite.js"), "build"], { cwd: ws, stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, RX_TYPECHECK: "0" } });

const server = spawn(process.execPath, ["serve.mjs"], { cwd: ws, env: { ...process.env, PORT: "0" } });
const port = await new Promise((resolve, reject) => { server.stdout.on("data", d => { const m = /listening (\d+)/.exec(String(d)); if (m) resolve(Number(m[1])); }); server.on("exit", c => reject(new Error(`server exited ${c}`))); });
const base = `http://127.0.0.1:${port}`;
let pass = 0, fail = 0;
const check = (name, ok, got) => { ok ? pass++ : fail++; console.log(`${ok ? "  ✓" : "  ✗"} ${name}${ok ? "" : `\n      ${JSON.stringify(got).slice(0, 400)}`}`); };
const bodyText = html => (/<body>([\s\S]*)<\/body>/.exec(html.replace(/<script[\s\S]*?<\/script>/g, ""))?.[1] ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
for (const [url, want] of [["/", "People clicks : 0"], ["/people/1", "Ann engineer"], ["/people/9", "no person 9"]]) {
  const got = bodyText(await (await fetch(base + url)).text());
  check(`${url}: rendered on the server, .rx components and all`, got.includes(want), got);
}
const { chromium } = createRequire(path.join(repo, "ref/package.json"))("playwright");
const browser = await chromium.launch(); const page = await browser.newPage();
const problems = []; page.on("console", m => { if (["error", "warning"].includes(m.type())) problems.push(m.text().slice(0, 200)); }); page.on("pageerror", e => problems.push(String(e).slice(0, 200)));
const text = async () => (await page.textContent("#app")).replace(/\s+/g, " ").trim();
const until = async ok => { for (let i = 0; i < 60; i++) { if (await ok()) return true; await page.waitForTimeout(50); } return false; };
await page.goto(base + "/people/2");
check("/people/2 served and hydrated", await until(async () => (await text()).includes("Bodesigner")), await text());
await page.evaluate(() => { window.__same = true; });
await page.click("button.counter"); await page.click("button.counter");
check("an .rx source, written after hydration", await until(async () => (await text()).includes("clicks: 2")), await text());
await page.click("nav >> text=Ann");
check("client navigation to another .rx-backed route", await until(async () => (await text()).includes("Annengineer")), await text());
await page.click("nav >> text=Nobody");
check("the .rx route's typed NotFound boundary", await until(async () => (await text()).includes("no person 9")), await text());
await page.click("nav >> text=Home");
check(".rx module state kept across routes, in the same document", await until(async () => (await text()).includes("clicks: 2")) && await page.evaluate(() => window.__same === true), await text());
check("no console errors or warnings", problems.length === 0, problems);
await browser.close(); server.kill();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
