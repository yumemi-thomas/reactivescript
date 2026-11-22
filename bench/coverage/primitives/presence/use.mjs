import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/presence", title: "presence: states read from a result while an item leaves", ssr: /shown|leaving|gone/, dom: async (h, page) => {
    h.check("mounted and shown", await h.until(async () => /^shown/.test(await h.text(page))), await h.text(page));
    await page.click("button");
    h.check("…and gone once its exit is over", await h.until(async () => /^gone/.test(await h.text(page))), await h.text(page));
  } });
