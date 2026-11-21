// Replays a fuzz-board trail (';'-separated, as the fuzzer prints it) against an app and reports whether the page
// hangs (page.evaluate unanswered for 3 s) after the last step. Answers come from fuzz-board's server model.
// Usage: node hang-after-reask.replay.mjs <desk> <trail-file-or-string> [--quiet]
const E = "/tmp/claude-0/-home-user/b0c1a8f0-5828-5b86-a816-75e9c36897f9/scratchpad/rx/eval/";
const { build } = await import(E + "harness/build.mjs");
const { launch, serve } = await import(E + "harness/driver.mjs");
const { freshServer, answer } = await import(E + "harness/fuzz-board.mjs");
import { existsSync, readFileSync } from "node:fs";
const [dir, t] = process.argv.slice(2); const quiet = process.argv.includes("--quiet");
const trail = (existsSync(t) ? readFileSync(t, "utf8") : t).split(";").map(s => s.trim()).filter(s => s && !s.startsWith("("));
const b = await build(dir); if (!b.ok) { console.log(b.output); process.exit(2); }
const server = await serve(b.dist); const browser = await launch();
export async function replay(page, trail, log = () => {}) {
  const srv = freshServer(); const settled = new Map();
  const sel = id => `[data-testid="${id}"]`; const T = { timeout: 1000 };
  const ev = (f, a) => Promise.race([page.evaluate(f, a), new Promise((_, j) => setTimeout(() => j(new Error("HUNG")), 3000))]);
  for (const [n, s] of trail.entries()) {
    log(`STEP ${n} ${s}`);
    try {
      let m;
      if ((m = s.match(/^(land|fail) (.*)$/))) {
        const key = m[2]; const fail = m[1] === "fail";
        const times = Math.max(1, (await ev(k => globalThis.__flights.asked().filter(x => x === k).length, key)) - (settled.get(key) ?? 0));
        settled.set(key, (settled.get(key) ?? 0) + times);
        let a; for (let i = 0; i < times; i++) a = answer(srv, key, fail);
        await ev(([k, a]) => a.fail ? globalThis.__flights.fail(k, "declined") : globalThis.__flights.land(k, a.value), [key, a]);
      } else if ((m = s.match(/^select #(\d+)$/))) await page.locator(sel("card"), { hasText: new RegExp(`^\\s*#${m[1]} `) }).first().click(T);
      else if ((m = s.match(/^(left|right|up|down) #(\d+)$/))) await page.locator(sel("card"), { hasText: new RegExp(`^\\s*#${m[2]} `) }).first().locator("xpath=..").locator(sel(m[1])).click(T);
      else if ((m = s.match(/^add (.*)$/))) { await page.locator(sel("new-card")).first().fill(m[1], T); await page.locator(sel("add-card")).first().click(T); }
      else if ((m = s.match(/^rename (.*)$/))) { await page.locator(sel("title-input")).first().fill(m[1], T); await page.locator(sel("rename")).first().click(T); }
      else if ((m = s.match(/^add-item (.*)$/))) { await page.locator(sel("item-input")).first().fill(m[1], T); await page.locator(sel("add-item")).first().click(T); }
      else if ((m = s.match(/^toggle (\d+)$/))) await page.locator(sel("toggle")).nth(Number(m[1])).click(T);
      else if ((m = s.match(/^restore (\d+)$/))) await page.locator(sel("restore")).nth(Number(m[1])).click(T);
      else if ((m = s.match(/^tab (board|archive)$/))) await page.locator(sel(`tab-${m[1]}`)).click(T);
      else if ((m = s.match(/^retry-(\w+)$/))) await page.locator(sel(s)).click(T);
      else throw new Error("unknown step " + s);
    } catch (e) { if (e.message === "HUNG") return { hung: n }; log(`  (step failed: ${e.message.split("\n")[0].slice(0, 80)})`); }
    await page.waitForTimeout(60);
    if (process.env.DUMP) log("  | " + (await ev(() => document.body.textContent.replace(/\s+/g, " ") + " ~ " + globalThis.__flights.pending().join("|")).catch(e => e.message)));
  }
  try { await ev(() => 1); return { hung: false }; } catch { return { hung: trail.length - 1 }; }
}
if (!process.env.NO_MAIN) {
  const page = await browser.newPage(); page.on("pageerror", e => console.log("PAGEERR", e.message));
  await page.goto(server.url); await page.waitForTimeout(200);
  const r = await replay(page, trail, quiet ? () => {} : console.log);
  console.log(r.hung === false ? "RESULT: no hang" : `RESULT: HANG after step ${r.hung} (${trail[r.hung]})`);
  await browser.close().catch(() => {}); server.close(); process.exit(r.hung === false ? 0 : 1);
}
