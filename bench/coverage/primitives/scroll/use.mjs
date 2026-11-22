import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/scroll", title: "the scroll position as a store's fields", ssr: /scrolled 0/, dom: async (h, page) => {
    await page.evaluate(() => window.scrollTo(0, 400));
    h.check("the scroll is followed", await h.until(async () => /scrolled 400/.test(await h.text(page))), await h.text(page));
  } });
