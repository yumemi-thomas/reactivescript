import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/scheduled", title: "a debounced function: its callback writes later, and it is called from a handler", ssr: /typed 0, saved 0/, dom: async (h, page) => {
    await page.click("button"); await page.click("button"); await page.click("button");
    h.check("three calls, one write once they stop", await h.until(async () => /typed 3, saved 3/.test(await h.text(page))), await h.text(page));
  } });
