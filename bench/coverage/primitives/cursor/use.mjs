import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/cursor", title: "the body's cursor set from a value", ssr: /idle/, dom: async (h, page) => {
    await page.click("button");
    h.check("the body's cursor follows the source", await h.until(async () => (await page.evaluate(() => document.body.style.cursor)) === "wait"), await page.evaluate(() => document.body.style.cursor));
    await page.click("button");
    h.check("…and is given back", await h.until(async () => (await page.evaluate(() => document.body.style.cursor)) === ""), await page.evaluate(() => document.body.style.cursor));
  } });
