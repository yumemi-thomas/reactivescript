import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/utils", title: "plain helpers, lifted over a source", ssr: /5 of 1/, dom: async (h, page) => {
    await page.click("button");
    h.check("a pure helper is computed again", await h.until(async () => /10 of 1/.test(await h.text(page))), await h.text(page));
  } });
