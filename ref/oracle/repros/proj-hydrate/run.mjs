// node repros/proj-hydrate/run.mjs      (from ref/oracle)
// createOptimisticStore(() => truth) over an async createStore. The server renders "A,B". In the browser, the truth is
// solidjs/solid#5146 (FIXED in solid main fcaa05104, #5150)
// written (rename "Y"). Rendered on an empty page: "Y,B". Hydrated from the server's page: does the view follow?
import { harness, wait } from "../_hydrate.mjs";
const rows = [{ id: 1, t: "A" }, { id: 2, t: "B" }];
const h = await harness(new URL(".", import.meta.url).pathname, () => Promise.resolve(structuredClone(rows)));
for (const mode of ["hydrate", "render"]) {
  const page = await h.open(mode);
  page.on("pageerror", e => console.log("pageerror", e.message));
  await page.evaluate(m => window.repro.start(m), mode); await wait(30);
  if (mode === "render") { await page.evaluate(r => window.repro.land("rows", r), rows); await wait(60); }
  const before = await page.evaluate(() => window.repro.text());
  await page.evaluate(() => window.repro.call("rename", "Y")); await wait(60);
  console.log(mode.padEnd(8), `shows "${before}"`, `· after the truth's write: "${await page.evaluate(() => window.repro.text())}"`, `(expected "Y,B")`);
}
await h.close();
