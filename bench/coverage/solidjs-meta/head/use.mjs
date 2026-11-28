import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solidjs/meta", modules: ["@solidjs/meta"], title: "the document's title, kept to what the page shows", ssr: /page 1/,
  dom: async (h, page) => {
    h.check("the title is the page's", await h.until(async () => await page.title() === "Page 1"), await page.title());
    await page.click(".next");
    h.check("…and follows it", await h.until(async () => await page.title() === "Page 2"), await page.title());
    h.check("a meta beside it", await page.locator('meta[name="description"]').count() >= 1, await page.locator("head").innerHTML());
  } });
