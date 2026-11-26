// DV-27: node repros/dv27-hydrate/run.mjs      (from ref/oracle)
// A `ref` writes a store, a signal holding an array and a number as its element is made. Rendered: "2/2/5". Taking a
// served page ("1/1/0") over, the hydrated page shows "1/2/5": the store's write is made (a later write shows "3") but its
// reader is not run again for it.
import { harness, wait } from "../_hydrate.mjs";
const h = await harness(new URL(".", import.meta.url).pathname, () => Promise.resolve(null));
for (const mode of ["hydrate", "render"]) {
  const page = await h.open(mode);
  await page.evaluate(m => window.repro.start(m), mode); await wait(60);
  const first = await page.evaluate(() => window.repro.text());
  await page.evaluate(() => window.repro.call("push")); await wait(30);
  console.log(mode.padEnd(8), `shows "${first}" (expected "2/2/5")`, `· after a write of the store: "${await page.evaluate(() => window.repro.text())}" (expected "3/2/5")`);
}
await h.close();
