import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/spring", title: "a spring: a tuple whose setter is called from a handler", ssr: /at rest/, dom: async (h, page) => {
    await page.click("button");
    h.check("the spring leaves its rest", await h.until(async () => /moving|arrived/.test(await h.text(page))), await h.text(page));
  } });
