import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/url", title: "a reactive URL: the library's own object", ssr: /\/docs \?page=1/, dom: async (h, page) => {
    await page.click("button");
    h.check("a write through its search params is followed", await h.until(async () => /\?page=2/.test(await h.text(page))), await h.text(page));
  } });
