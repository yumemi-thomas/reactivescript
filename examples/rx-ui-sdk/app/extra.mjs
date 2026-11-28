import { chromium } from "playwright"; import { readFileSync, writeFileSync } from "node:fs"; import path from "node:path"; import { here, rxApp, serve } from "./harness.mjs";
const f = path.join(here, "main.rx"), good = readFileSync(f, "utf8");
writeFileSync(f, good.replace('{bold ? "B!" : "B"}</Toggle>', '{view (s) { source n := 0\n <b id="inner" onClick={() => { n := n + 1 }}>{s.pressed ? "B!" : "B"}{n}</b> }}</Toggle>').replace('<DialogTrigger id="trigger">Open', '<DialogTrigger id="trigger">{view element (e) { <a {...e.attrs} data-open={e.state.open ? "y" : "n"}>Open</a> }}'));
const b = await chromium.launch();
try {
  const a = await rxApp();
  for (const ssr of [false, true]) {
    const s = await serve(a.client, async () => ({ head: a.head, body: await a.ssr() }));
    const p = await b.newPage(); const said = []; p.on("console", m => { if (m.type() !== "log") said.push(m.text().slice(0, 200)); }); p.on("pageerror", e => said.push(e.message));
    await p.goto(s.url + "?case=x" + (ssr ? "&ssr=1" : "")); await p.waitForFunction(() => window.__mounted); await p.waitForTimeout(80);
    const st = () => p.evaluate(() => { const i = document.querySelector("#inner"), t = document.querySelector("#trigger"); return [i.textContent, window.kept === i, t.tagName, t.dataset.open, t.getAttribute("aria-haspopup"), document.querySelector("#seen").textContent]; });
    const o = [await st()]; await p.evaluate(() => { window.kept = document.querySelector("#inner"); }); await p.click("#inner"); await p.waitForTimeout(60); o.push(await st()); await p.click("#trigger"); await p.waitForTimeout(150); o.push(await st());
    console.log(ssr ? "hydrated" : "client", JSON.stringify(o), said); await p.close(); s.close();
  }
} finally { writeFileSync(f, good); await b.close(); }
process.exit(0);
