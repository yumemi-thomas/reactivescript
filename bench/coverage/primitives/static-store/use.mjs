import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/static-store", title: "a static store: fields read as a store's, a setter called from a handler", ssr: /0 by 0/, dom: async (h, page) => {
    await page.click("button");
    h.check("the setter, from a handler", await h.until(async () => /640 by 480/.test(await h.text(page))), await h.text(page));
  } });
