import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/pagination", title: "a segment of a list: three accessors in, one out", ssr: /a,b/, dom: async (h, page) => {
    await page.click("button");
    h.check("the handler's call is followed", await h.until(async () => /c,d/.test(await h.text(page))), await h.text(page));
  } });
