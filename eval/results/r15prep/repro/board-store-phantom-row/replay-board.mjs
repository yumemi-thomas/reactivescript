// replay a board fuzz trail with the probe's dump after each step: node replay-board.mjs <desk> "<trail>" [fromStep]
const E = "/tmp/claude-0/-home-user/b0c1a8f0-5828-5b86-a816-75e9c36897f9/scratchpad/rx/eval/";
const { build } = await import(E + "harness/build.mjs");
const { launch, serve } = await import(E + "harness/driver.mjs");
const { freshServer, answer } = await import(E + "harness/fuzz-board.mjs");
const [dir, trail, from = "0"] = process.argv.slice(2);
const b = await build(dir); if (!b.ok) { console.log(b.output); process.exit(1); }
const server = await serve(b.dist); const browser = await launch(); const page = await browser.newPage();
page.on("pageerror", e => console.log("PAGEERR", e.message));
await page.goto(server.url); await page.waitForFunction(() => globalThis.__flights !== undefined);
const norm = s => (s ?? "").replace(/\s+/g, " ").trim();
const db = freshServer(); let n = 0;
const cardBtn = id => page.locator(`[data-testid=card]`, { hasText: new RegExp(`^#${id} `) }).first();
for (const s of trail.split(" ; ").filter(s => !s.startsWith("("))) {
  const [op, ...rest] = s.split(" "); const arg = rest.join(" "); n++;
  try {
    if (op === "land" || op === "fail") { const a = answer(db, arg, op === "fail"); await page.evaluate(([k, v, f]) => f ? globalThis.__flights.fail(k, "declined") : globalThis.__flights.land(k, v), [arg, a.value, !!a.fail]); }
    else if (op === "select") await cardBtn(arg.slice(1)).click({ timeout: 1000 });
    else if (["up", "down", "left", "right"].includes(op)) await page.locator("li", { has: cardBtn(arg.slice(1)) }).locator(`[data-testid=${op}]`).click({ timeout: 1000 });
    else if (op === "rename") { await page.fill("[data-testid=title-input]", arg); await page.click("[data-testid=rename]", { timeout: 1000 }); }
    else if (op === "archive") await page.click("[data-testid=archive]", { timeout: 1000 });
    else if (op === "add") { await page.fill("[data-testid=new-card]", arg); await page.click("[data-testid=add-card]", { timeout: 1000 }); }
    else if (op === "add-item") { await page.fill("[data-testid=item-input]", arg); await page.click("[data-testid=add-item]", { timeout: 1000 }); }
    else if (op === "toggle") await page.locator("[data-testid=toggle]").nth(Number(arg)).click({ timeout: 1000 });
    else if (op === "restore") await page.locator("[data-testid=restore]").nth(Number(arg)).click({ timeout: 1000 });
    else if (op === "tab") await page.click(`[data-testid=tab-${arg}]`);
    else if (op === "retry-todo" || op.startsWith("retry")) await page.click(`[data-testid=${op}]`);
  } catch (e) { console.log("STEP ERR", s, e.message.split("\n")[0]); }
  await page.waitForTimeout(60);
  if (n >= Number(from) || n === trail.split(" ; ").filter(s => !s.startsWith("(")).length) console.log(`--- ${n} ${s}\n`, norm(await page.locator("body").textContent()).replace("Board Archive", ""), "\n air:", (await page.evaluate(() => globalThis.__flights.pending())).join(", "));
}
await browser.close(); server.close(); process.exit(0);
