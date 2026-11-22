import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/range", title: "a repeat component, its children narrowed to the render prop the app writes", ssr: /\* ?\* ?\*/, dom: async (h, page) => {
    await page.click("button");
    h.check("repeated again as the count changes", await h.until(async () => (await page.locator("span").count()) === 5), await page.locator("span").count());
    h.check("a range of numbers, by its step", await h.until(async () => /0 ?2 ?4/.test(await h.text(page, ".steps"))), await h.text(page, ".steps"));
    await page.click("#none");
    h.check("none: each shows the fallback's element", await h.until(async () => (await page.locator("i").count()) === 2 && (await page.locator("span").count()) === 0), await h.text(page));
  } });
