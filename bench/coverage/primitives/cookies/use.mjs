import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/cookies", title: "a theme in a cookie: a signal's two halves", ssr: /theme: light/, dom: async (h, page) => {
    await page.click("button");
    h.check("the setter, from a handler", await h.until(async () => /theme: dark/.test(await h.text(page))), await h.text(page));
    h.check("the cookie is written", /theme=dark/.test(await page.evaluate(() => document.cookie)), await page.evaluate(() => document.cookie));
  } });
